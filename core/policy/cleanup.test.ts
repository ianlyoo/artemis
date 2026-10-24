/** Policy inputs only: no rm command in this file is executed. */
import { test } from 'node:test';
import { acquireLock } from '../locks.ts';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createPolicy } from './index.ts';
import { classifyUser } from './user.ts';
import { agent, database, stubPlugin } from './fixture.ts';
import { parseOptions, startEngine } from '../main.ts';
import { FakeDriver, fakeTerminals, console } from '../journal/fixtures.ts';
import { isAlive, processIdentity } from '../../drivers/claude/processes.ts';
import type { Action } from '../types.ts';

const action = (command: string, cwd: string): Action => ({ kind: 'shell', tool: 'Bash', command, paths: [], cwd });

test('cleanup roots permit owned worktree and scratch targets while preserving control boundaries', async t => {
  const f = database();
  const work = join(f.directory, 'work'), scratch = join(f.directory, 'scratch');
  const cwd = join(work, 'task', 'worktree'), outside = join(f.directory, 'outside'), peer = join(work, 'peer');
  for (const dir of [cwd, scratch, outside, peer]) await mkdir(dir, { recursive: true });
  await symlink(outside, join(cwd, 'escape'));
  await symlink(peer, join(cwd, 'peer-link'));
  await symlink(cwd, join(scratch, 'cwd-link'));
  await symlink(work, join(scratch, 'root-link'));
  const a = { ...agent(), cwd }, cleanupRoots = [work, scratch];
  let filed = 0;
  const plugin = stubPlugin({ fileApproval: async () => { filed++; } });
  const policy = createPolicy({ db: f.db, journal: f.journal, plugin, cleanupRoots, log() {} });
  const allowed = ['rm -rf build', 'rm -rf node_modules', '(rm -rf ./x)', 'rm -rf build node_modules',
    `rm -rf ${scratch}/state`, `sh -c 'rm -rf ${scratch}/other'`, 'rm -rf missing/nested/output'];
  const protectedInputs = ['rm -rf .', 'rm -rf ..', 'rm -rf ../..', `rm -rf ${cwd}`, `rm -rf ${work}`, `rm -rf ${scratch}`,
    'rm -rf escape/state', 'rm -rf peer-link/state', 'rm -rf peer-link/../lost-output',
    `rm -rf ${scratch}/cwd-link`, `rm -rf ${scratch}/root-link`,
    `rm -rf build ${outside}/state`, `rm -rf ${outside}/state`];
  try {
    for (const command of allowed) assert.equal((await policy.gate(a, action(command, cwd), { tool: 'Bash', input: { command } })).allow, true, command);
    assert.equal(filed, 0);
    for (const command of protectedInputs) {
      const result = await policy.gate(a, action(command, cwd), { tool: 'Bash', input: { command } });
      assert.ok(!result.allow && result.awaitingUser, command);
    }
    assert.equal(filed, protectedInputs.length);
    for (const unownedCwd of ['/workspace', '/workspace/system']) {
      const result = await policy.gate({ ...a, cwd: unownedCwd }, action('rm -rf build', unownedCwd), { tool: 'Bash', input: {} });
      assert.ok(!result.allow && result.awaitingUser, unownedCwd);
    }
    // Action.cwd may differ from the recorded cwd; it must not remove that veto.
    const relocated = await policy.gate(a, action(`rm -rf ${cwd}`, scratch), { tool: 'Bash', input: {} });
    assert.ok(!relocated.allow && relocated.awaitingUser);
    const direct: Action = { kind: 'delete', tool: 'Delete', paths: ['build'], cwd };
    assert.equal((await policy.gate(a, direct, { tool: 'Delete', input: {} })).allow, true);
    assert.equal((await policy.gate(a, { ...direct, paths: ['..'] }, { tool: 'Delete', input: {} })).allow, false);
    const nestedRoots = createPolicy({ db: f.db, journal: f.journal, plugin, cleanupRoots: [work, cwd, scratch], log() {} });
    assert.equal((await nestedRoots.gate(a, action(`rm -rf ${cwd}`, scratch), { tool: 'Bash', input: {} })).allow, false);
    t.diagnostic(`${allowed.length} literal cleanup forms allowed without cards; ${protectedInputs.length} unsafe forms filed cards; recorded cwd, overlapping roots and direct-delete paths checked`);
  } finally { f.close(); }
});

test('cleanup configuration defaults to OS scratch and explicit lists replace the defaults', () => {
  const f = database();
  try {
    assert.equal(classifyUser(action(`rm -rf ${f.directory}/build`, '/workspace')), null);
    assert.equal(classifyUser(action('rm -rf build', '/workspace'))?.category, 'irreversible_delete');
    assert.equal(classifyUser(action('rm -rf build', '/workspace/work/fixture'))?.category, 'irreversible_delete');
    assert.equal(classifyUser(action(`rm -rf ${tmpdir()}`, '/workspace'))?.category, 'irreversible_delete');
    assert.equal(classifyUser(action(`rm -rf ${f.directory}/build`, '/workspace'), { cleanupRoots: [] })?.category, 'irreversible_delete');
    assert.throws(() => createPolicy({ db: f.db, journal: f.journal, plugin: stubPlugin(), cleanupRoots: [''], log() {} }), /absolute/);
    const opts = parseOptions(['--state', f.directory, '--cleanup-roots', ' ./fixture-work , /tmp/fixture-scratch ']);
    assert.deepEqual(opts.cleanupRoots, [resolve('fixture-work'), '/tmp/fixture-scratch']);
    assert.equal(parseOptions(['--state', f.directory]).cleanupRoots, undefined);
    for (const value of ['', ',/tmp', '/tmp,']) assert.throws(() => parseOptions(['--state', f.directory, '--cleanup-roots', value]), /nonempty/);
  } finally { f.close(); }
});

test('artemisd boot passes parsed cleanup roots to its real policy', { timeout: 30_000 }, async t => {
  const f = database();
  const root = join(f.directory, 'allowed'), cwd = join(root, 'worker');
  await mkdir(cwd, { recursive: true });
  const options = parseOptions(['--state', join(f.directory, 'daemon'), '--api-port', '0', '--mcp-port', '0', '--cleanup-roots', root]);
  const engine = await startEngine(options, { plugin: stubPlugin(), drivers: [new FakeDriver()], terminals: () => fakeTerminals() });
  const lock = processIdentity(engine.lockPid)!;
  try {
    const { id } = await engine.core.create({ requestId: 'cleanup-agent', provider: 'claude', model: 'fixture', cwd,
      title: 'cleanup fixture', profile: 'generic' }, console);
    const a = engine.core.require(id);
    assert.equal((await engine.core.policy.gate(a, action('rm -rf build', cwd), { tool: 'Bash', input: {} })).allow, true);
    const outside = await engine.core.policy.gate(a, action(`rm -rf ${f.directory}/outside`, cwd), { tool: 'Bash', input: {} });
    assert.ok(!outside.allow && outside.awaitingUser, 'boot uses explicit roots instead of the OS-scratch defaults');
  } finally {
    await engine.close();
    try {
      const released = await acquireLock(options.stateDir); await released.close();
      if (lock.pid !== process.pid) assert.equal(isAlive(lock), false);
    } finally { f.close(); }
  }
  await assert.rejects(fetch(`http://127.0.0.1:${engine.apiPort}/v1/health`));
  await assert.rejects(fetch(`http://127.0.0.1:${engine.mcpPort}/state/unknown`));
  t.diagnostic('real boot/parse/policy wiring passed; writer-lock PID stopped; API/MCP listeners closed; no provider started');
});
