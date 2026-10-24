import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userChannel } from './channel.ts';
import type { Frame } from '../types.ts';
import { createMcp } from './index.ts';
import { createPolicy } from '../policy/index.ts';
import { agent, database, stubPlugin } from '../policy/fixture.ts';
import { protectPlugin, ADMISSION_BUDGET_MS } from '../plugin.ts';
import type { EngineCore, EnginePlugin } from '../types.ts';

test('state slot and agent-ID routes preserve adapter status/body/query and reject unavailable agents', async t => {
  const f = database(), current = agent('state-agent');
  const queries: string[] = [];
  let response: { status: number; data: unknown } = { status: 200, data: { text: 'synthetic state' } };
  let operation: NonNullable<EnginePlugin['state']> = async () => response;
  const plugin = stubPlugin({ state: async (a, search) => { assert.equal(a.id, current.id); queries.push(search); return operation(a, search); } });
  const core = { get: (id: string) => id === current.id ? current : null } as EngineCore;
  createPolicy({ db: f.db, journal: f.journal, plugin, log() {} });
  const service = createMcp({ port: 0, core, db: f.db, plugin, log() {} });
  let idUrl = '', port = 0;
  try {
    ({port} = await service.start()); idUrl = `http://127.0.0.1:${port}/state/${current.id}`;
    const early = await fetch(`${idUrl}?source=startup`);
    assert.equal(early.status, 200); assert.deepEqual(await early.json(), response.data);
    const spec = service.slotFor(current); assert.ok(spec.type === 'http');
    const slotUrl = spec.url.replace('/mcp/', '/state/');
    const query = '?source=resu%6De&source=other%3Fvalue';
    for (const url of [idUrl, slotUrl]) {
      const json = await fetch(url + query);
      assert.equal(json.status, 200); assert.match(json.headers.get('content-type')!, /json/);
      assert.equal(json.headers.get('cache-control'), 'no-store'); assert.deepEqual(await json.json(), response.data);
    }
    assert.deepEqual(queries, ['?source=startup', query, query]);
    response = { status: 202, data: 'plain state text' };
    for (const url of [idUrl, slotUrl]) {
      const text = await fetch(url); assert.equal(text.status, 202);
      assert.match(text.headers.get('content-type')!, /text\/plain/); assert.equal(await text.text(), response.data);
    }
    response = { status: 503, data: { error: 'fixture_unavailable' } };
    assert.deepEqual(await (await fetch(idUrl)).json(), response.data);
    for (const invalid of [{ status: 42, data: {} }, { status: 200, data: undefined }]) {
      response = invalid; const failed = await fetch(idUrl); assert.equal(failed.status, 503);
      assert.deepEqual(await failed.json(), { error: 'request refused' });
    }
    operation = async () => { throw new Error('synthetic raw adapter detail'); };
    const failed = await fetch(idUrl); assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('raw adapter detail'));
    operation = async () => ({ status: 200, data: { text: 'recovered' } });
    assert.equal((await fetch(idUrl)).status, 200, 'adapter failure leaves listener usable');
    const count = queries.length;
    assert.equal((await fetch(`http://127.0.0.1:${port}/state/unknown?source=startup`)).status, 404);
    assert.equal((await fetch(idUrl, { method: 'POST' })).status, 405);
    assert.equal((await fetch(idUrl, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal(queries.length, count);
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    operation = async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { status: 200, data: 'stale' }; };
    const pending = fetch(slotUrl); await waiting; current.state = 'archived'; release();
    assert.equal((await pending).status, 404, 'archiving during adapter work invalidates its response');
    assert.equal((await fetch(idUrl)).status, 404); assert.equal((await fetch(slotUrl)).status, 404);
    current.state = 'idle'; operation = async () => ({ status: 200, data: null });
    service.revoke(current.id);
    assert.equal((await fetch(slotUrl)).status, 404);
    assert.equal((await fetch(idUrl)).status, 200, 'ID compatibility does not require a slot');
    t.diagnostic('JSON/text/status/raw-query parity; unknown/archived/revoked-slot 404; adapter error 503; no provider started');
  } finally { await service.close(); f.close(); }
  await assert.rejects(fetch(idUrl));
});

test('state facade is optional and its adapter deadline fails closed', async t => {
  assert.equal(protectPlugin(stubPlugin()).state, undefined);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const plugin = protectPlugin(stubPlugin({ state: async () => new Promise(() => {}) }));
  const check = assert.rejects(plugin.state!(agent(), '?source=startup'), { code: 'ADAPTER_ERROR', status: 503 });
  t.mock.timers.tick(ADMISSION_BUDGET_MS + 1);
  await check;
});


test('P15: channel projection uses user origin and excludes wakes, stale frames, slash controls and resends', () => {
  const message = (channel: string, principal: 'user' | 'system' = 'user', text = 'Show chart', clientMessageId = 'fixture'): Frame => ({
    agentId: 'channel-agent', epoch: '1', seq: 1, ts: new Date(0).toISOString(), driverGeneration: 1, turnId: null,
    type: 'timeline', origin: { principal, channel }, item: { type: 'user_message', text, messageId: null, clientMessageId },
  });
  const console = message('console'), app = message('app');
  assert.deepEqual(userChannel([console]), { channel: 'console', userTurn: true });
  assert.deepEqual(userChannel([console, app]), { channel: 'app', userTurn: true });
  for (const frame of [message('wake', 'system'), message('console', 'system'), message('console', 'user', '/compact'),
    message('console', 'user', '[system wake]'), message('console', 'user', '⟦system:notice⟧'),
    message('console', 'user', 'text', 'system-wake-1'), message('console', 'user', 'text', 'wake:1'),
    message('console', 'user', 'text', 'console-00000000-0000-4000-8000-000000000000-now')]) {
    assert.deepEqual(userChannel([app, frame]), { channel: 'app', userTurn: false });
  }
  assert.deepEqual(userChannel([console, { ...app, stale: true }]), { channel: 'console', userTurn: true });
  assert.deepEqual(userChannel([]), { channel: null, userTurn: false });
});

test('P15: channel compatibility route is read only, origin fenced and returns only safe channel fields', async () => {
  const f = database(), current = agent('channel-agent'), plugin = stubPlugin();
  const frame: Frame = { agentId: current.id, epoch: '1', seq: 1, ts: new Date(0).toISOString(), driverGeneration: 1, turnId: null,
    type: 'timeline', origin: { principal: 'user', channel: 'console' }, item: { type: 'user_message', text: 'Private fixture text', clientMessageId: 'console-fixture' } };
  const core = { get: (id: string) => id === current.id ? current : null, timeline: () => ({ frames: [frame] }) } as unknown as EngineCore;
  createPolicy({ db: f.db, journal: f.journal, plugin, log() {} });
  const service = createMcp({ port: 0, core, db: f.db, plugin, log() {} });
  try {
    const { port } = await service.start(), url = `http://127.0.0.1:${port}/channel/${current.id}`;
    const response = await fetch(url); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { channel: 'console', userTurn: true });
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(url, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await fetch(url, { headers: { 'mcp-session-id': 'foreign-session' } })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/channel/missing`)).status, 404);
    const slot = service.slotFor(current); assert.equal(slot.type, 'http');
    const slotUrl = (slot as { url: string }).url.replace('/mcp/', '/channel/');
    assert.equal((await fetch(slotUrl)).status, 200); service.revoke(current.id); assert.equal((await fetch(slotUrl)).status, 404);
    current.state = 'archived'; assert.equal((await fetch(url)).status, 404);
  } finally { await service.close(); f.close(); }
});
