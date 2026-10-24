import { openDarwinLock, type LockOps } from './procs/darwin-lock.ts';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { EngineError } from './types.ts';
import { buildChildEnv } from './env.ts';

export type WriterLock = { pid: number; close(): Promise<void>; lost: Promise<void> };
/** flock --no-fork makes cat the lock holder. EOF on our private pipe releases the kernel lock even after SIGKILL. */
export async function acquireLock(stateDir: string, options: { platform?: NodeJS.Platform; lockOps?: LockOps } = {}): Promise<WriterLock> {
  const run = join(stateDir, 'run'); mkdirSync(run, { recursive: true, mode: 0o700 });
  if ((options.platform ?? process.platform) === 'darwin') {
    let file;
    try { file = openDarwinLock(join(run, 'artemisd.lock'), options.lockOps); }
    catch (error) {
      if (['EAGAIN','EWOULDBLOCK'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw new EngineError('WRITER_LOCKED', 409, 'Another engine owns this state', 'writer-lock');
      throw error;
    }
    let release!: () => void;
    const lost = new Promise<void>(resolve => { release = resolve; });
    return { pid: process.pid, lost, close: async () => { await file.close(); release(); } };
  }
  // The fixed shell snippet contains no caller input; the file is a separate argv entry.
  const child = spawn('flock', ['--exclusive', '--nonblock', '--no-fork', join(run, 'artemisd.lock'),
    'sh', '-c', 'printf "locked\\n"; exec cat >/dev/null'], { env: buildChildEnv('terminal'), stdio: ['pipe','pipe','ignore'] });
  const lost = new Promise<void>(resolve => child.once('exit', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new EngineError('WRITER_LOCKED', 409, 'Another engine owns this state', 'writer-lock')));
    child.stdout!.once('data', () => resolve());
  });
  return { pid: child.pid!, lost, close: async () => { child.stdin!.end(); await lost; } };
}
