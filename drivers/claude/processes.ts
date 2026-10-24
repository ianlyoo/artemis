import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { darwinProcesses, isDarwin, type ProcessOptions } from '../../core/procs/darwin.ts';
import type { DriverHost } from '../../core/types.ts';

export type ProcessIdentity = { pid: number; ppid: number; start: string; state: string };
/** Read kernel metadata only; never command lines, environment, or credentials. */
export function processIdentity(pid: number, options: ProcessOptions = {}): ProcessIdentity | null {
  if (isDarwin(options)) {
    const p = darwinProcesses(pid, options.ps)[0];
    return p ? { pid: p.pid, ppid: p.ppid, start: p.startTime, state: p.state } : null;
  }
  try {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return { pid, ppid: Number(fields[1]), start: fields[19]!, state: fields[0]! };
  } catch { return null; }
}
export function isAlive(identity: ProcessIdentity): boolean;
export function isAlive(identity: ProcessIdentity, options: ProcessOptions): boolean;
export function isAlive(identity: ProcessIdentity, options: ProcessOptions | number = {}): boolean {
  if (typeof options === "number") options = {}; // Array.filter callback compatibility.
  const now = processIdentity(identity.pid, options);
  return !!now && now.start === identity.start && now.state !== 'Z' && now.state !== 'X';
}

/** POSIX custody. Retain observed identities after reparenting. */
export class ProcessTree {
  private owned = new Map<number, { identity: ProcessIdentity; role: 'cli' | 'tool' }>();
  private host: DriverHost;
  private timer: NodeJS.Timeout;
  private options: ProcessOptions;
  constructor(host: DriverHost, options: ProcessOptions = {}) {
    this.host = host; this.options = options;
    this.timer = setInterval(() => this.discover(), 100);
    this.timer.unref();
  }
  add(pid: number, role: 'cli' | 'tool'): void {
    const identity = processIdentity(pid, this.options);
    if (!identity || this.owned.get(pid)?.identity.start === identity.start) return;
    this.owned.set(pid, { identity, role });
    this.host.trackPid(pid, role);
  }
  sample(): void {
    const parents = new Set([...this.owned.values()].filter(x => isAlive(x.identity, this.options)).map(x => x.identity.pid));
    const all = isDarwin(this.options) ? darwinProcesses(undefined, this.options.ps).map(p => ({ pid:p.pid, ppid:p.ppid, start:p.startTime, state:p.state })) : readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(x => processIdentity(Number(x))).filter(x => x !== null);
    if (isDarwin(this.options)) for (const pid of parents) if (all.find(p => p.pid === pid)?.start !== this.owned.get(pid)?.identity.start) parents.delete(pid);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of all) if (parents.has(p.ppid) && !parents.has(p.pid)) {
        if (isDarwin(this.options) && processIdentity(p.pid, this.options)?.start !== p.start) continue;
        parents.add(p.pid);
        this.add(p.pid, 'tool');
        changed = true;
      }
    }
  }
  /** A failed Darwin ps -A snapshot leaves known identities in custody; explicit pids() and stop still fail closed. */
  private discover(): boolean {
    try { this.sample(); return true; } catch (error) { if (!isDarwin(this.options)) throw error; return false; }
  }
  private live(toolsOnly: boolean): number[] {
    return [...this.owned.values()].filter(x => (!toolsOnly || x.role === 'tool') && isAlive(x.identity, this.options)).map(x => x.identity.pid);
  }
  pids(toolsOnly = false): number[] {
    this.sample();
    return this.live(toolsOnly);
  }
  async stop(toolsOnly: boolean): Promise<{ killed: number; alive: number }> {
    const targeted = new Set<number>();
    const started = Date.now();
    const sent = new Map<number, NodeJS.Signals>();
    while (true) {
      // Remembered identities (also reparented ones) are signalled even when this round's snapshot failed;
      // success needs a complete snapshot that finds nothing alive.
      const complete = this.discover(), live = this.live(toolsOnly);
      if (!live.length && complete) return { killed: targeted.size, alive: 0 };
      const age = Date.now() - started;
      const signal: NodeJS.Signals = age < 2000 ? 'SIGINT' : age < 5000 ? 'SIGTERM' : 'SIGKILL';
      for (const pid of live.reverse()) {
        targeted.add(pid);
        if (sent.get(pid) === signal) continue;
        const entry = this.owned.get(pid)!;
        if (isAlive(entry.identity, this.options)) {
          try { (this.options.signal ?? process.kill)(pid, signal); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        }
        sent.set(pid, signal);
      }
      if (age > 8000) throw new Error(live.length ? 'owned processes remain after SIGKILL' : 'owned processes could not be verified');
      await delay(40);
    }
  }
  dispose(): void { clearInterval(this.timer); }
}
