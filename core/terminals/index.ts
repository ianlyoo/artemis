import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';
import { Codes, EngineError, TERMINAL_LIMITS, TermFrame } from '../types.ts';
import type { JournalWriter, Principal, SqlDb, TerminalRecord, TerminalService, TermSocket, TerminalUser } from '../types.ts';
import { dimensions } from '../../ptyd/protocol.ts';
import type { WireMessage } from '../../ptyd/protocol.ts';
import { PtyClient } from './client.ts';
import type { TerminalActivity } from '../../ptyd/activity.ts';
import { registerCaptureGrants } from './capture.ts';
const refreshers = new WeakMap<TerminalService, () => Promise<unknown>>();
/** Refresh PTY status before projecting a terminal list; no terminal bytes enter the API. */
export async function refreshTerminalActivity(service: TerminalService): Promise<void> { await refreshers.get(service)?.(); }

type Options = { db: SqlDb; runDir: string; journal: JournalWriter; log: (msg: string, extra?: Record<string, unknown>) => void; allowedRoots?: string[] };
/** Optional transport extension: API adapters should expose their actual WS bufferedAmount. */
export type BufferedTermSocket = TermSocket & { readonly bufferedAmount?: number };
type Attachment = { id: string; terminalId: string; sock: BufferedTermSocket; pendingInput: number; closed: boolean; ready: Promise<void> };
const frame = (tag: number, body: string | Buffer) => Buffer.concat([Buffer.from([tag]), Buffer.isBuffer(body) ? body : Buffer.from(body)]);
function record(row: Record<string, unknown>): TerminalRecord {
  return { id: String(row.id), user: row.user as TerminalUser, ...(row.agent_id ? { agentId: String(row.agent_id) } : {}), cwd: String(row.cwd), cols: Number(row.cols), rows: Number(row.rows), generation: Number(row.generation), createdAt: String(row.created_at), ...(row.closed_at ? { closedAt: String(row.closed_at) } : {}), ...(row.title ? { title: String(row.title) } : {}), ...(row.exit_code != null ? { exitCode: Number(row.exit_code) } : {}) };
}
function authorize(user: TerminalUser, principal: Principal, create = false): void {
  if (principal.kind === 'user-channel' || (principal.kind === 'agent' && user !== principal.name) || (create && user === 'console' && principal.kind !== 'console')) throw new EngineError(Codes.FORBIDDEN, 403, 'Terminal user not authorized');
}
export function createTerminals(opts: Options): TerminalService {
  const { db, journal } = opts; const client = new PtyClient(opts.runDir);
  const activity = new Map<string, TerminalActivity>();
  const project = (row: Record<string, unknown>) => ({ ...record(row), ...(activity.get(String(row.id)) ?? { activity: 'working', attention: null }) });
  const attachments = new Map<string, Attachment>(); let ended = false;
  const roots = (opts.allowedRoots ?? []).map(path => realpathSync(path));
  db.exec('CREATE TABLE IF NOT EXISTS terminal_details (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, title TEXT, exit_code INTEGER, last_activity INTEGER NOT NULL)');
  const find = (id: string) => {
    const row = db.prepare('SELECT t.*, d.title, d.exit_code FROM terminals t LEFT JOIN terminal_details d ON t.id=d.id WHERE t.id=?').get(id);
    if (!row) throw new EngineError(Codes.NOT_FOUND, 404, 'Terminal not found'); return project(row);
  };
  const journalTerminal = (term: TerminalRecord, status: string) => {
    if (term.agentId) journal.append(term.agentId, { type: 'timeline', turnId: null, item: { type: 'tool_call', callId: term.id, name: 'terminal', status } });
  };
  const closed = (id: string, at: string, exitCode?: number) => {
    db.tx(() => {
      const row = db.prepare('SELECT id, closed_at FROM terminals WHERE id=?').get(id); if (!row || row.closed_at) return;
      db.prepare('UPDATE terminals SET closed_at=? WHERE id=?').run(at, id);
      db.prepare('UPDATE terminal_details SET exit_code=? WHERE id=?').run(exitCode ?? null, id);
      journalTerminal(find(id), 'closed');
    });
  };
  const remove = (a: Attachment, code?: number, reason?: string) => {
    if (a.closed) return; a.closed = true; attachments.delete(a.id);
    if (code) a.sock.close(code, reason);
    if (!ended) void a.ready.then(() => client.request('detach', { terminalId: a.terminalId, clientId: a.id })).catch(() => {});
  };
  const send = (a: Attachment, buf: Buffer) => {
    if (a.closed) return;
    if ((a.sock.bufferedAmount ?? 0) + buf.length > TERMINAL_LIMITS.queuedBytes) { remove(a, 1009, 'Terminal output queue limit'); return; }
    // Forward immediately: batching all IPC events until setImmediate can
    // misclassify a healthy client as slow during catch-up after a CPU stall.
    try { a.sock.send(buf); } catch { remove(a, 1011, 'Terminal transport failed'); }
  };
  client.onEvent = (m: WireMessage) => {
    if (m.event === 'exit') { try { closed(m.terminalId!, m.closedAt, m.exitCode); } catch { opts.log('terminal history update failed'); } }
    const a = attachments.get(m.clientId ?? ''); if (!a) return;
    if (m.event === 'output') send(a, frame(TermFrame.output, Buffer.from(m.data, 'base64')));
    else if (m.event === 'restore') {
      const { event, clientId, terminalId, ...snapshot } = m; send(a, frame(TermFrame.restore, JSON.stringify(snapshot)));
    } else if (m.event === 'exit') send(a, frame(TermFrame.exit, JSON.stringify({ exitCode: m.exitCode, closedAt: m.closedAt })));
    else if (m.event === 'refusal') remove(a, 1009, m.reason);
  };
  client.onDisconnect = () => { for (const a of attachments.values()) { a.closed = true; a.sock.close(1012, 'Terminal sidecar disconnected'); } attachments.clear(); };
  const reconcile = async () => {
    const states = await client.request('list');
    for (const t of states) {
      activity.set(t.id, { activity: t.activity, attention: t.attention });
      if (t.closedAt) closed(t.id, t.closedAt, t.exitCode);
      db.prepare('UPDATE terminals SET cols=?, rows=? WHERE id=?').run(t.cols, t.rows, t.id);
      db.prepare('UPDATE terminal_details SET last_activity=? WHERE id=?').run(t.lastActivity, t.id);
    }
    return states as { id: string; lastActivity: number; closedAt?: string }[];
  };
  void reconcile().catch(() => opts.log('terminal sidecar not connected'));
  const service: TerminalService = {
    async create(req, principal) {
      if (ended) throw new EngineError('CLOSED', 503, 'Terminal service closed');
      authorize(req.user, principal, true); dimensions(req.cols, req.rows);
      if (!req.requestId || req.requestId.length > 64 || !/^(console|agent:[A-Za-z0-9_-]+)$/.test(req.user)) throw new EngineError('INVALID', 400, 'Invalid terminal request');
      const cwd = realpathSync(req.cwd);
      if (req.user === 'console' && !roots.some(root => { const rel = relative(root, cwd); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); })) throw new EngineError(Codes.FORBIDDEN, 403, 'User terminal cwd outside allowed roots');
      const id = `term-${createHash('sha256').update(`${principal.name}\0${req.requestId}`).digest('hex').slice(0, 32)}`;
      const fingerprint = createHash('sha256').update(JSON.stringify({ user: req.user, cwd, cols: req.cols, rows: req.rows, title: req.title ?? null })).digest('hex');
      const prior = db.prepare('SELECT fingerprint FROM terminal_details WHERE id=?').get(id);
      if (prior) { if (prior.fingerprint !== fingerprint) throw new EngineError(Codes.IDEMPOTENCY_CONFLICT, 409, 'Terminal request differs'); return find(id); }
      const status = await client.request('create', { terminalId: id, user: req.user, fingerprint, cwd, cols: req.cols, rows: req.rows });
      try {
        db.tx(() => {
          const existing = db.prepare('SELECT fingerprint FROM terminal_details WHERE id=?').get(id);
          if (existing) { if (existing.fingerprint !== fingerprint) throw new EngineError(Codes.IDEMPOTENCY_CONFLICT, 409, 'Terminal request differs'); return; }
          db.prepare('INSERT INTO terminals (id,user,agent_id,cwd,cols,rows,generation,created_at,closed_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.user, req.user.startsWith('agent:') ? req.user.slice(6) : null, cwd, status.cols, status.rows, status.generation, new Date().toISOString(), status.closedAt ?? null);
          db.prepare('INSERT INTO terminal_details (id,fingerprint,title,exit_code,last_activity) VALUES (?,?,?,?,?)').run(id, fingerprint, req.title ?? null, status.exitCode ?? null, status.lastActivity);
          journalTerminal(find(id), 'created');
        });
      } catch (error) { if (status.created) await client.request('kill', { terminalId: id }); throw error; }
      return find(id);
    },
    list(q) {
      const limit = q.limit ?? TERMINAL_LIMITS.listed;
      if (!Number.isInteger(limit) || limit < 1 || limit > TERMINAL_LIMITS.listed) throw new EngineError(Codes.LIMIT, 413, 'Terminal list limit');
      const where: string[] = []; const values: unknown[] = [];
      if (q.user) { where.push('t.user=?'); values.push(q.user); }
      if (q.cwd) { where.push('t.cwd=?'); values.push(realpathSync(q.cwd)); }
      if (!q.includeClosed) where.push('t.closed_at IS NULL');
      if (q.cursor) { where.push('t.id>?'); values.push(q.cursor); }
      const rows = db.prepare(`SELECT t.*, d.title, d.exit_code FROM terminals t LEFT JOIN terminal_details d ON d.id=t.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.id LIMIT ?`).all(...values, limit + 1);
      const items = rows.slice(0, limit).map(project); return { items, ...(rows.length > limit ? { nextCursor: items.at(-1)!.id } : {}) };
    },
    async kill(id, principal) { authorize(find(id).user, principal); const result = await client.request('kill', { terminalId: id }); closed(id, result.closedAt ?? new Date().toISOString(), result.exitCode); },
    async capture(id, lines) { find(id); return client.request('capture', { terminalId: id, lines }); },
    attach(id, params, sock) {
      try {
        if (ended) throw new EngineError('CLOSED', 503, 'Terminal service closed');
        authorize(find(id).user, params.principal);
        if (params.offset !== undefined && (!Number.isSafeInteger(params.offset) || params.offset < 0)) throw new EngineError('INVALID', 400, 'Invalid terminal offset');
        if (attachments.size >= TERMINAL_LIMITS.sessions) throw new EngineError(Codes.LIMIT, 429, '16 terminal attachments are open; detach one to connect');
        if ([...attachments.values()].filter(a => a.terminalId === id).length >= TERMINAL_LIMITS.clientsPerTerminal) throw new EngineError(Codes.LIMIT, 429, 'Terminal client limit');
        const a: Attachment = { id: randomUUID(), terminalId: id, sock, pendingInput: 0, closed: false, ready: Promise.resolve() };
        attachments.set(a.id, a);
        a.ready = client.request('attach', { terminalId: id, clientId: a.id, generation: params.generation, offset: params.offset }).then(() => {});
        void a.ready.catch(error => remove(a, 1008, error instanceof EngineError ? error.message : 'Terminal attach refused'));
        sock.onClose(() => remove(a));
        sock.onMessage(data => {
          if (a.closed) return;
          const buf = Buffer.from(data); const tag = buf[0]; const body = buf.subarray(1);
          if (body.length > TERMINAL_LIMITS.inputBytes) { remove(a, 1009, 'Terminal input limit'); return; }
          if (a.pendingInput + body.length > TERMINAL_LIMITS.queuedBytes) { remove(a, 1009, 'Terminal input queue limit'); return; }
          a.pendingInput += body.length;
          void a.ready.then(async () => {
            if (a.closed) return;
            if (tag === TermFrame.input) await client.request('input', { terminalId: id, clientId: a.id, data: body.toString('base64') });
            else if (tag === TermFrame.resize) {
              const resize = JSON.parse(body.toString()); dimensions(resize.cols, resize.rows);
              const result = await client.request('resize', { terminalId: id, clientId: a.id, intent: resize.intent, cols: resize.cols, rows: resize.rows });
              db.prepare('UPDATE terminals SET cols=?, rows=? WHERE id=?').run(result.cols, result.rows, id);
            } else throw new EngineError('INVALID', 400, 'Invalid terminal frame');
          }).catch(() => remove(a, 1008, 'Terminal input or lease refused')).finally(() => { a.pendingInput -= body.length; });
        });
      } catch (error) { sock.close(1008, error instanceof EngineError ? error.message : 'Terminal attachment refused'); }
    },
    async sweep(now = new Date()) {
      const states = await reconcile(); let killed = 0;
      for (const status of states) {
        if (status.closedAt || now.getTime() - status.lastActivity < 6 * 60 * 60 * 1000) continue;
        const row = db.prepare("SELECT t.id FROM terminals t JOIN agents a ON a.id=t.agent_id WHERE t.id=? AND a.state='archived' AND t.closed_at IS NULL").get(status.id);
        if (row) { const end = await client.request('kill', { terminalId: status.id }); closed(status.id, end.closedAt, end.exitCode); killed++; }
      }
      return killed;
    },
    async close() { ended = true; for (const a of [...attachments.values()]) remove(a, 1001, 'Terminal service closed'); await client.close(); },
  };
  refreshers.set(service, reconcile);
  registerCaptureGrants(service, db);
  return service;
}
