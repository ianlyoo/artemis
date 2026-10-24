import { daemonReady } from '../test-support/ports.ts';
/** Opt-in integration: actual artemisd and synthetic plugin hook, with only a synthetic adapter. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { bootEnv } from '../../drivers/codex/env.ts';
import { ProcessTree as PosixTree } from '../../drivers/codex/processes.ts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ProcessTree, isAlive, processIdentity, type ProcessIdentity } from '../../drivers/claude/processes.ts';

async function exited(promise: Promise<number | null>): Promise<number | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Owned child did not exit')), 10_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

test('scratch artemisd serves plugin state to the synthetic plugin state hook', {
  timeout: 60_000,
}, async t => {
  const directory = await mkdtemp(join(process.env.TMPDIR!, 'state-hook-'));
  const module = join(directory, 'fixture-plugin.mjs');
  await writeFile(module, `import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export default {
  name:'state-hook-fixture',
  profiles:()=>({generic:{name:'generic',tools:[],interrupt:false,settingSources:[]}}),
  beforeCreate:async()=>({ok:true}),beforeSend:async()=>({ok:true}),beforeSpawn:async(_a,s)=>s,
  classify:async()=>null,tools:()=>[],mcpServers:()=>[],onEvent(){},
  async onBoot(ctx) {
    const agent=await ctx.core.create({requestId:'hook-parent',provider:'claude',model:'claude-haiku-5-5',
      cwd:ctx.stateDir,title:'hook-fixture',profile:'generic'},{kind:'console',name:'console'});
    await writeFile(join(ctx.stateDir,'fixture-agent.json'),JSON.stringify({id:agent.id}));
  },
  state:async(agent,search)=>({status:200,data:{text:'FIXTURE_STATE '+agent.title+' '+search}}),
};
`);
  const env: Record<string, string> = { HOME: directory };
  for (const name of ['PATH', 'USER', 'LOGNAME', 'LANG', 'SHELL', 'TERM', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[name]) env[name] = process.env[name]!;
  }
  const owned: ProcessIdentity[] = [];
  const tree = new ProcessTree({ gate: async () => ({ allow: false, rule: 'fixture', reason: 'No tools' }),
    prompt: async () => ({ decision: 'deny' }), log() {},
    trackPid(pid) { const identity = processIdentity(pid); if (identity) owned.push(identity); } });
  const children: ChildProcess[] = [];
  const exits: Promise<unknown>[] = [];
  function run(args: string[], childEnv: Record<string, string>) {
    const child = spawn(process.execPath, args, { cwd: directory, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);
    const exit = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    void exit.catch(() => {}); exits.push(exit);
    if (child.pid) tree.add(child.pid, 'cli');
    child.stderr.resume();
    return { child, exit };
  }
  let origin = '', apiPort = 0;
  try {
    const daemon = run([fileURLToPath(new URL('../test-support/state-daemon.ts', import.meta.url)), '--state', directory,
      '--api-port', '0', '--mcp-port', '0', '--plugin', module], env);
    const ports = await daemonReady(daemon.child); origin = `http://127.0.0.1:${ports.mcpPort}`; apiPort = ports.apiPort;
    let id = '';
    const deadline = Date.now() + 30_000;
    while (!id) {
      if (daemon.child.exitCode !== null || daemon.child.signalCode !== null) throw new Error('Scratch artemisd exited during boot');
      if (Date.now() >= deadline) throw new Error('Scratch artemisd boot timed out');
      try {
        const record = JSON.parse(await readFile(join(directory, 'fixture-agent.json'), 'utf8'));
        const res = await fetch(`${origin}/state/${record.id}?source=probe`, { signal: AbortSignal.timeout(1000) });
        if (res.status === 200 && (await res.json() as { text?: string }).text === 'FIXTURE_STATE hook-fixture ?source=probe') id = record.id;
      } catch { /* The file is written before the listener opens. */ }
      if (!id) await delay(50);
    }
    // These three non-secret identity names are authorized for this hook only; artemisd's env stays clean.
    const hook = run([fileURLToPath(new URL('../test-support/state-hook.mjs', import.meta.url))], { ...env, ARTEMIS_PLUGIN_ROLE: 'fixture',
      ARTEMIS_PLUGIN_AGENT_ID: id, ARTEMIS_PLUGIN_PROXY_URL: `${origin}/mcp/unused-hook-fixture` });
    let output = '';
    hook.child.stdout.setEncoding('utf8'); hook.child.stdout.on('data', chunk => { output += chunk; });
    hook.child.stdin.end(JSON.stringify({ source: 'resume' }));
    assert.equal(await exited(hook.exit), 0);
    assert.deepEqual(JSON.parse(output), { hookSpecificOutput: {
      hookEventName: 'SessionStart', additionalContext: 'FIXTURE_STATE hook-fixture ?source=resume',
    } });
    t.diagnostic('synthetic hook printed plugin text through /state/<agentId>?source=resume');
    daemon.child.kill('SIGTERM');
    assert.equal(await exited(daemon.exit), 0);
  } finally {
    await tree.stop(false); tree.dispose(); await Promise.allSettled(exits);
    for (const child of children) { child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy(); }
    assert.equal(owned.filter(isAlive).length, 0);
    t.diagnostic(`pid audit: ${owned.length} tracked identities, alive=0`);
  }
  await rm(directory, { recursive: true, force: true });
  await assert.rejects(fetch(`${origin}/state/unknown`));
  await assert.rejects(fetch(`http://127.0.0.1:${apiPort}/v1/health`));
  t.diagnostic('scratch API/MCP listeners closed; no model turn or live service used');
});


