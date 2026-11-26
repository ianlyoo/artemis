import { when, elapsed } from "../mobile/format.js";
import { wall, dayStart } from "../zone.js";
import { poolName } from "../antigravity.js";
import { permitLine } from "../chat/choices.js";
import { startQueueAge } from "./admin-model.js";
import { ms } from "../model.js";
import { stepHref } from "../step-route.js";
import { leadKo, leadRole, l10n, lead } from "../names.js";
const ASKED = { get approval() {
  return l10n("승인 질문", "Approval");
}, get question() {
  return l10n(leadKo() + " 질문", "Question from " + lead());
}, get step() {
  return l10n("내 차례", "My turn");
} };
function turnView(t, ui, now) {
  const href = t.kind === "approval" ? "#/approvals/" + encodeURIComponent(t.id) : t.kind === "question" ? "#/" + leadRole() + "/question/" + encodeURIComponent(t.id) : t.kind === "step" ? stepHref(t.id, t.link) : null;
  const st = t.kind === "step" ? ui.steps?.(t.id) ?? {} : null, band = permitLine(t.permission);
  return { key: t.key, kind: t.kind, id: t.id, line: t.line, href, external: /^https?:/.test(href ?? ""), word: ASKED[t.kind] ?? (t.state === "blocked" ? l10n("막힘", "Stuck") : l10n("내 차례", "My turn")), answer: t.kind === "approval" || t.kind === "question", quote: t.kind === "goal" ? "Answer" : l10n("메모", "Note"), done: st && { pending: !!st.pending, error: st.error || "" }, permit: band && { asks: band.asks, act: band.act, aim: band.aim }, age: t.since ? { text: elapsed(t.since, now), title: when(t.since, now) } : null };
}
const monthDay = (v) => {
  const d = new Date(wall(ms(v)));
  return d.getUTCMonth() + 1 + "/" + d.getUTCDate();
};
const whenShort = (v, now) => dayStart(ms(v)) === dayStart(now) ? when(v, now) : monthDay(v);
const sinceWord = (v, now) => {
  const at = dayStart(ms(v)) === dayStart(now) ? when(v, now) : monthDay(v);
  return l10n(at + "부터", "since " + at);
};
export const filterKey = (c) => c.state === "person" ? "person:" + c.who : c.state;
const SIZE = { owner: "lg", blocked: "lg", running: "lg", person: "md" };
export const workSize = (state) => SIZE[state] || "sm";
const marks = (agents, now) => [...new Set(agents.map((a) => a.role))].map((role) => {
  const on = agents.filter((a) => a.role === role);
  return { role, busy: on.some((a) => a.busy), n: on.length, title: on.map((a) => [a.name, a.host, a.seat, a.model, a.at ? elapsed(a.at, now) : ""].filter(Boolean).join(", ")).join("\n") };
});
const moreView = (c, now) => ({ facts: [["ETA", c.eta?.word], ["Check", c.check && when(c.check, now)]].filter(([, v]) => v), asks: c.asks.map((r) => ({ key: r.key, at: r.at, time: when(r.at, now), words: r.words })), parts: c.stage.parts.map((p) => ({ id: p.id, state: p.state, title: p.title, why: p.state !== "done" ? p.why || "" : "" })), agents: c.agents.map((a) => ({ key: a.key, name: a.name, host: a.host, seat: a.seat || "", task: a.task, time: a.at ? elapsed(a.at, now) : "", busy: a.busy })) });
const HOUR = 36e5;
const track = (v, now, hours = 24) => {
  const t = ms(v);
  return Number.isFinite(t) && t >= now && t - now <= hours * HOUR ? Math.round((t - now) / (hours * HOUR) * 1e3) / 10 : null;
};
const span = (cards, now) => {
  const last = Math.max(0, ...cards.flatMap((c) => [ms(c.check), ms(c.eta?.at)]).filter((t) => Number.isFinite(t) && t >= now && t - now <= 24 * HOUR).map((t) => t - now));
  return [6, 12, 24].find((h) => last <= h * HOUR);
};
function rowView(c, now, ui, label) {
  const open = !!ui.expanded?.has(c.key), d = c.doing?.what ? c.doing : null, far = !!c.check && dayStart(ms(c.check)) !== dayStart(now);
  return { key: c.key, state: c.state, group: filterKey(c), said: !c.attention?.length && c.word && c.word !== label ? c.word : "", tone: c.tone || c.state, size: c.size || workSize(c.state), title: c.title, full: c.full || c.title, estimate: c.eta?.text || "", status: c.attention?.length ? { text: c.attention.map((a) => a.line).join(" · "), tone: "stuck", title: c.attention.map((a) => a.line + (a.why ? " · " + String(a.why).trim() : "")).join("\n") } : { text: c.word, tone: c.tone || null, title: "" }, queue: c.startQueue ? { text: l10n("대기 " + c.startQueue.position + "번째", "Queued #" + c.startQueue.position), age: startQueueAge(c.startQueue.since, now), since: c.startQueue.since } : null, next: { who: c.next?.who || "", what: c.next?.what || "" }, doing: d ? { who: d.who || "", what: d.what, since: d.since && ms(d.since) ? sinceWord(d.since, now) : "", same: !!d.same, title: l10n("지금 하는 일: ", "Doing now: ") + [d.who, d.what, d.since && sinceWord(d.since, now)].filter(Boolean).join(" · ") } : null, when: { text: c.check ? whenShort(c.check, now) : "", far, title: c.check ? "Check " + when(c.check, now) : "", at: track(c.check, now, ui.hours), eta: track(c.eta?.at, now, ui.hours), etaTitle: c.eta?.at && track(c.eta.at, now, ui.hours) != null ? "ETA " + when(c.eta.at, now) : "" }, stage: { parts: c.stage.parts.map((p) => ({ id: p.id, state: p.state, title: p.title })), done: c.stage.done, total: c.stage.total }, marks: marks(c.agents, now), asks: c.asks.length, open, current: ui.goto === c.key, more: open ? moreView(c, now) : null, turn: c.turn ? c.turn.map((t) => turnView(t, ui, now)) : null };
}
export function boardView(x, ui = {}) {
  const slices = x.slices.map((s) => ({ key: s.key, state: s.state, label: s.label || s.state, n: s.n })), label = new Map(slices.map((s) => [s.key, s.label]));
  const hours = span(x.work, x.now), rows = x.work.filter((c) => !ui.filter || filterKey(c) === ui.filter).map((c) => rowView(c, x.now, { ...ui, hours }, label.get(filterKey(c))));
  const empty = x.work.length ? "" : l10n("열린 요청이 없어요.", "No open requests.");
  const later = (x.later || []).map((c) => ({ key: c.key, title: c.title, full: c.full, back: when(c.later, x.now), what: c.next?.what || "" }));
  return { work: x.work.length, asks: x.counts.requests, attention: x.counts.attention ?? 0, completed: Number(ui.completed ?? 0), slices, filter: ui.filter ?? null, rows, empty, hours, later };
}
export function dayView(day) {
  if (!day || typeof day !== "object") return null;
  const n = (v) => Number.isSafeInteger(v) && v > 0 ? v : 0, done = n(day.done), asked = n(day.asked), stuck = n(day.stuck);
  const parts = [{ key: "done", n: done, before: "", after: l10n("건 완료", " done") }, { key: "asked", n: asked, before: l10n("", "asked you "), after: l10n("번 물어봄", "×") }, ...stuck ? [{ key: "stuck", n: stuck, before: "", after: l10n("건 막힘", " stuck") }] : []];
  const label = l10n("오늘", "Today");
  return { label, parts, text: [label, ...parts.map((p) => p.before + p.n + p.after)].join(" · ") };
}
export function overviewView(x, ui = {}) {
  const slices = x.slices.map((s) => ({ key: s.key, state: s.state, label: s.label || s.state, n: s.n }));
  return { total: slices.reduce((n, s) => n + s.n, 0), slices, filter: ui.filter ?? null, crew: crewView(x), busy: x.load.busy, idle: x.load.idle, day: dayView(ui.day) };
}
export const CREW_LINES = 6;
const steady = (a, b) => Number(b.stuck) - Number(a.stuck) || Number(b.busy) - Number(a.busy) || String(a.key).localeCompare(String(b.key));
const by = (list, key) => {
  const m = new Map();
  for (const a of list) {
    const k = a[key] || "—";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  return [...m].map(([label, agents]) => ({ label, n: agents.length, agents: agents.sort(steady) })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
};
function crewView(x) {
  const order = new Map(x.all.map((c, i) => [c.key, i])), card = new Map(x.all.map((c) => [c.key, c])), board = new Set(x.work.map((c) => c.key));
  const lines = new Map(), standing = [];
  for (const a of x.agents) {
    const work = a.standing || !a.goal ? null : "goal:" + a.goal.id;
    const one = { key: a.key, name: a.name, role: a.role || a.name, state: a.label, busy: !!a.busy, stuck: !!a.stuck, host: a.host || "", on: a.project ? "#" + a.project.id + " " + a.project.title : a.goal ? "#" + a.goal.id + " " + a.goal.title : "", task: a.task || "", where: [a.host, a.seat].filter((v) => v && v !== "—").join(" · "), model: [String(a.model || "").replace(/^claude-/, ""), a.effort].filter(Boolean).join(" "), time: a.at ? elapsed(a.at, x.now) : "" };
    if (!work) {
      standing.push(one);
      continue;
    }
    if (!lines.has(work)) {
      const c = card.get(work);
      lines.set(work, { key: work, title: a.work || one.on, state: c ? c.tone || c.state : "waiting", go: board.has(work), agents: [] });
    }
    lines.get(work).agents.push(one);
  }
  const line = (l) => ({ ...l, n: l.agents.length, stuck: l.agents.some((a) => a.stuck), roles: by(l.agents, "role"), hosts: by(l.agents, "host").map(({ label, n }) => ({ label, n })) });
  const all = [...lines.values()].sort((a, b) => b.agents.length - a.agents.length || (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  return { n: x.agents.length, lines: all.map(line), box: CREW_LINES, standing: standing.length ? line({ key: "standing", title: l10n("상시", "Standing"), state: "idle", go: false, agents: standing }) : null };
}
export function railView(x) {
  const L = x.load;
  const hosts = L.hosts.map((h) => ({ key: h.key, label: h.label, online: h.online, state: h.online ? "" : h.state, busy: h.busy, active: h.active, cpu: h.cpu == null ? null : Math.round(h.cpu * 100), hot: h.cpu != null && h.cpu >= 0.85, title: [h.label, h.online ? "" : h.state, h.active ? h.busy + " of " + h.active + " agents busy" : "", h.cpu == null ? "" : "CPU " + Math.round(h.cpu * 100) + "%"].filter(Boolean).join(", ") }));
  const seats = L.seats.map((s) => ({ key: s.key, use: s.use, week: s.week ?? null, red: s.red, busy: s.busy, agents: s.agents, title: [s.key, "5 h " + (s.use == null ? "—" : s.use + "%") + (s.resets ? " (resets " + when(s.resets, x.now) + ")" : ""), "week " + (s.week == null ? "—" : s.week + "%") + (s.weekResets ? " (resets " + when(s.weekResets, x.now) + ")" : ""), s.agents ? s.busy + " of " + s.agents + " agents busy" : ""].filter(Boolean).join(", ") }));
  const pct = (v) => v == null ? "—" : Math.round(v) + "%", reset = (v) => v ? " (resets " + when(v, x.now) + ")" : "";
  const antigravity = (L.antigravity || []).map((a) => ({ key: a.key, state: a.state, status: a.status, pools: a.pools.map((p) => ({ key: a.key + ":" + p.name, name: poolName(p.name), use: p.five_hour == null ? null : Math.round(p.five_hour), week: p.weekly == null ? null : Math.round(p.weekly), under: l10n("주간 ", "Week ") + pct(p.weekly), reset: p.five_hour_resets_at ? "↻ " + when(p.five_hour_resets_at, x.now) : "", title: ["Antigravity " + a.key, p.name, "5 h " + pct(p.five_hour) + reset(p.five_hour_resets_at), "week " + pct(p.weekly) + reset(p.weekly_resets_at), a.status].filter(Boolean).join(", ") })) }));
  const roles = L.roles.map((r) => ({ key: r.key, label: r.label, busy: r.busy, total: r.total }));
  return { busy: L.busy, idle: L.idle, hosts, seats, antigravity, roles };
}
export function adminHTML() {
  return '<div class="adm-page" data-key="page"><div class="adm-main" data-key="main"><div class="adm-isl adm-isl-overview" data-key="isl-overview" data-own data-astryx-island="admin"></div><div class="adm-isl adm-isl-board" data-key="isl-board" data-own data-astryx-island="admin"></div></div><aside class="adm-side" data-key="side" aria-label="Load"><div class="adm-isl adm-isl-rail" data-key="isl-rail" data-own data-astryx-island="admin"></div></aside></div>';
}
