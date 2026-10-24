import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { darwinProcesses, isDarwin, type ProcessOptions } from './darwin.ts';
import type { SqlDb } from '../types.ts';
export type ProcIdentity = { pid: number; startTime: string; ppid: number; state: string };
export function readProc(pid: number, options: ProcessOptions = {}): ProcIdentity | null {
  if (isDarwin(options)) return darwinProcesses(pid, options.ps)[0] ?? null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    return { pid, startTime: f[19], ppid: Number(f[1]), state: f[0] };
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ESRCH') return null; throw e; }
}
export function isAlive(p: Pick<ProcIdentity,'pid'|'startTime'>): boolean;
export function isAlive(p: Pick<ProcIdentity,'pid'|'startTime'>, options: ProcessOptions): boolean;
export function isAlive(p: Pick<ProcIdentity,'pid'|'startTime'>, options: ProcessOptions | number = {}): boolean {
  if (typeof options === "number") options = {}; // Array.filter callback compatibility.
  const current = readProc(p.pid, options); return !!current && current.startTime === p.startTime && !['Z','X'].includes(current.state);
}
export function processTree(root: ProcIdentity, options: ProcessOptions = {}): ProcIdentity[] {
  if (!isAlive(root, options)) return [];
  const all: ProcIdentity[] = isDarwin(options) ? darwinProcesses(undefined, options.ps) : [];
  for (const s of isDarwin(options) ? [] : readdirSync('/proc')) {
    if (!/^\d+$/.test(s)) continue;
    try { const p = readProc(Number(s)); if(p) all.push(p); } catch { /* unrelated unreadable process */ }
  }
  if (isDarwin(options) && all.find(p => p.pid === root.pid)?.startTime !== root.startTime) return [];
  const seen = new Map<number,ProcIdentity>([[root.pid,root]]);
  let changed = true;
  while(changed) { changed = false; for(const p of all) if(seen.has(p.ppid) && !seen.has(p.pid)) { seen.set(p.pid,p); changed = true; } }
  return [...seen.values()];
}
export async function killTree(roots: ProcIdentity[], record?: (p:ProcIdentity)=>void, options: ProcessOptions = {}): Promise<{killed:number;alive:number}> {
  const known = new Map<string,ProcIdentity>();
  // A failed Darwin ps -A snapshot keeps the known identities in custody; success needs a complete snapshot.
  const gather = () => { let complete = true; for (const r of [...roots, ...known.values()]) {
    let tree: ProcIdentity[];
    try { tree = processTree(r, options); } catch (e) {
      if (!isDarwin(options)) throw e;
      complete = false; const key = `${r.pid}:${r.startTime}`; if(!known.has(key)) known.set(key,r); continue;
    }
    for (const p of tree) { const key = `${p.pid}:${p.startTime}`; if(!known.has(key)) { known.set(key,p); record?.(p); } }
  } return complete; };
  gather(); const start = Date.now(); let phase = -1;
  while (true) {
    const complete = gather();
    const living = [...known.values()].filter(p => isAlive(p, options));
    if (!living.length && complete) return { killed:known.size, alive:0 };
    const elapsed = Date.now()-start, next = elapsed >= 5000 ? 2 : elapsed >= 2000 ? 1 : 0;
    if(next !== phase) {
      phase=next;
      for(const p of living.reverse()) if(isAlive(p, options)) {
        if(p.pid === process.pid) throw new Error('Refusing to signal engine process');
        try { (options.signal ?? process.kill)(p.pid, (['SIGINT','SIGTERM','SIGKILL'] as const)[phase]); }
        catch(e) { if((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
      }
    }
    if(elapsed >= 6500) { if(!living.length) throw new Error('Process tree could not be verified'); return { killed:known.size-living.length, alive:living.length }; }
    await delay(25);
  }
}
export class ProcessCustody {
  readonly db: SqlDb;
  private timer?: NodeJS.Timeout;
  private options: ProcessOptions;
  constructor(db:SqlDb, options: ProcessOptions = {}) { this.db=db; this.options=options; }
  track(agentId:string,pid:number,role:'cli'|'tool'):void {
    if(!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) throw new Error('Invalid child pid');
    const p=readProc(pid, this.options); if(!p) return;
    // A newly claimed pid must descend from this engine. Boot uses only previously recorded identities.
    let parent=p; const seen=new Set<number>();
    while(parent.ppid !== process.pid) {
      if(parent.ppid <= 1 || seen.has(parent.ppid)) throw new Error('Process is not owned by this engine');
      seen.add(parent.ppid); const up=readProc(parent.ppid, this.options); if(!up) throw new Error('Cannot establish process custody'); parent=up;
    }
    this.save(agentId,p,role);
  }
  private save(agent:string,p:ProcIdentity,role:string):void {
    this.db.prepare('INSERT OR IGNORE INTO procs VALUES(?,?,?,?)').run(p.pid,p.startTime,agent,role);
  }
  private rows(agentId?:string): (ProcIdentity & {agentId:string})[] {
    return this.db.prepare(`SELECT * FROM procs${agentId ? ' WHERE agent_id=?':''}`).all(...(agentId?[agentId]:[])).map(r=>({
      pid:Number(r.pid),startTime:String(r.start_time),ppid:0,state:'',agentId:String(r.agent_id)}));
  }
  sample():void { for(const r of this.rows()) for(const p of processTree(r, this.options)) this.save(r.agentId,p,p.pid === r.pid?'cli':'tool'); }
  start():void { this.timer=setInterval(()=>{try {this.sample();} catch {/* boot/stop verification remains fail-closed */}},200); this.timer.unref(); }
  stop():void { if(this.timer) clearInterval(this.timer); }
  alive(agentId:string):number { return this.rows(agentId).filter(p => isAlive(p, this.options)).length; }
  toolsRunning(agentId:string):number {
    return this.db.prepare("SELECT * FROM procs WHERE agent_id=? AND role='tool'").all(agentId).filter(r=>isAlive({pid:Number(r.pid),startTime:String(r.start_time)}, this.options)).length;
  }
  async kill(agentId:string):Promise<{killed:number;alive:number}> {
    const result=await killTree(this.rows(agentId),p=>this.save(agentId,p,'tool'), this.options);
    for(const r of this.rows(agentId)) if(!isAlive(r, this.options)) this.db.prepare('DELETE FROM procs WHERE pid=? AND start_time=?').run(r.pid,r.startTime);
    return result;
  }
  async sweep():Promise<string[]> {
    const locked:string[]=[];
    for(const id of new Set(this.rows().map(r=>r.agentId))) {
      try { if((await this.kill(id)).alive) locked.push(id); } catch { locked.push(id); }
    }
    for(const id of locked) this.db.prepare("UPDATE agents SET state='writer_locked' WHERE id=?").run(id);
    return locked;
  }
}
