import { seatFigures } from "./seats.js";
import { esc, date, time } from "./mobile/format.js";
import { withZone } from "./zone.js";
const WINDOWS = [["five_hour", "5H"], ["weekly", "주간"], ["fable_weekly", "Fable 주간"]];
const BINS = 40;
function smoothPath(pts) {
  const n = pts.length, f = (v) => v.toFixed(1);
  if (n === 1) return "M" + f(pts[0].x) + "," + f(pts[0].y);
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x || 1e-6));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (d[i - 1] + d[i]) / ((2 * d[i] + d[i - 1]) / d[i] + (d[i] + 2 * d[i - 1]) / d[i - 1]);
  let path = "M" + f(pts[0].x) + "," + f(pts[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1], h = (q.x - p.x) / 3;
    path += " C" + f(p.x + h) + "," + f(p.y + m[i] * h) + " " + f(q.x - h) + "," + f(q.y - m[i + 1] * h) + " " + f(q.x) + "," + f(q.y);
  }
  return path;
}
function spark(series, label, reset) {
  const end = Date.parse(reset), start = end - 7 * 24 * 60 * 60 * 1e3;
  const samples = (series?.points || []).filter((p) => Number.isFinite(p.value) && Date.parse(p.at) >= start && Date.parse(p.at) <= end).map((p) => ({ x: end === start ? 100 : (Date.parse(p.at) - start) / (end - start) * 100, y: 38 - Math.max(0, Math.min(100, p.value)) * 0.36 })).sort((a, b) => a.x - b.x);
  const bins = new Map();
  for (const p of samples) {
    const k = Math.min(BINS - 1, Math.floor(p.x / 100 * BINS)), b = bins.get(k) || { x: 0, y: 0, n: 0 };
    b.x += p.x;
    b.y += p.y;
    b.n++;
    bins.set(k, b);
  }
  const pts = [...bins.keys()].sort((a, b) => a - b).map((k) => {
    const b = bins.get(k);
    return { x: b.x / b.n, y: b.y / b.n };
  });
  if (pts.length) {
    pts[0] = { ...samples[0] };
    pts[pts.length - 1] = { ...samples.at(-1) };
  }
  if (pts.length > 1 && pts[0].x === pts.at(-1).x) pts.splice(1);
  const last = pts.at(-1);
  const range = Number.isFinite(end) ? withZone(date(start) + " " + time(start) + " – " + date(end) + " " + time(end)) : "";
  return '<div class="seat-graph" title="' + esc(range) + '">' + (last ? '<svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="' + esc(label + " 사용량, 0–100%, " + range) + '"><path class="baseline" d="M0 2H100 M0 38H100"/><path class="seat-line" d="' + smoothPath(pts) + '"/></svg><i class="seat-dot" style="left:' + last.x.toFixed(1) + "%;top:" + (last.y / 40 * 100).toFixed(1) + '%"></i>' : '<span class="seat-unknown" aria-label="' + esc(label) + ' 기록 없음">—</span>') + "</div>";
}
export function seatUsageHTML(seat) {
  const f = seatFigures(seat.data);
  return spark(seat.history?.weekly, "주간", f.weekly_resets_at) + windowsHTML(f) + ticketsHTML(seat.tickets);
}
export function windowsHTML(f, windows = WINDOWS) {
  return '<div class="seat-usage">' + windows.map(([key, label]) => {
    const reset = f[key + "_resets_at"];
    return '<div class="seat-window' + (key === "five_hour" ? "" : " week") + '" data-window="' + key + '"><span class="seat-window-label">' + label + '</span><b class="seat-percent">' + (f[key] == null ? '<span class="seat-unknown">—</span>' : Math.round(f[key]) + " %") + '</b><div class="meter"><i style="--value:' + Math.min(100, f[key] || 0) + '%"></i></div><small class="seat-reset">↻ ' + (reset ? date(reset) + " " + time(reset) : "—") + "</small></div>";
  }).join("") + "</div>";
}
const TICKETS = [["weekly", "주간"], ["fable", "Fable"]];
function ticketsHTML(tickets) {
  const held = TICKETS.filter(([kind]) => tickets?.[kind]);
  return held.length ? '<small class="seat-reset seat-tickets">초기화 티켓 · ' + held.map(([kind, label]) => {
    const t = tickets[kind];
    return esc(label) + " " + t.count + (t.count && t.expires_at ? " (~" + date(t.expires_at) + " " + time(t.expires_at) + ")" : "");
  }).join(" · ") + "</small>" : "";
}
