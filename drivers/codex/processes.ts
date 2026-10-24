import { readFileSync, readdirSync } from 'node:fs';
import { darwinProcesses, isDarwin, type ProcessOptions } from '../../core/procs/darwin.ts';
import { setTimeout as delay } from 'node:timers/promises';

type Identity = { birth: string; state: string };
function identity(pid: number, options: ProcessOptions = {}): Identity | null {
  if (isDarwin(options)) { const p=darwinProcesses(pid, options.ps)[0]; return p ? {birth:p.startTime,state:p.state} : null; }
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return { birth: fields[19], state: fields[0] };
  } catch { return null; }
}
/** POSIX custody: only descendants of a process we spawned; never read argv or environ. */
export class ProcessTree {
  private known = new Map<number, string>();
  private timer: ReturnType<typeof setInterval>;
  private root: number;
  private track: (pid: number, role: 'cli' | 'tool') => void;
  private stopping?: Promise<{ killed: number; alive: number }>;
  private options: ProcessOptions;
  constructor(root: number, track: (pid: number, role: 'cli' | 'tool') => void = () => {}, options: ProcessOptions = {}) {
    if (!['linux','darwin'].includes(options.platform ?? process.platform)) throw new Error('Process custody requires Linux or Darwin');
    this.options = options;
    this.root = root; this.track = track;
    this.remember(root); this.discover();
    this.timer = setInterval(() => this.discover(), 50); this.timer.unref();
  }
  private remember(pid: number): void {
    const state = identity(pid, this.options);
    if (state && !this.known.has(pid)) {
      this.known.set(pid, state.birth); this.track(pid, pid === this.root ? 'cli' : 'tool');
    }
  }
  private same(pid: number): boolean {
    const state = identity(pid, this.options);
    return !!state && state.birth === this.known.get(pid) && state.state !== 'Z' && state.state !== 'X';
  }
  capture(): void {
    if (isDarwin(this.options)) {
      const all=darwinProcesses(undefined, this.options.ps);
      const parents=new Set([...this.known.keys()].filter(pid => this.same(pid) && all.find(p => p.pid===pid)?.startTime===this.known.get(pid)));
      let changed=true;
      while(changed) {
        changed=false;
        for(const p of all) if(parents.has(p.ppid) && !parents.has(p.pid)) {
          // Recheck identity at discovery; a stale snapshot cannot claim a reused PID.
          if(identity(p.pid, this.options)?.birth !== p.startTime) continue;
          this.remember(p.pid); if (!this.same(p.pid)) continue; parents.add(p.pid); changed=true;
        }
      }
      return;
    }
    const queue = [...this.known.keys()]; const seen = new Set<number>();
    while (queue.length) {
      const pid = queue.shift()!;
      if (seen.has(pid) || !this.same(pid)) continue;
      seen.add(pid);
      try {
        for (const tid of readdirSync(`/proc/${pid}/task`)) {
          let value = ''; try { value = readFileSync(`/proc/${pid}/task/${tid}/children`, 'utf8'); } catch {}
          for (const entry of value.trim().split(/\s+/)) {
            const child = Number(entry); if (!child) continue;
            this.remember(child); queue.push(child);
          }
        }
      } catch {}
    }
  }
  /** A failed Darwin ps -A snapshot leaves known identities in custody; explicit pids() and stop still fail closed. */
  private discover(): boolean {
    try { this.capture(); return true; } catch (e) { if (!isDarwin(this.options)) throw e; return false; }
  }
  pids(): number[] { this.capture(); return [...this.known.keys()].filter(pid => this.same(pid)); }
  stop(): Promise<{ killed: number; alive: number }> {
    return this.stopping ??= this.stopNow();
  }
  private async stopNow(): Promise<{ killed: number; alive: number }> {
    const start = Date.now(), sent = new Map<number, string>(); let initial = -1;
    while (true) {
      // Remembered identities (also reparented ones) are signalled even when this round's snapshot failed;
      // success needs a complete snapshot that finds nothing alive.
      const complete = this.discover(), live = [...this.known.keys()].filter(pid => this.same(pid));
      if (initial < 0) initial = live.length;
      if (!live.length && complete) break;
      const elapsed = Date.now() - start;
      const signal = elapsed >= 5000 ? 'SIGKILL' : elapsed >= 2000 ? 'SIGTERM' : 'SIGINT';
      for (const pid of [...live].reverse()) {
        // Give parents a chance to reap children before signalling the root.
        if (pid === this.root && elapsed < 150 && live.length > 1) continue;
        if (sent.get(pid) !== signal && this.same(pid)) {
          try { (this.options.signal ?? process.kill)(pid, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
          sent.set(pid, signal);
        }
      }
      if (elapsed > 8000) throw new Error(live.length ? 'Owned process tree did not terminate' : 'Owned process tree could not be verified');
      await delay(25);
    }
    clearInterval(this.timer);
    return { killed: Math.max(initial, sent.size), alive: 0 };
  }
}