test('P15: local bulletin hook fixture against throwaway artemisd follows Console/app channel and user/system turn markers', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(process.env.TMPDIR!, 'channel-hook-'));
  const env = { ...bootEnv(), HOME: directory };
  const daemon = fork(fileURLToPath(new URL('./channel-fixture.ts', import.meta.url)), [directory], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const tree = new PosixTree(daemon.pid!); let hook: ChildProcess | undefined;
  try {
    const [ready] = await once(daemon, 'message', { signal: AbortSignal.timeout(10000) });
    assert(ready.ready); const origin = `http://127.0.0.1:${ready.mcpPort}`, channel = `${origin}/channel/${ready.agentId}`;
    assert.deepEqual(await (await fetch(channel)).json(), { channel: null, userTurn: false });
    const bulletin = join(directory, 'bulletin.md');
    await writeFile(bulletin, '---\nid: bulletin\nroles: [orchestrator]\nrevision: 1\ndate: 2026-10-24 12:00\n---\nSynthetic bulletin.\n');
    const session = 'fixture-user-session', marker = join(directory, '.artemis', 'state', 'user-turn', createHash('sha256').update(session).digest('hex'));
    let n = 0;
    for (const phase of ['console', 'wake', 'app'] as const) {
      const response = once(daemon, 'message'); daemon.send({ id: ++n, phase }); assert.equal((await response)[0].ok, true);
      assert.deepEqual(await (await fetch(channel)).json(), { channel: phase === 'wake' ? 'console' : phase, userTurn: phase !== 'wake' });
      hook = spawn(process.execPath, [fileURLToPath(new URL('../test-support/state-hook.mjs', import.meta.url)), 'bulletin', bulletin], {
        env: { ...env, ARTEMIS_PLUGIN_ROLE: 'orchestrator', ARTEMIS_PLUGIN_AGENT_ID: ready.agentId, ARTEMIS_PLUGIN_PROXY_URL: `${origin}/mcp/hook-fixture` }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = ''; hook.stdout!.setEncoding('utf8'); hook.stdout!.on('data', chunk => { output += chunk; }); hook.stderr!.resume();
      const done = once(hook, 'close'); hook.stdin!.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: phase === 'wake' ? '[system wake] continue' : 'Show the comparison' }));
      assert.equal((await done)[0], 0);
      if (phase === 'console') assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /User channel: Console .*fences render/);
      else if (phase === 'app') assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /User channel: app, fences show as code/);
      else assert.equal(output, '');
      assert.equal(await readFile(marker, 'utf8'), phase === 'wake' ? 'system' : 'user');
    }
    const stopped = once(daemon, 'exit'); daemon.kill('SIGTERM'); assert.equal((await stopped)[0], 0);
    await assert.rejects(fetch(channel)); await assert.rejects(fetch(`http://127.0.0.1:${ready.apiPort}/v1/health`));
  } finally {
    if (hook && hook.exitCode === null && hook.signalCode === null) { const done = once(hook, 'close'); hook.kill('SIGTERM'); await done; }
    await tree.stop(); assert.deepEqual(tree.pids(), []); await rm(directory, { recursive: true, force: true });
    t.diagnostic('PID audit: throwaway artemisd, its lock helper and hook fixture children stopped; synthetic driver only');
  }
});
