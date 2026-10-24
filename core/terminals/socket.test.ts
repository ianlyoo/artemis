import { portOf } from '../test-support/ports.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { terminalSocket } from './socket.ts';
test('real websocket adapter preserves binary frames and exposes transport backlog', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const connected = once(server, 'connection'); const client = new WebSocket(`ws://127.0.0.1:${portOf(server)}`); const opened = once(client, 'open');
  let peer: WebSocket | undefined;
  try {
    [peer] = await connected as [WebSocket]; await opened; const socket = terminalSocket(peer); const frame = Buffer.from([2, 65]);
    const input = new Promise<Uint8Array>(resolve => socket.onMessage(resolve)); client.send(frame);
    assert.deepEqual(Buffer.from(await input), frame); assert.equal(socket.bufferedAmount, peer.bufferedAmount);
    const response = once(client, 'message'); socket.send(Buffer.from([1, 66]));
    const [data, binary] = await response; assert.equal(binary, true); assert.deepEqual(data, Buffer.from([1, 66]));
    const closed = once(client, 'close'); client.send('not binary'); const [code] = await closed; assert.equal(code, 1003);
  } finally { client.terminate(); peer?.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
