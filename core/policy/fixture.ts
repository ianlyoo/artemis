/** Shared test fixture only: real SQLite, scratch state, no daemon or provider process. */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentRecord, Frame, EnginePlugin, JournalWriter, SqlDb, SqlStatement } from '../types.ts';

export function agent(id = 'a', profile = 'generic'): AgentRecord {
  return { id, provider: 'claude', model: 'fixture', cwd: '/workspace', title: 'fixture', labels: {}, profile,
    state: 'idle', epoch: 'e1', driverGeneration: 1, createdAt: new Date().toISOString() };
}
export function stubPlugin(overrides: Partial<EnginePlugin> = {}): EnginePlugin {
  return {
    name: 'fixture', profiles: () => ({ generic: { name: 'generic', tools: [], interrupt: false, settingSources: [] } }),
    beforeCreate: async () => ({ ok: true }), beforeSend: async () => ({ ok: true }),
    beforeSpawn: async (_a, s) => s, classify: async () => null,
    tools: () => [], mcpServers: () => [], onBoot: async () => {}, onEvent() {},
    fileApproval: async () => {}, approvalStatus: async () => 'pending', ...overrides,
  };
}
export function database() {
  const directory = mkdtempSync(join(tmpdir(), 'policy-'));
  const file = join(directory, 'state.sqlite');
  const sqlite = new DatabaseSync(file);
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE permissions (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, turn_id TEXT, driver_generation INTEGER NOT NULL,
      kind TEXT NOT NULL, request_digest TEXT NOT NULL, scope_hash TEXT, nonce TEXT, state TEXT NOT NULL,
      decided_by TEXT, expires_at TEXT NOT NULL
    );
    CREATE TABLE journal_frames (seq INTEGER PRIMARY KEY, agent_id TEXT, type TEXT, body TEXT);`);
  let depth = 0;
  const db: SqlDb = {
    exec: sql => sqlite.exec(sql),
    prepare: sql => sqlite.prepare(sql) as unknown as SqlStatement,
    tx<T>(fn: () => T): T {
      if (depth) return fn();
      sqlite.exec('BEGIN IMMEDIATE'); depth++;
      try { const result = fn(); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      finally { depth--; }
    },
  };
  const journal: JournalWriter = {
    append(agentId, ev) {
      const row = db.prepare('INSERT INTO journal_frames(agent_id,type,body) VALUES(?,?,?)').run(agentId, ev.type, JSON.stringify(ev));
      return { agentId, epoch: 'e1', seq: Number(row.lastInsertRowid), ts: new Date().toISOString(), driverGeneration: 1, turnId: null, ...ev } as Frame;
    },
  };
  return { db, journal, sqlite, directory, file, close: () => sqlite.close() };
}
