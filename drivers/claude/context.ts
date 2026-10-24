import { breakdown, safePath, type ContextSnapshot } from '../projection.ts';

/** Estimates from successful Read results only. No file opens or retained contents. */
export class ReadFiles {
  private pending = new Map<string, string>();
  private files = new Map<string, number>();
  start(id: string, name: string, input: unknown, cwd: string): void {
    if (name !== 'Read') return;
    const path = safePath((input as { file_path?: unknown } | null)?.file_path, cwd);
    if (!path) return;
    this.pending.set(id, path);
    if (this.pending.size > 100) this.pending.delete(this.pending.keys().next().value!);
  }
  finish(id: string, content: unknown, failed = false): void {
    const path = this.pending.get(id); this.pending.delete(id);
    if (!path || failed) return;
    const blocks = typeof content === 'string' ? [content] : Array.isArray(content)
      ? content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text as string) : [];
    const tokens = Math.ceil(blocks.reduce((n, text) => n + text.length, 0) / 4);
    if (!tokens || !Number.isSafeInteger(tokens)) return;
    this.files.delete(path); this.files.set(path, tokens);
    if (this.files.size > 100) this.files.delete(this.files.keys().next().value!);
  }
  clear(): void { this.pending.clear(); this.files.clear(); }
  project(snapshot: ContextSnapshot): ContextSnapshot {
    const files = [...this.files].reverse().map(([path, tokens]) => ({ path, tokens }));
    const seen = new Set(files.map(f => f.path));
    files.push(...snapshot.context.files.filter(f => !seen.has(f.path)));
    return { ...snapshot, context: breakdown(snapshot.usage.used, snapshot.context.categories, files, snapshot.context.lastCompaction) };
  }
}
