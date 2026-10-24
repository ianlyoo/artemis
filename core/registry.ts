import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentRecord, AgentFilter, CommandState, CreateIntent, Cursor, Driver, Frame, EngineCore, EnginePlugin,
  Origin, PolicyEngine, Principal, SendRequest, TerminalService, TimelineQuery, McpService, McpServerSpec, Refusal } from './types.ts';
import { EngineError } from './types.ts';
import { Database } from './db.ts';
import { Journal } from './journal/index.ts';
import { ProcessCustody } from './procs/posix.ts';
import { validateIntentEnv, validatePluginEnv } from './env.ts';
import { Actor } from './actor.ts';
import { UPLOAD_LIMITS } from './uploads/index.ts';

export function canonical(value:unknown):string {
  if(value===undefined) return 'null';
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value:unknown):string {return createHash('sha256').update(canonical(value)).digest('hex');}
export function user(p:Principal):boolean {return p.kind==='console'||p.kind==='user-channel';}
export function originFor(p:Principal):Origin {return {principal:user(p)?'user':p.kind==='agent'?'agent':'system',channel:p.kind,via:p.name};}
export function refusal(r:Refusal):never {throw new EngineError(r.code,r.code==='ADMISSION_TIMEOUT'||r.code==='ADAPTER_ERROR'?503:403,r.reason,r.rule);}
export async function admitted<T>(fn:()=>Promise<T>,ms=10000):Promise<T> {
  let timer:NodeJS.Timeout|undefined;
  try {return await Promise.race([fn(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new EngineError('ADMISSION_TIMEOUT',503,'Admission timed out','admission')),ms);})]);}
  catch(e) {if(e instanceof EngineError) throw e;throw new EngineError('ADAPTER_ERROR',503,'Adapter failed','adapter');}
  finally {if(timer) clearTimeout(timer);}
}
export type Pending = {id:string;agentId:string;p:Principal;m:SendRequest;origin:Origin};
export type RegistryOptions = {db:Database;journal:Journal;policy:PolicyEngine;plugin:EnginePlugin;drivers:Driver[];
  terminals:TerminalService;procs:ProcessCustody;log?:(msg:string,extra?:Record<string,unknown>)=>void;codexHome?:string;home?:string;deferDispatch?:boolean};
