import { l10n } from "../names.js";
import { zoned, dayStart } from "../zone.js";
const clock = zoned("en-GB", { hour: "2-digit", minute: "2-digit" }), day = zoned("en-US", { month: "numeric", day: "numeric" });
const at = (v) => typeof v === "number" ? v : v ? Date.parse(v) : NaN;
export const DAY = 864e5;
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const time = (v) => Number.isFinite(at(v)) ? clock.format(at(v)) : "—";
export const date = (v) => Number.isFinite(at(v)) ? day.format(at(v)) : "—";
export const when = (v, now = Date.now()) => date(v) === date(now) ? time(v) : date(v) + " " + time(v);
export const glyph = (s) => ({ running: "●", owner: "▲", done: "✓", idle: "○", waiting: "◷", warning: "△", unrouted: "○" })[s] || "○";
export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export function shortTitle(title) {
  const t = clean(title), cut = t.search(/\s*[:：]\s/);
  return (cut > 0 ? t.slice(0, cut) : t).replace(/(\s*[(（][^()（）]*[)）])+$/, "").trim() || t;
}
export function elapsed(since, now = Date.now()) {
  const t = at(since);
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor(Math.max(0, now - t) / 6e4), h = Math.floor(m / 60);
  return m < 60 ? m + "m" : h < 24 ? h + "h" + String(m % 60).padStart(2, "0") + "m" : Math.floor(h / 24) + "d" + String(h % 24).padStart(2, "0") + "h";
}
export function koElapsed(since, now = Date.now()) {
  const t = at(since);
  if (!Number.isFinite(t)) return "—";
  const m = Math.floor(Math.max(0, now - t) / 6e4), h = Math.floor(m / 60);
  return l10n(m < 1 ? "방금" : m < 60 ? m + "분" : h < 24 ? h + "시간" + (m % 60 ? " " + m % 60 + "분" : "") : Math.floor(h / 24) + "일" + (h % 24 ? " " + h % 24 + "시간" : ""), m < 1 ? "just now" : elapsed(since, now));
}
export function koDayCount(since, now = Date.now()) {
  const t = at(since), n = at(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return "";
  const days = Math.round((dayStart(n) - dayStart(t)) / DAY);
  return days >= 1 ? l10n(days + 1 + "일째", "day " + (days + 1)) : "";
}
