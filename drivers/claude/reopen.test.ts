import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lifecycleFixture } from './lifecycle-fixture.ts';
import { console } from '../../core/journal/fixtures.ts';
import { isAlive } from './processes.ts';

for (const fake of [true, false]) test(`${fake ? 'SDK fixture' : 'real Haiku'} stop before first turn reopens with a fresh native session`, {
  skip: !fake && process.env.ARTEMIS_REAL !== '1', timeout: 120_000,
}, async t => {
  const f = await lifecycleFixture(fake);
  try {
    // An idle control request can initialize the driver without ever sending a user turn.
    await assert.rejects(f.core.actor(f.id).rewind('unobserved-command'), /not observed/);
    assert.equal(f.sessions.length, 1);
    assert.equal(f.sessions[0]!.nativeId, '', 'an unused SDK session must not advertise its planned UUID');
    assert.equal(f.db.prepare('SELECT native_id FROM native_sessions WHERE agent_id=?').get(f.id), undefined);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM turns WHERE agent_id=?').get(f.id)!.n, 0);
    await f.core.actor(f.id).lifecycle('stop', console);
    assert.equal(f.core.require(f.id).state, 'stopped');
    assert.equal(f.owned.filter(isAlive).length, 0);
    await f.core.actor(f.id).lifecycle('reopen', console);
    assert.equal(f.core.require(f.id).state, 'idle');
    const sent = await f.turn('after-reopen', 'Reply REOPENED_OK only. Do not use tools or delegate.');
    assert.equal(f.sessions.length, 2);
    assert.ok(f.sessions[1]!.nativeId);
    assert.equal(f.db.prepare('SELECT native_id FROM native_sessions WHERE agent_id=?').get(f.id)!.native_id, f.sessions[1]!.nativeId);
    if (fake) {
      const launches = (await readFile(join(f.cwd, 'transport.jsonl'), 'utf8')).trim().split('\n')
        .map(line => JSON.parse(line)).filter(row => row.type === 'launch');
      assert.equal(launches.length, 2);
      assert.ok(launches.every(row => row.args['--resume'] === undefined));
      assert.notEqual(launches[0].args['--session-id'], launches[1].args['--session-id']);
      // Rewinding the first message also leaves no native history. Core may store
      // the empty ID returned by rewind; reopening must treat that as a fresh start.
      await f.core.actor(f.id).rewind(sent.ack.commandId);
      assert.equal(f.sessions[1]!.nativeId, '');
      await f.core.actor(f.id).lifecycle('stop', console);
      await f.core.actor(f.id).lifecycle('reopen', console);
      await f.turn('after-empty-rewind', 'Synthetic fresh turn.');
    } else assert.match(sent.text, /^REOPENED_OK\s*$/);
    t.diagnostic('P21: initialized but unused session stopped; reopen sent successfully using fresh native state');
  } finally {
    await f.close();
    t.diagnostic(`pid audit: ${f.owned.length} tracked identities, alive=0`);
  }
});
