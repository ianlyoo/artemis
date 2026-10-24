import { safePath } from './projection.ts';

export type ToolProjection = { name: string; detail: Record<string, unknown> };
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const line = (v: unknown): string | undefined => typeof v === 'string' && v.length <= 2048 && !/[\x00-\x1f\x7f]|(?:sk-|gh[pousr]_|Bearer\s|(?:token|secret|password|api[_-]?key)\s*[:=])/i.test(v) ? v : undefined;
function url(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const u = new URL(value); if (['http:', 'https:'].includes(u.protocol)) return line(u.origin + u.pathname); } catch { /* unknown URL */ }
}
/** Never persist shell arguments, environment values, file contents or MCP results in tool details. */
function command(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const words = value.trimStart().split(/\s+/, 3), program = words[0];
  if (!/^[\w./+-]{1,128}$/.test(program)) return;
  return program + (/^(git|npm|pnpm|yarn)$/.test(program) && /^(status|diff|log|show|add|commit|test|run|build|install)$/.test(words[1] ?? '') ? ` ${words[1]}` : '');
}
export function toolDetail(name: string, value: unknown, cwd?: string): ToolProjection {
  const input = object(value), filePath = safePath(input.file_path ?? input.notebook_path, cwd);
  if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) return { name, detail: { type: name === 'Read' ? 'read' : name === 'Write' ? 'write' : 'edit', ...(filePath ? { filePath } : {}) } };
  if (['Bash', 'bash', 'shell', 'exec_command'].includes(name)) return { name: 'Bash', detail: { type: 'shell', command: command(input.command ?? input.cmd) } };
  if (['Grep', 'Glob', 'WebSearch'].includes(name)) return { name, detail: { type: 'search', query: line(input.pattern ?? input.query) } };
  if (name === 'WebFetch') return { name, detail: { type: 'fetch', url: url(input.url) } };
  if (/^mcp__[\w-]+__[\w-]+$/.test(name)) {
    // The summary/ref contract consumes named scalar arguments only; free text and arbitrary payloads are omitted.
    const fields = ['id', 'goal_id', 'project_id', 'request_id', 'ask_id', 'job_id', 'kind', 'status', 'to_role', 'waiting_on', 'day', 'size', 'verdict', 'op', 'host', 'board', 'title'];
    const selected: Record<string, string | number> = {};
    for (const key of fields) {
      const value = input[key], safe = line(value);
      if (typeof value === 'number' && Number.isSafeInteger(value)) selected[key] = value;
      else if (safe !== undefined) selected[key] = safe;
    }
    return { name, detail: { type: 'mcp', input: selected } };
  }
  return { name, detail: { type: 'unknown', input: {} } };
}
/** Codex names its parsed shell actions explicitly; do not try to parse shell arguments as file references. */
export function codexToolDetails(item: any, cwd: string): ToolProjection[] {
  if (item.type === 'commandExecution') {
    const actions = Array.isArray(item.commandActions) ? item.commandActions : [];
    const named = actions.flatMap((a: any) => a.type === 'read' ? [toolDetail('Read', { file_path: a.path }, item.cwd ?? cwd)] :
      a.type === 'search' ? [toolDetail('Grep', { query: a.query }, cwd)] : a.type === 'listFiles' ? [toolDetail('Glob', { pattern: a.path ?? '*' }, cwd)] : []);
    return named.length ? named : [toolDetail('Bash', { command: item.command }, cwd)];
  }
  if (item.type === 'fileChange') return (item.changes ?? []).map((c: any) => toolDetail(c.kind?.type === 'add' ? 'Write' : 'Edit', { file_path: c.path }, cwd));
  if (item.type === 'mcpToolCall') return [toolDetail(`mcp__${item.server}__${item.tool}`, item.arguments, cwd)];
  if (item.type === 'dynamicToolCall') return [toolDetail(item.namespace ? `mcp__${item.namespace}__${item.tool}` : item.tool, item.arguments, cwd)];
  if (item.type === 'webSearch') return [item.action?.url ? toolDetail('WebFetch', { url: item.action.url }, cwd) : toolDetail('WebSearch', { query: item.query ?? item.action?.query }, cwd)];
  if (item.type === 'imageView') return [toolDetail('Read', { file_path: item.path }, cwd)];
  return [toolDetail(item.type ?? 'unknown', {}, cwd)];
}
