import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

type Packet = { id?: number | string; method?: string; params?: any; result?: any; error?: { code: number } };
export class Rpc {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private next = 0;
  private closed = false;
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => Promise<unknown> = async () => { throw new Error('Unsupported server request'); };
  onExit: (code: number | null, signal: string | null) => void = () => {};
  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let packet: Packet;
      try { packet = JSON.parse(line); } catch { this.dispose(); return; }
      if (packet.method && packet.id !== undefined) {
        void this.onRequest(packet.method, packet.params ?? {}).then(
          result => this.write({ id: packet.id, result }),
          () => this.write({ id: packet.id, error: { code: -32601, message: 'Request refused by engine' } }),
        );
      } else if (packet.method) {
        try { this.onNotification(packet.method, packet.params ?? {}); } catch { this.dispose(); }
      } else if (typeof packet.id === 'number') {
        const request = this.pending.get(packet.id); if (!request) return;
        clearTimeout(request.timer); this.pending.delete(packet.id);
        if (packet.error) request.reject(new Error(`Codex RPC error ${packet.error.code}`)); else request.resolve(packet.result);
      }
    });
    child.stderr.resume(); // Provider stderr is never retained: it may contain sensitive diagnostics.
    child.on('error', () => this.dispose()); child.stdin.on('error', () => this.dispose());
    child.once('exit', (code, signal) => { lines.close(); this.dispose(); this.onExit(code, signal); });
  }
  private write(packet: unknown): void {
    if (!this.closed && this.child.stdin.writable) this.child.stdin.write(`${JSON.stringify(packet)}\n`);
  }
  request<T = any>(method: string, params: unknown, timeout = 30000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex transport closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex RPC timeout: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params });
    });
  }
  notify(method: string, params: unknown): void { this.write({ method, params }); }
  dispose(): void {
    this.closed = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Codex transport closed')); }
    this.pending.clear();
  }
}
