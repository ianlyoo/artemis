import type { Socket } from 'node:net';
import { EngineError, Codes, TERMINAL_LIMITS } from '../core/types.ts';
export type WireMessage = { id?: number; op?: string; result?: any; error?: { code: string; status: number; message: string }; event?: string; terminalId?: string; clientId?: string; [key: string]: any };
const MAX_FRAME = 32 * 1024 * 1024;
/** Length-prefixed JSON on the private Unix socket; terminal bytes are base64. */
export function encode(message: WireMessage): Buffer {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > MAX_FRAME) throw new EngineError(Codes.LIMIT, 413, 'Sidecar frame too large');
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length); return Buffer.concat([header, body]);
}
export function receive(socket: Socket, callback: (message: WireMessage) => void): void {
  let pending = Buffer.alloc(0);
  socket.on('data', data => {
    pending = Buffer.concat([pending, data]);
    while (pending.length >= 4) {
      const length = pending.readUInt32BE();
      if (length > MAX_FRAME) { socket.destroy(); return; }
      if (pending.length < length + 4) return;
      try { callback(JSON.parse(pending.subarray(4, length + 4).toString())); } catch { socket.destroy(); return; }
      pending = pending.subarray(length + 4);
    }
  });
}
export function dimensions(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || cols < 1 || cols > TERMINAL_LIMITS.maxCols || !Number.isInteger(rows) || rows < 1 || rows > TERMINAL_LIMITS.maxRows) throw new EngineError(Codes.LIMIT, 413, 'Terminal dimensions outside limits');
}
export function refuse(message: string, status = 429): never { throw new EngineError(Codes.LIMIT, status, message); }
