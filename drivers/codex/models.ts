import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelInfo } from '../../core/types.ts';
import type { Model } from './protocol/0.164.0/v2/Model.ts';
import type { ModelListResponse } from './protocol/0.164.0/v2/ModelListResponse.ts';
import { ProcessTree } from './processes.ts';
import { Rpc } from './rpc.ts';

export function codexModels(rows: Model[]): ModelInfo[] {
  return rows.filter(m => !m.hidden).map(m => ({ id: m.model, label: m.displayName, thinking: m.supportedReasoningEfforts.map(e => e.reasoningEffort), defaultThinking: m.defaultReasoningEffort, isDefault: m.isDefault }));
}
/** Control-only app-server, with pagination. No thread or turn is created. */
export async function readCodexModels(binary: string, env: Record<string, string>): Promise<ModelInfo[]> {
  const cwd = await mkdtemp(join(tmpdir(), 'engine-models-'));
  let tree: ProcessTree | undefined, rpc: Rpc | undefined;
  try {
    const child = spawn(binary, ['app-server'], { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', () => {});
    if (!child.pid) throw new Error('Model discovery spawn failed');
    tree = new ProcessTree(child.pid); rpc = new Rpc(child);
    await rpc.request('initialize', { clientInfo: { name: 'engine_models', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    rpc.notify('initialized', {});
    const rows: Model[] = [], cursors = new Set<string>(); let cursor: string | null = null;
    do {
      const page: ModelListResponse = await rpc.request('model/list', { cursor, limit: 100, includeHidden: false });
      if (!Array.isArray(page.data)) throw new Error('Invalid model list');
      rows.push(...page.data); cursor = page.nextCursor;
      if (cursor && (cursors.has(cursor) || cursors.size >= 20)) throw new Error('Invalid model cursor');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return codexModels(rows);
  } finally {
    rpc?.dispose(); try { await tree?.stop(); } finally { await rm(cwd, { recursive: true, force: true }); }
  }
}
