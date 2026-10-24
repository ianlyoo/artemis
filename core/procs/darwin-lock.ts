import { openSync, closeSync, fstatSync, fchmodSync } from 'node:fs';

// Darwin's open(2) flags; Node does not expose O_EXLOCK on every build.
// https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h
// O_RDWR | O_CREAT | O_NOFOLLOW | O_EXLOCK | O_NONBLOCK | O_CLOEXEC.
export const DARWIN_LOCK_FLAGS = 0x2 | 0x200 | 0x100 | 0x20 | 0x4 | 0x1000000;
export type LockOps = {
  open: (path: string, flags: number, mode: number) => number;
  close: (fd: number) => void;
  regular: (fd: number) => boolean;
  chmod: (fd: number, mode: number) => void;
};
const native: LockOps = { open: openSync, close: closeSync, regular: fd => fstatSync(fd).isFile(), chmod: fchmodSync };

/** Kernel-held, nonblocking, close-on-exec; never unlink the shared lock inode. */
export function openDarwinLock(path: string, ops: LockOps = native): { fd: number; close(): Promise<void> } {
  if (ops === native && process.platform !== 'darwin') throw new Error('Darwin lock flags require Darwin');
  const fd = ops.open(path, DARWIN_LOCK_FLAGS, 0o600);
  try {
    if (!ops.regular(fd)) throw new Error('Lock must be a regular file');
    ops.chmod(fd, 0o600);
  } catch (error) { ops.close(fd); throw error; }
  let closed = false;
  return { fd, async close() { if (!closed) { ops.close(fd); closed = true; } } };
}
