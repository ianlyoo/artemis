import { homedir, tmpdir } from 'node:os';
/** Delta v1 real-provider proof. Only the code word in the role prompt can answer the user prompt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createClaudeDriver } from './index.ts';
import { createCodexDriver } from '../codex/index.ts';
import { isAlive, processIdentity, type ProcessIdentity } from './processes.ts';
import type { DriverEvent, DriverHost, Session, SpawnSpec } from '../../core/types.ts';

const enabled = process.env.ARTEMIS_REAL === '1';
for (const provider of ['claude', 'codex'] as const) {
  test(`real ${provider} role prompt and extra options`, { skip: !enabled, timeout: 120_000 }, async t => {
    assert.ok(process.env.TMPDIR, 'Scratch directory required');
    const cwd = await mkdtemp(join(process.env.TMPDIR!, `${provider}-options-`));
    const codeWord = provider === 'claude' ? 'AMBER_DELTA' : 'COBALT_DELTA';
    const spec: SpawnSpec = {
      agentId: `${provider}-options`, driverGeneration: 1, cwd, profile: 'generic', mcp: [], settingSources: [],
      model: provider === 'claude' ? 'claude-haiku-5-5' : 'gpt-6-luna', thinking: provider === 'claude' ? 'off' : 'low',
      systemPrompt: `The engine code word is ${codeWord}. When asked for the engine code word, reply with exactly ${codeWord} and nothing else. Do not use tools or delegate.`,
      disallowedTools: ['WebSearch'],
      extraArgs: provider === 'claude' ? { 'disable-slash-commands': null } : { web_search: '"disabled"' },
      env: { PATH: process.env.PATH!, HOME: homedir(), USER: 'system', LOGNAME: 'system',
        LANG: 'C.UTF-8', SHELL: '/bin/bash', TERM: 'xterm-256color', TMPDIR: process.env.TMPDIR! },
    };
    const owned: ProcessIdentity[] = [];
    const host: DriverHost = {
      gate: async () => ({ allow: false, rule: 'fixture.no-tools', reason: 'No tools; stop without retrying.' }),
      prompt: async () => ({ decision: 'deny' }), log() {},
      trackPid(pid) { const identity = processIdentity(pid); if (identity) owned.push(identity); },
    };
    const driver = provider === 'claude' ? createClaudeDriver()
      : createCodexDriver({ binary: 'codex', codexHome: process.env.CODEX_HOME ?? join(homedir(), '.codex') });
    const events: DriverEvent[] = [];
    let session: Session | undefined;
    let reader = Promise.resolve();
    try {
      session = await driver.start(spec, host);
      const active = session;
      reader = (async () => { for await (const event of active.events) events.push(event); })();
      assert.equal((await session.send({ commandId: 'options-proof', text: 'What is the engine code word?', delivery: 'start' })).accepted, true);
      const deadline = Date.now() + 90_000;
      while (!events.some(e => e.type === 'turn_completed' || e.type === 'turn_failed')) {
        if (Date.now() >= deadline) throw new Error('role prompt turn timed out');
        await delay(40);
      }
      assert.ok(events.some(e => e.type === 'turn_completed'));
      const text = events.flatMap(e => e.type === 'timeline' && e.item.type === 'assistant_message' ? [e.item.text] : []).join('').trim();
      assert.equal(text, codeWord);
      if (provider === 'claude') {
        const init = events.find(e => e.type === 'timeline' && e.item.type === 'other' &&
          (e.item.raw as { subtype?: string })?.subtype === 'init');
        assert.ok(init?.type === 'timeline' && init.item.type === 'other');
        const tools = (init.item.raw as { tools: string[] }).tools;
        assert.ok(tools.includes('Read'), 'native CLI advertised its tool list');
        assert.ok(!tools.includes('WebSearch'), 'disallowed WebSearch absent from native tool list');
        t.diagnostic('appended role prompt answered code word; WebSearch absent; disable-slash-commands flag accepted');
      } else t.diagnostic('thread developerInstructions answered code word; native web_search config override accepted; reasoning=low');
    } finally {
      await session?.close(); await reader;
      if (session) assert.deepEqual(session.pids(), []);
      assert.equal(owned.filter(isAlive).length, 0);
      t.diagnostic(`pid audit: ${owned.length} tracked identities, alive=0`);
    }
  });
}
