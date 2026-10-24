import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Driver, DriverEvent, DriverHost, EnginePlugin, McpService, Outgoing, PolicyEngine, Principal, ProviderAck, Session, SpawnSpec, TerminalService } from '../types.ts';
import { Database } from '../db.ts';
import { Journal } from './index.ts';
import { Registry } from '../registry.ts';
import { ProcessCustody } from '../procs/posix.ts';
import { acquireLock } from '../locks.ts';

export const console:Principal={kind:'console',name:'console'},cli:Principal={kind:'cli',name:'cli'};
export class Events implements AsyncIterable<DriverEvent> {
  values:DriverEvent[]=[]; waiters:((x:IteratorResult<DriverEvent>)=>void)[]=[]; ended=false;
  push(v:DriverEvent):void {const cb=this.waiters.shift();if(cb)cb({done:false,value:v});else this.values.push(v);}
  end():void {this.ended=true;for(const cb of this.waiters.splice(0))cb({done:true,value:undefined});}
  [Symbol.asyncIterator]():AsyncIterator<DriverEvent> {return {next:()=>this.values.length?Promise.resolve({done:false,value:this.values.shift()!}):this.ended?Promise.resolve({done:true,value:undefined}):new Promise(r=>this.waiters.push(r))};}
}
export class FakeSession implements Session {
  nativeId:string; turnId:string|null=null; driverGeneration:number; events=new Events(); sent:Outgoing[]=[]; interrupts=0; settings:unknown[]=[];
  auto=false; failAck=false; host:DriverHost;
  constructor(spec:SpawnSpec,host:DriverHost,resume?:string){this.nativeId=resume??randomUUID();this.driverGeneration=spec.driverGeneration;this.host=host;this.events.push({type:'session_started',nativeId:this.nativeId});}
  async send(m:Outgoing):Promise<ProviderAck> {
    this.sent.push(m);
    if(m.delivery==='start'){this.turnId=randomUUID();this.events.push({type:'turn_started',turnId:this.turnId,commandId:m.commandId});}
    if(this.failAck)throw new Error('Lost ack');
    const turnId=this.turnId!;
    if(this.auto)setTimeout(()=>{this.events.push({type:'timeline',turnId,item:{type:'assistant_message',text:'Synthetic reply.',messageId:null}});this.events.push({type:'turn_completed',turnId});},10);
    return {accepted:true as const,nativeTurnId:turnId,steered:m.delivery==='steer'};
  }
  finish(){this.events.push({type:'turn_completed',turnId:this.turnId});}
  async interrupt(){this.interrupts++;this.events.push({type:'turn_canceled',turnId:this.turnId});}
  async hardStop(){await this.interrupt();return {killed:0,alive:0};}
  async rewind(_messageId:string){this.nativeId=randomUUID();return {nativeId:this.nativeId};}
  async setSettings(s:unknown){this.settings.push(s);}
  pids(){return [];}
  async close(){this.events.end();}
}
export class FakeDriver implements Driver {
  provider:'claude'|'codex'='claude';caps={steer:true,interrupt:true,rewind:'conversation' as const,compact:true,gate:'pretooluse' as const,images:true};
  specs:SpawnSpec[]=[];sessions:FakeSession[]=[];resumes:(string|undefined)[]=[];auto=false;failAck=false;
  async selfTest(){return {ok:true as const};}
  async start(spec:SpawnSpec,host:DriverHost,resume?:string){this.specs.push(spec);this.resumes.push(resume);const s=new FakeSession(spec,host,resume);s.auto=this.auto;s.failAck=this.failAck;this.sessions.push(s);return s;}
  async models(){return [{id:'synthetic'}];}
}
export function fakePlugin():EnginePlugin {return {name:'synthetic',profiles:()=>({test:{name:'test',tools:[],interrupt:false,settingSources:['user']}}),
  beforeCreate:async()=>({ok:true}),beforeSend:async()=>({ok:true}),beforeSpawn:async(_,s)=>s,classify:async()=>null,tools:()=>[],mcpServers:()=>[],onEvent:()=>{},onBoot:async()=>{}};}
export function fakePolicy(plugin=fakePlugin()):PolicyEngine {return {gate:async()=>({allow:true,rule:'fixture'}),admitCreate:(i,p)=>plugin.beforeCreate(i,p),admitSend:(a,m,p)=>plugin.beforeSend(a,m,p),admitSupersede:async(a,s,p)=>plugin.beforeSupersede?plugin.beforeSupersede(a,s,p):{ok:true},profile:n=>plugin.profiles()[n]??null};}
export function fakeTerminals():TerminalService {const items:Record<string,unknown>[]=[];return {
  create:async(req)=>{const r={...req,id:randomUUID(),generation:1,createdAt:new Date().toISOString()};items.push(r);return r;},
  list:q=>({items:items.filter(r=>(!q.user||q.user===r.user)&&(q.includeClosed||!r.closedAt)) as never}),
  kill:async id=>{const r=items.find(r=>r.id===id);if(r)r.closedAt=new Date().toISOString();},capture:async()=>'',
  attach:(_id,_opts,sock)=>{sock.send(new Uint8Array([4,...Buffer.from('restore')]));sock.onMessage(b=>sock.send(b));},sweep:async()=>0,close:async()=>{}};}
export function fakeMcp():McpService{return {slotFor:()=>({name:'fixture',type:'http',url:'http://127.0.0.1:0/mcp/synthetic'}),revoke:()=>{},start:async()=>({port:0}),close:async()=>{}};}
export function scratch(prefix:string):string {if(!process.env.TMPDIR)throw new Error('Tests require an explicit scratch TMPDIR');return mkdtempSync(join(process.env.TMPDIR,prefix));}
export function fixture(file?:string) {
  const dir=scratch('core-'),db=new Database(file??join(dir,'engine.db')),plugin=fakePlugin(),policy=fakePolicy(plugin),journal=new Journal(db,plugin),driver=new FakeDriver(),procs=new ProcessCustody(db);
  const core=new Registry({db,journal,plugin,policy,drivers:[driver],terminals:fakeTerminals(),procs});
  return {dir,db,plugin,policy,journal,driver,core,procs,close:async()=>{await core.close();journal.close();db.close();}};
}
export function intent(extra:Record<string,unknown>={}) {return {requestId:randomUUID(),provider:'claude' as const,model:'synthetic',thinking:'low',mode:'auto',cwd:scratch('cwd-'),title:'test',profile:'test',...extra};}
export async function until(fn:()=>boolean,ms=2000):Promise<void> {const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw new Error('Condition timed out');await new Promise(r=>setTimeout(r,5));}}
/** After close(), the writer lock is free and its holder gone. Linux holds it in a flock helper process (it must have
 * exited); Darwin holds an O_EXLOCK fd in the daemon itself, so lockPid is this process and no helper exists. */
export async function lockReleased(stateDir:string,lockPid:number):Promise<boolean> {
  const lock=await acquireLock(stateDir);await lock.close();
  if(lockPid===process.pid)return true;
  try{process.kill(lockPid,0);return false;}catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH';}
}
