import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { EngineError } from '../types.ts';
import { encode, receive } from '../../ptyd/protocol.ts';
import type { WireMessage } from '../../ptyd/protocol.ts';
export class PtyClient {
  private socket?: Socket; private connecting?: Promise<void>; private ended = false; private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private runDir: string;
  onEvent: (message: WireMessage) => void = () => {};
  onDisconnect: () => void = () => {};
  constructor(runDir: string) { this.runDir = runDir; }
  private connect(): Promise<void> {
    if (this.ended) return Promise.reject(new Error('Terminal service closed'));
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) return Promise.resolve();
    return this.connecting ??= new Promise<void>((resolve, reject) => {
      const socket = createConnection(join(this.runDir, 'ptyd.sock')); this.socket = socket;
      const timer = setTimeout(() => socket.destroy(new Error('Sidecar unavailable')), 5000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.on('error', () => { clearTimeout(timer); reject(new EngineError('PTY_OFFLINE', 503, 'Terminal sidecar unavailable')); });
      receive(socket, message => {
        if (message.event) { this.onEvent(message); return; }
        const request = this.pending.get(message.id!); if (!request) return;
        clearTimeout(request.timer); this.pending.delete(message.id!);
        if (message.error) request.reject(new EngineError(message.error.code, message.error.status, message.error.message)); else request.resolve(message.result);
      });
      socket.once('close', () => {
        clearTimeout(timer); this.socket = undefined; this.connecting = undefined;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new EngineError('PTY_OFFLINE', 503, 'Terminal sidecar disconnected')); }
        this.pending.clear(); this.onDisconnect();
      });
    }).finally(() => { this.connecting = undefined; });
  }
  async request(op: string, params: Record<string, unknown> = {}): Promise<any> {
    await this.connect();
    const socket = this.socket!;
    // Input admission is bounded per attachment by TerminalService. This
    // multiplexed connection must not charge one client's queue to another.
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new EngineError('PTY_TIMEOUT', 504, 'Terminal sidecar timeout')); }, 15000);
      this.pending.set(id, { resolve, reject, timer }); socket.write(encode({ id, op, ...params }));
    });
  }
  async close(): Promise<void> {
    this.ended = true;
    const socket = this.socket; if (!socket || socket.destroyed) return;
    await new Promise<void>(resolve => { socket.once('close', resolve); socket.destroy(); });
  }
}
