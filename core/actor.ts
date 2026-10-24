import { randomUUID } from 'node:crypto';
import type { DriverEvent, DriverHost, Outgoing, PermissionAnswer, PermissionRequest, Principal, Session, SpawnSpec } from './types.ts';
import { EngineError } from './types.ts';
import { buildChildEnv, validatePluginEnv } from './env.ts';
import { admitted, digest, originFor } from './registry.ts';
import type { Pending, Registry } from './registry.ts';
type TerminalEvent=Extract<DriverEvent,{type:'turn_completed'|'turn_failed'|'turn_canceled'}>;

export class Actor {
  readonly core:Registry; readonly id:string;
  private serial:Promise<unknown>=Promise.resolve();
  private session?:Session;
  private starting?:Promise<Session>;
  private reader?:Promise<void>;
  private scheduled=false;
  private closed=false;
  private endingTurn:string|null=null;
  private deferredFinish?:{type:'turn_completed'|'turn_failed'|'turn_canceled';reason?:string};
  private pauseTimer?:NodeJS.Timeout;
  private answers=new Map<string,{resolve:(a:PermissionAnswer)=>void;timer:NodeJS.Timeout}>();
  private turns=new Map<string,{generation:number;native?:string}>();
  private nativeTurns=new Map<string,string>();
  private earlyTerminals=new Map<string,{event:TerminalEvent;generation:number}>();
  constructor(core:Registry,id:string){this.core=core;this.id=id;}
  exclusive<T>(fn:()=>Promise<T>):Promise<T> {
    const run=this.serial.then(fn);this.serial=run.catch(()=>{});return run;
  }
  kick():void {
    if(this.scheduled||this.closed||this.core.dispatchBlocked) return;
    this.scheduled=true;
    queueMicrotask(()=>void this.exclusive(async()=>{
      this.scheduled=false;
      if(this.core.dispatchBlocked||this.closed) return;
      let a=this.core.require(this.id);
      if(['archived','writer_locked'].includes(a.state)) return;
      if(a.successorId){this.cancelPending();return;}  // superseded: queued work never starts this id (also after a restart)
      const paused=this.core.db.meta<number>(`paused:${this.id}`)??0;
      if(paused>Date.now()&&!this.pauseTimer){this.pauseTimer=setTimeout(()=>{this.pauseTimer=undefined;this.kick();},paused-Date.now());this.pauseTimer.unref();}
      for(const item of this.core.pending(this.id)) {
        a=this.core.require(this.id);
        if(this.core.dispatchBlocked||this.closed||['archived','writer_locked'].includes(a.state)) break;
        const running=a.state==='running'||a.state==='starting';
        const isWake=item.m.delivery==='when_idle';
        if(paused>Date.now()&&!isWake) continue;
        if(running&&(isWake||item.m.delivery==='queue')) {this.core.transition(item.id,'queued');continue;}
        await this.dispatch(item,running);
        // A queued item starts a turn synchronously; later queue/wake items must wait for its idle boundary.
      }
    }).catch(()=>{this.core.log('Actor dispatch failed');}));
  }
  private async ensureSession():Promise<Session> {
    if(this.session) return this.session;
    if(this.starting) return this.starting;
    this.starting=this.spawn();
    try {return await this.starting;} finally {this.starting=undefined;}
  }
  private async spawn():Promise<Session> {
    let a=this.core.require(this.id);
    if(a.state==='writer_locked') throw new EngineError('WRITER_LOCKED',409,'Writer custody is unresolved','custody');
    if(a.successorId) throw new EngineError('AGENT_SUPERSEDED',409,'Agent is superseded; send to its successor','supersede');
    const driver=this.core.drivers.get(a.provider);
    if(!driver||this.core.unavailable.has(a.provider)) throw new EngineError('DRIVER_CONTRACT',503,'Driver unavailable','driver');
    const profile=this.core.policy.profile(a.profile);if(!profile) throw new EngineError('FORBIDDEN',403,'Unknown profile','profile');
    this.core.journal.flush(this.id);
    this.core.db.tx(()=>this.core.db.prepare('UPDATE agents SET driver_generation=driver_generation+1 WHERE id=?').run(this.id));
    a=this.core.require(this.id);const generation=a.driverGeneration;
    const intent=this.core.db.meta<{env?:Record<string,string>}>(`intent:${this.id}`);
    const envSource=this.core.db.meta<{caller:Record<string,string>;plugin:Record<string,string>}>(`spawnEnv:${this.id}`);
    let spec:SpawnSpec={agentId:this.id,driverGeneration:generation,cwd:a.cwd,model:a.model,thinking:a.thinking,mode:a.mode,
      profile:a.profile,env:buildChildEnv(a.provider,envSource?.caller??intent?.env,process.env,{home:this.core.options.home,codexHome:this.core.options.codexHome},envSource?.plugin),
      settingSources:profile.settingSources,mcp:this.core.mcp?.serversFor?.(a)??(this.core.mcp?[this.core.mcp.slotFor(a)]:[])};
    spec=await admitted(()=>this.core.plugin.beforeSpawn(a,spec));
    const {HOME:home,CODEX_HOME:codexHome,...extras}=spec.env;validatePluginEnv(extras);
    if(home!==this.core.options.home&&home!==buildChildEnv('terminal').HOME || codexHome?.split('/').includes('.paseo')) throw new EngineError('FORBIDDEN',403,'Invalid child configuration','environment');
    if(spec.agentId!==this.id||spec.driverGeneration!==generation) throw new EngineError('ADAPTER_ERROR',503,'Adapter changed spawn identity','adapter');
    const host:DriverHost={
      gate:async(action,raw)=>{try{return await this.core.policy.gate(this.core.require(this.id),action,raw);}catch{return {allow:false,rule:'policy-error',reason:'Policy engine failed'};}},
      prompt:req=>this.prompt(req,generation),trackPid:(pid,role)=>this.core.procs.track(this.id,pid,role),log:()=>{this.core.log('Driver diagnostic');},
    };
    const native=this.core.db.prepare('SELECT native_id FROM native_sessions WHERE agent_id=?').get(this.id);
    const session=await driver.start(spec,host,native?String(native.native_id):undefined);
    this.session=session;
    if(session.nativeId) this.native(session.nativeId);
    this.reader=this.readEvents(session,generation);
    return session;
  }
  private native(id:string):void {
    const a=this.core.require(this.id);
    this.core.db.prepare('INSERT INTO native_sessions VALUES(?,?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET native_id=excluded.native_id,provider=excluded.provider,cwd=excluded.cwd').run(
      this.id,a.provider,id,a.provider==='codex'?this.core.options.codexHome??null:null,a.cwd);
  }
  private async dispatch(item:Pending,wasRunning:boolean):Promise<void> {
    let dispatching=false;
    try {
      const a=this.core.require(this.id);
      // Resolve opaque upload references before invoking a provider.
      const images=(item.m.images??[]).map(id=>{
        const row=this.core.db.prepare('SELECT * FROM uploads WHERE id=? AND (agent_id IS NULL OR agent_id=?)').get(id,this.id);
        if(!row||!String(row.mime).startsWith('image/')) throw new EngineError('NOT_FOUND',404,'Image upload not found','uploads');
        return {path:String(row.path),mime:String(row.mime)};
      });
      const attachments=(item.m.attachments??[]).map(id=>{
        const row=this.core.db.prepare('SELECT path FROM uploads WHERE id=? AND (agent_id IS NULL OR agent_id=?)').get(id,this.id);
        if(!row) throw new EngineError('NOT_FOUND',404,'Attachment upload not found','uploads');return String(row.path);
      });
      const session=await this.ensureSession();
      const generation=this.core.require(this.id).driverGeneration;
      if(item.m.delivery==='interrupt'&&wasRunning) {
        await this.endTurn('interrupted',false);wasRunning=false;
      }
      const turnId=wasRunning?this.currentTurn():randomUUID();
      this.core.db.tx(()=>{
        this.core.transition(item.id,'dispatching');dispatching=true;
        this.core.db.setMeta(`commandTurn:${item.id}`,turnId);
        if(!wasRunning) {
          this.turns.set(turnId!,{generation});
          this.core.db.prepare('INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)').run(turnId,this.id,null,JSON.stringify(item.origin),a.model,new Date().toISOString(),null,null);
          this.core.db.prepare("UPDATE agents SET state='running' WHERE id=?").run(this.id);
          this.core.journal.append(this.id,{type:'turn_started',turnId,commandId:item.id,origin:item.origin,model:a.model,thinking:a.thinking,mode:a.mode});
        }
        this.core.journal.append(this.id,{type:'timeline',turnId,commandId:item.id,origin:item.origin,
          item:{type:'user_message',text:item.m.text,messageId:item.id,clientMessageId:item.m.clientMessageId??null}});
      });
      const outgoing:Outgoing={commandId:item.id,text:item.m.text+(attachments.length?'\n\nAttachments:\n'+attachments.join('\n'):''),images,
        delivery:wasRunning?'steer':'start',clientMessageId:item.m.clientMessageId,origin:item.origin};
      // cancel/steer and permission decisions remain available while an acknowledgement is outstanding.
      void session.send(outgoing).then(ack=>{
        if(this.closed)return;
        if(!ack.accepted){this.core.transition(item.id,'failed');if(!wasRunning&&this.currentTurn()===turnId)this.finish('turn_failed',ack.error);return;}
        this.core.db.tx(()=>{
          const state=this.core.commandState(item.id);
          if(state!=='dispatching')return;
          this.core.transition(item.id,'provider_acknowledged');
          if(ack.nativeTurnId&&turnId)this.bindNative(turnId,ack.nativeTurnId,generation);
          const finished=this.core.db.prepare('SELECT outcome FROM turns WHERE id=?').get(turnId);
          if(finished?.outcome)this.core.transition(item.id,finished.outcome==='completed'?'completed':finished.outcome==='canceled'?'canceled':'failed');
        });
        if(ack.nativeTurnId)this.flushTerminal(ack.nativeTurnId,generation);
      }).catch(()=>{
        if(this.closed||this.core.commandState(item.id)!=='dispatching')return;
        this.core.db.tx(()=>{
          this.core.transition(item.id,'delivery_unknown');this.core.journal.append(this.id,{type:'message_ambiguous',commandId:item.id});
          if(!wasRunning&&this.currentTurn()===turnId)this.finish('turn_failed','delivery_unknown');
        });
      }).catch(()=>{this.core.log('Acknowledgement could not be journaled');});
    } catch {
      this.core.db.tx(()=>{
        this.core.transition(item.id,dispatching?'delivery_unknown':'failed');
        if(dispatching) this.core.journal.append(this.id,{type:'message_ambiguous',commandId:item.id});
        if(!wasRunning) this.finish('turn_failed',dispatching?'delivery_unknown':'driver_start');
      });
    }
  }
  private currentTurn():string|null {
    const r=this.core.db.prepare('SELECT id FROM turns WHERE agent_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(this.id);return r?String(r.id):null;
  }
  private nativeKey(native:string,generation:number):string {return JSON.stringify([generation,native]);}
  private bindNative(turnId:string,native:string,generation:number):boolean {
    const turn=this.turns.get(turnId),key=this.nativeKey(native,generation),bound=this.nativeTurns.get(key);
    if(!turn||turn.generation!==generation||(turn.native&&turn.native!==native)||(bound&&bound!==turnId))return false;
    turn.native=native;this.nativeTurns.set(key,turnId);
    this.core.db.prepare('UPDATE turns SET native_turn_id=? WHERE id=?').run(native,turnId);return true;
  }
  private terminal(event:TerminalEvent,generation:number):void {
    const key=event.turnId?this.nativeKey(event.turnId,generation):undefined;
    const turnId=key?this.nativeTurns.get(key):undefined;
    if(key&&!turnId&&this.earlyTerminals.size<64) {
      // A result may beat turn_started or its send ack. Never attribute it to the
      // current turn merely because that turn has no native ID yet.
      this.core.journal.output(this.id,{...event,driverGeneration:generation,stale:true});
      if(!this.earlyTerminals.has(key))this.earlyTerminals.set(key,{event,generation});return;
    }
    if(!turnId||turnId!==this.currentTurn()) {
      this.core.journal.output(this.id,{...event,turnId:turnId??event.turnId,driverGeneration:generation,stale:true});return;
    }
    this.providerFinish(event.type,event.reason??event.error);
  }
  private flushTerminal(native:string,generation:number):void {
    const key=this.nativeKey(native,generation),pending=this.earlyTerminals.get(key);
    if(pending&&this.nativeTurns.has(key)){this.earlyTerminals.delete(key);this.terminal(pending.event,pending.generation);}
  }
  private async readEvents(session:Session,generation:number):Promise<void> {
    try {
      for await(const ev of session.events) {
        const a=this.core.require(this.id);
        if(generation!==a.driverGeneration) {this.core.journal.output(this.id,{...ev,driverGeneration:generation});continue;}
        const turnId=this.currentTurn();
        if(ev.type==='session_started'){this.core.db.tx(()=>{this.native(ev.nativeId);this.core.journal.output(this.id,{...ev,driverGeneration:generation});});continue;}
        if(ev.type==='turn_started') {
          const logical=ev.commandId?this.core.db.meta<string>(`commandTurn:${ev.commandId}`):ev.turnId?this.nativeTurns.get(this.nativeKey(ev.turnId,generation)):undefined;
          if(logical&&ev.turnId&&this.bindNative(logical,ev.turnId,generation)) {
            this.flushTerminal(ev.turnId,generation);if(logical===turnId)continue;
          }
          this.core.journal.output(this.id,{...ev,turnId:logical??ev.turnId,driverGeneration:generation,stale:true});
          continue; // The logical turn begins at durable dispatch, before provider output.
        }
        if(ev.type==='turn_completed'||ev.type==='turn_failed'||ev.type==='turn_canceled') {
          this.terminal(ev,generation);continue;
        }
        if(ev.type==='timeline'&&ev.item.type==='user_message') continue; // Core owns the user item and its client id.
        this.core.journal.output(this.id,{...ev,turnId:'turnId' in ev?turnId:undefined,driverGeneration:generation});
        if(ev.type==='exited') {
          if(turnId) this.providerFinish('turn_failed','provider_exit');
          if(this.session===session&&(!this.endingTurn||this.endingTurn!==turnId)) this.session=undefined;
        }
      }
    } catch {
      if(generation===this.core.require(this.id).driverGeneration&&!this.closed) {
        try{this.providerFinish('turn_failed','driver_stream');}catch{
          try{this.core.db.prepare("UPDATE agents SET state='error' WHERE id=?").run(this.id);}catch{/* storage unavailable */}
          try{await session.hardStop();}catch{/* custody still verifies at shutdown/boot */}
        }
      }
    }
  }
  private providerFinish(type:'turn_completed'|'turn_failed'|'turn_canceled',reason?:string):void {
    if(this.endingTurn&&this.currentTurn()===this.endingTurn){this.deferredFinish??={type,reason};return;}
    this.finish(type,reason);
  }
  private async endTurn(reason:string,hardStop:boolean):Promise<void> {
    this.endingTurn=this.currentTurn();
    try {
      if(hardStop) {
        const sessionResult=await this.session?.hardStop(),custody=await this.core.procs.kill(this.id);
        if(sessionResult?.alive||custody.alive) {
          this.core.db.prepare("UPDATE agents SET state='writer_locked' WHERE id=?").run(this.id);
          throw new EngineError('WRITER_LOCKED',409,'Owned processes remain alive','custody');
        }
        await this.closeSession();
      } else if(this.session) await this.session.interrupt();
      this.finish('turn_canceled',reason);
    } catch(error) {
      if(this.deferredFinish)this.finish(this.deferredFinish.type,this.deferredFinish.reason);
      throw error;
    } finally {this.endingTurn=null;this.deferredFinish=undefined;}
  }
  private finish(type:'turn_completed'|'turn_failed'|'turn_canceled',reason?:string):void {
    const turnId=this.currentTurn();if(!turnId) return;
    for(const id of this.answers.keys())this.resolvePrompt(id,'deny','turn_ended');
    this.core.journal.flush(this.id);
    this.core.db.tx(()=>{
      const outcome=type.slice(5);
      this.core.db.prepare('UPDATE turns SET ended_at=?,outcome=? WHERE id=?').run(new Date().toISOString(),outcome,turnId);
      this.core.db.prepare("UPDATE agents SET state='idle' WHERE id=? AND state NOT IN ('archived','writer_locked','stopped')").run(this.id);
      this.core.db.setMeta(`idle:${this.id}`,Date.now());
      this.core.journal.append(this.id,{type,turnId,reason});
      for(const r of this.core.db.prepare("SELECT principal,request_id FROM commands WHERE agent_id=? AND state='provider_acknowledged'").all(this.id)) {
        const id=digest([r.principal,r.request_id]);if(this.core.db.meta(`commandTurn:${id}`)===turnId) this.core.transition(id,outcome==='completed'?'completed':outcome==='canceled'?'canceled':'failed');
      }
    });
    this.kick();
  }
  async cancel(req:{requestId:string;hardStop?:boolean},p:Principal):Promise<{turnId:string|null;toolsRunning:number}> {
    return this.exclusive(async()=>{
      const payload={kind:'cancel',id:this.id,req},existing=this.core.lookup(p,req.requestId,payload);if(existing) return existing as {turnId:string|null;toolsRunning:number};
      const turnId=this.currentTurn(),commandId=this.core.commandId(p,req.requestId);
      this.core.db.tx(()=>{
        this.core.insert(p,req.requestId,this.id,'cancel',payload,{turnId,toolsRunning:this.core.procs.toolsRunning(this.id)},'accepted');
        this.core.journal.append(this.id,{type:'command_state',commandId,state:'accepted'});
        this.core.transition(commandId,'dispatching');
      });
      this.core.db.tx(()=>{this.core.db.setMeta(`paused:${this.id}`,Date.now()+600000);this.core.journal.append(this.id,{type:'queue_paused',turnId});});
      await this.endTurn('cancel',!!req.hardStop);this.core.procs.sample();
      const result={turnId,toolsRunning:this.core.procs.toolsRunning(this.id)};
      this.core.db.tx(()=>{this.core.transition(commandId,'completed');this.core.db.prepare('UPDATE commands SET result=? WHERE principal=? AND request_id=?').run(JSON.stringify(result),p.name,req.requestId);});
      this.kick();return result;
    });
  }
  async withdraw(commandId:string):Promise<void> {
    await this.exclusive(async()=>{
      const c=this.core.command(commandId);
      if(!c||c.agentId!==this.id) throw new EngineError('NOT_FOUND',404,'Command not found','queue');
      if(!['queued','accepted'].includes(this.core.commandState(commandId)??'')) throw new EngineError('CONFLICT',409,'Command already dispatched','queue');
      this.core.db.tx(()=>{this.core.transition(commandId,'withdrawn');this.core.journal.append(this.id,{type:'withdrawn',commandId});});
    });
  }
  resumeQueue():void {this.core.db.tx(()=>{this.core.db.setMeta(`paused:${this.id}`,0);this.core.journal.append(this.id,{type:'queue_resumed'});});this.kick();}
  lifecycle(action:'stop'|'archive'|'reopen',p:Principal):Promise<void> {return this.exclusive(()=>this.doLifecycle(action,p));}
  async doLifecycle(action:'stop'|'archive'|'reopen',p:Principal):Promise<void> {
    if(action==='reopen') {
      if(this.core.require(this.id).state==='writer_locked') throw new EngineError('WRITER_LOCKED',409,'Writer custody unresolved','custody');
      if(this.core.require(this.id).successorId) throw new EngineError('AGENT_SUPERSEDED',409,'A superseded agent cannot be reopened','supersede');
      this.closed=false;
      this.core.db.tx(()=>{this.core.db.prepare("UPDATE agents SET state='idle',archived_at=NULL WHERE id=?").run(this.id);this.core.db.setMeta(`idle:${this.id}`,Date.now());this.core.journal.append(this.id,{type:'reopened',origin:originFor(p)});});
      this.kick();return;
    }
    await this.endTurn(action,true);
    this.core.db.tx(()=>{
      for(const item of this.core.pending(this.id)) this.core.transition(item.id,'canceled');
      this.core.db.prepare('UPDATE agents SET state=?,archived_at=? WHERE id=?').run(action==='archive'?'archived':'stopped',action==='archive'?new Date().toISOString():null,this.id);
      this.core.journal.append(this.id,{type:action==='archive'?'archived':'stopped',origin:originFor(p)});
    });
    if(action==='archive') this.core.mcp?.revoke(this.id);
  }
  private cancelPending():void {
    const items=this.core.pending(this.id);
    if(items.length)this.core.db.tx(()=>{for(const item of items)this.core.transition(item.id,'canceled');});
  }
  /** C11 P1-3: the local supersession fence. The successor link is committed first (durable across artemisd restarts:
   * no send, reopen, queued item or spawn for this id after it), then the predecessor is stopped and its owned
   * processes verified gone. The caller activates the successor only on processes === 0. */
  supersede(successorId:string,p:Principal):Promise<number> {
    return this.exclusive(async()=>{
      const a=this.core.require(this.id);
      if(a.successorId&&a.successorId!==successorId) throw new EngineError('CONFLICT',409,'Agent already has another successor','supersede');
      this.core.db.tx(()=>{
        this.core.db.prepare('UPDATE agents SET successor_id=? WHERE id=?').run(successorId,this.id);
        for(const item of this.core.pending(this.id)) this.core.transition(item.id,'canceled');
      });
      await this.endTurn('supersede',true);
      this.core.procs.sample();
      const processes=this.core.procs.alive(this.id);
      if(processes) {
        this.core.db.prepare("UPDATE agents SET state='writer_locked' WHERE id=?").run(this.id);
        throw new EngineError('WRITER_LOCKED',409,'Owned processes remain alive','custody');
      }
      this.core.db.tx(()=>{
        this.core.db.prepare("UPDATE agents SET state='stopped' WHERE id=? AND state<>'archived'").run(this.id);
        if(a.successorId!==successorId) this.core.journal.append(this.id,{type:'stopped',origin:originFor(p),successorId});
      });
      return processes;
    });
  }
  async settings(s:{model?:string;thinking?:string;mode?:string}):Promise<void> {
    await this.exclusive(async()=>{
      for(const key of Object.keys(s)) if(!['model','thinking','mode'].includes(key)||typeof s[key as keyof typeof s]!=='string') throw new EngineError('INVALID',400,'Invalid settings','settings');
      if(!this.core.policy.profile(this.core.require(this.id).profile)) throw new EngineError('FORBIDDEN',403,'Unknown profile','profile');
      if(this.session?.setSettings) await this.session.setSettings(s);
      else if(this.currentTurn()) throw new EngineError('CONFLICT',409,'Settings require an idle boundary for this driver','settings');
      else await this.closeSession();
      this.core.db.tx(()=>{
        for(const [key,value] of Object.entries(s)) this.core.db.prepare(`UPDATE agents SET ${key}=? WHERE id=?`).run(value,this.id);
        this.core.journal.append(this.id,{type:'settings_changed',...s});
      });
    });
  }
  async rewind(messageId:string):Promise<{epoch:string}> {
    return this.exclusive(async()=>{
      if(this.currentTurn()) throw new EngineError('CONFLICT',409,'Rewind requires idle','rewind');
      const session=await this.ensureSession();if(!session.rewind) throw new EngineError('DRIVER_CONTRACT',503,'Driver does not support rewind','rewind');
      const result=await session.rewind(messageId);this.core.journal.flush(this.id);
      const epoch=String(BigInt(this.core.require(this.id).epoch)+1n);
      this.core.db.tx(()=>{this.native(result.nativeId);this.core.db.prepare('UPDATE agents SET epoch=? WHERE id=?').run(epoch,this.id);this.core.journal.append(this.id,{type:'rewound',messageId});});
      return {epoch};
    });
  }
  private prompt(req:PermissionRequest,generation:number):Promise<PermissionAnswer> {
    if(this.closed||generation!==this.core.require(this.id).driverGeneration) return Promise.resolve({decision:'deny'});
    const id=randomUUID(),requestDigest=digest({req,generation,id}),expiresAt=new Date(Date.now()+1800000).toISOString();
    return new Promise(resolve=>{
      const timer=setTimeout(()=>this.resolvePrompt(id,'deny','expiry'),1800000);timer.unref();this.answers.set(id,{resolve,timer});
      try {
        this.core.db.tx(()=>{
          this.core.db.prepare('INSERT INTO permissions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,this.id,req.turnId,generation,req.kind,requestDigest,null,randomUUID(),'pending',null,expiresAt);
          this.core.db.setMeta(`permission:${id}`,req);
          this.core.journal.append(this.id,{type:'permission_requested',permissionId:id,turnId:req.turnId,driverGeneration:generation,requestDigest,summary:req.summary,allowedDecisions:req.allowedDecisions,expiresAt});
        });
      } catch {clearTimeout(timer);this.answers.delete(id);resolve({decision:'deny'});}
    });
  }
  permissions():Record<string,unknown>[] {return this.core.db.prepare("SELECT * FROM permissions WHERE agent_id=? AND state='pending' AND kind NOT LIKE 'user:%'").all(this.id).map(r=>({...r,...this.core.db.meta<Record<string,unknown>>(`permission:${r.id}`)}));}
  decide(id:string,req:{expectDigest:string;decision:string},p:Principal):void {
    this.core.db.tx(()=>{
      const r=this.core.db.prepare("SELECT * FROM permissions WHERE id=? AND agent_id=? AND kind NOT LIKE 'user:%'").get(id,this.id);
      if(!r||r.state!=='pending'||r.request_digest!==req.expectDigest||Number(r.driver_generation)!==this.core.require(this.id).driverGeneration||String(r.expires_at)<=new Date().toISOString()||!this.answers.has(id)) throw new EngineError('PERMISSION_STALE',409,'Permission request is stale','permission');
      const prompt=this.core.db.meta<PermissionRequest>(`permission:${id}`)!;
      if(!prompt.allowedDecisions.includes(req.decision)) throw new EngineError('INVALID',400,'Invalid permission decision','permission');
      this.resolvePrompt(id,req.decision,p.name);
    });
  }
  private resolvePrompt(id:string,decision:string,by:string):void {
    const pending=this.answers.get(id);if(!pending)return;
    this.core.db.tx(()=>{
      const changed=this.core.db.prepare("UPDATE permissions SET state=?,decided_by=? WHERE id=? AND state='pending'").run(decision,by,id);
      if(!Number(changed.changes))return;
      this.core.journal.append(this.id,{type:'permission_decided',permissionId:id,decision,decidedBy:by});
      this.core.db.afterCommit(()=>{clearTimeout(pending.timer);this.answers.delete(id);pending.resolve({decision});});
    });
  }
  private async closeSession():Promise<void> {
    for(const id of this.answers.keys()) this.resolvePrompt(id,'deny','session_closed');
    const session=this.session;this.session=undefined;
    if(session) {await session.close();await this.reader;}
  }
  async storageFailed():Promise<void> {
    this.closed=true;
    try{this.core.db.prepare("UPDATE agents SET state='writer_locked' WHERE id=?").run(this.id);}catch{/* storage unavailable; closed flag still blocks dispatch */}
    try{await this.session?.hardStop();}finally{await this.core.procs.kill(this.id);await this.closeSession();}
  }
  async close():Promise<void> {
    this.closed=true;if(this.pauseTimer)clearTimeout(this.pauseTimer);
    await this.serial;await this.closeSession();
    this.core.journal.flush(this.id);
  }
}
