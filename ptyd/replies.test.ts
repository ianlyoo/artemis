import test from 'node:test';
import assert from 'node:assert/strict';
import { Screen } from './screen.ts';
import { Replies } from './replies.ts';
test('cursor and colour queries are answered in place; the browser duplicates never reach the shell', async () => {
  const sent: string[] = []; const screen = new Screen(80, 24, data => sent.push(data));
  try {
    await screen.write('abc\x1b]11;?\x1b\\\x1b[6n');
    assert.deepEqual(sent, ['\x1b]11;rgb:2020/2020/2020\x1b\\', '\x1b[1;4R']);
    // The user's 10/22 echo: the browser's own late answers, then a typed key.
    assert.equal(screen.input('\x1b]11;rgb:fafa/fafa/f8f8\x1b\\\x1b[1;4Rx'), 'x');
    sent.length = 0; await screen.write('\r\n\x1b]10;?;?\x07');
    assert.deepEqual(sent, ['\x1b]10;rgb:e6e6/eeee/e9e9\x1b\\', '\x1b]11;rgb:fafa/fafa/f8f8\x1b\\']);
    assert.equal(screen.input('\x1b]10;rgb:0000/0000/0000\x07\x1b]11;rgb:0000/0000/0000\x07'), '');
    // A colour set stays the screen's and answers nothing.
    sent.length = 0; await screen.write('\x1b]11;#101010\x07'); assert.deepEqual(sent, []);
  } finally { screen.dispose(); }
});
test('unowed reports: stale duplicates go, a modified F3 key stays', () => {
  let now = 0; const replies = new Replies(() => {}, () => now);
  assert.equal(replies.input('\x1b[7;3R'), '');
  assert.equal(replies.input('\x1b[1;5R'), '\x1b[1;5R');
  replies.answered('\x1b[1;5R'); now = 11_000;
  assert.equal(replies.input('\x1b[1;5R'), '\x1b[1;5R', 'an answer older than the window is not owed');
  replies.answered('\x1b[?1;2c'); assert.equal(replies.input('\x1b[1;2R'), '\x1b[1;2R', 'device attributes stay the browser\'s');
});
