import { zoned } from "./zone.js";
import { originFirst } from "./requests.js";
export function completedRequests(item) {
  if (Array.isArray(item.requests)) return originFirst(item.requests);
  return item.request_id != null || item.request_text ? [{ id: item.request_id, at: item.request_at, request_text: item.request_text, how: "origin" }] : [];
}
export function mergeCompleted(items, incoming) {
  const merged = new Map(incoming.map((item) => [item.goal_id, item]));
  for (const item of items) if (!merged.has(item.goal_id)) merged.set(item.goal_id, item);
  return [...merged.values()];
}
export function overlapsCompleted(items, incoming) {
  const ids = new Set(items.map((item) => item.goal_id));
  return incoming.some((item) => ids.has(item.goal_id));
}
export async function reconnectCompleted(items, snapshot, fetchPage) {
  let incoming = snapshot.items, cursor = snapshot.next;
  for (let pages = 0; !overlapsCompleted(items, incoming); pages++) {
    if (!cursor || pages === 2) return null;
    const page = await fetchPage(cursor, 50);
    incoming = mergeCompleted(page.items, incoming);
    cursor = page.next;
  }
  return incoming;
}
const zoneDay = zoned("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
export function completedDays(items) {
  const groups = new Map();
  for (const item of items) {
    const key = zoneDay.format(new Date(item.done_at));
    if (!groups.has(key)) groups.set(key, { key, at: item.done_at, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
export function completedCounts(total, counts) {
  return { all: String(total), done: String(counts?.done ?? "—"), dropped: String(counts?.dropped ?? "—") };
}
const STATUSES = ["done", "dropped"];
const posId = (v) => Number.isSafeInteger(v) && v > 0 ? v : null, text = (v) => typeof v === "string" ? v : "", note = (v) => typeof v === "string" && v.trim() ? v : null;
const count = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null, isTime = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const ask = (r) => ({ id: posId(r.id), at: typeof r.at === "string" ? r.at : null, request_text: text(r.request_text), how: text(r.how) });
export function normalize(field) {
  if (!Array.isArray(field?.items)) return null;
  const items = [], seen = new Set();
  for (const g of field.items) {
    if (!g || typeof g !== "object" || !posId(g.goal_id) || seen.has(g.goal_id) || !STATUSES.includes(g.status) || !isTime(g.done_at)) continue;
    seen.add(g.goal_id);
    const item = { goal_id: g.goal_id, title: text(g.title), status: g.status, done_at: g.done_at, request_id: posId(g.request_id), request_text: text(g.request_text), result: note(g.result) };
    if (typeof g.request_at === "string") item.request_at = g.request_at;
    if (Array.isArray(g.requests)) item.requests = g.requests.filter((r) => r && typeof r === "object").map(ask);
    items.push(item);
  }
  const { next, total, counts } = field;
  return { items, next: typeof next === "string" && next ? next : null, total: count(total), counts: counts && typeof counts === "object" ? { done: count(counts.done), dropped: count(counts.dropped) } : null };
}
