import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Cursor, Frame, EnginePlugin, JournalWriter, OutboxWriter, TimelineQuery } from '../types.ts';
import { EngineError } from '../types.ts';
import { Database } from '../db.ts';
export type StreamNotice = { op:'frame'; frame:Frame } | { op:'resync_required'; agentId:string; snapshotCursor:Cursor };

export class Journal implements JournalWriter, OutboxWriter {
  readonly db:Database;
  private failure?: (agentId:string)=>void;
  private plugin?:Pick<EnginePlugin,'onEvent'>;
  private bus=new EventEmitter();
  private deltas=new Map<string,{event:Parameters<JournalWriter['append']>[1]; timer:NodeJS.Timeout; bytes:number}>();
  constructor(db:Database,plugin?:Pick<EnginePlugin,'onEvent'>) { this.db=db; this.plugin=plugin; this.bus.setMaxListeners(0); }
  onFailure(handler:(agentId:string)=>void):void {this.failure=handler;}
  setPlugin(plugin:Pick<EnginePlugin,'onEvent'>):void { this.plugin=plugin; }
  put(row:{key:string;target:string;path:string;body:unknown}):void {
    if(!this.db.inTransaction) throw new Error('Outbox writes require a transaction');
    this.db.prepare('INSERT OR IGNORE INTO outbox(key,target,path,body) VALUES(?,?,?,?)').run(row.key,row.target,row.path,JSON.stringify(row.body));
  }
  append(agentId:string,ev:Parameters<JournalWriter['append']>[1]):Frame {
    return this.db.tx(()=>{
      const agent=this.db.prepare('SELECT epoch,driver_generation FROM agents WHERE id=?').get(agentId);
      if(!agent) throw new EngineError('NOT_FOUND',404,'Agent not found','agent');
      const seq=(this.db.meta<number>(`seq:${agentId}`) ?? Number(this.db.prepare('SELECT MAX(seq) n FROM events WHERE agent_id=?').get(agentId)?.n ?? 0))+1;
      const generation=typeof ev.driverGeneration === 'number'?ev.driverGeneration:Number(agent.driver_generation);
      const frame:Frame={...ev,agentId,epoch:String(agent.epoch),seq,ts:new Date().toISOString(),driverGeneration:generation,turnId:ev.turnId??null};
      if(generation!==Number(agent.driver_generation)) frame.stale=true;
      this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?)').run(agentId,seq,frame.epoch,generation,frame.ts,frame.turnId,frame.commandId??null,frame.type,
        frame.origin?JSON.stringify(frame.origin):null,JSON.stringify(frame));
      this.db.setMeta(`seq:${agentId}`,seq);
      this.plugin?.onEvent(frame,this);
      this.db.afterCommit(()=>{
        if(frame.stale) return;
        if(frame.type==='rewound') this.emit({op:'resync_required',agentId,snapshotCursor:this.cursor(agentId)});
        else this.emit({op:'frame',frame});
      });
      return frame;
    });
  }
  private emit(n:StreamNotice):void {
    // Isolate subscribers so a closed/broken client cannot silence the others.
    for(const listener of this.bus.listeners('notice')) { try { listener(n); } catch { /* transport owns errors */ } }
  }
  cursor(agentId:string):Cursor {
    const row=this.db.prepare('SELECT epoch FROM agents WHERE id=?').get(agentId);
    if(!row) throw new EngineError('NOT_FOUND',404,'Agent not found','agent');
    return {epoch:String(row.epoch),seq:this.db.meta<number>(`seq:${agentId}`)??0};
  }
  needsResync(agentId:string,after:Cursor):boolean {
    const latest=this.cursor(agentId);
    const first=Number(this.db.prepare('SELECT MIN(seq) n FROM events WHERE agent_id=?').get(agentId)?.n??latest.seq+1);
    return after.epoch!==latest.epoch || after.seq>latest.seq || after.seq<first-1;
  }
  timeline(agentId:string,q:TimelineQuery={}):{frames:Frame[];cursor:Cursor} {
    const current=this.cursor(agentId);
    if(q.after && this.needsResync(agentId,q.after)) throw new EngineError('RESYNC_REQUIRED',409,JSON.stringify(current),'cursor');
    const limit=Math.min(200,Math.max(1,q.limit??q.tail??200));
    const rows=this.db.prepare('SELECT body FROM events WHERE agent_id=? AND seq>? ORDER BY seq').all(agentId,q.after?.seq??0);
    let frames=rows.map(r=>JSON.parse(String(r.body)) as Frame).filter(f=>matches(f,q.kinds));
    frames=q.tail!==undefined?frames.slice(-Math.min(limit,Math.max(0,q.tail))):frames.slice(0,limit);
    return {frames,cursor:frames.length?{epoch:current.epoch,seq:frames.at(-1)!.seq}:q.after??current};
  }
  subscribe(opts:{agents:string[]|'*'; kinds?:string[]; after?:Record<string,Cursor>},cb:(n:StreamNotice)=>void):()=>void {
    const accepts=(id:string)=>opts.agents==='*'||opts.agents.includes(id);
    const listener=(n:StreamNotice)=>{
      const id=n.op==='frame'?n.frame.agentId:n.agentId;
      if(accepts(id) && (n.op!=='frame'||matches(n.frame,opts.kinds))) cb(n);
    };
    // All replay/read/listener installation is synchronous on the sole writer thread.
    this.bus.on('notice',listener);
    try {
      for(const [id,after] of Object.entries(opts.after??{})) {
        if(!accepts(id)) continue;
        if(this.needsResync(id,after)) { cb({op:'resync_required',agentId:id,snapshotCursor:this.cursor(id)}); continue; }
        for(const r of this.db.prepare('SELECT body FROM events WHERE agent_id=? AND seq>? ORDER BY seq').all(id,after.seq)) {
          const frame=JSON.parse(String(r.body)) as Frame;
          if(!frame.stale && matches(frame,opts.kinds)) cb({op:'frame',frame});
        }
      }
    } catch(e) { this.bus.off('notice',listener); throw e; }
    return ()=>{this.bus.off('notice',listener);};
  }
  /** Coalesce before persistence so all consumers see the same sequence, independent of their connection. */
  output(agentId:string,ev:Parameters<JournalWriter['append']>[1]):void {
    const item=ev.item as {type?:string;delta?:boolean;text?:string;messageId?:string}|undefined;
    const key=agentId;
    const pending=this.deltas.get(key);
    if(ev.type!=='timeline'||item?.type!=='assistant_message'||!item.delta) {this.flush(agentId);this.append(agentId,ev);return;}
    if(pending && (pending.event.driverGeneration!==ev.driverGeneration || pending.event.turnId!==ev.turnId ||
      (pending.event.item as {messageId?:string}).messageId!==item.messageId)) this.flush(agentId);
    const existing=this.deltas.get(key);
    const bytes=Buffer.byteLength(item.text??'');
    if(existing) { (existing.event.item as {text:string}).text+=item.text??''; existing.bytes+=bytes; }
    else {
      const timer=setTimeout(()=>{try{this.flush(key);}catch{try{this.failure?.(key);}catch{/* failure handlers must not crash the daemon */}}},50); timer.unref();
      this.deltas.set(key,{event:{...ev,item:{...item}},bytes,timer});
    }
    if(this.deltas.get(key)!.bytes>=16*1024) this.flush(key);
  }
  flush(id?:string):void {
    for(const [key,p] of this.deltas) if(id===undefined||id===key) {clearTimeout(p.timer);this.deltas.delete(key);this.append(key,p.event);}
  }
  backup(stateDir:string,now=new Date()):string {
    const dir=join(stateDir,'backup'), file=join(dir,`engine-${now.toISOString().slice(0,10)}.db`);
    if(!existsSync(file)) this.db.snapshot(file);
    const old=readdirSync(dir).filter(f=>/^engine-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0,-7);
    for(const name of old) unlinkSync(join(dir,name));
    return file;
  }
  retain(now=new Date()):void {
    const cutoff=new Date(now.getTime()-180*86400000).toISOString();
    this.db.tx(()=>this.db.prepare("DELETE FROM events WHERE agent_id IN (SELECT id FROM agents WHERE state='archived' AND archived_at<?)").run(cutoff));
  }
  close():void {this.flush();this.bus.removeAllListeners();}
}
function matches(f:Frame,kinds?:string[]):boolean {
  return !kinds?.length || kinds.includes(f.type) || (kinds.includes('message')&&f.type==='timeline'&&['user_message','assistant_message'].includes(String((f.item as {type?:string})?.type)));
}
export { Journal as JournalWriter };
