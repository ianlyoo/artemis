import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeBinary, fakeHistory, lifecycleFixture, until } from './lifecycle-fixture.ts';
import { createClaudeDriver, type ClaudeSession } from './index.ts';
import { processIdentity, isAlive, type ProcessIdentity } from './processes.ts';
import { console } from '../../core/journal/fixtures.ts';
import type { StreamNotice } from '../../core/journal/index.ts';
import type { DriverEvent, DriverHost } from '../../core/types.ts';

for (const fake of [true, false]) test(`${fake ? 'SDK fixture' : 'real Haiku'} rewind survives a driver restart with actual core command IDs`, {
  skip: !fake && process.env.ARTEMIS_REAL !== '1', timeout: 180_000,
}, async t => {
  const f = await lifecycleFixture(fake);
  const notices: StreamNotice[] = [];
  const unsubscribe = f.journal.subscribe({ agents: [f.id] }, n => notices.push(n));
  try {
    await f.turn('first', 'Remember fixture word QUARTZ. Reply QUARTZ only. Do not use tools or delegate.');
    const second = await f.turn('second', 'Remember second fixture word TOPAZ. Reply TOPAZ only. Do not use tools or delegate.');
    assert.match(second.ack.commandId, /^[a-f0-9]{64}$/, 'current Registry command IDs are SHA-256, not UUIDs');
    const oldSession = f.sessions[0]!, native = oldSession.nativeId, previous = f.journal.cursor(f.id);
    const eventCount = f.events.length;
    await f.core.actor(f.id).lifecycle('stop', console);
    assert.equal(f.owned.filter(isAlive).length, 0, 'all old driver processes stopped');
    await f.core.actor(f.id).lifecycle('reopen', console);
    const rewound = await f.core.actor(f.id).rewind(second.ack.commandId);
    assert.equal(f.sessions.length, 2, 'new driver instance has no old command map');
    assert.notEqual(f.sessions[1], oldSession);
    assert.notEqual(f.sessions[1]!.nativeId, native);
    assert.equal(rewound.epoch, String(BigInt(previous.epoch) + 1n));
    assert.ok(f.core.timeline(f.id, {}).frames.some(frame => frame.type === 'rewound' && frame.messageId === second.ack.commandId));
    assert.ok(notices.some(n => n.op === 'resync_required' && n.snapshotCursor.epoch === rewound.epoch));
    assert.equal(f.events.slice(eventCount).filter(e => e.type === 'turn_started' ||
      (e.type === 'timeline' && e.item.type === 'assistant_message')).length, 0, 'history is not replayed as a new turn');
    await assert.rejects(f.sessions[1]!.rewind(second.ack.commandId), /not observed/);
    if (fake) {
      const trace = (await readFile(join(f.cwd, 'transport.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      const launches = trace.filter(row => row.type === 'launch');
      assert.equal(launches[1].args['--resume'], native);
      assert.equal(launches[2].args['--resume-session-at'], trace.find(row => row.type === 'user').reply);
    } else {
      const recall = await f.turn('recall', 'Which fixture words do you remember? Reply only the words. Do not use tools or delegate.');
      assert.match(recall.text, /QUARTZ/i); assert.doesNotMatch(recall.text, /TOPAZ/i);
    }
    t.diagnostic('P15/P17: A, B, close driver, resume, rewind before B; epoch+1/resync_required; A retained, B removed');
  } finally {
    unsubscribe(); await f.close();
    t.diagnostic(`pid audit: ${f.owned.length} tracked identities, alive=0`);
  }
});

test('UUID command IDs reach the SDK unchanged and remain rewindable after resume', { timeout: 30_000 }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'claude-uuid-restart-'));
  const driver = createClaudeDriver({ binary: await fakeBinary(cwd), readHistory: fakeHistory });
  const owned: ProcessIdentity[] = [], sessions: ClaudeSession[] = [], events: DriverEvent[] = [];
  const readers: Promise<void>[] = [];
  const host: DriverHost = { gate: async () => ({ allow: false, rule: 'fixture', reason: 'No tools' }),
    prompt: async () => ({ decision: 'deny' }), log() {},
    trackPid(pid) { const p = processIdentity(pid); if (p) owned.push(p); } };
  async function start(resume?: string) {
    const session = await driver.start({ agentId: 'fixture', driverGeneration: sessions.length + 1,
      cwd, model: 'fixture', profile: 'generic', settingSources: [], mcp: [],
      env: { HOME: '/workspace', PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: tmpdir() },
    }, host, resume);
    sessions.push(session);
    readers.push((async () => { for await (const e of session.events) events.push(e); })());
    return session;
  }
  try {
    const first = randomUUID(), second = randomUUID();
    const original = await start();
    for (const [index, commandId] of [first, second].entries()) {
      assert.equal((await original.send({ commandId, text: 'fixture', delivery: 'start' })).accepted, true);
      await until(() => events.filter(e => e.type === 'turn_completed').length === index + 1);
    }
    const native = original.nativeId;
    await original.close();
    const resumed = await start(native);
    await resumed.rewind(second);
    const trace = (await readFile(join(cwd, 'transport.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const users = trace.filter(row => row.type === 'user');
    assert.deepEqual(users.map(row => row.uuid), [first, second]);
    assert.deepEqual(events.flatMap(e => e.type === 'timeline' && e.item.type === 'user_message' ? [e.item.messageId] : []), [first, second]);
    assert.equal(trace.filter(row => row.type === 'launch').at(-1).args['--resume-session-at'], users[0].reply);
    await assert.rejects(resumed.rewind(second), /not observed/);
    await assert.rejects(resumed.rewind(users[0].reply), /not observed/, 'assistant IDs are not user rewind targets');
  } finally {
    for (const session of sessions) await session.close();
    await Promise.all(readers);
    assert.equal(owned.filter(isAlive).length, 0);
    t.diagnostic(`pid audit: ${owned.length} tracked identities, alive=0`);
  }
});
