import { openDarwinLock, type LockOps } from '../core/procs/darwin-lock.ts';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { bootEnv } from '../drivers/codex/env.ts';

/** Linux flock belongs to the shared open-file description, not the helper PID.
 * The helper locks inherited fd 3 then exits; our CLOEXEC fd retains the lock.
 * Never unlink the lock inode: doing so permits two users on different inodes.
 */
export async function lockPtyd(runDir: string, options: { platform?: NodeJS.Platform; lockOps?: LockOps } = {}): Promise<Pick<FileHandle, 'close'>> {
  const path = join(runDir, 'ptyd.lock');
  if ((options.platform ?? process.platform) === 'darwin') {
    try { return openDarwinLock(path, options.lockOps); }
    catch (error) {
      if (['EAGAIN','EWOULDBLOCK'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new Error('PTY sidecar already running or kernel lock unavailable');
      throw error;
    }
  }
  const file = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '3'], {
        cwd: runDir, env: bootEnv(), stdio: ['ignore', 'ignore', 'ignore', file.fd],
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('Cannot acquire ptyd kernel lock')); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('PTY sidecar already running or kernel lock unavailable')); });
    });
    await file.chmod(0o600); await file.truncate(0); await file.writeFile(`${process.pid}\n`);
    return file;
  } catch (error) { await file.close(); throw error; }
}
