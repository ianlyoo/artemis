import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { EngineError } from '../types.ts';
import type { Cursor, Principal, TerminalUser } from '../types.ts';
import { refreshTerminalActivity } from '../terminals/index.ts';
import { setCaptureGrant } from '../terminals/capture.ts';
import { terminalSocket } from '../terminals/socket.ts';
import type { Registry } from '../registry.ts';
import type { Database } from '../db.ts';
import type { Journal } from '../journal/index.ts';
import { Auth, scope } from './auth.ts';
import type { Authenticated, PrincipalSpec } from './auth.ts';
import { Uploads, UPLOAD_LIMITS } from '../uploads/index.ts';
import { userSays, pollReplies, replies } from './user.ts';
import { assertSocketPath } from '../socket-path.ts';

const text=z.string(),requestId=text.min(1).max(256),stringMap=z.record(text,text),uuid=text.uuid();
const createSchema=z.object({requestId,provider:z.enum(['claude','codex','agy']),model:text.min(1),thinking:text.optional(),mode:text.optional(),cwd:text.min(1),title:text,profile:text.min(1),
  prompt:text.optional(),env:stringMap.optional(),labels:stringMap.optional(),identity:z.record(text,z.unknown()).optional(),parentId:text.optional(),launcherId:text.optional(),predecessorId:text.optional()}).strict();
