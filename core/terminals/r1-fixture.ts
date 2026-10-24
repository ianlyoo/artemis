// Disposable real API/MCP/SQLite/PTY world; only the provider is synthetic.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Database } from '../db.ts';
import { Journal } from '../journal/index.ts';
import { Registry } from '../registry.ts';
import { ProcessCustody, readProc, isAlive, type ProcIdentity } from '../procs/posix.ts';
import { FakeDriver, fakePlugin, console } from '../journal/fixtures.ts';
import { createPolicy } from '../policy/index.ts';
import { createMcp } from '../mcp/index.ts';
import { createApi } from '../api/index.ts';
import { Auth } from '../api/auth.ts';
import { startPtyd } from '../../ptyd/server.ts';
import { bootEnv } from '../../drivers/codex/env.ts';
import { createTerminals } from './index.ts';

export async function until(check: () => unknown | Promise<unknown>, message = 'fixture condition', ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!await check()) { if (Date.now() > end) throw Error(`Timed out: ${message}`); await delay(25); }
}
export async function terminalWorld() {
  const root = realpathSync(mkdtempSync(join(process.env.TMPDIR!, 'r1c-'))), runDir = join(root, 'run'), state = join(root, 'state');
  const env = { ...bootEnv(), HOME: root, TMPDIR: root, TMP: root, TEMP: root };
  writeFileSync(join(root, '.bash_profile'), "PS1='R1C_PROMPT$ '\n");
  writeFileSync(join(root, '.zprofile'), "export PS1='R1C_PROMPT% '\n");
  const ptyd = await startPtyd(runDir, { env });
  const db = new Database(join(state, 'engine.db')), driver = new FakeDriver();
  const base = fakePlugin(), plugin = { ...base, profiles: () => Object.fromEntries(['orchestrator', 'project lead'].map(name =>
    [name, { name, tools: ['create_terminal', 'capture_terminal'], interrupt: false, settingSources: [] }])) };
  const journal = new Journal(db, plugin), procs = new ProcessCustody(db), policy = createPolicy({ db, journal, plugin, log() {} });
  const terminals = createTerminals({ db, runDir, journal, allowedRoots: [root], log() {} });
  const core = new Registry({ db, journal, procs, policy, plugin, drivers: [driver], terminals, log() {} });
  const mcp = createMcp({ db, core, plugin, port: 0, log() {} }); core.mcp = mcp; await mcp.start();
  const token = randomBytes(32).toString('hex'), cli = randomBytes(32).toString('hex');
  const auth = new Auth(db, state); auth.register({ name: 'console' }, token); auth.register({ name: 'cli' }, cli);
  // Only the product client reads this freshly generated fixture file.
  const accessFile = join(root, 'fixture-access'); writeFileSync(accessFile, token, { mode: 0o600 });
  const api = await createApi({ core, db, journal, stateDir: state, port: 0, version: '0.1.0', verifiedVersions: {} });
  const address = { engineURL: `http://127.0.0.1:${api.port}`, engineTokenFile: accessFile, dataDir: join(root, 'console-data') };
  mkdirSync(address.dataDir);
  const tracked = new Map<number, ProcIdentity>();
  const sample = () => { for (const pid of ptyd.pids()) { const p = readProc(pid); if (p) tracked.set(pid, p); } };
  const timer = setInterval(sample, 100); timer.unref();
  return { root, env, db, core, terminals, mcp, address,
    async request(path: string, method = 'GET', body?: unknown, as = 'console') {
      const res = await fetch(address.engineURL + path, { method, headers: { authorization: `Bearer ${as === 'console' ? token : cli}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() as any };
    },
    async agent(role = 'orchestrator', cwd = root) {
      const made = await core.create({ requestId: randomUUID(), provider: 'claude', model: 'synthetic', cwd, title: 'fixture', profile: role, labels: { 'role': role } }, console);
      await until(() => core.get(made.id)?.state === 'idle', 'synthetic agent idle'); return core.get(made.id)!;
    },
    async terminal(user: 'console' | `agent:${string}`, cwd = root) { return terminals.create({ requestId: randomUUID(), user, cwd, cols: 100, rows: 30 }, console); },
    async close() {
      sample(); clearInterval(timer);
      try { await api.close(); await mcp.close(); await core.close(); await terminals.close(); }
      finally { await ptyd.close(); journal.close(); db.close(); }
      assert.deepEqual(ptyd.pids(), []); assert.equal([...tracked.values()].filter(p => isAlive(p)).length, 0);
      const audit = { tracked: tracked.size, alive: 0 }; rmSync(root, { recursive: true, force: true }); return audit;
    },
  };
}
