import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSocketPath, SOCKET_PATH_MAX } from './socket-path.ts';

test('UNIX socket paths over sun_path fail loudly with the path and its length', () => {
  const ok = '/tmp/' + 'a'.repeat(SOCKET_PATH_MAX - 5);
  assert.equal(assertSocketPath(ok), ok);
  const long = ok + 'b';
  assert.throws(() => assertSocketPath(long), (e: Error) => e.message.includes(`${SOCKET_PATH_MAX + 1} > ${SOCKET_PATH_MAX}`) && e.message.includes(long));
});
