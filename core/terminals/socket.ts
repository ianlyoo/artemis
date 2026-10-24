import type WebSocket from 'ws';
import type { BufferedTermSocket } from './index.ts';
/** API adapter for the fixed TermSocket seam, including real transport backpressure. */
export function terminalSocket(ws: WebSocket): BufferedTermSocket {
  return {
    get bufferedAmount() { return ws.bufferedAmount; },
    send(buf) { ws.send(buf, { binary: true }); },
    onMessage(cb) { ws.on('message', (data, binary) => { if (!binary) { ws.close(1003, 'Terminal expects binary frames'); return; } cb(Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)); }); },
    onClose(cb) { ws.once('close', cb); },
    close(code, reason) { ws.close(code, reason); },
  };
}
