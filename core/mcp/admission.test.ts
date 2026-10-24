import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Database } from '../db.ts';
import { Journal } from '../journal/index.ts';
import { Registry } from '../registry.ts';
import { ProcessCustody } from '../procs/posix.ts';
import { FakeDriver, fakeTerminals, console, scratch } from '../journal/fixtures.ts';
import { stubPlugin } from '../policy/fixture.ts';
import { createPolicy } from '../policy/index.ts';
import { createMcp } from './index.ts';
import type { CreateIntent, Principal } from '../types.ts';

test('MCP create passes identity/profile through registry admission with an immutable caller parent', async t => {
  const cwd = scratch('mcp-admission-'), db = new Database(join(cwd, 'engine.db'));
  const admissions: { intent: CreateIntent; principal: Principal }[] = [];
  let gates = 0, deny = false;
  const plugin = stubPlugin({
    profiles: () => Object.fromEntries(['generic', 'system-test'].map(name => [name,
      { name, tools: ['create_agent'], interrupt: false, settingSources: [] }])),
    beforeCreate: async (intent, principal) => {
      admissions.push({ intent, principal });
      return intent.identity?.refuse ? { code: 'FORBIDDEN', rule: 'fixture.admission', reason: 'synthetic refusal' }
        : { ok: true, labels: { authority: 'adapter' }, identity: { authority: 'adapter' } };
    },
    classify: async () => { gates++; return deny ? { decision: 'deny', rule: 'fixture.gate', reason: 'synthetic denial' } : null; },
  });
  const journal = new Journal(db, plugin), policy = createPolicy({ db, journal, plugin, log() {} });
  const driver = new FakeDriver();
  const core = new Registry({ db, journal, policy, plugin, drivers: [driver], terminals: fakeTerminals(), procs: new ProcessCustody(db) });
  core.held = true; // Creation may include a prompt; keep it queued without starting a provider.
  const service = createMcp({ port: 0, core, plugin, db, log() {} }); core.mcp = service;
  const client = new Client({ name: 'admission-test', version: '1' }); let port = 0;
  try {
    const parent = await core.create({ requestId: 'parent', provider: 'claude', model: 'synthetic', cwd, title: 'parent', profile: 'generic' }, console);
    ({port} = await service.start());
    const slot = service.slotFor(core.require(parent.id)); assert.ok(slot.type === 'http');
    await client.connect(new StreamableHTTPClientTransport(new URL(slot.url)));
    const tool = (await client.listTools()).tools.find(t => t.name === 'create_agent')!;
    assert.deepEqual((tool.inputSchema.properties!.provider as { enum: string[] }).enum, ['claude', 'codex']);
    assert.equal(tool.inputSchema.properties!.parentId, undefined);
    const base = { provider: 'claude', model: 'synthetic', cwd, title: 'child' };
    let calls = 0;
    const create = (args: Record<string, unknown>) => { calls++; return client.callTool({ name: 'create_agent', arguments: args }); };
    const response = await create({ ...base, requestId: 'explicit', profile: 'system-test', thinking: 'low', mode: 'plan',
      labels: { project: 'fixture', authority: 'caller' }, identity: { role: 'worker', goal: 159, authority: 'caller' }, prompt: 'synthetic queued prompt' });
    assert.notEqual(response.isError, true);
    const id = JSON.parse((response.content as { text: string }[])[0]!.text).id as string;
    const seen = admissions.at(-1)!;
    assert.deepEqual(seen.principal, { kind: 'agent', name: `agent:${parent.id}`, agentId: parent.id });
    assert.equal(seen.intent.parentId, parent.id); assert.equal(seen.intent.launcherId, parent.id);
    assert.equal(seen.intent.profile, 'system-test'); assert.equal(seen.intent.identity?.role, 'worker');
    const created = core.require(id);
    assert.equal(created.profile, 'system-test'); assert.equal(created.thinking, 'low'); assert.equal(created.mode, 'plan');
    assert.deepEqual(created.labels, { project: 'fixture', authority: 'adapter' });
    assert.deepEqual(created.identity, { role: 'worker', goal: 159, authority: 'adapter' });
    assert.equal(core.pending(id)[0]!.m.text, 'synthetic queued prompt');
    assert.equal(driver.sessions.length, 0);
    const inherited = await create({ ...base, requestId: 'default-profile' });
    assert.notEqual(inherited.isError, true); assert.equal(admissions.at(-1)!.intent.profile, 'generic');
    const before = admissions.length;
    for (const invalid of [{ parentId: 'someone-else' }, { launcherId: 'someone-else' }, { provider: 'agy' },
      { identity: [] }, { labels: { project: 159 } }, { profile: null }]) {
      assert.equal((await create({ ...base, ...invalid })).isError, true);
    }
    assert.equal(admissions.length, before, 'malformed callers never reach admission');
    deny = true;
    assert.equal((await create(base)).isError, true); assert.equal(admissions.length, before);
    deny = false;
    assert.equal((await create({ ...base, identity: { refuse: true } })).isError, true);
    assert.equal(core.list({}).length, 3, 'denied admission did not create an agent');
    assert.equal(gates, calls, 'every tool call, including malformed/refused ones, passed the gate');
    t.diagnostic(`${calls} MCP calls gated; agent principal reached admission; adapter identity/labels won; no provider started`);
  } finally { await client.close(); await service.close(); await core.close(); journal.close(); db.close(); }
  await assert.rejects(fetch(`http://127.0.0.1:${port}/state/unknown`));
});
