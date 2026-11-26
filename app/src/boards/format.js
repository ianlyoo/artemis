import { zoned } from "../zone.js";
const dayFmt = zoned("en-US", { month: "numeric", day: "numeric" });
const clockFmt = zoned("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = zoned("en-US", { weekday: "long" });
const keyFmt = zoned("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const ms = (v) => typeof v === "number" ? v : Date.parse(v);
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const valid = (v) => v != null && v !== "" && Number.isFinite(ms(v));
export const date = (v) => valid(v) ? dayFmt.format(ms(v)) : "—";
export const time = (v) => valid(v) ? clockFmt.format(ms(v)) : "—";
export const when = (v) => valid(v) ? date(v) + " " + time(v) : "—";
export const weekday = (v) => valid(v) ? weekdayFmt.format(ms(v)) : "";
export const dayKey = (v) => valid(v) ? keyFmt.format(ms(v)) : "";
export function byDay(items, stamp) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of items) {
    const at = stamp(item), key = dayKey(at) || "none";
    if (!groups.has(key)) groups.set(key, { key, at, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}
export function plainLines(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  let html = "", list = false;
  for (const line of lines) {
    const item = /^[-•]\s+/.test(line);
    if (item && !list) {
      html += "<ul>";
      list = true;
    }
    if (!item && list) {
      html += "</ul>";
      list = false;
    }
    html += item ? "<li>" + esc(line.replace(/^[-•]\s+/, "")) + "</li>" : "<p>" + esc(line) + "</p>";
  }
  return html + (list ? "</ul>" : "");
}
