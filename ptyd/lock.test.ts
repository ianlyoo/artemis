import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { lockPtyd } from './lock.ts';

test('kernel lock is retained after flock helper exits and released without unlink', async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, 'ptyd-lock-'));
  const first = await lockPtyd(root);
  try {
    const before = await stat(join(root, 'ptyd.lock'));
    await assert.rejects(lockPtyd(root), /already running/);
    await first.close();
    const second = await lockPtyd(root);
    try { assert.equal((await stat(join(root, 'ptyd.lock'))).ino, before.ino); }
    finally { await second.close(); }
  } finally { await first.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
