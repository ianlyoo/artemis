import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';

// Releases are launched through a `current` symlink; Node realpaths the main module, so the entry check must too.
test('artemisd boots and stops cleanly when started through a symlinked path', async () => {
  const root = await mkdtemp(join(process.env.TMPDIR!, 'hsym-'));
  try {
    await symlink(fileURLToPath(new URL('..', import.meta.url)), join(root, 'current'));
    await mkdir(join(root, 'state'));
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(root, 'current', 'core', 'main.ts'),
      '--state', join(root, 'state'), '--api-port', '0', '--mcp-port', '0'], { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? root, LANG: 'C.UTF-8', TMPDIR: root }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    const exited = once(child, 'exit');
    const ready = await Promise.race([
      new Promise<boolean>(r => { const tick = setInterval(() => { if (out.includes('"ready":true')) { clearInterval(tick); r(true); } }, 50); exited.then(() => { clearInterval(tick); r(false); }); }),
      new Promise<boolean>(r => setTimeout(() => r(false), 15_000)),
    ]);
    if (child.exitCode === null) child.kill('SIGTERM');
    const [code] = await exited;
    assert.ok(ready, `no ready line through the symlink (exit ${code}): ${err.trim()}`);
    assert.equal(code, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
