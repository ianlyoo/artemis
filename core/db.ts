import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EngineError } from './types.ts';
import type { SqlDb, SqlStatement } from './types.ts';

const schema = `
CREATE TABLE agents(id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, thinking TEXT, mode TEXT,
 cwd TEXT NOT NULL, title TEXT NOT NULL, labels TEXT NOT NULL, parent_id TEXT, launcher_id TEXT, profile TEXT NOT NULL,
 identity TEXT, state TEXT NOT NULL, epoch TEXT NOT NULL, driver_generation INTEGER NOT NULL DEFAULT 0,
 predecessor_id TEXT, successor_id TEXT, created_at TEXT NOT NULL, archived_at TEXT);
CREATE TABLE native_sessions(agent_id TEXT PRIMARY KEY, provider TEXT NOT NULL, native_id TEXT NOT NULL, config_root TEXT, cwd TEXT NOT NULL);
CREATE TABLE turns(id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, native_turn_id TEXT, origin TEXT, model TEXT NOT NULL,
 started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT);
CREATE TABLE events(agent_id TEXT NOT NULL, seq INTEGER NOT NULL, epoch TEXT NOT NULL, driver_generation INTEGER NOT NULL,
 ts TEXT NOT NULL, turn_id TEXT, command_id TEXT, type TEXT NOT NULL, origin TEXT, body TEXT NOT NULL, PRIMARY KEY(agent_id,seq));
CREATE TABLE commands(principal TEXT NOT NULL, request_id TEXT NOT NULL, agent_id TEXT, kind TEXT NOT NULL, digest TEXT NOT NULL,
 state TEXT NOT NULL, result TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(principal,request_id));
CREATE TABLE outbox(id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, target TEXT NOT NULL, path TEXT NOT NULL, body TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE permissions(id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, turn_id TEXT, driver_generation INTEGER NOT NULL,
 kind TEXT NOT NULL, request_digest TEXT NOT NULL, scope_hash TEXT, nonce TEXT, state TEXT NOT NULL, decided_by TEXT, expires_at TEXT NOT NULL);
CREATE TABLE principals(name TEXT PRIMARY KEY, kind TEXT NOT NULL, token_sha256 TEXT NOT NULL, scopes TEXT NOT NULL,
 targets TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE terminals(id TEXT PRIMARY KEY, user TEXT NOT NULL, agent_id TEXT, cwd TEXT NOT NULL, cols INTEGER NOT NULL,
 rows INTEGER NOT NULL, generation INTEGER NOT NULL, created_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE uploads(id TEXT PRIMARY KEY, agent_id TEXT, path TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE procs(pid INTEGER NOT NULL, start_time TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(pid,start_time));
CREATE INDEX commands_agent_state ON commands(agent_id,state);
CREATE INDEX events_kind ON events(agent_id,type,seq);
CREATE INDEX turns_agent ON turns(agent_id,started_at);
`;

export function storageError(error: unknown): never {
  if (error && typeof error === 'object' && ('errcode' in error && error.errcode === 13 ||
      'code' in error && error.code === 'SQLITE_FULL' || 'message' in error && /database or disk is full/i.test(String(error.message)))) {
    throw new EngineError('STORAGE_FULL', 507, 'Journal storage is full', 'storage');
  }
  throw error;
}

/** One synchronous writer. Commit callbacks cannot observe an uncommitted event. */
export class Database implements SqlDb {
  readonly raw: DatabaseSync;
  readonly file: string;
  private depth = 0;
  private rollbackOnly = false;
  private commits: (() => void)[] = [];
  private checkSpace: () => number;
  constructor(file: string, options: { freeBytes?: () => number } = {}) {
    this.file = file;
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.checkSpace = options.freeBytes ?? (() => {
      const s = statfsSync(file === ':memory:' ? process.env.TMPDIR ?? '.' : dirname(file));
      return s.bavail * s.bsize;
    });
    this.raw = new DatabaseSync(file);
    try {
      this.raw.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
      this.raw.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      const version = Number(this.raw.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value ?? 0);
      if (version > 1) throw new Error('Database schema is newer than this engine');
      if (version < 1) {
        // Forward-only migrations always snapshot the preceding schema, including schema zero.
        if (file !== ':memory:') this.snapshot(join(dirname(file), 'backup', `migration-${version}-${Date.now()}.db`));
        this.tx(() => {
          this.exec(schema);
          this.prepare("INSERT OR REPLACE INTO meta VALUES('schema_version','1')").run();
        });
      }
    } catch (e) { this.raw.close(); throw e; }
  }
  get inTransaction(): boolean { return this.depth > 0; }
  assertWritable(): void {
    if (this.checkSpace() < 512 * 1024 * 1024) throw new EngineError('STORAGE_FULL', 507, 'Less than 512 MiB free', 'storage');
  }
  exec(sql: string): void { try { this.raw.exec(sql); } catch (e) { storageError(e); } }
  prepare(sql: string): SqlStatement {
    const s = this.raw.prepare(sql);
    return {
      run: (...p) => { try { return s.run(...p as never[]); } catch (e) { return storageError(e); } },
      get: (...p) => s.get(...p as never[]), all: (...p) => s.all(...p as never[]),
    };
  }
  tx<T>(fn: () => T): T {
    if (this.depth) {
      try { return this.sync(fn()); } catch (e) { this.rollbackOnly = true; throw e; }
    }
    this.assertWritable();
    this.exec('BEGIN IMMEDIATE'); this.depth = 1; this.rollbackOnly = false;
    let result: T;
    try {
      result = this.sync(fn());
      if (this.rollbackOnly) throw new Error('Nested transaction failed');
      this.exec('COMMIT');
    } catch (e) {
      try { this.exec('ROLLBACK'); } catch { /* original failure wins */ }
      this.commits = []; throw e;
    } finally { this.depth = 0; }
    const callbacks = this.commits; this.commits = [];
    for (const cb of callbacks) { try { cb(); } catch { /* subscriber failures cannot undo a committed write */ } }
    return result;
  }
  private sync<T>(value: T): T {
    if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('SqlDb.tx callback must be synchronous');
    return value;
  }
  afterCommit(cb: () => void): void { if (this.depth) this.commits.push(cb); else cb(); }
  snapshot(file: string): void {
    if (this.depth) throw new Error('Cannot snapshot inside a transaction');
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.raw.prepare('VACUUM INTO ?').run(file);
  }
  meta<T>(key: string): T | undefined {
    const row = this.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }
  setMeta(key: string, value: unknown): void {
    this.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  close(): void { this.raw.close(); }
}
export function openDb(file: string): Database { return new Database(file); }
