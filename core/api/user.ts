import type { Frame, Cursor } from '../types.ts';
import { EngineError } from '../types.ts';
import type { Registry } from '../registry.ts';
import type { Authenticated } from './auth.ts';
import { scope } from './auth.ts';
import { digest } from '../registry.ts';

// Console counts Unicode code points, not UTF-16 units or UTF-8 bytes. No per-minute/day quota in Console.
export const USER_TEXT_LIMIT = 20_000;

export function resolveTarget(core:Registry,auth:Authenticated,to:{agentId?:string;label?:string}|string):string {
  const selector=typeof to==='string'?(to.includes('=')?{label:to}:{agentId:to}):to;
  if(!selector||!!selector.agentId===!!selector.label)throw new EngineError('INVALID',400,'One explicit target is required','target');
  let id:string;
  if(selector.agentId){id=selector.agentId;if(!core.get(id))throw new EngineError('NO_TARGET',404,'No matching target','target');}
  else {
    const at=selector.label!.indexOf('=');if(at<1)throw new EngineError('INVALID',400,'Invalid target label','target');
    const rows=core.list({labels:{[selector.label!.slice(0,at)]:selector.label!.slice(at+1)}});
    if(rows.length!==1)throw new EngineError(rows.length?'AMBIGUOUS_TARGET':'NO_TARGET',rows.length?409:404,'Target must resolve to exactly one live agent','target');id=rows[0].id;
  }
  const label=selector.label;
  if(auth.principal.kind!=='console'&&!auth.targets.some(t=>t===id||t===`agent:${id}`||!!label&&(t===label||t===`label:${label}`)))throw new EngineError('TARGET',403,'Target is outside principal scope','target');
  return id;
}
export function encodeCursor(id:string,cursor:Cursor):string {return `${id}.${cursor.epoch}.${cursor.seq}`;}
function decodeCursor(id:string,raw?:string):Cursor|undefined {
  if(!raw)return undefined;const parts=raw.split('.');if(parts.length!==3||parts[0]!==id||!/^\d+$/.test(parts[2]))throw new EngineError('INVALID',400,'Invalid reply cursor','cursor');
  return {epoch:parts[1],seq:Number(parts[2])};
}
async function doUserSays(core:Registry,auth:Authenticated,body:{requestId:string;to:{agentId?:string;label?:string};text:string;channel:string;utteranceId?:string;capturedAt?:string;delivery?:'steer'|'queue'|'interrupt';images?:string[];attachments?:string[]}) {
  scope(auth,'user.say');const id=resolveTarget(core,auth,body.to);
  if([...body.text].length>USER_TEXT_LIMIT)throw new EngineError('TOO_LONG',413,'User message exceeds 20000 characters','user.say');
  if(body.text.trimStart().startsWith('/'))throw new EngineError('SLASH_FORBIDDEN',422,'Slash commands are not allowed on the user channel','user.say');
  if(core.get(id)?.state==='archived')throw new EngineError('ARCHIVED',423,'Target is archived','user.say');
  if(core.get(id)?.successorId)throw new EngineError('AGENT_SUPERSEDED',409,'Target is superseded; send to its successor','user.say');
  const key=`userSay:${auth.principal.name}:${body.requestId}`,previous=core.db.meta<{digest:string;result:unknown}>(key);
  if(previous){if(previous.digest!==digest(body))throw new EngineError('IDEMPOTENCY_CONFLICT',409,'requestId payload changed','idempotency');return previous.result;}
  const now=Date.now();
  const cursor=encodeCursor(id,core.journal.cursor(id)),wasRunning=core.get(id)?.state==='running',messageId=`${body.channel}-${body.utteranceId??body.requestId}`;
  const sent=await core.send(id,{requestId:body.requestId,text:body.text,delivery:body.delivery??'steer',clientMessageId:messageId,
    ...(body.images?.length?{images:body.images}:{}),...(body.attachments?.length?{attachments:body.attachments}:{})},auth.principal,
    {principal:'user',channel:body.channel,via:auth.principal.name});
  const result={messageId,agentId:id,delivery:sent.state==='queued'?'queued':wasRunning&&body.delivery!=='interrupt'?'steered':'started',replyCursor:cursor,acceptedAt:new Date(now).toISOString()};
  core.db.tx(()=>{core.db.setMeta(key,{digest:digest(body),result});});return result;
}
const userCalls=new WeakMap<Registry,Map<string,Promise<unknown>>>();
export function userSays(core:Registry,auth:Authenticated,body:Parameters<typeof doUserSays>[2]):Promise<unknown> {
  let calls=userCalls.get(core);if(!calls){calls=new Map();userCalls.set(core,calls);}
  const previous=calls.get(auth.principal.name)??Promise.resolve();
  const next=previous.then(()=>doUserSays(core,auth,body));calls.set(auth.principal.name,next.catch(()=>{}));return next;
}
export function replies(core:Registry,auth:Authenticated,to:string,after?:string,maxChars=4000) {
  scope(auth,'user.read');const id=resolveTarget(core,auth,to),latest=core.journal.cursor(id),cursor=decodeCursor(id,after);
  const gate=core.db.prepare("SELECT type,body FROM events WHERE agent_id=? AND type IN ('awaiting_user','approval_consumed') ORDER BY seq DESC LIMIT 1").get(id);
  // An user card has no TTL: the agent awaits the user until its permission resolves (denied, expired or consumed).
  const approvalId=gate?.type==='awaiting_user'?(()=>{try{return String(JSON.parse(String(gate.body)).approvalId??'');}catch{return '';}})():'';
  const resolved=approvalId?core.db.prepare("SELECT state FROM permissions WHERE id=?").get(approvalId)?.state:undefined;
  const state=gate?.type==='awaiting_user'&&(resolved===undefined||resolved==='pending'||resolved==='approved')?'awaiting_user':core.get(id)?.state==='running'?'running':'idle';
  if(cursor&&core.journal.needsResync(id,cursor))return {agentId:id,state,items:[],cursor:encodeCursor(id,latest),resync:true};
  const rows=core.db.prepare('SELECT body FROM events WHERE agent_id=? AND seq>? ORDER BY seq').all(id,cursor?.seq??0);
  const items:Record<string,unknown>[]=[];let seq=cursor?.seq??0,buffer='',bufferStart=seq,chars=0;
  let pending:Record<string,unknown>[]=[];
  for(const row of rows) {
    const f=JSON.parse(String(row.body)) as Frame;if(f.stale){if(!buffer)seq=f.seq;continue;}
    const item=f.item as {type?:string;text?:string;delta?:boolean;name?:string}|undefined;
    if(f.type==='timeline'&&item?.type==='assistant_message') {
      if(!buffer)bufferStart=seq;
      buffer+=item.text??'';
      // A frame cursor cannot represent half a frame. Wait for a sentence boundary, then consume
      // complete frames together. maxChars is a soft whole-sentence budget, never silent truncation.
      if(item.delta&&!/[.!?。！？]["'”’)]*\s*$/.test(buffer))continue;
      if(chars&&chars+buffer.length>maxChars){seq=bufferStart;buffer='';break;}
      items.push(...pending,{kind:'text',turnId:f.turnId,text:buffer,final:!item.delta,at:f.ts});pending=[];
      chars+=buffer.length;buffer='';seq=f.seq;if(chars>=maxChars)break;
    } else {
      let projected:Record<string,unknown>|undefined;
      if(f.type==='turn_started')projected={kind:'turn_started',turnId:f.turnId,inReplyTo:f.commandId?(core.db.meta<{m:{clientMessageId?:string}}>(`pending:${f.commandId}`)?.m.clientMessageId??f.commandId):null,at:f.ts};
      else if(f.type==='timeline'&&item?.type==='tool_call')projected={kind:'working',turnId:f.turnId,tool:item.name??'',at:f.ts};
      else if(f.type==='awaiting_user')projected={kind:'awaiting_user',turnId:f.turnId,approvalId:f.approvalId,summary:f.rule,at:f.ts};
      else if(['turn_completed','turn_failed','turn_canceled'].includes(f.type)) {
        if(buffer) {
          if(chars&&chars+buffer.length>maxChars){seq=bufferStart;buffer='';break;}
          items.push(...pending,{kind:'text',turnId:f.turnId,text:buffer,final:true,at:f.ts});pending=[];chars+=buffer.length;buffer='';
        }
        projected={kind:'turn_ended',turnId:f.turnId,outcome:f.type.slice(5),at:f.ts};
      }
      if(buffer){if(projected)pending.push(projected);continue;}
      if(projected)items.push(projected);seq=f.seq;
    }
  }
  if(buffer)seq=bufferStart;
  return {agentId:id,state,items,cursor:encodeCursor(id,{epoch:latest.epoch,seq})};
}
export async function pollReplies(core:Registry,auth:Authenticated,to:string,after:string|undefined,waitMs:number,maxChars:number,signal?:AbortSignal) {
  let result=replies(core,auth,to,after,maxChars);if(result.items.length||result.resync||waitMs<=0)return result;
  await new Promise<void>(resolve=>{
    const done=()=>{clearTimeout(timer);off();signal?.removeEventListener('abort',done);resolve();};
    const off=core.journal.subscribe({agents:[result.agentId]},()=>{
      result=replies(core,auth,to,after,maxChars);if(result.items.length||result.resync)done();
    });
    const timer=setTimeout(done,Math.min(25000,Math.max(0,waitMs)));signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();
  });return result;
}
