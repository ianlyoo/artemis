import { homedir, tmpdir } from 'node:os';
/** Opt-in real native CLI test. Run under env -i; no transcript text or env values are logged. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { createClaudeDriver, type ClaudeSession } from './index.ts';
import { processIdentity, isAlive, type ProcessIdentity } from './processes.ts';
import type { DriverEvent, DriverHost, SpawnSpec } from '../../core/types.ts';

test('C18 real Claude model discovery uses control only and returns cached choices', { skip: process.env.ARTEMIS_REAL !== '1', timeout: 45000 }, async t => {
  const driver = createClaudeDriver();
  const models = await driver.models!();
  assert(models.length > 0); assert(models.every(m => m.id && m.label));
  assert(models.some(m => (m.thinking?.length ?? 0) > 0));
  assert.deepEqual(await driver.models!(), models);
  t.diagnostic(`Claude catalog: ${models.length} models; discovery process custody verified before return; no model turn`);
});

async function until(check: () => boolean | Promise<boolean>, ms = 120_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('fixture condition timed out');
    await delay(50);
  }
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
function png(): Buffer {
  function crc(b: Buffer): number {
    let c = 0xffffffff;
    for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(name: string, data: Buffer): Buffer {
    const b = Buffer.concat([Buffer.from(name), data]);
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(b));
    return Buffer.concat([head, b, tail]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(32, 0); header.writeUInt32BE(32, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(32 * 97);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pixels[y * 97 + 1 + 3 * x] = 255;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

test('real Claude: stream, steer, cancel, hardStop, settings, image, deny, rewind, resume and hooks',
  { skip: process.env.ARTEMIS_REAL !== '1', timeout: 720_000 }, async t => {
    assert.ok(process.env.TMPDIR, 'explicit test scratch root required');
    const cwd = await mkdtemp(join(process.env.TMPDIR!, 'real-'));
    const owned: ProcessIdentity[] = [];
    let gates = 0, denied = 0, prompts = 0;
    const host: DriverHost = {
      async gate(action) {
        gates++;
        // Synthetic, absent fixture path. A real secret file is never created or read.
        if (action.paths.some(p => p.endsWith('test-secret.fixture')) || action.command?.includes('test-secret.fixture')) {
          denied++; return { allow: false, rule: 'fixture.secret', reason: 'fixture secret denied' };
        }
        if (['Agent', 'Task'].includes(action.tool)) return { allow: false, rule: 'fixture.no-subagents', reason: 'no delegation' };
        if (action.kind === 'shell' && !action.command?.startsWith('python3 -c '))
          return { allow: false, rule: 'fixture.shell', reason: 'only synthetic python fixtures allowed' };
        if (action.kind === 'network' || action.kind === 'mcp') return { allow: false, rule: 'fixture.local', reason: 'local fixture only' };
        return { allow: true, rule: 'fixture' };
      },
      async prompt() { prompts++; return { decision: 'allow' }; },
      trackPid(pid) { const p = processIdentity(pid); if (p) owned.push(p); },
      log() {},
    };
    const spec: SpawnSpec = {
      agentId: 'claude-real-fixture', driverGeneration: 1, cwd, model: 'claude-haiku-5-5', mode: 'default',
      profile: 'generic', mcp: [], settingSources: [],
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: homedir(), USER: 'system', LOGNAME: 'system',
        LANG: 'C.UTF-8', SHELL: '/bin/bash', TERM: 'xterm-256color', TMPDIR: process.env.TMPDIR! },
    };
    const driver = createClaudeDriver();
    let session: ClaudeSession | undefined;
    let events: DriverEvent[] = [];
    let reader: Promise<void> | undefined;
    async function start(resume?: string, sources: SpawnSpec['settingSources'] = []) {
      session = await driver.start({ ...spec, settingSources: sources }, host, resume);
      events = [];
      const stream = session.events, target = events;
      reader = (async () => { for await (const e of stream) target.push(e); })();
    }
    async function turn(text: string, images?: { path: string; mime: string }[]) {
      const from = events.length;
      assert.equal((await session!.send({ commandId: `c-${from}`, clientMessageId: `console-${from}`, text, images, delivery: 'start' })).accepted, true);
      await until(() => events.slice(from).some(e => ['turn_completed', 'turn_failed'].includes(e.type)));
      assert.ok(events.slice(from).some(e => e.type === 'turn_completed'), 'turn completed');
      return events.slice(from);
    }
    const response = (list: DriverEvent[]) => list.flatMap(e => e.type === 'timeline' && e.item.type === 'assistant_message' ? [e.item.text] : []).join('');
    try {
      await start();
      assert.ok((await session!.supportedCommands()).some(c => c.name === 'compact'));
      const first = await turn('Remember fixture word QUARTZ. Reply with QUARTZ only. Do not use any tools.');
      assert.match(response(first), /QUARTZ/i);
      assert.ok(first.some(e => e.type === 'timeline' && e.item.type === 'assistant_message' && e.item.delta));
      assert.ok(first.some(e => e.type === 'timeline' && e.item.type === 'user_message' && e.item.clientMessageId?.startsWith('console-')));
      t.diagnostic('P1/P7 stream and client id: pass');
      const second = await turn('Remember second fixture word TOPAZ. Reply TOPAZ only. Do not use tools.');
      const target = second.find(e => e.type === 'timeline' && e.item.type === 'user_message');
      assert.ok(target?.type === 'timeline' && target.item.type === 'user_message' && target.item.messageId);
      const keepFile = join(cwd, 'unchanged.txt'); await writeFile(keepFile, 'unchanged');
      const before = session!.nativeId;
      const rewound = await session!.rewind(target.item.messageId);
      assert.notEqual(rewound.nativeId, before);
      assert.equal(await exists(keepFile), true);
      const recalled = response(await turn('What fixture word do you remember? Reply only the word; do not use tools.'));
      assert.match(recalled, /QUARTZ/i); assert.doesNotMatch(recalled, /TOPAZ/i);
      t.diagnostic('P15 conversation rewind preserves file and earlier context: pass');
      await session!.setSettings!({ model: 'claude-haiku-5-5', thinking: 'off', mode: 'default' });
      const changed = await turn('Reply SETTINGS_OK only, no tools.');
      assert.ok(changed.some(e => e.type === 'settings_changed' && e.thinking === 'off' && e.mode === 'default'));
      const picture = join(cwd, 'red.png'); await writeFile(picture, png());
      assert.match(response(await turn('Name the dominant color in this image in English. One word, no tools.', [{ path: picture, mime: 'image/png' }])), /red/i);
      t.diagnostic('P13/P14 image and next-turn settings: pass');
      await turn('Use Read once on test-secret.fixture in the current directory. If denied, stop and reply DENIED; never use another tool or route.');
      assert.ok(denied > 0);
      t.diagnostic('P32 real PreToolUse deny: pass');
      const sleepPrompt = (prefix: string) => `Use Bash for three separate sequential commands, waiting for each before starting the next. For N=1,2,3 execute: python3 -c "import pathlib,time; pathlib.Path('${prefix}'+str(N)+'.begin').write_text('begin'); time.sleep(15); pathlib.Path('${prefix}'+str(N)+'.done').write_text('done')" replacing N with its number. Do not delegate or use other tools. Then reply DONE.`;
      let from = events.length;
      await session!.send({ commandId: 'steer-start', text: sleepPrompt('steer'), delivery: 'start' });
      await until(() => exists(join(cwd, 'steer1.begin')));
      const turnId = events.slice(from).find(e => e.type === 'turn_started');
      const ack = await session!.send({ commandId: 'steer-message', text: 'After the three steps reply STEER_OK. Keep the steps unchanged.', delivery: 'steer' });
      assert.ok(ack.accepted && ack.steered);
      await until(() => events.slice(from).some(e => e.type === 'turn_completed'));
      assert.ok(events.slice(from).some(e => e.type === 'steered' && e.turnId === (turnId as { turnId: string }).turnId));
      assert.ok(!events.slice(from).some(e => e.type === 'turn_canceled'));
      t.diagnostic('P8 live steer retains turn without cancel: pass');
      from = events.length;
      await session!.send({ commandId: 'cancel-start', text: sleepPrompt('cancel'), delivery: 'start' });
      await until(() => exists(join(cwd, 'cancel1.begin')));
      const cancelAt = Date.now(); await session!.interrupt();
      await until(() => events.slice(from).some(e => e.type === 'turn_canceled'), 2000);
      assert.ok(Date.now() - cancelAt < 2000);
      const stopped = await session!.hardStop(); assert.equal(stopped.alive, 0);
      t.diagnostic(`P10 cancel ${Date.now() - cancelAt}ms, hardStop alive=0: pass`);
      await session!.send({ commandId: 'hard-stop-start', text: sleepPrompt('hard'), delivery: 'start' });
      await until(() => exists(join(cwd, 'hard1.begin')));
      assert.ok(session!.pids().length > 1, 'live tool descendant observed');
      const hardStopped = await session!.hardStop();
      assert.equal(hardStopped.alive, 0);
      assert.ok(!await exists(join(cwd, 'hard1.done')));
      t.diagnostic(`P10 hardStop during live tool: killed=${hardStopped.killed}; alive=0`);
      await turn('/compact');
      assert.ok(events.some(e => e.type === 'timeline' && e.item.type === 'compaction'));
      t.diagnostic('P9 /compact: pass');
      const native = session!.nativeId;
      await session!.close(); await reader;
      await mkdir(join(cwd, '.claude'));
      await writeFile(join(cwd, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [
        { type: 'command', command: 'python3 -c "print(\'synthetic session hook\')"' },
      ] }] } }));
      await start(native, ['project']);
      assert.equal(session!.nativeId, native);
      await turn('Reply RESUMED in Korean. Do not use tools.');
      assert.ok(events.some(e => e.type === 'timeline' && e.item.type === 'other' &&
        (e.item.raw as { hookEvent?: string })?.hookEvent === 'SessionStart'));
      t.diagnostic(`P17 resume/P31 synthetic project hook: pass; gate calls=${gates}; ordinary prompts=${prompts}`);
    } finally {
      await session?.close(); await reader;
      const alive = owned.filter(isAlive);
      t.diagnostic(`pid audit: started identities=${owned.length}; alive=${alive.length}`);
      assert.equal(alive.length, 0);
      await rm(cwd, { recursive: true, force: true });
    }
  });
