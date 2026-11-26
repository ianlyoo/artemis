let boardTitles = new Map();
const watchers = new Set();
export function rememberBoardTitles(rows) {
  if (!Array.isArray(rows)) return;
  boardTitles = new Map(rows.filter((row) => row?.title && (row.path_key || row.id)).map((row) => [String(row.path_key || row.id), String(row.title)]));
  for (const watcher of [...watchers]) {
    try {
      watcher();
    } catch {
    }
  }
}
export const knownBoardTitle = (id) => boardTitles.get(String(id ?? "")) ?? null;
export function onBoardTitles(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
