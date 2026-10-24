import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { parseOptions, startEngine } from '../main.ts';
import { FakeDriver, fakePlugin, fakeTerminals, scratch, console, lockReleased } from '../journal/fixtures.ts';
import { Auth } from './auth.ts';
import { callLocal } from './transport.ts';
import { listen, closeServer } from '../test-support/ports.ts';

test('CLI accepts ephemeral ports and preserves production defaults', () => {
  const defaults = parseOptions(['--state', '/scratch']);
  assert.equal(defaults.apiPort, 47160);
  assert.equal(defaults.mcpPort, 47161);
  const dynamic = parseOptions(['--state', '/scratch', '--api-port', '0', '--mcp-port', '0']);
  assert.equal(dynamic.apiPort, 0); assert.equal(dynamic.mcpPort, 0);
  for (const value of ['', '-1', '65536', '1.5', 'invalid'])
    assert.throws(() => parseOptions(['--state', '/scratch', '--api-port', value]));
});

test('concurrent enginees expose distinct bound API/MCP ports and advertise the live MCP listener', async t => {
  const enginees: (Awaited<ReturnType<typeof startEngine>> & { stateDir: string })[] = [];
  t.after(async () => {
    await Promise.all(enginees.map(h => h.close()));
    for (const h of enginees) assert.ok(await lockReleased(h.stateDir, h.lockPid), 'writer lock released and its helper stopped');
    for (const h of enginees) {
      await assert.rejects(fetch(`http://127.0.0.1:${h.apiPort}/v1/health`));
      await assert.rejects(fetch(`http://127.0.0.1:${h.mcpPort}/state/unknown`));
    }
    t.diagnostic('two enginees; four listeners closed; two lock helpers alive=0');
  });
  const boots = await Promise.allSettled([0, 1].map(async () => {
    const stateDir = scratch('ports-');
    const h = await startEngine({ stateDir, apiPort: 0, mcpPort: 0 },
      { plugin: fakePlugin(), drivers: [new FakeDriver()], terminals: () => fakeTerminals() });
    enginees.push({ ...h, stateDir });
    const token = randomBytes(32).toString('hex'); new Auth(h.db, stateDir).register({ name: 'console' }, token);
    const doctor = await callLocal({ port: h.apiPort, token, method: 'GET', path: '/v1/doctor' });
    assert.equal(doctor.status, 200); assert.equal((doctor.body as { ports: {mcp: boolean} }).ports.mcp, true);
    const { id } = await h.core.create({ requestId: 'port-agent', provider: 'claude', model: 'fixture', cwd: stateDir,
      profile: 'test', title: 'ports' }, console);
    const spec = h.core.mcp!.slotFor(h.core.require(id)); assert.ok(spec.type === 'http');
    assert.equal(Number(new URL(spec.url).port), h.mcpPort);
    assert.equal((await fetch(spec.url.replace('/mcp/', '/state/'))).status, 200);
  }));
  for (const boot of boots) if (boot.status === 'rejected') throw boot.reason;
  const ports = enginees.flatMap(h => [h.apiPort, h.mcpPort]);
  assert.ok(ports.every(port => port > 0)); assert.equal(new Set(ports).size, 4);
});

test('restart helper retains its allocated port and retries EADDRINUSE until the prior listener closes', async t => {
  const first = createServer(), second = createServer();
  t.after(async () => { await closeServer(first); await closeServer(second); });
  const port = await listen(first);
  const rebound = listen(second, port);
  await new Promise(resolve => setTimeout(resolve, 100));
  await closeServer(first);
  assert.equal(await rebound, port);
});
