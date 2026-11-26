import { columnLabel, statusWord, isStatusColumn, isTimeColumn, isNumberColumn, toNumber, cellText } from "./visual-labels.js";
export const TONE_ORDER = Object.freeze(["stop", "wait", "go", "done", "idle"]);
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
export function tableColumns(block, view = null) {
  const rows = (block?.rows ?? []).filter(Array.isArray);
  const columns = (block?.columns ?? []).map((raw, index) => {
    const key = String(raw), values = rows.map((row) => row[index]);
    const kind = /^(id|#)$/i.test(key) ? "id" : isStatusColumn(key, values) ? "status" : isTimeColumn(key, values) ? "time" : isNumberColumn(values) ? "num" : "text";
    const length = values.reduce((sum, value) => sum + [...String(value ?? "")].length, 0) / Math.max(1, values.length);
    return { key, index, kind, label: columnLabel(key, view), clamp: false, length };
  });
  const longest = columns.filter((column) => column.kind === "text").sort((a, b) => b.length - a.length || a.index - b.index)[0];
  if (longest) longest.clamp = true;
  return columns.map(({ length, ...column }) => column);
}
export function keyColumn(rows, columns, before = null) {
  const unique = (list, column) => new Set(list.map((row) => String(row?.[column.index] ?? ""))).size === list.length;
  const id = columns.find((column) => column.kind === "id"), order = id ? [id, ...columns.filter((column) => column !== id)] : columns;
  return order.find((column) => unique(rows, column) && (!before || unique(before, column))) ?? null;
}
export const rowKey = (row, n, by) => by ? String(row?.[by.index] ?? "") : "#" + n;
export const firstDirection = (column) => column.kind === "num" || column.kind === "time" ? "desc" : "asc";
export function nextSort(sort, column) {
  if (sort?.index === column.index) return { index: column.index, dir: sort.dir === "asc" ? "desc" : "asc" };
  return { index: column.index, dir: firstDirection(column) };
}
export function sortedOrder(rows, columns, sort, view = null) {
  const order = rows.map((_, n) => n);
  const column = sort && columns.find((one) => one.index === sort.index);
  if (!column) return order;
  const sign = sort.dir === "desc" ? -1 : 1, at = (n) => rows[n]?.[column.index];
  const empty = (value) => value == null || value === "";
  const compare = (a, b) => {
    const x = at(a), y = at(b);
    if (empty(x) || empty(y)) return empty(x) && empty(y) ? 0 : empty(x) ? "last-a" : "last-b";
    if (column.kind === "status") {
      const p = statusWord(x, view), q = statusWord(y, view);
      return sign * (TONE_ORDER.indexOf(p.tone) - TONE_ORDER.indexOf(q.tone) || collator.compare(p.word, q.word));
    }
    if (column.kind === "id" || column.kind === "num") {
      const p = toNumber(x), q = toNumber(y);
      if (Number.isNaN(p) || Number.isNaN(q)) return Number.isNaN(p) && Number.isNaN(q) ? sign * collator.compare(String(x), String(y)) : Number.isNaN(p) ? "last-a" : "last-b";
      return sign * (p - q);
    }
    if (column.kind === "time") return sign * (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0);
    return sign * collator.compare(cellText(column.key, x, view), cellText(column.key, y, view));
  };
  return order.sort((a, b) => {
    const result = compare(a, b);
    return result === "last-a" ? 1 : result === "last-b" ? -1 : result || a - b;
  });
}
export function changes(before, rows, columns, by = keyColumn(rows, columns, before)) {
  const added = new Set(), cells = new Set();
  if (!before) return { added, cells };
  const old = new Map(before.map((row, n) => [rowKey(row, n, by), row]));
  for (const [n, row] of rows.entries()) {
    const key = rowKey(row, n, by), was = old.get(key);
    if (!was) {
      added.add(key);
      continue;
    }
    for (const column of columns) if (String(was[column.index] ?? "") !== String(row[column.index] ?? "")) cells.add(key + "\0" + column.index);
  }
  return { added, cells };
}
