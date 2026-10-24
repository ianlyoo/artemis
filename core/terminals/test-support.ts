import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlStatement, TermSocket } from '../types.ts';
export function testDb(path: string): SqlDb & { close(): void } {
  const raw = new DatabaseSync(path); raw.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY,state TEXT,archived_at TEXT); CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY,user TEXT NOT NULL,agent_id TEXT,cwd TEXT NOT NULL,cols INTEGER NOT NULL,rows INTEGER NOT NULL,generation INTEGER NOT NULL,created_at TEXT NOT NULL,closed_at TEXT);`);
  return { exec: sql => raw.exec(sql), prepare: sql => raw.prepare(sql) as unknown as SqlStatement, tx(fn) { raw.exec('BEGIN IMMEDIATE'); try { const value = fn(); raw.exec('COMMIT'); return value; } catch (e) { raw.exec('ROLLBACK'); throw e; } }, close: () => raw.close() };
}
export class SocketFixture implements TermSocket {
  frames: Buffer[] = []; closed?: { code?: number; reason?: string }; bufferedAmount = 0;
  private message: (b: Uint8Array) => void = () => {}; private closeCallback: () => void = () => {};
  send(b: Uint8Array) { this.frames.push(Buffer.from(b)); }
  onMessage(cb: (b: Uint8Array) => void) { this.message = cb; }
  onClose(cb: () => void) { this.closeCallback = cb; }
  close(code?: number, reason?: string) { if (this.closed) return; this.closed = { code, reason }; this.closeCallback(); }
  input(tag: number, body: string | Buffer) { this.message(Buffer.concat([Buffer.from([tag]), Buffer.isBuffer(body) ? body : Buffer.from(body)])); }
}
