/** These command strings are policy inputs only. No shell command is executed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy } from './index.ts';
import { classifyUser } from './user.ts';
import { agent, database, stubPlugin } from './fixture.ts';
import type { Action, UserCategory } from '../types.ts';

const action = (command: string): Action => ({ kind: 'shell', tool: 'Bash', command, paths: [], cwd: '/workspace' });
const wrapped = [
  (s: string) => `(${s})`,
  (s: string) => `{ ${s}; }`,
  (s: string) => `echo $(${s})`,
  (s: string) => `echo \`${s}\``,
  (s: string) => `echo "$(${s})"`,
  (s: string) => `bash -c "(${s})"`,
  (s: string) => `sh -c '${s}'`,
  (s: string) => `zsh -c '${s}'`,
  (s: string) => s.replace(' ', ' \\\n '),
];

test('C12 B1 shell forms file user cards; harmless look-alikes do not', async t => {
  const f = database();
  const filed: string[] = [];
  const plugin = stubPlugin({ classify: async () => ({ decision: 'allow', rule: 'fixture.allow', reason: 'fixture' }),
    fileApproval: async req => { filed.push(req.approvalId); } });
  const policy = createPolicy({ db: f.db, journal: f.journal, plugin, log() {} });
  const protectedInputs = [
    ...wrapped.map(wrap => wrap('rm -rf /workspace/work/fixture-victim')),
    'r\\\nm -rf /workspace/work/fixture-victim',
    'rm \\\r\n -rf /workspace/work/fixture-victim',
    'bash -c "sh -c \'(rm -rf /workspace/work/fixture-victim)\'"',
    'echo "$(printf %s \"$(rm -rf /workspace/work/fixture-victim)\")"',
    'sudo /bin/rm -rf /workspace/work/fixture-victim',
  ];
  const harmless = [
    ...wrapped.map(wrap => wrap('rmdir /workspace/work/fixture-victim')),
    ...wrapped.map(wrap => wrap('rm -rf /tmp/engine-fixture-safe')),
    "echo '(rm -rf /workspace/work/fixture-victim)'",
    "printf '%s' '$(rm -rf /workspace/work/fixture-victim)'",
    "echo '`rm -rf /workspace/work/fixture-victim`'",
    'echo "\\$(rm -rf /workspace/work/fixture-victim)"',
    'echo rm -rf /workspace/work/fixture-victim',
    'echo $(echo rm -rf /workspace/work/fixture-victim)',
    'bash -c "echo rm -rf /workspace/work/fixture-victim"',
    'echo safe # rm -rf /workspace/work/fixture-victim',
    'rm -- -rf /workspace/work/fixture-victim',
    "rm -rf '/tmp/engine fixture safe'",
    "printf '%s' 'rm \\\n -rf /workspace/work/fixture-victim'",
  ];
  try {
    for (const command of protectedInputs) {
      const verdict = await policy.gate(agent(), action(command), { tool: 'Bash', input: { command } });
      assert.ok(!verdict.allow && verdict.awaitingUser, command);
      assert.equal(verdict.rule, 'user.irreversible_delete', command);
    }
    assert.equal(filed.length, protectedInputs.length, 'every protected form filed an user card despite adapter allow');
    for (const command of harmless) {
      assert.equal((await policy.gate(agent(), action(command), { tool: 'Bash', input: { command } })).allow, true, command);
    }
    assert.equal(filed.length, protectedInputs.length, 'harmless forms filed no cards');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM journal_frames WHERE type='awaiting_user'").get()!.n, protectedInputs.length);
    t.diagnostic(`${protectedInputs.length} protected forms filed cards; ${harmless.length} harmless forms allowed; no shell/provider process started`);
  } finally { f.close(); }
});

test('non-literal delete targets deny without cards; literal targets retain boundary decisions', async t => {
  const f = database();
  const reason = 'delete targets must be literal paths: expand variables and globs first (e.g. rm -rf /workspace/work/…/build)';
  let filed = 0;
  const plugin = stubPlugin({ classify: async () => ({ decision: 'allow', rule: 'fixture.allow', reason: 'fixture' }),
    fileApproval: async () => { filed++; }, approvalStatus: async () => 'approved' });
  const policy = createPolicy({ db: f.db, journal: f.journal, plugin, log() {} });
  const commands = [
    'rm -rf $S/x', 'rm -rf "$S/state"', 'rm -fr "$TARGET"', 'rm -rf ${S}/x',
    'rm -rf /tmp/fixture-*', 'rm -rf /tmp/fixture-?', 'rm -rf /tmp/fixture-[ab]',
    'rm -rf /tmp/fixture-{a,../../workspace/work/fixture-victim}', 'rm -rf {a,b}',
    'rm -rf $(printf /tmp/fixture-x)', 'rm -rf `printf /tmp/fixture-x`', 'rm -rf ~/fixture-x',
    'rm -rf /workspace/fixture-outside $S/x',
    'systemctl --user start fixture; rm -rf $S/x',
    'bash -c \'(rm -rf "$S/x")\'',
  ];
  try {
    for (const command of commands) {
      assert.equal(classifyUser(action(command))?.decision, 'deny', command);
      for (let attempt = 0; attempt < 2; attempt++) {
        const verdict = await policy.gate(agent(), action(command), { tool: 'Bash', input: { command } });
        assert.equal(verdict.allow, false, command);
        assert.equal('awaitingUser' in verdict, false, command);
        if (!verdict.allow) assert.equal(verdict.reason, reason, command);
      }
    }
    const direct: Action = { kind: 'delete', tool: 'Delete', paths: ['$S/x'], cwd: '/workspace' };
    const denied = await policy.gate(agent(), direct, { tool: 'Delete', input: {} });
    assert.ok(!denied.allow && !denied.awaitingUser); assert.equal(denied.reason, reason);
    assert.equal(filed, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM permissions').get()!.n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM journal_frames WHERE type='awaiting_user'").get()!.n, 0);
    const outside = await policy.gate(agent(), action('rm -rf /workspace/fixture-outside'), { tool: 'Bash', input: {} });
    assert.ok(!outside.allow && outside.awaitingUser); assert.equal(filed, 1);
    const inside = await policy.gate(agent(), action(`rm -rf ${f.directory}/build`), { tool: 'Bash', input: {} });
    assert.equal(inside.allow, true); assert.equal(filed, 1);
    t.diagnostic(`${commands.length} non-literal forms denied twice with exact reason and zero approval rows/cards; literal outside filed one card; literal inside allowed`);
  } finally { f.close(); }
});

test('all command-word user categories share shell segmentation', t => {
  const cases: [UserCategory, string, string][] = [
    ['standing_service', 'systemctl --user reenable fixture', 'systemctl --user status fixture'],
    ['standing_service', 'service fixture start', 'service fixture status'],
    ['standing_service', 'crontab -e', 'crontab-helper -e'],
    ['standing_service', 'launchctl bootstrap fixture', 'launchctl print fixture'],
    ['standing_service', 'schtasks /create /tn fixture', 'schtasks /query /tn fixture'],
    ['standing_service', 'pm2 start fixture -d', 'pm2 list'],
    ['standing_service', 'docker compose up -d', 'docker compose ps'],
    ['irreversible_delete', 'git push --force-with-lease origin main', 'git push origin main'],
    ['irreversible_delete', 'find /workspace -delete', 'find /workspace -print'],
    ['irreversible_delete', 'shred /workspace/fixture', 'shredder /workspace/fixture'],
    ['irreversible_delete', 'DROP TABLE fixture', 'SELECT fixture'],
    ['irreversible_delete', 'TRUNCATE TABLE fixture', 'SELECT fixture'],
    ['publish', 'npm publish', 'npm run check'],
    ['publish', 'gh release create fixture', 'gh release list'],
    ['publish', 'twine upload fixture', 'twine check fixture'],
    ['publish', 'vercel deploy fixture', 'vercel inspect fixture'],
    ['money', 'alpaca order buy fixture', 'alpaca account show'],
  ];
  for (const [category, dangerous, harmless] of cases) {
    for (const wrap of wrapped) {
      const command = wrap(dangerous);
      assert.equal(classifyUser(action(command))?.category, category, command);
      assert.equal(classifyUser(action(wrap(harmless))), null, wrap(harmless));
    }
    assert.equal(classifyUser(action(`echo '${dangerous}'`)), null, 'quoted examples are data');
  }
  for (const verb of ['enable', 'reenable', 'preset', 'link', 'start', 'restart'])
    assert.equal(classifyUser(action(`systemctl --user ${verb} fixture`))?.category, 'standing_service', verb);
  for (const verb of ['is-enabled', 'list-unit-files', 'status', 'show', 'reenabled', 'presetting', 'linkage'])
    assert.equal(classifyUser(action(`systemctl --user ${verb} fixture`)), null, verb);
  assert.equal(classifyUser(action('git push origin main; echo --force')), null, 'flags cannot cross a segment boundary');
  assert.equal(classifyUser(action('systemctl --user status fixture; echo start')), null, 'verbs cannot cross a segment boundary');
  assert.equal(classifyUser(action('stripe account show; echo buy')), null, 'money verbs cannot cross a segment boundary');
  t.diagnostic(`${cases.length} command families × ${wrapped.length} shell forms, with matching harmless controls; m1 service verbs covered`);
});

test('excessive shell nesting fails closed without evaluating source', async () => {
  const f = database();
  try {
    const policy = createPolicy({ db: f.db, journal: f.journal, plugin: stubPlugin(), log() {} });
    const command = '('.repeat(40) + 'echo fixture' + ')'.repeat(40);
    const verdict = await policy.gate(agent(), action(command), { tool: 'Bash', input: { command } });
    assert.equal(verdict.allow, false); assert.equal(verdict.rule, 'policy.unavailable');
  } finally { f.close(); }
});
