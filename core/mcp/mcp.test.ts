import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcp } from './index.ts';
import { createPolicy } from '../policy/index.ts';
import { agent, database, stubPlugin } from '../policy/fixture.ts';
import type { AgentRecord, EngineCore, Principal, SendRequest, TerminalRecord } from '../types.ts';

const names = ['create_agent', 'send_agent_prompt', 'get_agent_status', 'get_agent_activity', 'list_agents',
  'archive_agent', 'archive_workspace', 'create_terminal', 'capture_terminal', 'fixture_echo', 'fixture_denied', 'fixture_throw'];

test('real MCP sockets: all generic tools, policy, profiles, identity, transport/slot binding, revoke and proxy seam', { timeout: 30_000 }, async t => {
  const f = database();
  const agents = new Map<string, AgentRecord>([['a', agent('a')], ['b', agent('b', 'limited')]]);
  const calls: { id: string; request: SendRequest; principal: Principal }[] = [];
  const terminals: TerminalRecord[] = [];
  let created = 0, gates = 0, deniedInvocations = 0;
  const core: EngineCore = {
    get: id => agents.get(id) ?? null,
    list: filter => [...agents.values()].filter(a => filter.archived === undefined || (a.state === 'archived') === filter.archived),
    async create(intent, principal) {
      assert.equal(principal.name, 'agent:a');
      assert.equal(intent.parentId, 'a');
      const id = `created-${++created}`;
      agents.set(id, { ...agent(id), cwd: intent.cwd, title: intent.title });
      return { id, state: 'idle' };
    },
    async send(id, request, principal) { calls.push({ id, request, principal }); return { commandId: request.requestId, state: 'accepted' }; },
    async cancel() { throw new Error('unexpected cancel'); },
    async waitFor(id) { return agents.get(id)!; },
    timeline: () => ({ frames: [], cursor: { epoch: 'e1', seq: 0 } }),
    async archive(id, principal) { assert.equal(principal.kind, 'agent'); agents.get(id)!.state = 'archived'; },
    terminals: {
      async create(request) { const result: TerminalRecord = { ...request, id: `t-${terminals.length}`, generation: 1, createdAt: new Date().toISOString() };
        terminals.push(result); return result; },
      list: q => ({ items: terminals.filter(t => !q.user || t.user === q.user) }),
      kill: async () => {}, capture: async () => 'fixture screen', attach() {}, sweep: async () => 0, close: async () => {},
    },
  };
  const plugin = stubPlugin({
    profiles: () => ({
      generic: { name: 'generic', tools: names, interrupt: false, settingSources: [], mcpServers: ['proxy'] },
      limited: { name: 'limited', tools: ['get_agent_status'], interrupt: false, settingSources: [] },
    }),
    classify: async (_agent, action) => {
      gates++;
      return action.tool === 'fixture_denied' ? { decision: 'deny', rule: 'fixture.deny', reason: 'fixture denied' } : null;
    },
    tools: () => [
      { name: 'fixture_echo', description: 'fixture', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        call: async a => ({ caller: a.id }) },
      { name: 'fixture_denied', description: 'fixture', inputSchema: { type: 'object' },
        call: async () => { deniedInvocations++; return {}; } },
      { name: 'fixture_throw', description: 'fixture', inputSchema: { type: 'object' }, call: async () => { throw new Error('adapter failure'); } },
    ],
    mcpServers: a => [{ name: 'proxy', type: 'http', url: `http://127.0.0.1:0/proxy/${a.id}` }],
  });
  createPolicy({ db: f.db, journal: f.journal, plugin, log() {} });
  const service = createMcp({ port: 0, core, db: f.db, plugin, log() {} });
  const clients: Client[] = []; let port = 0;
  try {
    ({port} = await service.start());
    const a = service.slotFor(agents.get('a')!), b = service.slotFor(agents.get('b')!);
    assert.ok(a.type === 'http' && b.type === 'http');
    assert.match(new URL(a.url).pathname, /^\/mcp\/[a-f0-9]{32}$/);
    assert.deepEqual(service.slotFor(agents.get('a')!), a);
    const clientA = new Client({ name: 'fixture-a', version: '1' });
    const clientB = new Client({ name: 'fixture-b', version: '1' });
    clients.push(clientA, clientB);
    const transportA = new StreamableHTTPClientTransport(new URL(a.url));
    const transportB = new StreamableHTTPClientTransport(new URL(b.url));
    await clientA.connect(transportA); await clientB.connect(transportB);
    assert.equal((await clientA.listTools()).tools.length, names.length);
    assert.deepEqual((await clientB.listTools()).tools.map(t => t.name), ['get_agent_status']);
    let successes = 0;
    async function call(name: string, args: Record<string, unknown> = {}) {
      const result = await clientA.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, `${name} succeeds`);
      successes++;
      const content = result.content as { type: string; text: string }[];
      return JSON.parse(content[0]!.text);
    }
    assert.equal((await call('get_agent_status', { agentId: 'a' })).id, 'a');
    assert.deepEqual((await call('get_agent_activity', { agentId: 'a' })).frames, []);
    assert.equal((await call('list_agents')).length, 2);
    const child = await call('create_agent', { provider: 'claude', model: 'fixture', cwd: '/fixture-workspace', title: 'child' });
    await call('send_agent_prompt', { agentId: 'b', text: 'fixture prompt' });
    assert.equal(calls[0]!.request.delivery, 'steer');
    assert.equal(calls[0]!.principal.name, 'agent:a');
    const interrupt = await clientA.callTool({ name: 'send_agent_prompt', arguments: { agentId: 'b', text: 'fixture', delivery: 'interrupt' } });
    assert.equal(interrupt.isError, true);
    assert.equal(calls.length, 1);
    const terminal = await call('create_terminal', {});
    assert.equal(terminal.user, 'agent:a');
    assert.equal((await call('capture_terminal', { terminalId: terminal.id })).text, 'fixture screen');
    await call('archive_agent', { agentId: child.id });
    await call('create_agent', { provider: 'claude', model: 'fixture', cwd: '/fixture-workspace', title: 'child2' });
    assert.equal((await call('archive_workspace', { cwd: '/fixture-workspace' })).archived.length, 1);
    assert.equal((await call('fixture_echo')).caller, 'a');
    assert.equal((await clientA.callTool({ name: 'fixture_denied', arguments: {} })).isError, true);
    assert.equal(deniedInvocations, 0);
    assert.equal((await clientA.callTool({ name: 'fixture_throw', arguments: {} })).isError, true);
    assert.equal((await call('fixture_echo')).caller, 'a', 'adapter throw leaves listener usable');
    assert.equal((await clientB.callTool({ name: 'create_agent', arguments: {} })).isError, true);
    assert.equal((await clientA.callTool({ name: 'get_agent_status', arguments: { agentId: 123 } })).isError, true);
    const state = await fetch(a.url.replace('/mcp/', '/state/'));
    assert.equal(state.status, 200);
    assert.equal((await state.json() as { agentId: string }).agentId, 'a');
    const crossed = await fetch(b.url, { method: 'POST', headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': transportA.sessionId!,
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'tools/list', params: {} }) });
    assert.equal(crossed.status, 404);
    assert.equal((await fetch(b.url.replace('/mcp/', '/state/'), { headers: { 'mcp-session-id': transportA.sessionId! } })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp/00000000000000000000000000000000`)).status, 404);
    assert.equal((await fetch(a.url, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    const specs = service.serversFor(agents.get('a')!);
    assert.equal(specs.length, 2);
    assert.ok(specs.every(s => s.type !== 'http' || s.headers === undefined));
    assert.equal(service.serversFor(agents.get('b')!).length, 1, 'external servers also default deny');
    service.revoke('a');
    assert.equal((await fetch(a.url)).status, 404);
    assert.equal((await fetch(a.url.replace('/mcp/', '/state/'))).status, 404);
    assert.ok(gates >= successes + 5);
    assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get()!['integrity_check'], 'ok');
    t.diagnostic(`all 9 generic tools called; successful calls=${successes}; policy calls=${gates}; cross-slot=404; revoked=404`);
  } finally {
    await Promise.allSettled(clients.map(c => c.close()));
    await service.close();
    f.close();
  }
  await assert.rejects(fetch(`http://127.0.0.1:${port}/state/00000000000000000000000000000000`));
  t.diagnostic('listener audit: ephemeral port closed; no provider process started');
});

test('MCP missing policy fails closed; proxy credentials never leave server configuration', async () => {
  const f = database();
  const core = { get: () => agent() } as unknown as EngineCore;
  const plugin = stubPlugin({ mcpServers: () => [{ name: 'proxy', type: 'http', url: 'http://127.0.0.1:0/proxy',
    headers: { Authorization: 'synthetic-test-value' } }] });
  const service = createMcp({ port: 0, core, db: f.db, plugin, log() {} });
  try {
    await service.start();
    const spec = service.slotFor(agent());
    assert.ok(spec.type === 'http');
    assert.equal((await fetch(spec.url)).status, 404);
    assert.throws(() => service.serversFor(agent()), { code: 'FORBIDDEN' });
  } finally { await service.close(); f.close(); }
});
