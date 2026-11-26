import { seatUsageHTML } from "../seat-usage.js";
import { codexCapacity } from "../codex.js";
import { apiCredit } from "../api.js";
import { antigravityRows, antigravityHTML } from "../antigravity.js";
import { hostRows, hostHealth, hostMetrics, hostWorkHTML } from "../host-switches.js";
import { seatFigures, seatWord } from "../seats.js";
import { esc, time, date } from "./format.js";
import { section, head, meter, caret } from "./parts.js";
import { icon } from "./icons.js";
import { jobsHTML, kept } from "../running.js";
import { has } from "../names.js";
import { withZone } from "../zone.js";
const seatPercent = (v) => v == null ? "—" : Math.round(v) + " %";
const seatReset = (v) => v ? date(v) + " " + time(v) : "";
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
export function resourceRows(model) {
  const res = model.d.resources || {}, seats = res.seats || [], hosts = hostRows(model.d);
  const allWeekly = seats.some((s) => seatFigures(s.data).weekly != null);
  return { allWeekly, codex: codexCapacity(res.codex), api: apiCredit(res.api), antigravity: antigravityRows(res.antigravity), seats: seats.map((s) => {
    const d = s.data || {}, f = seatFigures(d), n = model.nodes.get("seat:" + s.key), expired = s.fault === true && !d.red;
    return { sample: s, key: s.key, fault: s.fault === true, state: n.state, busy: n.busy, active: n.active, why: n.why?.join(" · "), status: expired ? d.status !== "OK" ? seatWord(s) : "NO FIGURES" : n.busy + "/" + n.active + " BUSY", five: seatPercent(f.five_hour), fiveValue: clamp(f.five_hour), fiveReset: seatReset(f.five_hour_resets_at), fable: seatPercent(f.fable_weekly), fableValue: clamp(f.fable_weekly), fableReset: seatReset(f.fable_weekly_resets_at), all: seatPercent(f.weekly), allValue: clamp(f.weekly), allReset: seatReset(f.weekly_resets_at) };
  }), hosts: hosts.map((h) => {
    const n = model.nodes.get("host:" + h.key) || { state: "idle", busy: 0, active: 0 }, health = hostHealth(h, model.now);
    return { workHTML: hostWorkHTML(h), key: h.key, label: h.label, state: n.state, busy: n.busy, active: n.active, why: n.why?.join(" · "), ...health, ...hostMetrics(h, res.gpu, health.muted) };
  }) };
}
const why = (r) => r.why ? '<p class="m-why-all">' + esc(r.why) + "</p>" : "";
const busy = (r) => '<span class="m-state m-busy" data-state="' + r.state + '">' + r.busy + "/" + r.active + " BUSY</span>";
const gauge = (name, value, fill, { reset = "", high = false, klass = "", figure = "", bar = "", attrs = "", cap = "", again = "" } = {}) => '<div class="m-gauge' + (klass ? " " + klass : "") + '"' + (attrs ? " " + attrs : "") + '><div class="m-gauge-cap"><span class="m-gauge-name' + (cap ? " " + cap : "") + '">' + name + '</span><b class="m-gauge-v' + (figure ? " " + figure : "") + (high ? " high" : "") + '">' + esc(value) + "</b></div>" + meter(fill, high, bar) + (reset ? '<small class="m-gauge-reset' + (again ? " " + again : "") + '">↻ ' + esc(reset) + "</small>" : "") + "</div>";
const fold = (key, klass, line, inner) => '<details class="m-tok' + (klass ? " " + klass : "") + '" data-key="' + esc(key) + '"><summary><span class="m-foot">' + line + "</span>" + caret() + '</summary><div class="m-tok-in">' + inner + "</div></details>";
function seat(r) {
  return '<div class="m-seat" data-key="seat:' + esc(r.key) + '" data-state="' + r.state + '"><div class="m-top"><b class="m-name">' + esc(r.key) + "</b>" + (/ BUSY$/.test(r.status) ? busy(r) : '<span class="m-state m-seat-status" data-state="' + r.state + '">' + esc(r.status) + "</span>") + "</div>" + why(r) + seatUsageHTML(r.sample) + "</div>";
}
function codex(r) {
  const [five, week] = r.windows, stamp = (w) => date(w.reset) + " " + time(w.reset), status = esc(r.status);
  return '<div class="m-seat codex-seat" data-key="seat:codex" data-state="' + r.state + '"><div class="m-top"><b class="m-name">codex</b><span class="m-state m-seat-status" data-state="' + r.state + '">' + status + '</span></div><div class="m-gauges">' + gauge("Weekly", week.percent, week.value, { reset: week.reset ? stamp(week) : "", klass: "codex-weekly", figure: "codex-percent", bar: "week", attrs: 'data-window="weekly"' + (week.reset ? ' title="Reset ' + withZone(stamp(week)) + '"' : "") }) + "</div>" + fold("codex-detail", "codex-detail", "5H " + esc(five.percent), "<p>5H " + esc(five.percent) + (five.reset ? " · ↻ " + withZone(stamp(five)) : "") + "</p>" + (r.reason ? '<p class="m-raw">' + esc(r.reason) + "</p>" : "")) + "</div>";
}
const api = (r) => '<div class="m-seat api-seat" data-key="seat:api" data-state="' + r.state + '"><div class="m-top"><b class="m-name">API</b></div><div class="m-gauges">' + gauge("Monthly", r.figure, r.value, { reset: r.renews, klass: "api-meter", figure: "api-figure", attrs: r.reason ? 'title="' + esc(r.reason) + '"' : "" }) + "</div>" + (r.detail.length ? '<p class="m-foot api-detail">' + r.detail.map(esc).join(" · ") + "</p>" : "") + "</div>";
export const switchButton = (action, name, label, title) => '<button type="button" class="m-icon m-switch" data-host-action="' + esc(action) + '" aria-label="' + esc(label) + '" title="' + esc(title) + '">' + icon(name) + "</button>";
function host(r, switches) {
  const last = r.last, gpu = "free" in last, ok = r.health === "running" && r.status.startsWith("● "), load = /^load \/ (\S+) CPU$/i.exec(r.cpus);
  return '<div class="m-host" data-key="host:' + esc(r.key) + '" data-state="' + r.state + '"><div class="m-top"><b class="m-name">' + esc(r.label || r.key) + "</b>" + (r.health === "running" ? busy(r) : "") + '<span class="m-state m-health' + (r.health === "idle" ? " host-rest" : "") + '" data-state="' + r.health + '">' + esc(ok ? r.status.slice(2) : r.status) + "</span></div>" + why(r) + (r.asleep ? '<p class="m-foot host-sleep-note">Wakes when needed</p>' : "") + '<div class="m-metrics' + (r.muted ? " muted" : "") + '"><div class="m-gauges">' + gauge(esc(load ? load[1] === "—" ? "Load" : "Load · " + load[1] + " CPU" : r.cpus), r.load, r.loadValue, { high: r.high, figure: "m-load", cap: "m-cpus" }) + gauge(gpu ? "GPU" : "Disk", last.value, last.meter, { figure: gpu ? "m-gpu-util" : "m-disk" }) + '</div><p class="m-foot">Free memory <b class="m-mem">' + esc(r.mem) + "</b>" + (gpu ? ' · GPU free <b class="m-gpu-free">' + esc(String(last.free).replace(/ free$/, "")) + "</b>" : "") + "</p></div>" + r.workHTML + (switches?.html(r.key, r) || "") + "</div>";
}
export function resourcesHTML(rows, switches = null, jobs = null) {
  return (jobs ? section("jobs", "Jobs", head("Jobs", jobs.rows?.length || null, "running", esc(kept(jobs))) + '<div class="jobs">' + jobsHTML(jobs) + "</div>") : "") + (has("seats") ? section("seats", "Seats", head("Seats", null, "", rows.allWeekly ? "" : "All weekly unknown") + (rows.seats.map((r) => seat(r)).join("") || '<p class="m-empty">—</p>') + codex(rows.codex) + (rows.antigravity || []).map((r) => antigravityHTML(r, true)).join("") + (rows.api ? api(rows.api) : "")) : "") + (has("hosts") ? section("hosts", "Devices", head("Devices") + (rows.hosts.map((r) => host(r, switches)).join("") || '<p class="m-empty">—</p>')) : "");
}
