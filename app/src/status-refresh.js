import { esc, time } from "./mobile/format.js";
export const WAIT = 2e4;
export const LABEL = "새로고침", STALE = "아직 전 수치예요", KEPT = "방금 읽은 수치예요";
export function seatsAt(dashboard) {
  let newest = null;
  for (const seat of dashboard?.resources?.seats || []) {
    const at = Date.parse(seat?.at);
    if (Number.isFinite(at) && (newest === null || at > newest)) newest = at;
  }
  return newest;
}
export function createStatusRefresh({ post, changed = () => {
}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let at = null, before = null, busy = false, note = "", timer = null, noteTimer = null;
  const newer = () => at !== null && (before === null || at > before);
  const settle = (text) => {
    busy = false;
    note = text;
    clearTimer(timer);
    timer = null;
    clearTimer(noteTimer);
    noteTimer = text === KEPT ? setTimer(() => {
      if (note === KEPT) {
        note = "";
        changed();
      }
    }, WAIT) : null;
  };
  const finish = (text) => {
    settle(text);
    changed();
  };
  const answer = async (response) => {
    if (!busy) return;
    let body = null;
    try {
      body = await response.json();
    } catch {
    }
    if (!busy) return;
    if (response.ok && Array.isArray(body?.read)) {
      if (!body.read.length) return finish(Object.keys(body.failed || {}).length ? STALE : KEPT);
      if (newer()) return finish("");
      return;
    }
    if (body?.error !== "hq_http_504") finish(STALE);
  };
  return { get busy() {
    return busy;
  }, get note() {
    return note;
  }, get at() {
    return at;
  }, update(dashboard) {
    at = seatsAt(dashboard);
    if (newer() && (busy || note)) settle("");
  }, press() {
    if (busy) return false;
    busy = true;
    note = "";
    before = at;
    clearTimer(noteTimer);
    timer = setTimer(() => {
      if (busy) finish(STALE);
    }, WAIT);
    changed();
    Promise.resolve().then(post).then(answer, () => {
      if (busy) finish(STALE);
    });
    return true;
  }, html(button) {
    return '<span class="status-refresh"><time class="refresh-at"' + (at === null ? "" : ' datetime="' + esc(new Date(at).toISOString()) + '"') + ">" + esc(time(at)) + " 기준</time>" + button('data-status-refresh aria-busy="' + busy + '"' + (busy ? ' aria-disabled="true"' : "")) + "</span>";
  }, noteHTML(klass) {
    return note ? '<div class="' + klass + '" role="status">' + esc(note) + "</div>" : "";
  } };
}
export const refreshRequest = (api) => () => api("/resources/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", expected: ["502 hq_http_504"] });
