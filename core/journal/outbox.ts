import type { OutboxTarget, SqlDb } from '../types.ts';
export const OUTBOX_DELIVERY_BUDGET_MS=30000;
type PumpOptions={pluginTargets?:Record<string,OutboxTarget>;deliveryTimeoutMs?:number;log?:(msg:string,extra:Record<string,unknown>)=>void};
export class OutboxPump {
  private db:SqlDb;
  private targets:Record<string,string>;
  private timer?:NodeJS.Timeout;
  private active?:Promise<void>;
  private controller?:AbortController;
  private stopped=false;
  private pluginTargets:Record<string,OutboxTarget>;
  private deliveryTimeoutMs:number;
  private log:NonNullable<PumpOptions['log']>;
  constructor(db:SqlDb,targets:Record<string,string>={},options:PumpOptions={}) {
    this.db=db;this.targets=targets;this.pluginTargets=options.pluginTargets??{};
    this.deliveryTimeoutMs=options.deliveryTimeoutMs??OUTBOX_DELIVERY_BUDGET_MS;
    if(!Number.isFinite(this.deliveryTimeoutMs)||this.deliveryTimeoutMs<=0)throw new Error('Invalid outbox delivery budget');
    this.log=options.log??((event,extra)=>{process.stderr.write(JSON.stringify({event,...extra})+'\n');});
  }
  start():void {this.stopped=false;this.schedule(0);}
  private schedule(ms:number):void { if(!this.stopped) {this.timer=setTimeout(()=>{void this.tick().catch(()=>{}).finally(()=>this.schedule(250));},ms);this.timer.unref();} }
  tick(now=Date.now()):Promise<void> {
    // Manual ticks and the timer share one flight, including during close.
    return this.active??=this.runTick(now).finally(()=>{this.active=undefined;});
  }
  private async deliver(row:Record<string,unknown>,signal:AbortSignal):Promise<'delivered'|'retry'|'drop'> {
    if(Object.hasOwn(this.pluginTargets,String(row.target))) {
      let timer:NodeJS.Timeout|undefined,abort:()=>void=()=>{};
      try {
        // A deadline cannot cancel adapter-owned IO. Late results are observed but never
        // acknowledge the row; adapters must deduplicate retries by the unchanged key.
        return await Promise.race([
          Promise.resolve().then(()=>this.pluginTargets[String(row.target)].deliver({key:String(row.key),path:String(row.path),body:JSON.parse(String(row.body)),attempts:Number(row.attempts)})),
          new Promise<never>((_,reject)=>{
            abort=()=>reject(new Error('Outbox delivery interrupted'));
            timer=setTimeout(abort,this.deliveryTimeoutMs);
            signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
          }),
        ]);
      } finally {if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);}
    }
    const base=this.targets[String(row.target)]??String(row.target);
    const path=String(row.path);if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid outbox path');
    const url=new URL(base.replace(/\/$/,'')+path);
    const origin=new URL(base);
    if(url.origin!==origin.origin || !['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('Invalid outbox destination');
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':String(row.key)},body:String(row.body),
      redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
    await res.body?.cancel();
    return res.ok?'delivered':'retry';
  }
  private async runTick(now:number):Promise<void> {
    if(this.stopped)return;
    // Head-of-line ordering per target survives a failed request and a process restart.
    const rows=this.db.prepare("SELECT o.* FROM outbox o WHERE o.state='pending' AND o.next_at<=? AND NOT EXISTS (SELECT 1 FROM outbox p WHERE p.target=o.target AND p.state='pending' AND p.id<o.id) ORDER BY o.id").all(now);
    for(const head of rows) {
      let row:Record<string,unknown>|undefined=head;
      // Bound each batch for fairness; recovery still drains without another backoff.
      for(let delivered=0;row&&delivered<256;delivered++) {
        if(this.stopped) return;
        try {
          this.controller=new AbortController();
          const result=await this.deliver(row,this.controller.signal);
          if(this.stopped)return;
          if(result!=='delivered'&&result!=='drop')throw new Error('Outbox target unavailable');
          const current=row;
          this.db.tx(()=>{
            this.db.prepare('UPDATE outbox SET state=?,attempts=attempts+1 WHERE id=?').run(result==='drop'?'failed':'delivered',current.id);
            if(result==='delivered')this.db.prepare("UPDATE outbox SET next_at=0 WHERE target=? AND state='pending'").run(current.target);
          });
          if(result==='drop')try{this.log('outbox.drop',{key:String(current.key)});}catch{/* logging cannot change delivery state */}
          row=this.db.prepare("SELECT * FROM outbox WHERE target=? AND state='pending' ORDER BY id LIMIT 1").get(current.target);
          if(row&&Number(row.next_at)>Math.max(now,Date.now()))break;
        } catch {
          if(this.stopped) return;
          const failed=row!;
          // Leave 250 ms for the pump interval: a recovered target is retried within 10 s.
          this.db.tx(()=>this.db.prepare('UPDATE outbox SET attempts=attempts+1,next_at=? WHERE id=?').run(Date.now()+Math.min(9750,250*2**Math.min(7,Number(failed.attempts))),failed.id));
          break;
        } finally {this.controller=undefined;}
      }
    }
  }
  async close():Promise<void> {this.stopped=true;if(this.timer) clearTimeout(this.timer);this.controller?.abort();await this.active;}
}
