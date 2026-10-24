import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPlugin, protectPlugin } from '../plugin.ts';
import { createPolicy, scopeHash } from './index.ts';
import { classifyUser } from './user.ts';
import { agent, database, stubPlugin } from './fixture.ts';
import type { Action, CreateIntent, EnginePlugin, Profile, SpawnSpec } from '../types.ts';

const action = (command: string): Action => ({ kind: 'shell', tool: 'Bash', command, paths: [], cwd: '/workspace' });
const intent: CreateIntent = { requestId: 'r1', provider: 'claude', model: 'fixture', cwd: '/workspace', title: 'fixture', profile: 'generic' };
const principal = { kind: 'cli', name: 'cli' } as const;
const options = (f: ReturnType<typeof database>, plugin: EnginePlugin) => ({ db: f.db, journal: f.journal, plugin, log() {} });

test('user grammar catches secrets and core protected categories without touching targets', () => {
  for (const path of ['.env', '/project/.env.local', '/users/me/auth.json', '/users/me/.credentials.json', '/users/me/.claude.json',
    '~/.ssh/id_ed25519', '/root/tokens/access', '/users/me/.aws/credentials', '/users/me/.config/gcloud/cache']) {
    assert.equal(classifyUser({ kind: 'read', tool: 'Read', paths: [path], cwd: '/work' })?.category, 'secrets', path);
    assert.equal(classifyUser(action(`cat '${path}'`))?.decision, 'deny', path);
  }
  for (const command of ['systemctl --user enable fixture.service', 'systemctl --user start fixture.service', 'crontab -e',
    'launchctl load fixture.plist', 'schtasks /create /tn fixture']) assert.equal(classifyUser(action(command))?.category, 'standing_service');
  for (const command of ['rm -rf /workspace/data', 'rm -fr "$TARGET"', 'git push --force origin main', 'DROP TABLE customers',
    'find /workspace -delete']) assert.equal(classifyUser(action(command))?.category, 'irreversible_delete');
  for (const command of ['npm publish', 'gh release create v1']) assert.equal(classifyUser(action(command))?.category, 'publish');
  assert.equal(classifyUser(action('alpaca order buy fixture'))?.category, 'money');
  assert.equal(classifyUser(action('rm -rf /tmp/engine-fixture')), null);
  assert.equal(classifyUser(action('git status')), null);
});
test('null plugin and named/default module exports; missing adapter refuses', async () => {
  const f = database();
  try {
    const generic = await loadPlugin();
    assert.deepEqual(Object.keys(generic.profiles()), ['generic']);
    assert.deepEqual(generic.tools(), []);
    assert.deepEqual(await generic.beforeCreate(intent, principal), { ok: true });
    for (const kind of ['default', 'named']) {
      const path = join(f.directory, `adapter-${kind}.mjs`);
      await writeFile(path, `${kind === 'default' ? 'export default' : 'export const plugin ='} {
        name:'fixture', profiles(){return {}}, beforeCreate:async()=>({ok:true})
      };`);
      assert.deepEqual(await (await loadPlugin(path)).beforeCreate(intent, principal), { ok: true });
    }
    const missing = await loadPlugin(join(f.directory, 'absent-module.mjs'));
    assert.ok('code' in await missing.beforeCreate(intent, principal));
    assert.equal((await missing.classify(agent(), action('echo safe')))?.decision, 'deny');
  } finally { f.close(); }
});
test('scratch deletion exemption does not follow a link outside scratch', async () => {
  const f = database();
  try {
    // /usr exists on every host; /srv is absent on macOS, where the link dangles, and a dangling link grants nothing.
    for (const [name, target] of [['outside', '/srv'], ['outside-usr', '/usr'], ['dangling', join(f.directory, 'absent')]]) {
      const link = join(f.directory, name);
      await symlink(target, link);
      assert.equal(classifyUser(action(`rm -rf ${link}/fixture`))?.category, 'irreversible_delete', target);
    }
    assert.equal(classifyUser(action('cat .ssh/id_ed25519'))?.category, 'secrets');
  } finally { f.close(); }
});
test('core secret denial cannot be overridden or approved; profile denial beats plugin allow', async () => {
  const f = database();
  let filed = 0;
  const plugin = stubPlugin({
    classify: async () => ({ decision: 'allow', rule: 'plugin.allow', reason: 'test' }),
    fileApproval: async () => { filed++; },
    profiles: () => ({ generic: { name: 'generic', tools: [], interrupt: false, settingSources: [], deny: ['Read', 'echo forbidden*'] } }),
  });
  try {
    const policy = createPolicy(options(f, plugin));
    const secret = await policy.gate(agent(), action('cat /fixture/.env.fake'), { tool: 'Bash', input: {} });
    assert.equal(secret.allow, false);
    assert.ok(!('awaitingUser' in secret));
    assert.equal(filed, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM permissions').get()!.n, 0);
    assert.equal((await policy.gate(agent(), action('echo forbidden text'), { tool: 'Bash', input: {} })).allow, false);
    assert.equal((await policy.gate(agent('a', 'missing'), action('echo safe'), { tool: 'Bash', input: {} })).allow, false);
  } finally { f.close(); }
});
test('user gate: awaiting_user, exact action/scope, adapter authority, once-only CAS, expiry and journal', async () => {
  const f = database();
  const statuses = new Map<string, 'pending' | 'approved'>();
  const plugin = stubPlugin({
    classify: async () => ({ decision: 'allow', rule: 'plugin.allow', reason: 'test' }),
    fileApproval: async req => { statuses.set(req.approvalId, 'pending'); },
    approvalStatus: async id => statuses.get(id) ?? 'pending',
  });
  const protectedAction = action('systemctl --user enable fixture.service');
  const raw = { tool: 'Bash', input: { command: protectedAction.command } };
  try {
    let policy = createPolicy(options(f, plugin));
    const first = await policy.gate(agent(), protectedAction, raw);
    assert.ok(!first.allow && first.awaitingUser);
    const id = first.awaitingUser;
    const row = f.db.prepare('SELECT * FROM permissions WHERE id=?').get(id)!;
    assert.equal(row.scope_hash, scopeHash(protectedAction, agent()));
    assert.equal(String(row.nonce).length, 32);
    assert.equal(row.expires_at, '9999-12-31T23:59:59.999Z', 'a pending user card has no local TTL');
    f.db.prepare("UPDATE permissions SET state='approved' WHERE id=?").run(id);
    assert.equal((await policy.gate(agent(), protectedAction, raw)).allow, false, 'local database approval alone has no authority');
    const changed = await policy.gate(agent(), action('systemctl --user enable different.service'), raw);
    assert.ok(!changed.allow && changed.awaitingUser !== id);
    assert.notEqual(scopeHash(protectedAction, agent('b')), row.scope_hash);
    assert.notEqual(scopeHash({ ...protectedAction, cwd: '/elsewhere' }, agent()), row.scope_hash);
    statuses.set(id, 'approved');
    policy = createPolicy(options(f, plugin)); // reconstruct engine over durable pending approval
    const results = await Promise.all([policy.gate(agent(), protectedAction, raw), policy.gate(agent(), protectedAction, raw)]);
    assert.equal(results.filter(r => r.allow).length, 1);
    assert.equal(f.db.prepare('SELECT state FROM permissions WHERE id=?').get(id)!.state, 'consumed');
    assert.equal((await policy.gate(agent(), protectedAction, raw)).allow, false);
    const pending = results.find(r => !r.allow)!;
    assert.ok(!pending.allow && pending.awaitingUser);
    statuses.set(pending.awaitingUser, 'approved');
    f.db.prepare('UPDATE permissions SET expires_at=? WHERE id=?').run(new Date(Date.now() - 1).toISOString(), pending.awaitingUser);
    assert.equal((await policy.gate(agent(), protectedAction, raw)).allow, false, 'expired approval cannot pass');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM journal_frames WHERE type='approval_consumed'").get()!.n, 1);
    assert.ok(Number(f.db.prepare("SELECT COUNT(*) n FROM journal_frames WHERE type='awaiting_user'").get()!.n) >= 3);
    assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get()!['integrity_check'], 'ok');
  } finally { f.close(); }
});
test('profile deny is rechecked before consuming approval; adapter/file/journal failure denies', async () => {
  const f = database();
  let deny: Profile['deny'] = [];
  const plugin = stubPlugin({
    profiles: () => ({ generic: { name: 'generic', tools: [], interrupt: false, settingSources: [], deny } }),
    approvalStatus: async () => 'approved',
  });
  try {
    const policy = createPolicy(options(f, plugin));
    const protectedAction = action('systemctl --user enable fixture.service');
    const first = await policy.gate(agent(), protectedAction, { tool: 'Bash', input: {} });
    assert.ok(!first.allow && first.awaitingUser);
    deny = ['Bash'];
    assert.equal((await policy.gate(agent(), protectedAction, { tool: 'Bash', input: {} })).allow, false);
    assert.equal(f.db.prepare('SELECT state FROM permissions WHERE id=?').get(first.awaitingUser)!.state, 'pending');
    const missingRules = createPolicy(options(f, stubPlugin({ classify: async () => {
      await readFile(join(f.directory, 'missing-rules.json')); return null;
    } })));
    assert.equal((await missingRules.gate(agent(), action('echo safe'), { tool: 'Bash', input: {} })).allow, false);
    const brokenJournal = createPolicy({ ...options(f, plugin), journal: { append() { throw new Error('journal unavailable'); } } });
    assert.equal((await brokenJournal.gate(agent(), action('cat .env.fake'), { tool: 'Bash', input: {} })).allow, false);
  } finally { f.close(); }
});
test('approval scope binds non-shell tool arguments, including changed write contents', async () => {
  const f = database();
  const plugin = stubPlugin({
    classify: async () => ({ decision: 'approval', category: 'publish', rule: 'fixture.publish', reason: 'fixture approval' }),
    approvalStatus: async () => 'approved',
  });
  try {
    const policy = createPolicy(options(f, plugin));
    const write: Action = { kind: 'write', tool: 'Write', paths: ['/workspace/post'], cwd: '/workspace' };
    const first = await policy.gate(agent(), write, { tool: 'Write', input: { content: 'first' } });
    const different = await policy.gate(agent(), write, { tool: 'Write', input: { content: 'second' } });
    assert.ok(!first.allow && first.awaitingUser);
    assert.ok(!different.allow && different.awaitingUser !== first.awaitingUser);
    assert.equal((await policy.gate(agent(), write, { tool: 'Write', input: { content: 'first' } })).allow, true);
  } finally { f.close(); }
});
test('adapter throws yield refusals and leave the policy usable; sync and async seams are protected', async () => {
  const f = database();
  try {
    const plugin = stubPlugin({ beforeCreate: async () => { throw new Error('fixture'); }, beforeSend: async () => { throw new Error('fixture'); },
      beforeSpawn: async () => { throw new Error('fixture'); }, onBoot: async () => { throw new Error('fixture'); },
      onEvent() { throw new Error('fixture'); }, tools() { throw new Error('fixture'); } });
    const policy = createPolicy(options(f, plugin));
    assert.equal((await policy.admitCreate(intent, principal) as { code: string }).code, 'ADAPTER_ERROR');
    assert.equal((await policy.admitSend(agent(), { requestId: 'r2', text: 'test' }, principal) as { code: string }).code, 'ADAPTER_ERROR');
    assert.equal((await policy.gate(agent(), action('echo safe'), { tool: 'Bash', input: {} })).allow, true);
    const safe = protectPlugin(plugin);
    await assert.rejects(safe.beforeSpawn(agent(), {} as SpawnSpec), { code: 'ADAPTER_ERROR' });
    await assert.rejects(safe.onBoot({} as never), { code: 'ADAPTER_ERROR' });
    assert.throws(() => safe.onEvent({} as never, {} as never), { code: 'ADAPTER_ERROR' });
    assert.deepEqual(safe.tools(), []);
  } finally { f.close(); }
});
test('real 10s beforeCreate/beforeSend deadlines and 5s classify deadline fail closed', { timeout: 20_000 }, async () => {
  const f = database();
  const never = () => new Promise<never>(() => {});
  try {
    const policy = createPolicy(options(f, stubPlugin({ beforeCreate: never, beforeSend: never, classify: never })));
    const started = Date.now();
    const [create, send, gate] = await Promise.all([
      policy.admitCreate(intent, principal), policy.admitSend(agent(), { requestId: 'r2', text: 'fixture' }, principal),
      policy.gate(agent(), action('echo safe'), { tool: 'Bash', input: {} }),
    ]);
    assert.equal((create as { code: string }).code, 'ADMISSION_TIMEOUT');
    assert.equal((send as { code: string }).code, 'ADMISSION_TIMEOUT');
    assert.equal(gate.allow, false);
    assert.ok(Date.now() - started >= 9_950);  // timers run on a monotonic clock; Date.now() may trail it in a VM
  } finally { f.close(); }
});
