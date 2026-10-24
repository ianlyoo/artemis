import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lifecycleFixture } from './lifecycle-fixture.ts';
import type { StreamNotice } from '../../core/journal/index.ts';
import type { TimelineItem } from '../../core/types.ts';

for (const fake of [true, false]) test(`${fake ? 'SDK fixture' : 'real Haiku'} rewind uses the journal command ID and resyncs subscribers`, {
  skip: !fake && process.env.ARTEMIS_REAL !== '1', timeout: 180_000,
}, async t => {
  const f = await lifecycleFixture(fake);
  const notices: StreamNotice[] = [];
  const unsubscribe = f.journal.subscribe({ agents: [f.id] }, n => notices.push(n));
  try {
    const first = await f.turn('first', 'Remember fixture word QUARTZ. Reply QUARTZ only. Do not use tools or delegate.');
    const second = await f.turn('second', 'Remember second fixture word TOPAZ. Reply TOPAZ only. Do not use tools or delegate.');
    const users = second.frames.flatMap(frame => {
      const item = frame.item as TimelineItem | undefined;
      return item?.type === 'user_message' ? [item] : [];
    });
    assert.equal(users.length, 1);
    assert.equal(users[0]!.messageId, second.ack.commandId);
    assert.equal(users[0]!.clientMessageId, 'client-second');
    assert.deepEqual(f.events.flatMap(e => e.type === 'timeline' && e.item.type === 'user_message' ? [e.item.messageId] : []),
      [first.ack.commandId, second.ack.commandId], 'driver and core expose the same user IDs');
    assert.match(second.ack.commandId, /^[a-f0-9]{64}$/, 'the public ID is not a native UUID');
    const session = f.sessions.at(-1)!, native = session.nativeId, previous = f.journal.cursor(f.id);
    const file = join(f.cwd, 'unchanged.txt'); await writeFile(file, 'preserve this file');
    const rewound = await f.core.actor(f.id).rewind(users[0]!.messageId!);
    assert.equal(rewound.epoch, String(BigInt(previous.epoch) + 1n));
    assert.notEqual(session.nativeId, native);
    assert.ok(f.core.timeline(f.id, {}).frames.some(frame => frame.type === 'rewound' && frame.messageId === second.ack.commandId));
    assert.ok(notices.some(n => n.op === 'resync_required' && n.agentId === f.id && n.snapshotCursor.epoch === rewound.epoch));
    assert.throws(() => f.core.timeline(f.id, { after: previous }), { code: 'RESYNC_REQUIRED' });
    assert.equal(await readFile(file, 'utf8'), 'preserve this file');
    await assert.rejects(session.rewind(second.ack.commandId), /not observed/, 'removed messages cannot be rewound again');
    if (fake) {
      const trace = (await readFile(join(f.cwd, 'transport.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      const first = trace.find(row => row.type === 'user');
      const fork = trace.filter(row => row.type === 'launch').at(-1);
      assert.equal(fork.args['--resume'], native);
      assert.equal(fork.args['--resume-session-at'], first.reply, 'fork before user 2, at assistant 1');
      assert.notEqual(trace.filter(row => row.type === 'user')[1].uuid, second.ack.commandId);
    } else {
      const recall = await f.turn('recall', 'Which fixture words do you remember? Reply only the words. Do not use tools or delegate.');
      assert.match(recall.text, /QUARTZ/i); assert.doesNotMatch(recall.text, /TOPAZ/i);
    }
    t.diagnostic('P15: command-ID rewind, epoch+1, rewound journal frame, resync_required, files unchanged');
  } finally {
    unsubscribe(); await f.close();
    t.diagnostic(`pid audit: ${f.owned.length} tracked identities, alive=0`);
  }
});
