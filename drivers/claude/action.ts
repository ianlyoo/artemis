import type { Action } from '../../core/types.ts';

/** Unrecognized tools still reach the gate; their tool name remains available to classifiers. */
export function actionFor(tool: string, input: unknown, cwd: string): Action {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const paths = ['file_path', 'path', 'notebook_path', 'directory'].flatMap(key =>
    typeof value[key] === 'string' ? [value[key] as string] : []);
  if (Array.isArray(value.paths)) paths.push(...value.paths.filter((x): x is string => typeof x === 'string'));
  if (tool === 'Glob' && typeof value.pattern === 'string') paths.push(value.pattern);
  const kind = tool === 'Bash' ? 'shell'
    : /^(Read|Grep|Glob|LS)$/.test(tool) ? 'read'
    : /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) ? 'write'
    : /^(WebFetch|WebSearch)$/.test(tool) ? 'network' : 'mcp';
  return { kind, tool, paths, cwd, ...(kind === 'shell' ? { command: String(value.command ?? '') }
    : kind === 'mcp' || kind === 'network' ? { command: JSON.stringify(value) } : {}) };
}
