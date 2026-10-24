import { homedir, tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createCodexDriver } from './index.ts';
import { contractTest, approvalFiles, protocolDir } from './contract.ts';
import { bootEnv, codexEnv } from './env.ts';
import { Rpc } from './rpc.ts';
import type { ThreadReadResponse } from './protocol/0.164.0/v2/ThreadReadResponse.ts';
import { processIdentity, isAlive, type ProcessIdentity } from '../claude/processes.ts';
import type { DriverEvent, DriverHost, Session, SpawnSpec } from '../../core/types.ts';
const enabled = process.env.ARTEMIS_REAL === '1';
const binary = 'codex'; const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
test('C18 real Codex model discovery uses control only and returns cached choices', { skip: process.env.ARTEMIS_REAL !== '1', timeout: 45000 }, async t => {
  const driver = createCodexDriver({ binary, codexHome });
  const models = await driver.models!();
  assert(models.length > 0); assert(models.every(m => m.id && m.label));
  assert(models.some(m => (m.thinking?.length ?? 0) > 0));
  assert(models.some(m => m.isDefault));
  assert.deepEqual(await driver.models!(), models);
  t.diagnostic(`Codex catalog: ${models.length} models; discovery process custody verified before return; no model turn`);
  t.diagnostic(JSON.stringify(models.map(m => ({ id: m.id, label: m.label, thinking: m.thinking }))));
});
async function waitFor(check: () => boolean | Promise<boolean>, timeout = 90000): Promise<void> {
  const until = Date.now() + timeout; while (Date.now() < until) { if (await check()) return; await delay(40); } throw new Error('Condition timed out');
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
test('X06 real Codex applies low to medium effort and a second cheap model on the next turn', { skip: process.env.ARTEMIS_REAL !== '1', timeout: 180000 }, async t => {
  const driver = createCodexDriver({ binary, codexHome });
  const models = await driver.models!();
  // Live catalog + official prices checked 2026-10-24: 5.6 Luna is the cheapest other model.
  // https://developers.openai.com/api/docs/models/gpt-5.6-luna ($0.20/$1.20 per million input/output).
  const alternate = 'gpt-5.6-luna';
  for (const id of ['gpt-6-luna', alternate]) assert(models.some(m => m.id === id && m.thinking?.includes('medium')));
  assert(models.find(m => m.id === 'gpt-6-luna')?.thinking?.includes('low'));
  const base = await mkdtemp(join(process.env.TMPDIR!, 'codex-mutation-'));
  const owned: ProcessIdentity[] = [], events: DriverEvent[] = [];
  let session: Session | undefined, consumed: Promise<void> | undefined, rpc: Rpc | undefined;
  let gateCalls = 0;
  const sent: { model: string; effort: string; collaboration: { model: string; reasoning_effort: string } }[] = [];
  const request = Rpc.prototype.request;
  // Observe the real transport without replacing any response. Only settings are retained.
  t.mock.method(Rpc.prototype, 'request', function(this: Rpc, method: string, params: any, timeout?: number) {
    if (method === 'thread/start') rpc = this;
    if (method === 'turn/start') sent.push({ model: params.model, effort: params.effort,
      collaboration: { model: params.collaborationMode.settings.model, reasoning_effort: params.collaborationMode.settings.reasoning_effort } });
    return request.call(this, method, params, timeout);
  });
  const host: DriverHost = {
    gate: async () => { gateCalls++; return { allow: false, rule: 'fixture', reason: 'No tools in this fixture; do not retry' }; },
    prompt: async () => ({ decision: 'deny' }), log() {},
    trackPid: pid => { const identity = processIdentity(pid); if (identity) owned.push(identity); },
  };
  try {
    session = await driver.start({ agentId: 'mutation-fixture', driverGeneration: 1, cwd: base,
      model: 'gpt-6-luna', thinking: 'low', mode: 'default', profile: 'test', mcp: [], settingSources: [],
      env: codexEnv(bootEnv(), codexHome), codexHome }, host);
    const active = session;
    consumed = (async () => { for await (const event of active.events) events.push(event); })();
    for (const [index, model, thinking] of [[0, 'gpt-6-luna', 'low'], [1, 'gpt-6-luna', 'medium'], [2, alternate, 'medium']] as const) {
      if (index === 1) await session.setSettings!({ thinking });
      if (index === 2) await session.setSettings!({ model });
      const offset = events.length;
      const ack = await session.send({ commandId: `mutation-${index}`, text: 'No tools. Reply only OK.', delivery: 'start' });
      assert.equal(ack.accepted, true);
      await waitFor(() => events.slice(offset).some(e => ['turn_completed', 'turn_failed', 'turn_canceled'].includes(e.type)), 45000);
      const turn = events.slice(offset);
      assert(turn.some(e => e.type === 'turn_completed'));
      assert(!turn.some(e => ['turn_failed', 'turn_canceled'].includes(e.type)));
      assert(turn.some(e => e.type === 'timeline' && e.item.type === 'assistant_message' && e.item.text.includes('OK')));
      assert(turn.some(e => e.type === 'settings_changed' && e.runtimeModel === model && e.runtimeThinking === thinking));
      assert.deepEqual(sent[index], { model, effort: thinking, collaboration: { model, reasoning_effort: thinking } });
      assert(rpc);
      const { thread }: ThreadReadResponse = await rpc.request('thread/read', { threadId: session.nativeId, includeTurns: false });
      assert.equal(thread.model, model, 'provider loaded model after the completed turn');
      assert.equal(thread.reasoningEffort, thinking, 'provider loaded effort after the completed turn');
      t.diagnostic(`turn ${index + 1}: ${model}/${thinking}; completed, provider thread/read agrees`);
    }
    assert.equal(sent.length, 3); assert.equal(gateCalls, 0);
    assert(!events.some(e => e.type === 'timeline' && e.item.type === 'tool_call'));
  } finally {
    await session?.close(); await consumed;
    if (session) assert.deepEqual(session.pids(), []);
    assert.equal(owned.filter(p => isAlive(p)).length, 0);
    t.diagnostic(`PID audit: ${owned.length} tracked, 0 running; ${sent.length} short turns sent`);
    await rm(base, { recursive: true, force: true });
  }
});
test('real Codex contract, approval denial, stream/steer, cancel/tree kill, settings and native resume', { skip: !enabled, timeout: 360000 }, async t => {
  const base = await mkdtemp(join(process.env.TMPDIR!, 'codex-real-'));
  const sessions: Session[] = []; const owned = new Set<number>();
  const env = codexEnv(bootEnv(), codexHome);
  let deny = true; let gateCalls = 0;
  const host: DriverHost = {
    gate: async action => { gateCalls++; return deny ? { allow: false, rule: 'fixture', reason: 'synthetic denial; do not retry', awaitingUser: 'fixture-approval' } : action.command?.includes('python3') && action.command.includes(base) ? { allow: true, rule: 'fixture' } : { allow: false, rule: 'fixture', reason: 'Only the synthetic Python fixture is allowed; do not retry' }; },
    prompt: async () => ({ decision: 'deny' }), trackPid: pid => { owned.add(pid); }, log() {},
  };
  const spec: SpawnSpec = { agentId: 'fixture', driverGeneration: 1, cwd: base, model: 'gpt-6-luna', thinking: 'low', mode: 'default', profile: 'test', mcp: [], settingSources: [], env, codexHome };
  const events: DriverEvent[] = [];
  const consume = (s: Session) => { sessions.push(s); void (async () => { for await (const e of s.events) events.push(e); })(); };
  try {
    const driver = createCodexDriver({ binary, codexHome });
    assert.deepEqual(await driver.selfTest!(), { ok: true });
    t.diagnostic('real pinned contract and handshake pass (no model turn)');
    const broken = join(base, 'broken-contract');
    for (const f of approvalFiles) { await mkdir(dirname(join(broken, f)), { recursive: true }); await writeFile(join(broken, f), await readFile(join(protocolDir, f))); }
    await writeFile(join(broken, approvalFiles[0]), 'broken contract');
    await assert.rejects(contractTest(binary, env, broken), /mismatch/);
    const disabled = createCodexDriver({ binary: '/bin/false', codexHome });
    assert.equal((await disabled.selfTest!()).ok, false);
    await assert.rejects(disabled.start(spec, host), { code: 'DRIVER_CONTRACT' });
    const s = await driver.start(spec, host); consume(s);
    let offset = events.length;
    const denied = await s.send({ commandId: 'denied', text: `Run exactly once: python3 -c "from pathlib import Path; Path('${base}/denied.txt').write_text('synthetic')". If denied, stop and say DENIED. Do not try another tool or method. No other commands.`, delivery: 'start', clientMessageId: 'console-denied' });
    assert.equal(denied.accepted, true);
    await waitFor(() => events.slice(offset).some(e => ['turn_completed','turn_failed'].includes(e.type)));
    assert.ok(gateCalls > 0, 'approval must reach host gate');
    assert.equal(await exists(join(base, 'denied.txt')), false);
    assert.ok(events.some(e => e.type === 'timeline' && e.item.type === 'tool_call' && JSON.stringify(e.item.detail ?? {}).includes('awaiting_user fixture-approval')));
    assert.ok(events.some(e => e.type === 'timeline' && e.item.type === 'user_message' && e.item.clientMessageId === 'console-denied'));
    t.diagnostic('real gate denial reached, denied write absent, client id echoed');
    deny = false; offset = events.length;
    const fixture = (prefix: string) => [1,2,3].map(i => `python3 -c "import time; from pathlib import Path; Path('${base}/${prefix}${i}.begin').write_text('begin'); time.sleep(15); Path('${base}/${prefix}${i}.done').write_text('done')"`).join('\n');
    const first = await s.send({ commandId: 'sleep', text: `Run these three commands sequentially, one tool call each, with no other commands. Then reply FINISHED. No subagents.\n${fixture('steer')}`, delivery: 'start' });
    assert.equal(first.accepted, true);
    await waitFor(() => exists(join(base, 'steer1.begin')));
    const steered = await s.send({ commandId: 'steer', text: 'Continue all three commands. Finish with STEERED instead of FINISHED.', delivery: 'steer', clientMessageId: 'console-steer' });
    assert.equal(steered.accepted, true); assert.ok(steered.accepted && steered.steered);
    assert.equal(steered.accepted && steered.nativeTurnId, first.accepted && first.nativeTurnId);
    await waitFor(() => events.slice(offset).some(e => e.type === 'turn_completed'), 120000);
    assert.equal(events.slice(offset).filter(e => e.type === 'turn_canceled').length, 0);
    assert.ok(events.slice(offset).some(e => e.type === 'steered'));
    assert.ok(events.slice(offset).some(e => e.type === 'timeline' && e.item.type === 'assistant_message'));
    t.diagnostic('real steer same turn, streamed response, no cancel');
    offset = events.length;
    assert.equal((await s.send({ commandId: 'cancel', text: `Run these commands sequentially, one tool call each, with no other commands.\n${fixture('cancel')}`, delivery: 'start' })).accepted, true);
    await waitFor(() => exists(join(base, 'cancel1.begin')));
    const before = Date.now(); await s.interrupt(); const elapsed = Date.now() - before;
    assert.ok(elapsed < 2000, `interrupt ${elapsed}ms`);
    assert.ok(events.slice(offset).some(e => e.type === 'turn_canceled'));
    const result = await s.hardStop(); assert.equal(result.alive, 0); assert.deepEqual(s.pids(), []);
    t.diagnostic(`real cancellation ${elapsed}ms; hardStop alive=0`);
    const resumed = await createCodexDriver({ binary, codexHome }).start({ ...spec, driverGeneration: 2 }, host, s.nativeId); consume(resumed);
    assert.equal(resumed.nativeId, s.nativeId);
    await resumed.setSettings!({ model: 'gpt-6-luna', thinking: 'low', mode: 'plan' }); offset = events.length;
    assert.equal((await resumed.send({ commandId: 'resume', text: 'No tools. Reply with exactly RESUMED.', delivery: 'start', clientMessageId: 'console-resume' })).accepted, true);
    await waitFor(() => events.slice(offset).some(e => e.type === 'turn_completed'));
    t.diagnostic('real new driver resumed same native thread; plan/low settings applied on next turn');
    const png = join(base, 'pixel.png');
    await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64'));
    offset = events.length;
    assert.equal((await resumed.send({ commandId: 'image', text: 'No tools. Reply IMAGE if an image was attached.', images: [{ path: png, mime: 'image/png' }], delivery: 'start' })).accepted, true);
    await waitFor(() => events.slice(offset).some(e => e.type === 'turn_completed'));
    assert.ok(events.slice(offset).some(e => e.type === 'timeline' && e.item.type === 'assistant_message' && e.item.text.includes('IMAGE')));
    offset = events.length;
    assert.equal((await resumed.send({ commandId: 'compact', text: '/compact', delivery: 'start' })).accepted, true);
    await waitFor(() => events.slice(offset).some(e => e.type === 'timeline' && e.item.type === 'compaction' && e.item.status === 'completed'));
    t.diagnostic('real image input and explicit compaction completed');
  } finally {
    for (const s of sessions) await s.close();
    for (const s of sessions) assert.deepEqual(s.pids(), []);
    let alive = 0;
    for (const pid of owned) { try { const stat = await readFile(`/proc/${pid}/stat`, 'utf8'); if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z') alive++; } catch {} }
    assert.equal(alive, 0); t.diagnostic(`PID audit: ${owned.size} tracked, 0 running`);
    await rm(base, { recursive: true, force: true });
  }
});
