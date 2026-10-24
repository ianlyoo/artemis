import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, stat, rm, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startPtyd } from '../../ptyd/server.ts';
import { loginShell } from '../../ptyd/shell.ts';
import { createTerminals, refreshTerminalActivity } from './index.ts';
import { PtyClient } from './client.ts';
import { testDb, SocketFixture } from './test-support.ts';
import { ProcessTree } from '../../drivers/codex/processes.ts';
import { bootEnv } from '../../drivers/codex/env.ts';
import { TermFrame, TERMINAL_LIMITS } from '../types.ts';
import { captureCase } from './capture-case.ts';
import type { Principal, TerminalRecord } from '../types.ts';
const console: Principal = { kind: 'console', name: 'console' };
test('M15: user grants one Orchestrator screen, persisted and revocable; other agents and terminals refuse', { timeout: 60000 }, captureCase);
const journal = { append: () => ({}) as any };
// Keep sidecar socket names below Darwin's 103-byte limit even under hostkit's long TMPDIR.
const scratch = (prefix: string) => mkdtemp(join(process.env.TMPDIR!, prefix));
async function waitFor(fn: () => boolean | Promise<boolean>, timeout = 10000): Promise<void> { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(20); } throw new Error('Condition timed out'); }
function snapshotFrom(frames: Buffer[]): any | undefined {
  const parts = frames.filter(b => b[0] === TermFrame.restore).map(b => JSON.parse(b.subarray(1).toString()));
  if (!parts.length) return undefined;
  if (parts[0].encoding !== 'base64-json') return parts[0];
  if (parts.length < parts[0].parts) return undefined;
  return JSON.parse(Buffer.concat(parts.sort((a, b) => a.index - b.index).map(p => Buffer.from(p.data, 'base64'))).toString());
}
function launch(path: string, args: string[]) {
  const child = fork(fileURLToPath(new URL(path, import.meta.url)), args, { env: { ...bootEnv(), HOME: args[0] === '--run' ? args[1] : args[2] ?? args[0] }, stdio: ['ignore','ignore','ignore','ipc'] });
  assert.ok(child.pid); const tree = new ProcessTree(child.pid);
  const ready = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Child not ready')), 10000); child.on('message', (m: any) => { if (m.ready) { clearTimeout(timer); resolve(); } }); child.once('exit', () => { clearTimeout(timer); reject(new Error('Child exited')); }); });
  return { child, tree, ready };
}
function requestor(child: ChildProcess) {
  let next = 0; const pending = new Map<number, (m: any) => void>(); const frames: Buffer[] = [];
  child.on('message', (m: any) => { if (m.event === 'frame') frames.push(Buffer.from(m.data, 'base64')); else if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } });
  return { frames, request(op: string, params: object = {}): Promise<any> { return new Promise((resolve, reject) => { const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Fixture RPC timeout')); }, 10000); pending.set(id, m => { clearTimeout(timer); if (m.error) reject(new Error('Fixture operation failed')); else resolve(m.result); }); child.send({ id, op, ...params }); }); } };
}

test('real PTY and SQLite: limits, lease, 5000-line restore, resume, user roots, history and idle sweep', { timeout: 90000 }, async t => {
  const base = await scratch('terminal-real-'); const runDir = join(base, 'run');
  const sidecar = launch('../../ptyd/main.ts', ['--run', runDir]);
  const db = testDb(join(base, 'state.db')); db.prepare('INSERT INTO agents VALUES (?,?,?)').run('fixture', 'idle', null);
  let service = createTerminals({ db, runDir, journal, log() {}, allowedRoots: [base] });
  const diagnostic = new PtyClient(runDir); const tracked = new Set<number>();
  try {
    await sidecar.ready; assert.equal((await stat(join(runDir, 'ptyd.sock'))).mode & 0o777, 0o600);
    const req = { requestId: 'one', user: 'console' as const, cwd: base, cols: 100, rows: 24, title: 'test' };
    await assert.rejects(service.create({ ...req, cwd: '/tmp' }, console), { code: 'FORBIDDEN' });
    const escape = join(base, 'escape'); await symlink('/tmp', escape);
    await assert.rejects(service.create({ ...req, cwd: escape }, console), { code: 'FORBIDDEN' });
    await assert.rejects(service.create({ ...req, rows: 501 }, console), { code: 'LIMIT' });
    await assert.rejects(service.create({ ...req, cols: 1001 }, console), { code: 'LIMIT' });
    const term = await service.create(req, console);
    assert.equal((await service.create(req, console)).id, term.id);
    await assert.rejects(service.create({ ...req, cols: 99 }, console), { code: 'IDEMPOTENCY_CONFLICT' });
    assert.throws(() => service.list({ limit: 101 }), { code: 'LIMIT' });
    const controller = new SocketFixture(); const observer = new SocketFixture(); const third = new SocketFixture();
    service.attach(term.id, { principal: console }, controller); service.attach(term.id, { principal: console }, observer); service.attach(term.id, { principal: console }, third);
    assert.ok(third.closed);
    await waitFor(() => controller.frames.some(b => b[0] === TermFrame.restore) && observer.frames.some(b => b[0] === TermFrame.restore));
    controller.input(TermFrame.resize, JSON.stringify({ intent: 'claim', cols: 120, rows: 30 }));
    await waitFor(() => service.list({}).items[0]?.cols === 120);
    observer.input(TermFrame.input, 'printf SHOULD_NOT_RUN\n'); await waitFor(() => !!observer.closed);
    controller.input(TermFrame.input, `printf '\\033[2J\\033[H'; python3 -c "for i in range(5100): print('LINE-%04d' % i)"\n`);
    await waitFor(async () => (await service.capture(term.id, 5000)).includes('LINE-5099'));
    const capture = await service.capture(term.id, 5000); assert.equal(capture.split('\n').length, 5000); assert.ok(!capture.includes('LINE-0000'));
    const restored = new SocketFixture(); service.attach(term.id, { principal: console }, restored);
    await waitFor(() => !!snapshotFrom(restored.frames));
    const snapshot = snapshotFrom(restored.frames);
    assert.equal(snapshot.text.split('\n').length, 5000); assert.ok(snapshot.ansi.includes('LINE-5099')); assert.equal(snapshot.cols, 120);
    restored.close(); await delay(30);
    const resumed = new SocketFixture(); service.attach(term.id, { principal: console, generation: snapshot.generation, offset: snapshot.offset }, resumed);
    await waitFor(() => resumed.frames.some(b => b[0] === TermFrame.restore));
    assert.equal(JSON.parse(resumed.frames.find(b => b[0] === TermFrame.restore)!.subarray(1).toString()).resumed, true);
    resumed.input(TermFrame.resize, JSON.stringify({ intent: 'claim', cols: 80, rows: 24 })); await waitFor(() => !!resumed.closed);
    t.diagnostic('real PTY output, resize, observer refusal, single lease and 5000-line snapshot/resume passed');
    controller.close(); await delay(30);
    const tooBig = new SocketFixture(); service.attach(term.id, { principal: console }, tooBig); await waitFor(() => tooBig.frames.length > 0);
    tooBig.input(TermFrame.input, Buffer.alloc(TERMINAL_LIMITS.inputBytes + 1)); assert.equal(tooBig.closed?.code, 1009);
    await delay(30);
    const queue = new SocketFixture(); service.attach(term.id, { principal: console }, queue);
    for (let i = 0; i < 17; i++) queue.input(TermFrame.input, Buffer.alloc(TERMINAL_LIMITS.inputBytes));
    assert.equal(queue.closed?.code, 1009);
    await delay(30);
    const slow = new SocketFixture(); slow.bufferedAmount = TERMINAL_LIMITS.queuedBytes; service.attach(term.id, { principal: console }, slow); await waitFor(() => !!slow.closed); assert.equal(slow.closed?.code, 1009);
    const terms: TerminalRecord[] = [term];
    for (let i = 1; i < TERMINAL_LIMITS.userTerminals; i++) terms.push(await service.create({ ...req, requestId: `limit-${i}` }, console));
    const agentCapacity = await service.create({ ...req, user: 'agent:fixture', requestId: 'capacity-agent' }, console);
    await assert.rejects(service.create({ ...req, requestId: 'over' }, console), { code: 'LIMIT', message: '8 user terminals are open; close one to open another' });
    const tabs = terms.flatMap(term => Array.from({ length: 2 }, () => {
      const socket = new SocketFixture(); service.attach(term.id, { principal: console }, socket); return socket;
    }));
    await waitFor(() => tabs.every(socket => socket.frames.some(frame => frame[0] === TermFrame.restore)));
    assert.equal(tabs.length, 16); assert(tabs.every(socket => !socket.closed));
    const overflow = new SocketFixture(); service.attach(agentCapacity.id, { principal: console }, overflow);
    assert.match(overflow.closed!.reason!, /16 terminal attachments/);
    // The sidecar independently enforces the same total across service connections.
    await assert.rejects(diagnostic.request('attach', { terminalId: agentCapacity.id, clientId: 'seventeenth' }), { code: 'LIMIT' });
    tabs[0].close(); await delay(50);
    const replacement = new SocketFixture(); service.attach(agentCapacity.id, { principal: console }, replacement);
    await waitFor(() => replacement.frames.some(frame => frame[0] === TermFrame.restore)); assert(!replacement.closed);
    for (const socket of [...tabs, replacement]) socket.close();
    await service.kill(agentCapacity.id, console);
    assert.equal(service.list({ limit: 2 }).items.length, 2); assert.ok(service.list({ limit: 2 }).nextCursor);
    for (const state of await diagnostic.request('list')) for (const pid of state.pids) tracked.add(pid);
    await Promise.all(terms.map(t => service.kill(t.id, console)));
    assert.equal(service.list({}).items.length, 0); assert.equal(service.list({ includeClosed: true, user: 'console' }).items.length, 8);
    await service.close(); service = createTerminals({ db, runDir, journal, log() {}, allowedRoots: [base] });
    assert.equal(service.list({ includeClosed: true }).items.length, 9);
    const agent = await service.create({ ...req, requestId: 'agent', user: 'agent:fixture' }, console);
    db.prepare("UPDATE agents SET state='archived', archived_at=? WHERE id='fixture'").run(new Date().toISOString());
    assert.equal(await service.sweep(new Date(Date.now() + 7 * 3600000)), 1);
    assert.ok(service.list({ user: 'agent:fixture', includeClosed: true }).items.find(t => t.id === agent.id)?.closedAt);
    assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok');
    t.diagnostic('all terminal limits, root/symlink refusal, closed history, pagination, archived idle sweep, SQLite integrity passed');
    assert.ok((await diagnostic.request('list')).every((t: any) => t.pids.length === 0));
  } finally {
    await service.close(); await diagnostic.close(); await sidecar.tree.stop(); assert.deepEqual(sidecar.tree.pids(), []); db.close();
    for (const pid of tracked) { try { const data = await readFile(`/proc/${pid}/stat`, 'utf8'); assert.equal(data.slice(data.lastIndexOf(')') + 2).split(' ')[0], 'Z'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
    await rm(base, { recursive: true, force: true }); t.diagnostic(`PID audit: sidecar and ${tracked.size} tracked PTY processes stopped`);
  }
});

test('terminal survives SIGKILL of its service process and sidecar enforces single instance', { timeout: 60000 }, async t => {
  const base = await scratch('terminal-restart-'); const runDir = join(base, 'run'); const db = join(base, 'state.db');
  const sidecar = launch('../../ptyd/main.ts', ['--run', runDir]); const services: ReturnType<typeof launch>[] = [];
  let duplicate: ChildProcess | undefined;
  try {
    await sidecar.ready;
    duplicate = fork(fileURLToPath(new URL('../../ptyd/main.ts', import.meta.url)), ['--run', runDir], { env: bootEnv(), stdio: 'ignore' });
    const code = await new Promise<number | null>(resolve => duplicate!.once('exit', resolve)); assert.notEqual(code, 0);
    const first = launch('./service-fixture.ts', [runDir, db, base]); services.push(first); await first.ready;
    const rpc = requestor(first.child);
    const term = await rpc.request('create', { request: { requestId: 'persistent', user: 'console', cwd: base, cols: 80, rows: 24 } });
    await rpc.request('attach', { terminalId: term.id, clientId: 'a' }); await waitFor(() => rpc.frames.some(f => f[0] === TermFrame.restore));
    await rpc.request('input', { clientId: 'a', tag: TermFrame.resize, body: JSON.stringify({ intent: 'claim', cols: 80, rows: 24 }) });
    await rpc.request('input', { clientId: 'a', tag: TermFrame.input, body: 'printf BEFORE_RESTART\\n\n' });
    await waitFor(async () => (await rpc.request('capture', { terminalId: term.id, lines: 24 })).includes('BEFORE_RESTART'));
    first.child.kill('SIGKILL'); await new Promise<void>(resolve => first.child.once('exit', () => resolve())); await first.tree.stop();
    const second = launch('./service-fixture.ts', [runDir, db, base]); services.push(second); await second.ready; const after = requestor(second.child);
    assert.equal((await after.request('list')).items[0].id, term.id);
    assert.ok((await after.request('capture', { terminalId: term.id, lines: 24 })).includes('BEFORE_RESTART'));
    await after.request('attach', { terminalId: term.id, clientId: 'b' }); await waitFor(() => after.frames.some(f => f[0] === TermFrame.restore));
    await after.request('input', { clientId: 'b', tag: TermFrame.resize, body: JSON.stringify({ intent: 'claim', cols: 100, rows: 40 }) });
    await after.request('input', { clientId: 'b', tag: TermFrame.input, body: 'printf AFTER_RESTART\\n\n' });
    await waitFor(async () => (await after.request('capture', { terminalId: term.id, lines: 40 })).includes('AFTER_RESTART'));
    await after.request('kill', { terminalId: term.id }); assert.ok((await after.request('list', { query: { includeClosed: true } })).items[0].closedAt);
    t.diagnostic('real separate service SIGKILL/restart: same terminal, retained output, new lease and input; duplicate sidecar refused');
  } finally {
    for (const s of services) { await s.tree.stop(); assert.deepEqual(s.tree.pids(), []); }
    await sidecar.tree.stop(); assert.deepEqual(sidecar.tree.pids(), []);
    if (duplicate?.exitCode === null && duplicate.signalCode === null) { duplicate.kill('SIGTERM'); await new Promise<void>(resolve => duplicate!.once('exit', () => resolve())); }
    await rm(base, { recursive: true, force: true }); t.diagnostic('PID audit: all service processes, sidecar and PTYs stopped');
  }
});

test('sidecar SIGTERM kills live PTYs and their descendants cleanly', { timeout: 20000 }, async t => {
  const base = await scratch('terminal-shutdown-'); const runDir = join(base, 'run');
  const sidecar = launch('../../ptyd/main.ts', ['--run', runDir]); const client = new PtyClient(runDir);
  try {
    await sidecar.ready;
    await client.request('create', { terminalId: 'shutdown', fingerprint: 'shutdown', cwd: base, cols: 80, rows: 24 });
    await client.request('attach', { terminalId: 'shutdown', clientId: 'controller' });
    await client.request('resize', { terminalId: 'shutdown', clientId: 'controller', intent: 'claim', cols: 80, rows: 24 });
    await client.request('input', { terminalId: 'shutdown', clientId: 'controller', data: Buffer.from('sleep 30\n').toString('base64') });
    await waitFor(async () => (await client.request('list'))[0].pids.length > 1);
    sidecar.tree.capture();
    const exit = new Promise<number | null>(resolve => sidecar.child.once('exit', resolve)); sidecar.child.kill('SIGTERM');
    assert.equal(await exit, 0); assert.deepEqual(sidecar.tree.pids(), []);
    t.diagnostic('clean SIGTERM exit=0; real shell and sleep descendant stopped');
  } finally { await client.close(); await sidecar.tree.stop(); assert.deepEqual(sidecar.tree.pids(), []); await rm(base, { recursive: true, force: true }); }
});

test('SIGKILL releases ptyd kernel lock; same runDir restarts automatically and rejects a second live user', { timeout: 30000 }, async t => {
  const base = await scratch('terminal-lock-restart-'); const runDir = join(base, 'run');
  const first = launch('../../ptyd/main.ts', ['--run', runDir]); let second: ReturnType<typeof launch> | undefined;
  const oldClient = new PtyClient(runDir); let newClient: PtyClient | undefined;
  try {
    await first.ready;
    await oldClient.request('create', { terminalId: 'before', fingerprint: 'before', cwd: base, cols: 80, rows: 24 });
    const before = (await stat(join(runDir, 'ptyd.lock'))).ino;
    first.tree.capture();
    const exited = new Promise<void>(resolve => first.child.once('exit', () => resolve())); first.child.kill('SIGKILL'); await exited;
    // Do not remove either pathname and do not stop old descendants before restart:
    // inherited PTY children must not retain the parent's lock descriptor.
    second = launch('../../ptyd/main.ts', ['--run', runDir]); await second.ready;
    assert.equal((await stat(join(runDir, 'ptyd.lock'))).ino, before);
    newClient = new PtyClient(runDir);
    await newClient.request('create', { terminalId: 'after', fingerprint: 'after', cwd: base, cols: 100, rows: 30 });
    assert.equal((await newClient.request('list'))[0].id, 'after');
    const duplicate = launch('../../ptyd/main.ts', ['--run', runDir]);
    try { await assert.rejects(duplicate.ready, /Child exited/); }
    finally { await duplicate.tree.stop(); assert.deepEqual(duplicate.tree.pids(), []); }
    assert.equal((await newClient.request('list'))[0].id, 'after');
    t.diagnostic('SIGKILL -> automatic same-runDir restart; stable lock inode; two live users refused');
  } finally {
    await oldClient.close(); await newClient?.close(); await first.tree.stop(); await second?.tree.stop();
    assert.deepEqual(first.tree.pids(), []); if (second) assert.deepEqual(second.tree.pids(), []);
    await rm(base, { recursive: true, force: true }); t.diagnostic('PID audit: both sidecars, rejected duplicate, flock helpers and PTYs stopped');
  }
});


test('T08/T11: login profile, idle/working/input attention, line editing and bracketed multiline paste on Linux', { timeout: 30000, skip: process.platform !== 'linux' }, async t => {
  const base = await scratch('terminal-console-'), runDir = join(base, 'run');
  await writeFile(join(base, '.bash_profile'), "export PROFILE_PROOF=PROFILE_LOADED\nPS1='ARTEMIS_PROMPT$ '\nbind 'set enable-bracketed-paste on'\n");
  const shell = loginShell(); assert.match(shell.file, /\/bash$/);
  const sidecar = await startPtyd(runDir, { env: { ...bootEnv(), HOME: base } });
  const db = testDb(join(base, 'state.db')), service = createTerminals({ db, runDir, journal, log() {}, allowedRoots: [base] });
  const client = new PtyClient(runDir); const tracked = new Set<number>();
  try {
    const term = await service.create({ requestId: 'console-shell', user: 'console', cwd: base, cols: 100, rows: 24 }, console);
    const socket = new SocketFixture(); service.attach(term.id, { principal: console }, socket);
    await waitFor(() => socket.frames.some(frame => frame[0] === TermFrame.restore));
    socket.input(TermFrame.resize, JSON.stringify({ intent: 'claim', cols: 100, rows: 24 }));
    const status = async () => { await refreshTerminalActivity(service); return service.list({}).items[0] as TerminalRecord & { activity: string; attention: null | { reason: string; since: string } }; };
    await waitFor(async () => (await status()).activity === 'idle');
    assert.equal((await status()).attention, null);
    socket.input(TermFrame.input, 'printf "PROFILE=%s SHELL=%s\\n" "$PROFILE_PROOF" "$SHELL"\r');
    await waitFor(async () => (await service.capture(term.id, 24)).includes(`PROFILE=PROFILE_LOADED SHELL=${shell.file}`));
    socket.input(TermFrame.input, 'sleep 30\r');
    await waitFor(async () => (await status()).activity === 'working');
    for (const pid of sidecar.pids()) tracked.add(pid);
    socket.input(TermFrame.input, '\x03'); await waitFor(async () => (await status()).activity === 'idle');
    socket.input(TermFrame.input, 'read -r -p "Continue? " answer\r');
    await waitFor(async () => (await status()).activity === 'needs_input');
    const attention = (await status()).attention!; assert.equal(attention.reason, 'needs_input'); assert(!Number.isNaN(Date.parse(attention.since)));
    assert.deepEqual((await status()).attention, attention);
    socket.input(TermFrame.input, 'yes\r'); await waitFor(async () => (await status()).activity === 'idle');
    assert.equal((await status()).attention, null);
    // Ctrl-A/Ctrl-E editing and a bracketed paste with Korean and a newline stay one pending edit.
    socket.input(TermFrame.input, 'printf BAD'); socket.input(TermFrame.input, '\x01\x0b');
    socket.input(TermFrame.input, "\x1b[200~printf '한글-one\\n' > pasted.txt\nprintf 'two\\n' >> pasted.txt\x1b[201~");
    await delay(200); await assert.rejects(stat(join(base, 'pasted.txt')), { code: 'ENOENT' });
    socket.input(TermFrame.input, '\x05\r');
    await waitFor(async () => { try { return await readFile(join(base, 'pasted.txt'), 'utf8') === '한글-one\ntwo\n'; } catch { return false; } });
    await waitFor(async () => (await status()).activity === 'idle');
    assert(!(await service.capture(term.id, 24)).includes('command not found'));
    socket.close();
  } finally {
    await service.close(); await client.close(); await sidecar.close(); assert.deepEqual(sidecar.pids(), []); db.close();
    for (const pid of tracked) { try { process.kill(pid, 0); const data = await readFile(`/proc/${pid}/stat`, 'utf8'); assert.equal(data.slice(data.lastIndexOf(')') + 2).split(' ')[0], 'Z'); } catch (error) { if (!['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; } }
    await rm(base, { recursive: true, force: true }); t.diagnostic('PID audit: login shell and its long command stopped');
  }
});
