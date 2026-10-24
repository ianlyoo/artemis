// launchers and stage tests read the bound ports back instead of picking fixed ones. Also: artemisd started through the
// release layout's symlinks runs its main (the entry guard compares real paths).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseOptions } from './main.ts';

test('parseOptions accepts port 0 and still refuses out-of-range ports', () => {
  const o = parseOptions(['--state', '/tmp/x', '--api-port', '0', '--mcp-port', '0']);
  assert.equal(o.apiPort, 0); assert.equal(o.mcpPort, 0);
  for (const bad of ['-1', '65536', '1.5', 'x']) assert.throws(() => parseOptions(['--state', '/tmp/x', '--api-port', bad]), /valid listener ports/);
});

/** Starts artemisd from `entry` with port 0 on a fresh state; resolves its bound ports (or rejects if it exits first). */
async function boot(entry: string, directory: string) {
  const env: Record<string, string> = { HOME: process.env.HOME ?? directory };
  for (const name of ['PATH', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'TMPDIR']) if (process.env[name]) env[name] = process.env[name]!;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', entry, '--state', join(directory, 'state'), '--api-port', '0', '--mcp-port', '0'],
    { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
  child.stderr.resume();
  let out = '';
  child.stdout.setEncoding('utf8');
  const ports = new Promise<{ api: number; mcp: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no listening line within 60 s')), 60_000);
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
      const m = /^artemisd: listening api=(\d+) mcp=(\d+)$/m.exec(out);
      if (m) { clearTimeout(timer); resolve({ api: Number(m[1]), mcp: Number(m[2]) }); }
    });
    void exit.then((code) => { clearTimeout(timer); reject(new Error(`artemisd exited ${code} before listening`)); });
  });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; } };
  return { child, exit, ports, stop };
}

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

test('artemisd with port 0 prints the bound ports and serves on them', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'engine-ports-'));
  const d = await boot(MAIN, directory);
  try {
    const { api, mcp } = await d.ports;
    assert.ok(api > 0 && mcp > 0 && api !== mcp, `bound ports api=${api} mcp=${mcp}`);
    const health = await fetch(`http://127.0.0.1:${api}/v1/health`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(health.status, 401);
    const slot = await fetch(`http://127.0.0.1:${mcp}/mcp/not-a-slot`, { method: 'POST', signal: AbortSignal.timeout(5_000) });
    assert.ok(slot.status >= 400 && slot.status < 500, `MCP listener answers on the bound port (${slot.status})`);
    t.diagnostic(`bound api=${api} mcp=${mcp}; unauthenticated /v1/health 401; MCP ${slot.status}`);
    d.child.kill('SIGTERM');
    assert.equal(await d.exit, 0);
  } finally {
    await d.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('artemisd started through the release layout symlinks (current → releases/<v>) runs, not a silent exit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'engine-layout-'));
  await mkdir(join(directory, 'releases'));
  await symlink(dirname(dirname(MAIN)), join(directory, 'releases', 'v1'));
  await symlink(join('releases', 'v1'), join(directory, 'current'));
  const d = await boot(join(directory, 'current', 'core', 'main.ts'), directory);
  try {
    const { api } = await d.ports;
    assert.ok(api > 0);
    d.child.kill('SIGTERM');
    assert.equal(await d.exit, 0);
  } finally {
    await d.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
