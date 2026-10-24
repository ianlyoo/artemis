import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { bootEnv } from '../../drivers/codex/env.ts';
import { ProcessTree } from '../../drivers/codex/processes.ts';
import { callLocal } from '../api/transport.ts';
import { TermFrame } from '../types.ts';

async function until(check: () => boolean, failure: string, timeout = 60000): Promise<void> {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw new Error(failure); await delay(20); }
}
function launch(path: string, args: string[], credential?: string) {
  const child = fork(fileURLToPath(new URL(path, import.meta.url)), args,
    { env: bootEnv(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  assert.ok(child.pid); const tree = new ProcessTree(child.pid);
  const ready = new Promise<{apiPort?:number;mcpPort?:number}>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture startup timeout')), 30000);
    child.on('message', (message: any) => {
      if (message.started && credential) child.send({ credential });
      if (message.ready) { clearTimeout(timer); resolve(message); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Fixture exited before ready')); });
  });
  return { child, tree, ready };
}

// PTY throughput varies by platform; the test retains bounded deadlines.
const darwin = process.platform === 'darwin';
const FLOOD_MS = darwin ? 300_000 : 60_000;
test('real artemisd/ptyd: a paused observer alone closes; controller receives all 24 MB and other terminal stays live', { timeout: darwin ? 420_000 : 120_000 }, async t => {
  const root = await mkdtemp(join(process.env.TMPDIR!, 'tbp-'));
  const runDir = join(root, 'run'); const credential = randomBytes(32).toString('base64url');
  const sidecar = launch('../../ptyd/main.ts', ['--run', runDir]);
  let engine: ReturnType<typeof launch> | undefined;
  const peers: { ws: WebSocket; output: Buffer[]; restores: number; closed?: { code: number; reason: string } }[] = [];
  let apiPort = 0, mcpPort = 0;
  const call = (method: string, path: string, body?: unknown) => callLocal({ port: apiPort, token: credential, method, path, body });
  async function attach(id: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/terminals/${id}/io`, { headers: { Authorization: `Bearer ${credential}` } });
    const peer: (typeof peers)[number] = { ws, output: [], restores: 0 }; peers.push(peer);
    ws.on('error', () => {});
    ws.on('message', data => {
      const frame = Buffer.from(data as Buffer);
      if (frame[0] === TermFrame.output) peer.output.push(frame.subarray(1));
      if (frame[0] === TermFrame.restore) peer.restores++;
    });
    ws.on('close', (code, reason) => { peer.closed = { code, reason: reason.toString() }; });
    await once(ws, 'open'); await until(() => peer.restores > 0, 'Missing restore'); return peer;
  }
  const input = (peer: (typeof peers)[number], value: string) => peer.ws.send(Buffer.concat([Buffer.from([TermFrame.input]), Buffer.from(value)]));
  const claim = (peer: (typeof peers)[number]) => peer.ws.send(Buffer.concat([Buffer.from([TermFrame.resize]), Buffer.from(JSON.stringify({ intent: 'claim', cols: 80, rows: 24 }))]));
  const text = (peer: (typeof peers)[number]) => Buffer.concat(peer.output).toString();
  const received = (peer: (typeof peers)[number]) => peer.output.reduce((n, chunk) => n + chunk.length, 0);
  try {
    await sidecar.ready;
    engine = launch('./backpressure-engine-fixture.ts', [join(root, 'state'), runDir, root, '0', '0'], credential);
    const ports = await engine.ready; apiPort = ports.apiPort!; mcpPort = ports.mcpPort!;
    const create = async (requestId: string) => {
      const response = await call('POST', '/v1/terminals', { requestId, user: 'console', cwd: root, cols: 80, rows: 24 });
      assert.equal(response.status, 201); return (response.body as { id: string }).id;
    };
    const id = await create('flood'), otherId = await create('other');
    const fast = await attach(id), slow = await attach(id), other = await attach(otherId);
    claim(fast); claim(other);
    input(fast, "stty -echo; printf '\\nFAST_READY\\n'\n");
    input(other, "stty -echo; printf '\\nOTHER_READY\\n'\n");
    await until(() => text(fast).includes('\r\nFAST_READY\r\n') && text(other).includes('\r\nOTHER_READY\r\n'), 'Lease initialization failed');
    fast.output = []; other.output = []; slow.output = []; slow.ws.pause();
    input(fast, "printf 'FLOOD_BEGIN\\n'; head -c 24000000 /dev/zero | tr '\\0' x; printf '\\nFLOOD_END\\n'\n");
    const flooding = Date.now();
    await until(() => Buffer.concat(fast.output.slice(0, 3)).includes('FLOOD_BEGIN'), 'Flood did not start');
    // Model transient scheduler/CPU pressure on the shared receiver, independently
    // of the paused WebSocket. Its IPC queue must never evict healthy clients.
    engine.child.kill('SIGSTOP');
    try { await delay(1000); } finally { engine.child.kill('SIGCONT'); }
    input(other, "printf 'OTHER_DURING\\n'\n");
    await until(() => {
      if (fast.closed || other.closed) throw new Error(`Healthy attachment closed: fast=${fast.closed?.code}, other=${other.closed?.code}`);
      return text(other).includes('OTHER_DURING\r\n');
    }, 'Other terminal stalled during flood');
    assert.ok(!Buffer.concat(fast.output.slice(-3)).includes('FLOOD_END'), 'other terminal must respond during the burst');
    let moved = Date.now(), seen = received(fast);
    await until(() => {
      if (fast.closed || other.closed) throw new Error(`Healthy attachment closed: fast=${fast.closed?.code}, other=${other.closed?.code}`);
      const now = received(fast); if (now !== seen) { seen = now; moved = Date.now(); }
      if (Date.now() - moved > 20_000) throw new Error(`Flood stalled at ${now} bytes after ${Date.now() - flooding} ms`);
      return Buffer.concat(fast.output.slice(-3)).includes('FLOOD_END');
    }, `Flood did not finish within ${FLOOD_MS} ms`, FLOOD_MS);
    const floodMs = Date.now() - flooding;
    const data = Buffer.concat(fast.output); const start = data.indexOf('FLOOD_BEGIN\r\n') + Buffer.byteLength('FLOOD_BEGIN\r\n');
    const end = data.indexOf('\r\nFLOOD_END', start);
    assert.ok(start >= Buffer.byteLength('FLOOD_BEGIN\r\n') && end > start);
    const payload = data.subarray(start, end);
    assert.equal(payload.length, 24000000, 'controller must receive every payload byte');
    assert.ok(payload.every(byte => byte === 120), 'payload must remain intact');
    // artemisd cuts the paused observer with 1009 once the flood starts. ws tears that close down if the peer has not
    // answered it within its 30 s close timeout, so an observer resumed later (Darwin's flood takes ~70 s) sees 1006.
    const pausedMs = Date.now() - flooding;
    slow.ws.resume(); await until(() => !!slow.closed, 'Slow observer was not cut');
    assert.ok(received(slow) < 24000000, 'the paused observer was cut, not drained');
    if (pausedMs < 30_000 || slow.closed!.code !== 1006) {
      assert.equal(slow.closed!.code, 1009); assert.match(slow.closed!.reason, /queue limit/);
    }
    assert.equal(fast.closed, undefined); assert.equal(other.closed, undefined);
    input(fast, "printf 'LEASE_STILL_HELD\\n'\n"); input(other, "printf 'OTHER_AFTER\\n'\n");
    await until(() => text(fast).includes('LEASE_STILL_HELD\r\n') && text(other).includes('OTHER_AFTER\r\n'), 'Healthy input/output stopped');
    assert.ok(text(other).includes('OTHER_DURING\r\n'));
    assert.equal((await call('GET', `/v1/terminals/${otherId}/capture?lines=24`)).status, 200);
    assert.equal((await call('GET', '/v1/health')).status, 200);
    t.diagnostic(`flood ${floodMs} ms (${(payload.length / 1e6 / (floodMs / 1000)).toFixed(2)} MB/s on ${process.platform}); observer paused ${pausedMs} ms`);
    t.diagnostic(`controller payload=${payload.length}; slow close=${slow.closed!.code}; other terminal and lease preserved; ports=${apiPort}/${mcpPort}`);
    await call('POST', `/v1/terminals/${id}/kill`); await call('POST', `/v1/terminals/${otherId}/kill`);
  } finally {
    for (const peer of peers) { peer.ws.resume(); peer.ws.terminate(); }
    if (engine) { engine.child.kill('SIGCONT'); await engine.tree.stop(); assert.deepEqual(engine.tree.pids(), []); }
    await sidecar.tree.stop(); assert.deepEqual(sidecar.tree.pids(), []);
    await rm(root, { recursive: true, force: true });
    t.diagnostic('PID audit: real artemisd, ptyd, lock helpers and PTY descendants all stopped');
  }
});
