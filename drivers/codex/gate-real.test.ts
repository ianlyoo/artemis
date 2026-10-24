import { homedir, tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createCodexDriver } from './index.ts';
import { bootEnv, codexEnv } from './env.ts';
import type { Action, DriverEvent, DriverHost, Session, SpawnSpec } from '../../core/types.ts';

const enabled = process.env.ARTEMIS_REAL === '1';
test('real untrusted cat and apply_patch are declined by the host gate', { skip: !enabled, timeout: 180000 }, async t => {
  const root = await mkdtemp(join(process.env.TMPDIR!, 'codex-read-gate-'));
  const path = join(root, 'fixture.txt');
  // Synthetic data only; never place real secrets in a provider fixture.
  const content = `synthetic-fixture-${randomUUID()}\n`;
  await writeFile(path, content);
  const events: DriverEvent[] = []; const calls: Action[] = []; const owned = new Set<number>();
  let session: Session | undefined;
  const host: DriverHost = {
    gate: async action => {
      calls.push(action);
      return { allow: false, rule: 'fixture-read-deny', reason: 'Synthetic test denied; do not retry', awaitingUser: 'fixture-read' };
    },
    prompt: async () => ({ decision: 'deny' }), trackPid: pid => { owned.add(pid); }, log() {},
  };
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const spec: SpawnSpec = { agentId: 'read-gate-fixture', driverGeneration: 1, cwd: root, model: 'gpt-6-luna',
    thinking: 'low', mode: 'default', profile: 'test', mcp: [], settingSources: [],
    env: codexEnv(bootEnv(), codexHome), codexHome };
  async function turn(commandId: string, text: string): Promise<void> {
    const offset = events.length;
    assert.equal((await session!.send({ commandId, text, delivery: 'start' })).accepted, true);
    const until = Date.now() + 70000;
    while (!events.slice(offset).some(e => ['turn_completed', 'turn_failed', 'turn_canceled'].includes(e.type))) {
      if (Date.now() > until) throw new Error('Synthetic gate turn timed out');
      await delay(40);
    }
    assert.ok(events.slice(offset).some(e => e.type === 'turn_completed'), 'turn must complete after denial');
    assert.ok(events.slice(offset).some(e => e.type === 'timeline' && e.item.type === 'tool_call'
      && e.item.status === 'denied' && JSON.stringify(e.item.detail ?? {}).includes('awaiting_user fixture-read')));
    assert.ok(events.slice(offset).some(e => e.type === 'timeline' && e.item.type === 'tool_call'
      && e.item.status === 'declined'), 'app-server must confirm the tool was declined');
  }
  try {
    session = await createCodexDriver({ binary: 'codex', codexHome }).start(spec, host);
    void (async () => { for await (const event of session!.events) events.push(event); })();
    await turn('read-deny', `Use the shell tool exactly once to run: cat ${path}\nIf denied, stop and reply DENIED. Do not retry, use another tool, or read any other file. No other commands.`);
    assert.ok(calls.some(a => a.kind === 'shell' && a.command?.includes('cat ') && a.command.includes(path)),
      'cat approval must reach the policy gate');
    assert.ok(!JSON.stringify(events).includes(content.trim()), 'synthetic file content must never reach normalized events');
    t.diagnostic('real gpt-6-luna/low: cat reached host.gate and was declined with awaiting_user');
    const count = calls.length;
    await turn('patch-deny', `Use apply_patch exactly once to add ${root}/new-fixture.txt containing the text synthetic. Do not run shell commands. If denied, stop and reply DENIED. Do not retry or use another tool.`);
    assert.ok(calls.slice(count).some(a => a.kind === 'write' && a.paths?.includes(join(root, 'new-fixture.txt'))),
      'patch paths must reach the policy gate before any write');
    await assert.rejects(readFile(join(root, 'new-fixture.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(path, 'utf8'), content);
    t.diagnostic('real apply_patch reached host.gate and was declined; target absent');
  } finally {
    if (session) { await session.close(); assert.deepEqual(session.pids(), []); }
    let alive = 0;
    for (const pid of owned) {
      try { const stat = await readFile(`/proc/${pid}/stat`, 'utf8'); if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z') alive++; }
      catch {}
    }
    assert.equal(alive, 0); t.diagnostic(`PID audit: ${owned.size} tracked, 0 running`);
    await rm(root, { recursive: true, force: true });
  }
});
