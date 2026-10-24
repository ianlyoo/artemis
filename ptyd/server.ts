import { createServer, createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { chmod, mkdir, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { Codes, EngineError, TERMINAL_LIMITS } from '../core/types.ts';
import { ProcessTree } from '../drivers/codex/processes.ts';
import { bootEnv } from '../drivers/codex/env.ts';
import { dimensions, encode, receive, refuse } from './protocol.ts';
import type { WireMessage } from './protocol.ts';
import { Screen } from './screen.ts';
import { loginShell, type ShellCommand } from './shell.ts';
import { shellForeground, terminalActivity, type TerminalActivity } from './activity.ts';
import { lockPtyd } from './lock.ts';
import { assertSocketPath } from '../core/socket-path.ts';

type Client = { socket: Socket; clientId: string; restoring: boolean; queued: WireMessage[]; bytes: number };
type Terminal = { user: string; activity: TerminalActivity; id: string; pty: pty.IPty; tree: ProcessTree; screen: Screen; cols: number; rows: number; cwd: string; generation: number; offset: number; history: { offset: number; data: Buffer }[]; bytes: number; clients: Map<string, Client>; controller?: string; closedAt?: string; exitCode?: number; lastActivity: number; fingerprint: string; pending: Promise<void>; pendingBytes: number };
const PTY_READ_HIGH_WATER = 256 * 1024;
export async function startPtyd(runDir: string, options: { shell?: () => ShellCommand; env?: Record<string, string> } = {}): Promise<{ close(): Promise<void>; pids(): number[] }> {
  if (!['linux','darwin'].includes(process.platform)) throw new Error('PTY custody requires Linux or Darwin');
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  const socketPath = assertSocketPath(join(runDir, 'ptyd.sock'));
  const lock = await lockPtyd(runDir);
  // Only the kernel-lock user may remove a dead listener's pathname.
  // Refuse a live/non-cooperating listener and non-socket files.
  try {
    let exists = true;
    try { if (!(await lstat(socketPath)).isSocket()) throw new Error('PTY socket path is not a socket'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error; }
    if (exists) {
      await new Promise<void>((resolve, reject) => {
        const probe = createConnection(socketPath);
        const timer = setTimeout(() => probe.destroy(new Error('Cannot verify stale PTY socket')), 2000);
        probe.once('connect', () => { clearTimeout(timer); probe.destroy(); reject(new Error('PTY socket has a live listener')); });
        probe.once('error', error => { clearTimeout(timer); probe.destroy(); ['ECONNREFUSED', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '') ? resolve() : reject(new Error('Cannot verify stale PTY socket')); });
      });
      await rm(socketPath, { force: true });
    }
  } catch (error) { await lock.close(); throw error; }
  const terminals = new Map<string, Terminal>(); const sockets = new Set<Socket>(); let closing = false;
  const send = async (socket: Socket, message: WireMessage): Promise<void> => {
    if (socket.destroyed) return;
    // This multiplexed transport is not a terminal client. Pace producers on
    // write completion instead of applying a client's eviction budget to it.
    // A disconnected service must not kill its persistent terminals either.
    await new Promise<void>(resolve => { socket.write(encode(message), () => resolve()); });
  };
  const restore = async (socket: Socket, message: WireMessage) => {
    const data = Buffer.from(JSON.stringify(message));
    const chunks = Math.ceil(data.length / 32768);
    for (let index = 0; index < chunks; index++) {
      if (socket.destroyed) throw new Error('Terminal client disconnected');
      const packet = chunks === 1 ? message : { event: 'restore', terminalId: message.terminalId, clientId: message.clientId,
        generation: message.generation, offset: message.offset, encoding: 'base64-json', index, parts: chunks,
        data: data.subarray(index * 32768, (index + 1) * 32768).toString('base64') };
      await send(socket, packet);
    }
  };
  const emit = async (term: Terminal, message: WireMessage): Promise<void> => {
    await Promise.all([...term.clients.values()].map(async c => {
      if (c.restoring) {
        const bytes = encode(message).length;
        if (c.bytes + bytes > TERMINAL_LIMITS.queuedBytes) { detach(term, c.clientId); await send(c.socket, { event: 'refusal', terminalId: term.id, clientId: c.clientId, reason: 'Terminal queue limit' }); }
        else { c.queued.push(message); c.bytes += bytes; }
      } else await send(c.socket, { ...message, clientId: c.clientId });
    }));
    // State events also reach services with no attached websocket, for durable history.
    if (message.event === 'exit') await Promise.all([...sockets].map(socket => send(socket, message)));
  };
  function detach(term: Terminal, clientId: string) { term.clients.delete(clientId); if (term.controller === clientId) term.controller = undefined; }
  const status = (term: Terminal) => ({ id: term.id, cwd: term.cwd, cols: term.cols, rows: term.rows, generation: term.generation, closedAt: term.closedAt, exitCode: term.exitCode, lastActivity: term.lastActivity, ...term.activity, pids: term.tree.pids() });
  const get = (id: string) => { const term = terminals.get(id); if (!term) throw new EngineError(Codes.NOT_FOUND, 404, 'Terminal not found'); return term; };
  async function kill(term: Terminal): Promise<void> {
    term.tree.capture();
    if (!term.closedAt) { try { term.pty.kill('SIGHUP'); } catch {} }
    await term.tree.stop();
    if (!term.closedAt) { term.closedAt = new Date().toISOString(); term.exitCode = -1; await emit(term, { event: 'exit', terminalId: term.id, closedAt: term.closedAt, exitCode: term.exitCode }); }
  }
  async function handle(socket: Socket, m: WireMessage): Promise<any> {
    if (closing) throw new EngineError('DRAINING', 503, 'Sidecar shutting down');
    if (m.op === 'hello') return { version: 1, instance: instanceId };
    if (m.op === 'list') return Promise.all([...terminals.values()].map(async term => {
      await term.pending;
      if (!term.closedAt) {
        const prompt = await term.screen.prompt();
        term.activity = terminalActivity(prompt.line, prompt.bracketedPaste, shellForeground(term.pty.pid), term.activity);
      } else term.activity = { activity: 'idle', attention: null };
      return status(term);
    }));
    if (m.op === 'create') {
      dimensions(m.cols, m.rows);
      if (typeof m.terminalId !== 'string' || typeof m.cwd !== 'string' || typeof m.fingerprint !== 'string') throw new EngineError('INVALID', 400, 'Invalid terminal request');
      const prior = terminals.get(m.terminalId);
      if (prior) { if (prior.fingerprint !== m.fingerprint) throw new EngineError(Codes.IDEMPOTENCY_CONFLICT, 409, 'Terminal request differs'); return { ...status(prior), created: false }; }
      const user = m.user ?? 'console';
      if (typeof user !== 'string' || !/^(console|agent:[A-Za-z0-9_-]+)$/.test(user)) throw new EngineError('INVALID', 400, 'Invalid terminal user');
      const open = [...terminals.values()].filter(t => !t.closedAt);
      if (user === 'console' && open.filter(t => t.user === 'console').length >= TERMINAL_LIMITS.userTerminals) refuse('8 user terminals are open; close one to open another');
      if (user !== 'console' && open.filter(t => t.user !== 'console').length >= TERMINAL_LIMITS.agentTerminals) refuse('Agent terminal limit');
      const env: Record<string, string> = { ...(options.env ?? bootEnv()), TERM: 'xterm-256color' };
      const shell = user === 'console' ? (options.shell ?? loginShell)() : { file: '/bin/bash', args: ['--noprofile', '--norc'] };
      env.SHELL = shell.file;
      const process = pty.spawn(shell.file, shell.args, { cwd: m.cwd, env, name: 'xterm-256color', cols: m.cols, rows: m.rows });
      const term: Terminal = { user, activity: { activity: 'working', attention: null }, id: m.terminalId, pty: process, tree: new ProcessTree(process.pid), screen: new Screen(m.cols, m.rows, reply => { try { process.write(reply); } catch {} }), cols: m.cols, rows: m.rows, cwd: m.cwd, generation: 1, offset: 0, history: [], bytes: 0, clients: new Map(), lastActivity: Date.now(), fingerprint: m.fingerprint, pending: Promise.resolve(), pendingBytes: 0 };
      terminals.set(term.id, term);
      process.onData(data => {
        const bytes = Buffer.from(data);
        term.pendingBytes += bytes.length;
        if (term.pendingBytes >= PTY_READ_HIGH_WATER) term.pty.pause();
        // Keep byte offsets consistent with the binary websocket output payloads.
        term.pending = term.pending.then(async () => {
          await term.screen.write(data); term.lastActivity = Date.now();
          for (let start = 0; start < bytes.length; start += 16384) {
            const chunk = bytes.subarray(start, start + 16384); const offset = term.offset;
            term.offset += chunk.length; term.history.push({ offset, data: chunk }); term.bytes += chunk.length;
            while (term.bytes > TERMINAL_LIMITS.queuedBytes) term.bytes -= term.history.shift()!.data.length;
            await emit(term, { event: 'output', terminalId: term.id, generation: term.generation, offset, data: chunk.toString('base64') });
          }
        }).catch(() => { void kill(term); }).finally(() => {
          term.pendingBytes -= bytes.length;
          if (term.pendingBytes < PTY_READ_HIGH_WATER / 2 && !term.closedAt && !closing) term.pty.resume();
        });
      });
      process.onExit(({ exitCode }) => { void term.pending.then(async () => {
        term.closedAt ??= new Date().toISOString(); term.exitCode = exitCode;
        await emit(term, { event: 'exit', terminalId: term.id, closedAt: term.closedAt, exitCode });
      }); });
      return { ...status(term), created: true };
    }
    const term = get(m.terminalId!);
    if (m.op === 'kill') { await kill(term); return status(term); }
    if (m.op === 'capture') {
      if (!Number.isInteger(m.lines) || m.lines < 1 || m.lines > TERMINAL_LIMITS.restoreLines) refuse('Capture line limit', 413);
      await term.pending; return (await term.screen.snapshot(m.lines)).text;
    }
    if (m.op === 'attach') {
      if (typeof m.clientId !== 'string' || term.clients.has(m.clientId)) throw new EngineError('INVALID', 400, 'Invalid client id');
      if ([...terminals.values()].reduce((n, t) => n + t.clients.size, 0) >= TERMINAL_LIMITS.sessions) refuse('16 terminal attachments are open; detach one to connect');
      if (term.clients.size >= TERMINAL_LIMITS.clientsPerTerminal) refuse('Terminal client limit');
      const client: Client = { socket, clientId: m.clientId, restoring: true, queued: [], bytes: 0 }; term.clients.set(m.clientId, client);
      await term.pending;
      const offset = term.offset;
      const history = [...term.history];
      const available = m.generation === term.generation && Number.isInteger(m.offset) && m.offset >= (term.history[0]?.offset ?? offset) && m.offset <= offset;
      if (available) {
        await send(socket, { event: 'restore', terminalId: term.id, clientId: m.clientId, generation: term.generation, offset: m.offset, resumed: true, cols: term.cols, rows: term.rows });
        for (const h of history) if (h.offset + h.data.length > m.offset) {
          const cut = Math.max(0, m.offset - h.offset);
          await send(socket, { event: 'output', terminalId: term.id, clientId: m.clientId, offset: h.offset + cut, data: h.data.subarray(cut).toString('base64') });
        }
      } else await restore(socket, { event: 'restore', terminalId: term.id, clientId: m.clientId, generation: term.generation, offset, resumed: false, ...await term.screen.snapshot() });
      while (client.queued.length && term.clients.has(client.clientId)) {
        const event = client.queued.shift()!; client.bytes -= encode(event).length;
        if (event.event !== 'output' || event.offset >= offset) await send(socket, { ...event, clientId: client.clientId });
      }
      client.restoring = false; client.queued = []; client.bytes = 0;
      if (term.closedAt) await send(socket, { event: 'exit', terminalId: term.id, clientId: m.clientId, closedAt: term.closedAt, exitCode: term.exitCode });
      return { attached: true };
    }
    const client = term.clients.get(m.clientId ?? '');
    if (!client || client.socket !== socket) throw new EngineError(Codes.FORBIDDEN, 403, 'Terminal client not attached');
    if (m.op === 'detach') { detach(term, m.clientId!); return {}; }
    if (term.closedAt) throw new EngineError('CLOSED', 409, 'Terminal is closed');
    if (m.op === 'resize') {
      dimensions(m.cols, m.rows);
      if (m.intent !== 'claim' && m.intent !== 'update') throw new EngineError('INVALID', 400, 'Invalid resize intent');
      if (m.intent === 'claim' && !term.controller) term.controller = m.clientId;
      if (term.controller !== m.clientId) throw new EngineError(Codes.FORBIDDEN, 403, 'Terminal input lease held by another client');
      await term.pending; await term.screen.resize(m.cols, m.rows); term.pty.resize(m.cols, m.rows); term.cols = m.cols; term.rows = m.rows;
      term.lastActivity = Date.now(); return status(term);
    }
    if (m.op === 'input') {
      if (term.controller !== m.clientId) throw new EngineError(Codes.FORBIDDEN, 403, 'Terminal is observe only');
      if (typeof m.data !== 'string' || m.data.length > 4 * Math.ceil(TERMINAL_LIMITS.inputBytes / 3)) refuse('Terminal input limit', 413);
      const data = Buffer.from(m.data, 'base64'); if (data.length > TERMINAL_LIMITS.inputBytes) refuse('Terminal input limit', 413);
      const text = term.screen.input(data.toString()); if (text) term.pty.write(text); term.lastActivity = Date.now(); return {};
    }
    throw new EngineError('INVALID', 400, 'Unknown sidecar operation');
  }
  const instanceId = randomUUID();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('error', () => {});
    let serial = Promise.resolve();
    receive(socket, message => { serial = serial.then(async () => {
      try { await send(socket, { id: message.id, result: await handle(socket, message) }); }
      catch (e) { const error = e instanceof EngineError ? e : new EngineError('PTY_ERROR', 500, 'Terminal operation failed'); await send(socket, { id: message.id, error: { code: error.code, status: error.status, message: error.message } }); }
    }); });
    socket.once('close', () => { sockets.delete(socket); for (const term of terminals.values()) for (const [id, c] of term.clients) if (c.socket === socket) detach(term, id); });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); resolve(); }); });
    await chmod(socketPath, 0o600);
  } catch (error) {
    if (server.listening) {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(socketPath, { force: true });
    }
    await lock.close(); throw error;
  }
  let stopped: Promise<void> | undefined;
  return {
    pids: () => [...terminals.values()].flatMap(t => t.tree.pids()),
    close: () => stopped ??= (async () => {
      closing = true;
      await Promise.all([...terminals.values()].map(kill));
      for (const t of terminals.values()) t.screen.dispose();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(socketPath, { force: true }); await lock.close();
    })(),
  };
}
