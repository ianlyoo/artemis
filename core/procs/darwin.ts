import { spawnSync } from 'node:child_process';
import type { ProcIdentity } from './posix.ts';

export type PsResult = { status: number | null; stdout: string; stderr: string; error?: unknown };
export type Ps = (args: string[]) => PsResult;
export type ProcessOptions = { platform?: NodeJS.Platform; ps?: Ps; signal?: (pid: number, signal: NodeJS.Signals) => void };
export const isDarwin = (options: ProcessOptions = {}): boolean => (options.platform ?? process.platform) === 'darwin';

const ps: Ps = args => spawnSync('/bin/ps', args, {
  encoding: 'utf8', timeout: 2000, maxBuffer: 8 * 1024 * 1024,
  env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' },
});

/** Only kernel metadata, never argv/environment. lstart is stable; etime is not an identity.
 * stat's first letter comes from adv_cmds ps/tasks.c mach_state_table " RUSITH?" or Z/T; any row of any process may be '?'. */
export function parseDarwinProcesses(output: string): ProcIdentity[] {
  const result: ProcIdentity[] = [], seen = new Set<number>();
  for (const line of output.split('\n').filter(s => s.trim())) {
    const match = /^\s*(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})(?:\s+([A-Za-z?<>+=-]+))?\s*$/.exec(line);
    if (!match) throw new Error('Invalid Darwin process metadata');
    const pid = Number(match[1]), ppid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || pid < 0 || !Number.isSafeInteger(ppid) || seen.has(pid)) throw new Error('Invalid Darwin process identity');
    seen.add(pid);
    // Apple ps prints '?' (or a blank, unentitled builds) when it cannot read a task, e.g. one that is exiting ('?E').
    result.push({ pid, ppid, startTime: 'darwin:' + match[3].replace(/\s+/g, ' '), state: /^[A-Z]/.test(match[4] ?? '') ? match[4]![0] : '?' });
  }
  return result;
}

export function darwinProcesses(pid?: number, run: Ps = ps): ProcIdentity[] {
  if (pid !== undefined && (!Number.isSafeInteger(pid) || pid < 1)) return [];
  const result = run([...(pid === undefined ? ['-A'] : ['-p', String(pid)]), '-o', 'pid=,ppid=,lstart=,stat=']);
  // ps exits 1 without diagnostics when a selected PID has disappeared.
  if (pid !== undefined && result.status === 1 && !result.error && !result.stdout.trim() && !result.stderr.trim()) return [];
  if (result.error || result.status !== 0 || result.stderr.trim()) throw new Error('Darwin process metadata unavailable');
  const rows = parseDarwinProcesses(result.stdout);
  if (pid !== undefined && rows.some(row => row.pid !== pid)) throw new Error('Unexpected Darwin process identity');
  return rows;
}
