import test from 'node:test';
import assert from 'node:assert/strict';
import { loginShell } from './shell.ts';
import { terminalActivity } from './activity.ts';
import { Screen } from './screen.ts';
test('headless snapshot restores 5000 lines, colors, wide characters and cursor', async () => {
  const source = new Screen(80, 24); const restored = new Screen(80, 24);
  try {
    await source.write(Array.from({ length: 5100 }, (_, i) => `\x1b[31mrow-${String(i).padStart(4, '0')}\x1b[0m 한글\r\n`).join(''));
    await source.write('\x1b[32mTAIL\x1b[0m');
    const snap = await source.snapshot(); assert.equal(snap.text.split('\n').length, 5000); assert.match(snap.ansi, /38;5;1/);
    await restored.write(snap.ansi); const replay = await restored.snapshot();
    assert.equal(replay.text, snap.text); assert.equal(replay.cursorX, snap.cursorX); assert.equal(replay.cursorY, snap.cursorY);
  } finally { source.dispose(); restored.dispose(); }
});


test('T11: Darwin and Linux account shells are interactive login commands', () => {
  assert.deepEqual(loginShell('darwin', () => '/bin/zsh', () => {}), { file: '/bin/zsh', args: ['-l', '-i'] });
  for (const platform of ['darwin', 'linux'] as const) assert.deepEqual(loginShell(platform, () => '/bin/sh'), { file: '/bin/sh', args: ['-l', '-i'] });
  assert.throws(() => loginShell('darwin', () => 'relative'));
});

test('T08: prompt projection is conservative and attention timestamps survive polling', async () => {
  const screen = new Screen(80, 24), working = { activity: 'working' as const, attention: null };
  try {
    await screen.write('\x1b[?2004huser% ');
    assert.deepEqual(await screen.prompt(), { line: 'user% ', bracketedPaste: true });
    assert.equal(terminalActivity('user% ', true, true, working).activity, 'idle');
    assert.equal(terminalActivity('output ends in $', false, false, working).activity, 'working');
    const first = terminalActivity('Password: ', false, false, working, new Date(0));
    assert.deepEqual(first, { activity: 'needs_input', attention: { reason: 'needs_input', since: new Date(0).toISOString() } });
    assert.deepEqual(terminalActivity('Password: ', false, false, first, new Date(1000)), first);
    assert.deepEqual(terminalActivity('user% ', true, true, first), { activity: 'idle', attention: null });
  } finally { screen.dispose(); }
});
