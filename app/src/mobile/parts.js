import { esc, glyph } from "./format.js";
import { perMinute, busyMinutes, MINUTES } from "./activity.js";
import { icon } from "./icons.js";
export const section = (key, label, inner) => '<section class="m-sec" data-key="' + esc(key) + '" aria-label="' + esc(label) + '">' + inner + "</section>";
export const head = (name, count = null, state = "", aside = "") => '<h2 class="m-h"><span class="m-h-name">' + esc(name) + "</span>" + (count != null ? '<b class="m-n"' + (state ? ' data-state="' + state + '"' : "") + ">" + esc(count) + "</b>" : "") + (aside ? '<span class="m-h-aside">' + aside + "</span>" : "") + "</h2>";
export const MARKED = new Set(["running", "warning", "owner"]);
export const mark = (s) => MARKED.has(s) ? '<i class="m-mark" data-state="' + s + '">' + glyph(s) + "</i>" : "";
export const caret = () => icon("chevron", "m-caret");
export const level = (v) => v >= 80 ? "bad" : v >= 60 ? "warn" : "ok";
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
export const meter = (value, high = false, klass = "") => '<span class="m-meter' + (klass ? " " + klass : "") + '" data-level="' + (high ? "bad" : level(clamp(value))) + '"><i style="--value:' + clamp(value) + '%"></i></span>';
export function minuteBar(spans, now, state) {
  const bins = perMinute(spans, now), busy = busyMinutes(bins), label = "busy " + busy + " of the last " + MINUTES + " min";
  return '<span class="m-bar" data-state="' + esc(state) + '" role="img" aria-label="' + label + '" title="' + label + '">' + bins.map((b) => b.n ? "<i" + (b.state === "waiting" ? " data-queued" : "") + ' style="--n:' + Math.min(b.n, 3) + '"></i>' : "<i></i>").join("") + "</span>";
}
