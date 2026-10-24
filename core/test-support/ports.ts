import type { Server } from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export function portOf(server: Pick<Server, 'address'>): number {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener is not bound');
  return address.port;
}
export const originOf = (server: Pick<Server, 'address'>) => `http://127.0.0.1:${portOf(server)}`;

/** First bind uses 0. A restart can reuse that bound port, with a bounded close/rebind grace period. */
export async function retryBind<T>(bind: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { return await bind(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || Date.now() >= deadline) throw error;
      await delay(50);
    }
  }
}
export async function listen(server: Server, port = 0): Promise<number> {
  await retryBind(() => new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off('listening', ready); reject(error); };
    const ready = () => { server.off('error', failed); resolve(); };
    server.once('error', failed); server.once('listening', ready); server.listen(port, '127.0.0.1');
  }));
  return portOf(server);
}
export async function closeServer(server: Server & { closeAllConnections?: () => void }): Promise<void> {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); });
}
export type BoundPorts = { apiPort: number; mcpPort: number };
/** CLI readiness carries ports only; no credentials or provider output is captured. */
export function daemonReady(child: ChildProcess): Promise<BoundPorts> {
  return new Promise((resolve, reject) => {
    let pending = '';
    const done = (error?: Error, ports?: BoundPorts) => {
      clearTimeout(timer); child.stdout?.off('data', data); child.off('exit', exited); child.off('error', failed);
      if (error) reject(error); else resolve(ports!);
    };
    const data = (chunk: Buffer) => {
      pending += chunk.toString();
      let at: number;
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at); pending = pending.slice(at + 1);
        try { const value = JSON.parse(line); if (value.ready && value.apiPort > 0 && value.mcpPort > 0) done(undefined, value); } catch { /* Ignore non-ready output. */ }
      }
    };
    const exited = () => done(new Error('Fixture exited before ready'));
    const failed = () => done(new Error('Fixture failed before ready'));
    const timer = setTimeout(() => done(new Error('Fixture startup timeout')), 60000);
    child.stdout?.on('data', data); child.once('exit', exited); child.once('error', failed);
  });
}