const sendSchema=z.object({requestId,text,images:z.array(uuid).max(5).optional(),attachments:z.array(uuid).max(5).optional(),delivery:z.enum(['steer','queue','when_idle','interrupt']).optional(),clientMessageId:text.optional()}).strict();
const terminalSchema=z.object({requestId,user:text.regex(/^(console|agent:[A-Za-z0-9-]+)$/),cwd:text,cols:z.number().int().min(1).max(1000),rows:z.number().int().min(1).max(500),title:text.optional()}).strict();
const userSchema=z.object({requestId:text.min(1).max(64),to:z.object({agentId:text.optional(),label:text.optional()}).strict(),text:text.min(1),channel:text.regex(/^[a-z][a-z0-9-]{1,15}$/),utteranceId:text.max(128).optional(),capturedAt:text.datetime().optional(),delivery:z.enum(['steer','queue','interrupt']).optional(),images:z.array(uuid).max(5).optional(),attachments:z.array(uuid).max(5).optional()}).strict();
const cursorSchema=z.object({epoch:text,seq:z.number().int().nonnegative()}).strict();
// Walk each byte once: repeated regex groups exhaust V8's stack on valid multi-MiB uploads.
function validBase64(value:string):boolean {
  if(value.length%4!==0)return false;
  const end=value.length-(value.endsWith('==')?2:value.endsWith('=')?1:0);
  for(let i=0;i<end;i++){const c=value.charCodeAt(i);if(!(c>=65&&c<=90||c>=97&&c<=122||c>=48&&c<=57||c===43||c===47))return false;}
  return true;
}
function parsed<T>(schema:z.ZodType<T>,value:unknown):T {const p=schema.safeParse(value);if(!p.success)throw new EngineError('INVALID',400,'Invalid request shape','request');return p.data;}
function number(value:string|null,fallback:number,min=0,max=600000):number {if(value===null)return fallback;const n=Number(value);if(!Number.isFinite(n)||!Number.isInteger(n)||n<min||n>max)throw new EngineError('INVALID',400,'Invalid numeric query value','query');return n;}
async function raw(req:IncomingMessage,limit:number):Promise<Buffer> {
  if(Number(req.headers['content-length']??0)>limit){req.resume();throw new EngineError('LIMIT',413,'Request too large','body');}
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let bytes=0;
    const clean=()=>{req.off('data',data);req.off('end',end);req.off('error',fail);req.off('aborted',aborted);};
    const fail=(error:unknown)=>{clean();reject(error);};
    const aborted=()=>fail(new EngineError('INVALID',400,'Upload interrupted','body'));
    const end=()=>{clean();resolve(Buffer.concat(chunks));};
    const data=(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit){clean();req.resume();reject(new EngineError('LIMIT',413,'Request too large','body'));return;}chunks.push(chunk);};
    req.on('data',data);req.once('end',end);req.once('error',fail);req.once('aborted',aborted);
  });
}
async function portOpen(port:number):Promise<boolean> {
  return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});const done=(ok:boolean)=>{socket.destroy();resolve(ok);};socket.setTimeout(500,()=>done(false));socket.once('connect',()=>done(true));socket.once('error',()=>done(false));});
}
async function json(req:IncomingMessage):Promise<unknown> {const buf=await raw(req,2*1024*1024);try{return buf.length?JSON.parse(buf.toString()):{};}catch{throw new EngineError('INVALID',400,'Malformed JSON','body');}}
function reply(res:ServerResponse,status:number,body:unknown):void {if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function errorReply(res:ServerResponse,e:unknown):void {
  const error=e instanceof EngineError?e:new EngineError('INTERNAL',500,'Request failed','internal');
  if(error.status===413)res.shouldKeepAlive=false;
  reply(res,error.status,{code:error.code,rule:error.rule??error.code.toLowerCase(),reason:error.message});
}
export type ApiOptions={core:Registry;db:Database;journal:Journal;stateDir:string;port:number;mcpPort?:number;initTokens?:boolean;tokenPrincipals?:PrincipalSpec[];version:string;verifiedVersions:Record<string,string>};
export async function createApi(o:ApiOptions) {
  mkdirSync(join(o.stateDir,'run'),{recursive:true,mode:0o700});
  const {core,db,journal}=o,auth=new Auth(db,o.stateDir),uploads=new Uploads(db,o.stateDir);
  if(o.initTokens)auth.init(o.tokenPrincipals);
  let closing=false;
  const projectAgent=<T extends {id:string}|null>(a:T)=>a?{...a,pendingPermissions:core.actor(a.id).permissions().length}:a;
  async function control(id:string,kind:string,body:Record<string,unknown>,p:Principal,fn:()=>Promise<unknown>):Promise<unknown> {
    const rid=typeof body.requestId==='string'?body.requestId:randomUUID(),payload={id,kind,body},prior=core.lookup(p,rid,payload);
    if(prior)return prior;
    const commandId=core.commandId(p,rid);
    db.tx(()=>{core.insert(p,rid,id,kind,payload,{commandId,state:'accepted'},'accepted');journal.append(id,{type:'command_state',commandId,state:'accepted'});core.transition(commandId,'dispatching');});
    try {
      const result=await fn()??{ok:true};db.tx(()=>{core.transition(commandId,'completed');db.prepare('UPDATE commands SET result=? WHERE principal=? AND request_id=?').run(JSON.stringify(result),p.name,rid);});return result;
    }catch(e){
      const error=e instanceof EngineError?e:new EngineError('INTERNAL',500,'Control failed','control');
      db.tx(()=>{core.transition(commandId,'failed');db.prepare('UPDATE commands SET result=? WHERE principal=? AND request_id=?').run(JSON.stringify({__error:{code:error.code,status:error.status,reason:error.message,rule:error.rule}}),p.name,rid);});throw error;
    }
  }
  async function route(req:IncomingMessage,res:ServerResponse):Promise<void> {
    if(closing)throw new EngineError('OFFLINE',503,'Daemon is shutting down','lifecycle');
    const verified=auth.authenticate(req.headers.authorization),p=verified.principal,url=new URL(req.url??'/','http://127.0.0.1'),path=url.pathname,method=req.method??'GET',q=url.searchParams;
    if(path.startsWith('/v1/user/')) {
      if(path==='/v1/user/says'&&method==='POST'){reply(res,202,await userSays(core,verified,parsed(userSchema,await json(req))));return;}
      if(path==='/v1/user/replies'&&method==='GET'){
        const signal=new AbortController();res.once('close',()=>signal.abort());
        reply(res,200,await pollReplies(core,verified,q.get('to')??'',q.get('after')??undefined,number(q.get('waitMs'),0,0,25000),number(q.get('maxChars'),4000,1,4000),signal.signal));return;
      }
      throw new EngineError('NOT_FOUND',404,'Route not found','route');
    }
    scope(verified,method==='GET'?'core.read':'core.write');
    if(path==='/v1/health'&&method==='GET'){reply(res,200,{ok:true,held:core.held});return;}
    if(path==='/v1/info'&&method==='GET'){reply(res,200,{version:o.version,daemonVersion:o.version,verifiedVersions:Object.entries(o.verifiedVersions).map(([component,version])=>({component,version})),drivers:[...core.drivers.keys()].map(provider=>({provider,ok:!core.unavailable.has(provider)}))});return;}
    if(path==='/v1/doctor'&&method==='GET'){
      const drivers=[];for(const driver of core.drivers.values()){
        if(driver.disabled){drivers.push({provider:driver.provider,status:'disabled',reason:driver.disabled});continue;}
        try{const result=await driver.selfTest?.()??{ok:true};drivers.push({provider:driver.provider,...result,status:result.ok?'healthy':'failed'});}
        catch{drivers.push({provider:driver.provider,ok:false,status:'failed'});}
      }
      reply(res,200,{integrity:db.prepare('PRAGMA integrity_check').get()?.integrity_check,tokens:auth.modes(),drivers,writerLock:true,ports:{api:true,...(o.mcpPort?{mcp:await portOpen(o.mcpPort)}:{})}});return;
    }
    if(path==='/v1/agents'&&method==='POST'){reply(res,201,await core.create(parsed(createSchema,await json(req)),p));return;}
    if(path==='/v1/agents'&&method==='GET'){
      const labels:Record<string,string>={};for(const label of q.getAll('label')){const at=label.indexOf('=');if(at<1)throw new EngineError('INVALID',400,'Invalid label filter','query');labels[label.slice(0,at)]=label.slice(at+1);}
      const provider=q.get('provider');if(provider&&!['claude','codex','agy'].includes(provider))throw new EngineError('INVALID',400,'Invalid provider','query');
      reply(res,200,{agents:core.list({labels,archived:q.get('archived')==='1',provider:provider as 'claude'|'codex'|'agy'|undefined??undefined,parentId:q.get('parentId')??undefined}).map(projectAgent)});return;
    }
    if(path==='/v1/agents/cleanup-children'&&method==='POST') {
      const body=parsed(z.object({parentId:text.optional(),label:text.optional(),idleHours:z.number().nonnegative()}),await json(req));reply(res,200,await core.cleanupChildren(body,p));return;
    }
    const agent=/^\/v1\/agents\/([^/]+)(?:\/(.*))?$/.exec(path);
    if(agent) {
      const id=decodeURIComponent(agent[1]),action=agent[2]??'';core.require(id);
      if(!action&&method==='GET'){reply(res,200,projectAgent(q.get('waitFor')==='idle'?await core.waitFor(id,'idle',number(q.get('timeoutMs'),30000)):core.get(id)));return;}
      if(action==='messages'&&method==='POST'){reply(res,202,await core.send(id,parsed(sendSchema,await json(req)),p));return;}
      if(action.startsWith('messages/')&&method==='DELETE'){await core.actor(id).withdraw(action.slice(9));reply(res,200,{ok:true});return;}
      if(action==='cancel'&&method==='POST'){
        const body=parsed(z.object({requestId,hardStop:z.boolean().optional()}).strict(),await json(req));reply(res,200,await core.cancel(id,body,p));return;
      }
      if(action==='timeline'&&method==='GET'){
        let after:Cursor|undefined;
        if(q.has('after')){try{after=parsed(cursorSchema,JSON.parse(q.get('after')!));}catch{throw new EngineError('INVALID',400,'Invalid timeline cursor','cursor');}}
        reply(res,200,core.timeline(id,{after,kinds:q.get('kinds')?.split(',').filter(Boolean),tail:q.has('tail')?number(q.get('tail'),80,0,200):undefined,limit:number(q.get('limit'),200,1,200)}));return;
      }
      if(action==='permissions'&&method==='GET'){reply(res,200,{permissions:core.actor(id).permissions().map(r=>({id:r.id,requestDigest:r.request_digest,request_digest:r.request_digest,summary:r.summary,allowedDecisions:r.allowedDecisions,expiresAt:r.expires_at,turnId:r.turnId??null}))});return;}
      // These controls require Console authority; user-channel principals never reach core routes.
      if(p.kind!=='console'&&['settings','rewind'].includes(action)||p.kind!=='console'&&action.startsWith('permissions/'))throw new EngineError('FORBIDDEN',403,'Console principal required','principal');
      if(action.startsWith('permissions/')&&method==='POST'){
        const body=parsed(z.object({expectDigest:text,decision:text,requestId:requestId.optional()}).strict(),await json(req));
        reply(res,200,await control(id,'permission',body,p,async()=>core.actor(id).decide(action.slice(12),body,p)));return;
      }
      if(action==='settings'&&method==='PATCH'){
        const body=parsed(z.object({model:text.optional(),thinking:text.optional(),mode:text.optional(),requestId:requestId.optional()}).strict(),await json(req));
        const {requestId:_rid,...settings}=body;reply(res,200,await control(id,'settings',body,p,async()=>{await core.actor(id).settings(settings);return core.get(id);}));return;
      }
      if(action==='supersede'&&method==='POST'){
        const body=parsed(z.object({requestId:requestId.optional(),successorId:text}).strict(),await json(req));
        reply(res,200,await control(id,'supersede',body,p,async()=>core.supersede(id,body.successorId,p)));return;
      }
      if(method==='POST'&&['queue/resume','rewind','stop','archive','reopen'].includes(action)) {
        const body=parsed(z.object({requestId:requestId.optional(),messageId:text.optional()}).strict(),await json(req));
        if(action==='rewind'&&!body.messageId)throw new EngineError('INVALID',400,'messageId required','rewind');
        reply(res,200,await control(id,action,body,p,async()=>{
          if(action==='queue/resume')core.actor(id).resumeQueue();else if(action==='rewind')return core.actor(id).rewind(body.messageId!);
          else await core.actor(id).lifecycle(action as 'stop'|'archive'|'reopen',p);return core.get(id);
        }));return;
      }
    }
    const workspace=/^\/v1\/workspaces(?:\/([^/]+)(?:\/(archive))?)?$/.exec(path);
    if(workspace) {
      if(method==='GET'){const rows=core.workspaces();const result=workspace[1]?rows.find(r=>r.id===workspace[1]):{workspaces:rows};if(!result)throw new EngineError('NOT_FOUND',404,'Workspace not found','workspace');reply(res,200,result);return;}
      if(method==='PATCH'){
        const body=parsed(z.object({id:text.optional(),title:text.min(1)}).strict(),await json(req));const id=workspace[1]??body.id;if(!id)throw new EngineError('INVALID',400,'Workspace id required','workspace');reply(res,200,core.updateWorkspace(id,{title:body.title}));return;
      }
      if(method==='POST'&&workspace[2]==='archive'){reply(res,200,core.updateWorkspace(workspace[1],{archived:true}));return;}
    }
    const download=/^\/v1\/uploads\/([0-9a-f-]{36})$/.exec(path);
    if(download&&method==='GET') {
      if(p.kind!=='console')throw new EngineError('FORBIDDEN',403,'Upload downloads require Console authority','uploads');
      const id=parsed(uuid,download[1]),row=db.prepare('SELECT path,bytes FROM uploads WHERE id=?').get(id);
      if(!row||String(row.path)!==join(uploads.dir,id))throw new EngineError('NOT_FOUND',404,'Upload not found','uploads');
      const stream=createReadStream(String(row.path));
      await new Promise<void>((resolve,reject)=>{
        stream.once('error',reject);stream.once('open',()=>{
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':Number(row.bytes),'Cache-Control':'no-store'});
          stream.pipe(res);
        });
        res.once('finish',resolve);res.once('close',()=>{stream.destroy();resolve();});
      });return;
    }
    if(path==='/v1/uploads'&&method==='POST') {
      const result=await uploads.accepting(async()=>{
        const content=req.headers['content-type']??'';let files:{data:Uint8Array;mime:string}[]=[],agentId:string|undefined;
        if(content.startsWith('multipart/form-data')) {
          const buf=await raw(req,UPLOAD_LIMITS.files*UPLOAD_LIMITS.fileBytes+1024*1024);
          let form:FormData;try{form=await new Request('http://127.0.0.1/',{method:'POST',headers:{'Content-Type':content},body:new Blob([new Uint8Array(buf)])}).formData();}catch{throw new EngineError('INVALID',400,'Invalid multipart upload','uploads');}
          for(const [key,value] of form){if(typeof value==='string'){if(key==='agentId')agentId=value;else throw new EngineError('INVALID',400,'Unexpected upload field','uploads');}else files.push({data:new Uint8Array(await value.arrayBuffer()),mime:value.type||'application/octet-stream'});}
        } else {
          const buf=await raw(req,Math.ceil(UPLOAD_LIMITS.files*UPLOAD_LIMITS.fileBytes*4/3)+1024*1024);
          let value:unknown;try{value=JSON.parse(buf.toString());}catch{throw new EngineError('INVALID',400,'Invalid JSON upload','uploads');}
          if(value&&typeof value==='object'&&'files' in value&&Array.isArray(value.files)&&value.files.length>5)throw new EngineError('LIMIT',413,'At most five files per upload','uploads');
          const body=parsed(z.object({agentId:text.optional(),files:z.array(z.object({mime:text,data:text}).strict()).min(1).max(5)}).strict(),value);agentId=body.agentId;
          files=body.files.map(file=>{if(!validBase64(file.data))throw new EngineError('INVALID',400,'Invalid base64 upload','uploads');return {data:Buffer.from(file.data,'base64'),mime:file.mime};});
        }
        return uploads.store(files,agentId);
      });reply(res,201,{uploads:result});return;
    }
    if(path==='/v1/models'&&method==='GET') {
      const provider=q.get('provider');if(provider&&!core.drivers.has(provider))throw new EngineError('INVALID',400,'Unknown provider','models');
      const models=[];for(const driver of core.drivers.values())if(!driver.disabled&&(!provider||driver.provider===provider)){
        try{models.push(...(await driver.models?.()??[]).map(m=>({...m,label:m.label??m.id,thinking:m.thinking??[],defaultThinking:m.defaultThinking??null,isDefault:m.isDefault??false,provider:driver.provider})));}
        catch{throw new EngineError('DRIVER_UNAVAILABLE',503,'Provider model catalog unavailable','models');}
      }reply(res,200,{models});return;
    }
    if(path==='/v1/terminals'&&method==='POST') {
      const value=await json(req);if(value&&typeof value==='object'&&(('rows' in value&&Number(value.rows)>500)||('cols' in value&&Number(value.cols)>1000)))throw new EngineError('LIMIT',413,'Terminal dimensions exceed limits','terminals');
      const body=parsed(terminalSchema,value);reply(res,201,await core.terminals.create({...body,user:body.user as TerminalUser},p));return;
    }
    if(path==='/v1/terminals'&&method==='GET') {
      await refreshTerminalActivity(core.terminals);
      reply(res,200,core.terminals.list({user:q.get('user') as TerminalUser??undefined,cwd:q.get('cwd')??undefined,includeClosed:q.get('includeClosed')==='1',cursor:q.get('cursor')??undefined,limit:number(q.get('limit'),100,1,100)}));return;
    }
    const grant=/^\/v1\/terminals\/([^/]+)\/capture-grant$/.exec(path);
    if(grant&&method==='POST') {
      const body=parsed(z.object({agentId:text,granted:z.boolean()}).strict(),await json(req));
      setCaptureGrant(core.terminals,grant[1],core.get(body.agentId),body.agentId,body.granted,p);
      reply(res,200,{terminalId:grant[1],agentId:body.agentId,granted:body.granted});return;
    }
    const terminal=/^\/v1\/terminals\/([^/]+)\/(kill|capture)$/.exec(path);
    if(terminal&&terminal[2]==='kill'&&method==='POST'){await core.terminals.kill(terminal[1],p);reply(res,200,{ok:true});return;}
    if(terminal&&terminal[2]==='capture'&&method==='GET'){reply(res,200,{text:await core.terminals.capture(terminal[1],number(q.get('lines'),5000,1,5000))});return;}
    if(/^\/v1\/admin\/(drain|hold|release)$/.test(path)&&method==='POST') {
      if(p.kind!=='console'&&p.kind!=='cli')throw new EngineError('FORBIDDEN',403,'Console or CLI principal required','admin');
      const body=parsed(z.object({deadlineS:z.number().min(0).max(600).optional()}).strict(),await json(req));
      if(path.endsWith('/drain'))reply(res,200,await core.drain((body.deadlineS??600)*1000));
      else {if(path.endsWith('/hold'))core.held=true;else core.release();reply(res,200,{held:core.held});}return;
    }
    throw new EngineError('NOT_FOUND',404,'Route not found','route');
  }
  const http=(req:IncomingMessage,res:ServerResponse)=>{void route(req,res).catch(e=>errorReply(res,e));};
  const tcp=createServer(http),unix=createServer(http),wss=new WebSocketServer({noServer:true,maxPayload:64*1024});
  function wire(server:Server):void {
    server.requestTimeout=30000;server.headersTimeout=10000;
    server.on('upgrade',(req,socket,head)=>{
      try {
        if(closing)throw new EngineError('OFFLINE',503,'Closing','lifecycle');
        const verified=auth.authenticate(req.headers.authorization),url=new URL(req.url??'/','http://127.0.0.1'),match=/^\/v1\/terminals\/([^/]+)\/io$/.exec(url.pathname);
        if(url.pathname!=='/v1/stream'&&!match)throw new EngineError('NOT_FOUND',404,'Unknown socket route','route');
        if(match)scope(verified,'core.read');
        wss.handleUpgrade(req,socket,head,ws=>{
          if(match) {
            const sock=terminalSocket(ws);
            try{core.terminals.attach(match[1],{principal:verified.principal,generation:url.searchParams.has('generation')?number(url.searchParams.get('generation'),0):undefined,offset:url.searchParams.has('offset')?number(url.searchParams.get('offset'),0,0,Number.MAX_SAFE_INTEGER):undefined},sock);}catch{ws.close(1008);}return;
          }
          const subs=new Map<string,()=>void>();
          const send=(data:unknown)=>{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>1024*1024){ws.close(1013);return;}ws.send(JSON.stringify(data));};
          const heartbeat=setInterval(()=>send({op:'heartbeat',ts:new Date().toISOString()}),15000);heartbeat.unref();
          ws.on('message',data=>{
            try {
              const msg=parsed(z.object({op:z.enum(['subscribe','unsubscribe']),id:text.min(1).max(128),agents:z.union([z.literal('*'),z.array(text).max(1000)]).optional(),kinds:z.array(text).optional(),after:z.record(text,cursorSchema).optional(),replies:z.object({to:text,after:text.optional()}).optional()}).strict(),JSON.parse(String(data)));
              subs.get(msg.id)?.();subs.delete(msg.id);if(msg.op==='unsubscribe')return;
              if(subs.size>=32)throw new EngineError('LIMIT',429,'Too many subscriptions','stream');
              if(msg.replies) {
                scope(verified,'user.read');let after=msg.replies.after;const to=msg.replies.to;
                const project=()=>{const result=replies(core,verified,to,after);after=result.cursor;send({op:'replies',sub:msg.id,...result});return result.agentId;};
                const id=project();subs.set(msg.id,journal.subscribe({agents:[id]},()=>{project();}));
              }else{
                scope(verified,'core.read');if(!msg.agents)throw new EngineError('INVALID',400,'agents is required','stream');
                subs.set(msg.id,journal.subscribe({agents:msg.agents,kinds:msg.kinds,after:msg.after},notice=>send({...notice,sub:msg.id})));
              }
            }catch(e){const err=e instanceof EngineError?e:new EngineError('INVALID',400,'Invalid stream message','stream');send({op:'error',code:err.code,rule:err.rule,reason:err.message});}
          });
          ws.once('close',()=>{clearInterval(heartbeat);for(const off of subs.values())off();subs.clear();});
          ws.on('error',()=>{});
        });
      } catch(e) {const err=e instanceof EngineError?e:new EngineError('INVALID',400,'Invalid socket request','socket');socket.end(`HTTP/1.1 ${err.status} Rejected\r\nConnection: close\r\n\r\n`);}
    });
  }
  wire(tcp);wire(unix);const socketPath=assertSocketPath(join(o.stateDir,'run','api.sock'));
  if(existsSync(socketPath)){if(!lstatSync(socketPath).isSocket())throw new Error('API socket path is not a socket');unlinkSync(socketPath);}
  async function close():Promise<void> {
    if(closing)return;closing=true;for(const ws of wss.clients)ws.terminate();wss.close();
    await Promise.all([tcp,unix].map(server=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})));
    if(existsSync(socketPath)&&lstatSync(socketPath).isSocket())unlinkSync(socketPath);
  }
  try {
    tcp.listen(o.port,'127.0.0.1');await once(tcp,'listening');unix.listen(socketPath);await once(unix,'listening');chmodSync(socketPath,0o600);
  }catch(e){await close();throw e;}
  const retention=setInterval(()=>{try{uploads.retain();}catch{/* retry on next maintenance tick */}},3600000);retention.unref();
  return {auth,uploads,port:(tcp.address() as {port:number}).port,socketPath,close:async()=>{clearInterval(retention);await close();}};
}