export class Registry implements EngineCore {
  readonly db:Database; readonly journal:Journal; readonly policy:PolicyEngine; readonly plugin:EnginePlugin;
  readonly drivers:Map<string,Driver>; readonly terminals:TerminalService; readonly procs:ProcessCustody;
  readonly actors=new Map<string,Actor>(); readonly options:RegistryOptions;
  readonly unavailable=new Set<string>(); mcp?:(McpService & {serversFor?(agent:AgentRecord):McpServerSpec[]});
  held=false; closing=false;
  private booting:boolean;
  private creates:Promise<unknown>=Promise.resolve();
  constructor(o:RegistryOptions) {this.options=o;this.db=o.db;this.journal=o.journal;this.policy=o.policy;this.plugin=o.plugin;
    this.booting=o.deferDispatch??false;
    this.drivers=new Map(o.drivers.map(d=>[d.provider,d]));this.terminals=o.terminals;this.procs=o.procs;
    this.journal.onFailure(id=>{void this.actor(id).storageFailed().catch(()=>this.log('Journal failure stopped an actor'));});
  }
  get dispatchBlocked():boolean {return this.booting||this.held||this.closing;}
  /** Open dispatch only after plugin boot and listener setup; recover actors not yet in memory. */
  startDispatch():void {
    if(this.closing)return;this.booting=false;
    for(const row of this.db.prepare("SELECT DISTINCT agent_id FROM commands WHERE kind='send' AND state IN ('accepted','queued')").all())this.actor(String(row.agent_id)).kick();
  }
  log(msg:string):void {this.options.log?.(msg);}
  actor(id:string):Actor {this.require(id);let a=this.actors.get(id);if(!a){a=new Actor(this,id);this.actors.set(id,a);}return a;}
  require(id:string):AgentRecord {const a=this.get(id);if(!a) throw new EngineError('NOT_FOUND',404,'Agent not found','agent');return a;}
  get(id:string):(AgentRecord & {env:Record<string,string>;prompt?:string;requestId?:string;status:string;activeTurnId:string|null})|null {
    const r=this.db.prepare('SELECT * FROM agents WHERE id=?').get(id); if(!r) return null;
    const intent=this.db.meta<CreateIntent>(`intent:${id}`);
    const a:AgentRecord={id:String(r.id),provider:r.provider as AgentRecord['provider'],model:String(r.model),thinking:r.thinking as string??undefined,
      mode:r.mode as string??undefined,cwd:String(r.cwd),title:String(r.title),labels:JSON.parse(String(r.labels)),parentId:r.parent_id as string??undefined,
      launcherId:r.launcher_id as string??undefined,profile:String(r.profile),identity:r.identity?JSON.parse(String(r.identity)):undefined,
      state:r.state as AgentRecord['state'],epoch:String(r.epoch),driverGeneration:Number(r.driver_generation),predecessorId:r.predecessor_id as string??undefined,
      successorId:r.successor_id as string??undefined,createdAt:String(r.created_at),archivedAt:r.archived_at as string??undefined};
    const turn=this.db.prepare('SELECT id FROM turns WHERE agent_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(id);
    // Read the latest normalized provider snapshot, not cumulative billing usage or provider files.
    const latest=(predicate:string):Frame|undefined=>{
      const row=this.db.prepare(`SELECT body FROM events WHERE agent_id=? AND epoch=? AND COALESCE(json_extract(body,'$.stale'),0)=0 AND ${predicate} ORDER BY seq DESC LIMIT 1`).get(id,a.epoch);
      return row?JSON.parse(String(row.body)):undefined;
    };
    const runtime=latest("type='settings_changed' AND json_type(body,'$.runtimeModel')='text'");
    const usage=latest("type='timeline' AND json_extract(body,'$.item.type')='usage' AND json_type(body,'$.item.usage')='object'")?.item as {usage?:AgentRecord['usage'];context?:AgentRecord['context']}|undefined;
    const driver=this.drivers.get(a.provider);
    return {...a,mode:a.mode??driver?.defaultMode,modes:driver?.modes??[],runtimeModel:typeof runtime?.runtimeModel==='string'?runtime.runtimeModel:null,
      runtimeThinking:typeof runtime?.runtimeThinking==='string'?runtime.runtimeThinking:null,runtimeMode:typeof runtime?.runtimeMode==='string'?runtime.runtimeMode:null,
      usage:usage?.usage??null,context:usage?.context??null,
      env:intent?.env??{},prompt:intent?.prompt,requestId:intent?.requestId,status:['stopped','archived'].includes(a.state)?'closed':a.state==='writer_locked'?'error':a.state,activeTurnId:turn?String(turn.id):null};
  }
  list(f:AgentFilter={}):AgentRecord[] {return this.db.prepare('SELECT id FROM agents ORDER BY created_at,id').all().map(r=>this.get(String(r.id))!).filter(a=>
    (f.archived===true||a.state!=='archived')&&(!f.provider||a.provider===f.provider)&&(!f.parentId||a.parentId===f.parentId)&&
    Object.entries(f.labels??{}).every(([k,v])=>a.labels[k]===v));}
  async create(i:CreateIntent,p:Principal):Promise<{id:string;state:AgentRecord['state']}> {
    const work=this.creates.then(async()=>{
      this.validateCreate(i);
      const existing=this.lookup(p,i.requestId,{kind:'create',i}); if(existing) return existing as {id:string;state:AgentRecord['state']};
      const allow=await admitted(()=>this.policy.admitCreate(i,p)); if(!('ok' in allow)) refusal(allow);
      validatePluginEnv(allow.env);
      const profile=this.policy.profile(i.profile);
      if(!profile||profile.providers&&!profile.providers.includes(i.provider)) throw new EngineError('FORBIDDEN',403,'Profile does not allow provider','profile');
      if(this.unavailable.has(i.provider)) throw new EngineError('DRIVER_CONTRACT',503,'Driver contract check failed','driver');
      if(i.provider==='agy'||!this.drivers.has(i.provider)) throw new EngineError('DRIVER_DISABLED',503,'Driver unavailable','driver');
      const intent={...i,env:{...i.env,...allow.env},labels:{...i.labels,...allow.labels},identity:{...i.identity,...allow.identity}};
      const id=randomUUID(),now=new Date().toISOString();
      // A predecessorId fences that agent at once, irreversibly: the same authority as supersede must already link it to
      if(i.predecessorId){
        const before=this.get(i.predecessorId); if(!before) throw new EngineError('NOT_FOUND',404,'Predecessor not found','supersede');
        if(before.successorId) throw new EngineError('AGENT_SUPERSEDED',409,'Predecessor is already superseded','supersede');
        const linked=await admitted(()=>this.policy.admitSupersede(before,id,p)); if(!('ok' in linked)) refusal(linked);
      }
      const result={id,state:'idle' as const};
      this.db.tx(()=>{
        this.db.prepare('INSERT INTO agents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,i.provider,i.model,i.thinking??null,i.mode??null,i.cwd,i.title,
          JSON.stringify(intent.labels),i.parentId??null,i.launcherId??null,i.profile,JSON.stringify(intent.identity),'idle','1',0,i.predecessorId??null,null,now,null);
        this.db.setMeta(`intent:${id}`,intent); this.db.setMeta(`idle:${id}`,Date.now());
        this.db.setMeta(`spawnEnv:${id}`,{caller:i.env??{},plugin:allow.env??{}});
        this.insert(p,i.requestId,id,'create',{kind:'create',i},result,'completed');
        this.journal.append(id,{type:'agent_created',origin:originFor(p)});
        this.journal.append(id,{type:'command_state',commandId:this.commandId(p,i.requestId),state:'completed'});
        if(i.predecessorId) this.db.prepare('UPDATE agents SET successor_id=? WHERE id=?').run(id,i.predecessorId);
        this.workspaceFor(i.cwd);
        if(i.prompt) this.acceptSend(id,{requestId:randomUUID(),text:i.prompt},p,originFor(p),true);
      });
      this.actor(id).kick();return result;
    });
    this.creates=work.catch(()=>{});return work;
  }
  private validateCreate(i:CreateIntent):void {
    if(!i||!i.requestId||!['claude','codex','agy'].includes(i.provider)||typeof i.cwd!=='string'||!i.cwd.startsWith('/')||
      typeof i.model!=='string'||!i.model||typeof i.title!=='string'||typeof i.profile!=='string'||!i.profile) throw new EngineError('INVALID',400,'Invalid create intent','request');
    validateIntentEnv(i.env); this.db.assertWritable();
  }
  commandId(p:Principal,requestId:string):string {return digest([p.name,requestId]);}
  lookup(p:Principal,requestId:string,payload:unknown):unknown {
    if(typeof requestId!=='string'||!requestId||requestId.length>256) throw new EngineError('INVALID',400,'requestId is required','request');
    const r=this.db.prepare('SELECT digest,result FROM commands WHERE principal=? AND request_id=?').get(p.name,requestId);
    if(!r) return undefined;
    if(r.digest!==digest(payload)) throw new EngineError('IDEMPOTENCY_CONFLICT',409,'requestId already used for a different request','idempotency');
    const result=JSON.parse(String(r.result));
    if(result&&typeof result==='object'&&result.__error){const e=result.__error;throw new EngineError(e.code,e.status,e.reason,e.rule);}
    return result;
  }
  insert(p:Principal,requestId:string,agentId:string,kind:string,payload:unknown,result:unknown,state:CommandState):void {
    this.db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)').run(p.name,requestId,agentId,kind,digest(payload),state,JSON.stringify(result),new Date().toISOString());
    this.db.setMeta(`command:${this.commandId(p,requestId)}`,{p,requestId,agentId});
  }
  command(id:string):{p:Principal;requestId:string;agentId:string}|undefined {return this.db.meta(`command:${id}`);}
  commandState(id:string):CommandState|undefined {
    const c=this.command(id);return c?this.db.prepare('SELECT state FROM commands WHERE principal=? AND request_id=?').get(c.p.name,c.requestId)?.state as CommandState:undefined;
  }
  transition(id:string,state:CommandState):void {
    const c=this.command(id);if(!c) throw new Error('Unknown command');
    this.db.tx(()=>{
      const r=this.db.prepare('SELECT result,state FROM commands WHERE principal=? AND request_id=?').get(c.p.name,c.requestId)!;
      if(r.state===state) return;
      const result={...JSON.parse(String(r.result)),state};
      this.db.prepare('UPDATE commands SET state=?,result=? WHERE principal=? AND request_id=?').run(state,JSON.stringify(result),c.p.name,c.requestId);
      this.journal.append(c.agentId,{type:'command_state',commandId:id,state});
    });
  }
  pending(agentId:string):Pending[] {
    return this.db.prepare("SELECT principal,request_id FROM commands WHERE agent_id=? AND kind='send' AND state IN ('accepted','queued') ORDER BY rowid").all(agentId)
      .map(r=>this.db.meta<Pending>(`pending:${digest([r.principal,r.request_id])}`)).filter((x):x is Pending=>!!x);
  }
  acceptSend(agentId:string,m:SendRequest,p:Principal,origin:Origin,forceQueue=false):{commandId:string;state:CommandState} {
    const a=this.require(agentId); const driver=this.drivers.get(a.provider)!;
    if(a.state==='archived') throw new EngineError('ARCHIVED',409,'Agent is archived','lifecycle');
    if(a.successorId) throw new EngineError('AGENT_SUPERSEDED',409,'Agent is superseded; send to its successor','supersede');
    if(a.state==='writer_locked') throw new EngineError('WRITER_LOCKED',409,'Previous writer cannot be proven dead','custody');
    if(this.unavailable.has(a.provider)) throw new EngineError('DRIVER_CONTRACT',503,'Driver contract check failed','driver');
    if(m.delivery==='interrupt'&&!user(p)&&!(p.kind==='agent'&&this.policy.profile(this.require(p.agentId).profile)?.interrupt))
      throw new EngineError('INTERRUPT_FORBIDDEN',403,'Interrupt requires user authority or a profile grant','interrupt');
    if(m.delivery==='interrupt'&&!driver.caps.interrupt) throw new EngineError('DRIVER_CONTRACT',503,'Driver does not support interrupt','driver');
    const slash=m.text.trim().split(/\s+/)[0];
    // Only commands in the driver's declared capabilities are special; unknown slash text remains ordinary text.
    const knownSlash=slash==='/compact'&&driver.caps.compact;
    const request={...m,delivery:knownSlash&&m.delivery!=='interrupt'?'queue' as const:m.delivery??'steer'};
    if(this.pending(agentId).length>=100) throw new EngineError('QUEUE_FULL',429,'Agent queue is full','queue');
    const state:CommandState=forceQueue||this.dispatchBlocked||request.delivery==='queue'||request.delivery==='when_idle'?'queued':'accepted';
    const id=this.commandId(p,m.requestId), result={commandId:id,state};
    this.db.tx(()=>{
      if(user(p)) this.db.setMeta(`paused:${agentId}`,0);
      this.insert(p,m.requestId,agentId,'send',{kind:'send',agentId,m},result,state);
      this.db.setMeta(`pending:${id}`,{id,agentId,p,m:request,origin} satisfies Pending);
      this.journal.append(agentId,{type:'command_state',commandId:id,state:'accepted',origin});
      if(state==='queued') this.journal.append(agentId,{type:'command_state',commandId:id,state,origin});
    });return result;
  }
  async send(agentId:string,m:SendRequest,p:Principal,origin=originFor(p)):Promise<{commandId:string;state:CommandState}> {
    return this.actor(agentId).exclusive(async()=>{
      const existing=this.lookup(p,m.requestId,{kind:'send',agentId,m});
      if(existing) {
        const result=existing as {commandId:string;state:CommandState};
        if(['accepted','queued'].includes(this.commandState(result.commandId)??''))this.actor(agentId).kick();
        return result;
      }
      if(typeof m.text!=='string'||!['steer','queue','when_idle','interrupt'].includes(m.delivery??'steer')) throw new EngineError('INVALID',400,'Invalid message','request');
      const images=m.images??[],attachments=m.attachments??[];
      if(images.length>4||attachments.length>5) throw new EngineError('LIMIT',413,'At most four images and five attachments per message','uploads');
      let attachmentBytes=0;
      for(const [ids,image] of [[images,true],[attachments,false]] as const)for(const id of ids) {
        const file=this.db.prepare('SELECT bytes,mime FROM uploads WHERE id=? AND (agent_id IS NULL OR agent_id=?)').get(id,agentId);
        if(!file||image&&!String(file.mime).startsWith('image/')) throw new EngineError('NOT_FOUND',404,'Upload not found for this agent','uploads');
        if(Number(file.bytes)>UPLOAD_LIMITS.fileBytes) throw new EngineError('LIMIT',413,'Upload exceeds per-file limit','uploads');
        if(!image)attachmentBytes+=Number(file.bytes);
      }
      if(attachmentBytes>50*1024*1024) throw new EngineError('LIMIT',413,'Attachments exceed 50 MiB','uploads');
      const a=this.require(agentId),allow=await admitted(()=>this.policy.admitSend(a,m,p)); if(!('ok' in allow)) refusal(allow);
      const result=this.acceptSend(agentId,m,p,origin);this.actor(agentId).kick();return result;
    });
  }
  cancel(id:string,req:{requestId:string;hardStop?:boolean},p:Principal):Promise<{turnId:string|null;toolsRunning:number}> {return this.actor(id).cancel(req,p);}
  async archive(id:string,p:Principal):Promise<void> {await this.actor(id).lifecycle('archive',p);}
  /** Fence a predecessor for its successor (C11 P1-3): Console or the host CLI only (the cutover runs it). */
  async supersede(id:string,successorId:string,p:Principal):Promise<ReturnType<Registry['get']>&{processes:number}> {
    if(p.kind!=='console'&&p.kind!=='cli') throw new EngineError('FORBIDDEN',403,'Console or CLI principal required','supersede');
    if(typeof successorId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(successorId)||successorId===id) throw new EngineError('INVALID',400,'Invalid successorId','supersede');
    const a=this.require(id);
    const allow=await admitted(()=>this.policy.admitSupersede(a,successorId,p)); if(!('ok' in allow)) refusal(allow);
    const processes=await this.actor(id).supersede(successorId,p);
    return {...this.get(id)!,processes};
  }
  async waitFor(id:string,_state:'idle',timeoutMs:number):Promise<AgentRecord> {
    const end=Date.now()+Math.max(0,Math.min(600000,timeoutMs));
    while(true) {
      const a=this.get(id);if(!a)throw new EngineError('NOT_FOUND',404,'Agent not found','agent');
      const pending=this.db.prepare("SELECT 1 FROM commands WHERE agent_id=? AND state IN ('accepted','queued','dispatching') LIMIT 1").get(id);
      if((!a.activeTurnId&&!['starting','running'].includes(a.state)&&!pending)||Date.now()>=end)return a;
      await delay(Math.max(0,Math.min(20,end-Date.now())));
    }
  }
  timeline(id:string,q:TimelineQuery):{frames:Frame[];cursor:Cursor} {return this.journal.timeline(id,q);}
  reconcile():void {
    this.db.tx(()=>{
      for(const row of this.db.prepare('SELECT * FROM turns WHERE ended_at IS NULL').all()) {
        this.db.prepare("UPDATE turns SET ended_at=?,outcome='failed' WHERE id=?").run(new Date().toISOString(),row.id);
        this.journal.append(String(row.agent_id),{type:'turn_failed',turnId:String(row.id),reason:'daemon_restart'});
      }
      for(const r of this.db.prepare("SELECT * FROM commands WHERE state IN ('accepted','dispatching','provider_acknowledged')").all()) {
        const id=digest([r.principal,r.request_id]);
        this.transition(id,r.state==='dispatching'?'delivery_unknown':r.state==='accepted'&&r.kind==='send'?'queued':'failed');
        if(r.state==='dispatching') this.journal.append(String(r.agent_id),{type:'message_ambiguous',commandId:id});
      }
      this.db.prepare("UPDATE agents SET state='idle' WHERE state IN ('running','starting')").run();
      this.db.prepare("UPDATE permissions SET state='denied',decided_by='daemon_restart' WHERE state='pending' AND kind NOT LIKE 'user:%'").run();
      for(const a of this.list({archived:true})) this.journal.append(a.id,{type:'daemon_restart'});
    });
  }
  workspaceFor(cwd:string):Record<string,unknown> {
    const id=digest(cwd).slice(0,24),key=`workspace:${id}`;
    let value=this.db.meta<Record<string,unknown>>(key);
    if(!value){value={id,cwd,title:cwd.split('/').at(-1)||cwd,archived:false};this.db.setMeta(key,value);}return value;
  }
  workspaces():Record<string,unknown>[] {return this.db.prepare("SELECT value FROM meta WHERE key LIKE 'workspace:%' ORDER BY key").all().map(r=>JSON.parse(String(r.value)));}
  updateWorkspace(id:string,body:{title?:string;archived?:boolean}):Record<string,unknown> {
    const row=this.db.meta<Record<string,unknown>>(`workspace:${id}`);if(!row) throw new EngineError('NOT_FOUND',404,'Workspace not found','workspace');
    const next={...row,...body};this.db.tx(()=>this.db.setMeta(`workspace:${id}`,next));return next;
  }
  async cleanupChildren(req:{parentId?:string;label?:string;idleHours:number},p:Principal):Promise<{archived:string[]}> {
    if(!req.parentId&&!req.label||!Number.isFinite(req.idleHours)||req.idleHours<0) throw new EngineError('INVALID',400,'Parent selector and nonnegative idleHours required','cleanup');
    const archived:string[]=[];
    for(const a of this.list({})) {
      const labelAt=req.label?.indexOf('=')??-1;
      const match=req.parentId?a.parentId===req.parentId:labelAt<0?!!a.labels[req.label!]:a.labels[req.label!.slice(0,labelAt)]===req.label!.slice(labelAt+1);
      if(!match) continue;
      await this.actor(a.id).exclusive(async()=>{
        const fresh=this.require(a.id);
        if(fresh.state!=='idle'||this.pending(a.id).length||this.procs.toolsRunning(a.id)||this.actor(a.id).permissions().length||
          (this.db.meta<number>(`idle:${a.id}`)??Date.now())>Date.now()-req.idleHours*3600000) return;
        await this.actor(a.id).doLifecycle('archive',p);archived.push(a.id);
      });
    }return {archived};
  }
  async drain(deadlineMs=600000):Promise<{drained:boolean;deferred?:boolean}> {
    this.held=true;const end=Date.now()+Math.max(0,Math.min(deadlineMs,600000));
    while(this.list({}).some(a=>a.state==='running'||a.state==='starting')) {
      if(Date.now()>=end){this.release();return {drained:false,deferred:true};}await delay(Math.min(50,end-Date.now()));
    }return {drained:true};
  }
  release():void {this.held=false;for(const actor of this.actors.values()) actor.kick();}
  async close():Promise<void> {
    this.closing=true;
    for(const actor of this.actors.values()) await actor.close();
    this.procs.stop();const locked=await this.procs.sweep();if(locked.length) throw new Error('Owned processes remain alive');
    this.journal.flush();
  }
}
