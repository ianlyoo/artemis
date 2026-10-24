import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, type ModelInfo as SDKModel, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ModelInfo } from '../../core/types.ts';
import { AsyncQueue } from './queue.ts';
import { ProcessTree } from './processes.ts';

export function claudeModels(rows: SDKModel[]): ModelInfo[] {
  const models = rows.map((m, i) => ({ id: m.value, aliases: m.resolvedModel && m.resolvedModel !== m.value ? [m.resolvedModel] : [], label: m.displayName, thinking: [
    ...(m.supportsAdaptiveThinking ? ['off', 'adaptive'] : []), ...(m.supportedEffortLevels ?? []),
  ], defaultThinking: m.supportsAdaptiveThinking ? 'adaptive' : null, isDefault: m.value === 'default' || i === 0 }));
  // Keep the SDK aliases selectable, and give persisted wire IDs their own choice
  // so returning to an explicit model does not silently replace it with an alias.
  const ids = new Set(models.map(m => m.id));
  for (const m of [...models]) for (const id of m.aliases) if (!ids.has(id)) {
    models.push({ ...m, id, aliases: [], isDefault: false }); ids.add(id);
  }
  return models;
}
/** A control-only SDK session. No prompt, hook settings, MCP servers, or model turn. */
export async function readClaudeModels(binary: string): Promise<ModelInfo[]> {
  const cwd = await mkdtemp(join(tmpdir(), 'engine-models-'));
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key]!;
  const tree = new ProcessTree({ gate: async () => ({ allow: false, rule: 'models', reason: 'No tools during discovery' }), prompt: async () => ({ decision: 'deny' }), trackPid() {}, log() {} });
  const input = new AsyncQueue<SDKUserMessage>(); let q: Query | undefined, timer: NodeJS.Timeout | undefined;
  try {
    q = query({ prompt: input, options: { cwd, env, pathToClaudeCodeExecutable: binary, settingSources: [], strictMcpConfig: true, mcpServers: {},
      spawnClaudeCodeProcess: request => {
        const child = spawn(request.command, request.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], signal: request.signal });
        if (child.pid) tree.add(child.pid, 'cli'); child.stderr.resume(); return child;
      } } });
    return claudeModels(await Promise.race([q.supportedModels(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Model discovery timeout')), 30_000); })]));
  } finally {
    if (timer) clearTimeout(timer); input.end(); q?.close();
    try { await tree.stop(false); } finally { tree.dispose(); await rm(cwd, { recursive: true, force: true }); }
  }
}
