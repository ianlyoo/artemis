import { getJSON, paths } from "./api.js";
export const PREVIEW_ID = /^[0-9a-f]{8}$/;
export const AGAIN = 1e4;
const origin = (raw) => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.origin === raw ? raw : null;
  } catch {
    return null;
  }
};
const text = (raw, max) => typeof raw === "string" ? raw.slice(0, max) : "";
const when = (raw) => typeof raw === "string" && Number.isFinite(Date.parse(raw)) ? raw : null;
export function readPreviews(body) {
  const previews = (Array.isArray(body?.previews) ? body.previews : []).filter((p) => PREVIEW_ID.test(String(p?.id)) && origin(p?.origin) && when(p?.started_at)).map((p) => ({ id: p.id, origin: p.origin, title: text(p.title, 120), agent: text(p.agent?.title, 200), agentId: text(p.agent?.id, 200), goal: Number.isSafeInteger(p.goal) ? p.goal : null, project: Number.isSafeInteger(p.project) ? p.project : null, startedAt: p.started_at, reload: p.reload === "watch" ? "watch" : "hmr", dataSource: text(p.data_source, 200), idleS: Number.isFinite(p.idle_s) ? p.idle_s : null, session: when(p.session?.started_at) ? { startedAt: p.session.started_at } : null }));
  return { slots: Number.isSafeInteger(body?.slots) && body.slots >= 0 ? body.slots : 0, previews };
}
const list = { state: "idle", slots: 0, previews: [], at: 0, reading: null, timer: null, viewers: new Set(), listeners: new Set() };
export const previewList = () => ({ state: list.state, slots: list.slots, previews: list.previews });
export const previewOf = (id) => list.previews.find((p) => p.id === id) ?? null;
export function readList(api) {
  if (list.state === "idle") list.state = "loading";
  list.reading ??= getJSON(api, paths.previews()).then((answer) => {
    list.at = Date.now();
    const before = JSON.stringify([list.state, list.previews]);
    if (answer.ok) Object.assign(list, readPreviews(answer.body), { state: "ready" });
    else if (list.state !== "ready") list.state = "failed";
    return before !== JSON.stringify([list.state, list.previews]);
  }, () => {
    if (list.state !== "ready") list.state = "failed";
    return true;
  }).then((changed) => {
    list.reading = null;
    if (changed) for (const fn of [...list.listeners]) fn(previewList());
  });
  return list.reading;
}
export function followList(api, node, fn) {
  list.listeners.add(fn);
  list.viewers.add(node);
  if (Date.now() - list.at > 2e3 || list.state === "idle") void readList(api);
  if (!list.timer) list.timer = setInterval(() => {
    for (const viewer of [...list.viewers]) if (!viewer.isConnected) list.viewers.delete(viewer);
    if (!list.viewers.size) {
      clearInterval(list.timer);
      list.timer = null;
      return;
    }
    if (document.visibilityState === "visible") void readList(api);
  }, AGAIN);
  return () => {
    list.listeners.delete(fn);
    list.viewers.delete(node);
  };
}
export function minutesSince(at, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 6e4));
}
export function resetPreviewList() {
  clearInterval(list.timer);
  Object.assign(list, { state: "idle", slots: 0, previews: [], at: 0, reading: null, timer: null });
  list.viewers.clear();
  list.listeners.clear();
}
