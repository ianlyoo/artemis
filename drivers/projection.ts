import { posix } from 'node:path';
import type { ContextBreakdown, ContextUsage } from '../core/types.ts';

export const count = (v: unknown): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
const text = (v: unknown): string => typeof v === 'string' ? v : '';
/** Generic path fence; Console additionally applies its own allowed roots and secret scanner. */
export function safePath(value: unknown, cwd?: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) return null;
  const path = value.startsWith('/') ? value : cwd ? `${cwd}/${value}` : '';
  if (!path || posix.normalize(path) !== path || path.split('/').some(p => p.startsWith('.') && !['.scratch'].includes(p) || /(?:credential|token|keychain|secret|private[_-]?key)/i.test(p))) return null;
  return path;
}
/** Integer proportions, preserving the provider's total even when its category estimates differ. */
export function apportioned(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return values.map(() => 0);
  const exact = values.map(v => v / sum * total), ints = exact.map(Math.floor);
  let left = total - ints.reduce((a, b) => a + b, 0);
  for (const { i } of exact.map((v, i) => ({ i, remainder: v - ints[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i)) {
    if (left-- <= 0) break; ints[i]++;
  }
  return ints;
}
export function breakdown(used: number, categories: { name: string; tokens: number }[], files: { path: string; tokens: number }[] = [], lastCompaction: ContextBreakdown['lastCompaction'] = null): ContextBreakdown {
  const rows = categories.filter(c => typeof c.name === 'string' && c.name.length <= 100 && count(c.tokens) > 0).slice(0, 64);
  if (!rows.length) rows.push({ name: 'conversation', tokens: used });
  const scaled = apportioned(rows.map(c => c.tokens), used);
  return { categories: rows.map((c, i) => ({ name: c.name, tokens: scaled[i] })),
    files: files.filter(f => safePath(f.path) && count(f.tokens) > 0).slice(0, 100).map(f => ({ path: f.path, tokens: Math.min(used, f.tokens) })), lastCompaction };
}
export type ContextSnapshot = { usage: ContextUsage; context: ContextBreakdown };
/** SDK get_context_usage response or the structured /context message. Only in-window rows count. */
export function claudeContext(raw: any, lastCompaction: ContextBreakdown['lastCompaction'] = null): ContextSnapshot | null {
  const used = count(raw?.totalTokens ?? raw?.total_tokens), max = count(raw?.rawMaxTokens ?? raw?.raw_max_tokens);
  if (!max) return null;
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).filter((c: any) => c?.kind === 'used').map((c: any) => ({ name: text(c.id || c.name), tokens: count(c.tokens) }));
  const files = (Array.isArray(raw.memoryFiles ?? raw.memory_files) ? raw.memoryFiles ?? raw.memory_files : []).map((f: any) => ({ path: text(f?.path), tokens: count(f?.tokens) }));
  return { usage: { used, max }, context: breakdown(used, categories, files, lastCompaction) };
}
/** Codex's last request, never the session's cumulative usage. Cached tokens are included in inputTokens. */
export function codexContext(raw: any, lastCompaction: ContextBreakdown['lastCompaction'] = null): ContextSnapshot | null {
  if (!raw?.last || !count(raw.modelContextWindow)) return null;
  const input = count(raw.last.inputTokens), output = count(raw.last.outputTokens), cached = Math.min(input, count(raw.last.cachedInputTokens));
  const used = count(raw.last.totalTokens) || input + output;
  return { usage: { used, max: raw.modelContextWindow }, context: breakdown(used, [
    { name: 'Input', tokens: input - cached }, { name: 'Cached input', tokens: cached }, { name: 'Output', tokens: output },
  ], [], lastCompaction) };
}
