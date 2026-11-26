import { buildModel, terminal, standingAgent } from "./model.js";
import { hostName } from "./pc-data.js";
import { activeGoalIds, originRequestId } from "./requests.js";
import { statusWord } from "./chat/visual-labels.js";
import { clean, ms, scrub, stepText, stepLine, STEP_TAG, FILLER, OWN_STEPS, MENTION_STEPS, isReport, TURN_EDGES, FINAL_REPORT, isFinalReport } from "./tl-steps.js";
import { lead, isLead, userKo, myTurn, l10n } from "./names.js";
import { zoned, wall, dayStart } from "./zone.js";
export { clean, ms };
export const MIN = 6e4, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const ended = (s) => terminal(s) || s === "merged";
export const standing = standingAgent;
export const isCodex = (a) => a?.source === "codex" || a?.seat === "codex";
const pick = (o, keys) => {
  const out = {};
  for (const k of keys) if (o?.[k] !== void 0) out[k] = o[k];
  return out;
};
export const EVENT_KEYS = ["id", "at", "kind", "actor", "goal_id", "project_id", "agent_id", "summary"];
const AGENT_KEYS = ["id", "role", "host", "seat", "status", "busy", "goal_id", "project_id", "parent_id", "launcher_id", "launcher_role", "title", "created_at", "last_turn_at", "ended_at", "finished_at", "model", "thinking", "source", "external"];
const GOAL_KEYS = ["id", "title", "status", "waiting_on", "owner_action", "next_check_at", "created_at", "updated_at"];
const PROJECT_KEYS = ["id", "goal_id", "title", "status", "pm_agent_id", "next_check_at", "waiting_on", "opened_at", "closed_at", "created_at", "updated_at"];
const TURN_KEYS = ["kind", "id", "goal_id", "title", "what", "since"];
const NAMED = new WeakSet();
export const namedEvent = (e) => {
  if (NAMED.has(e)) return e;
  const out = pick(e, EVENT_KEYS);
  NAMED.add(out);
  return out;
};
export const namedAgent = (a) => pick(a, AGENT_KEYS);
export const namedGoal = (g) => ({ ...pick(g, GOAL_KEYS), projects: (g.projects || []).filter((p) => p?.id != null).map((p) => ({ ...pick(p, PROJECT_KEYS), goal_id: p.goal_id ?? g.id })) });
export const RANGES = [{ id: "30m", get label() {
  return l10n("30분", "30m");
}, span: 30 * MIN, gap: 3 * MIN }, { id: "2h", get label() {
  return l10n("2시간", "2h");
}, span: 2 * HOUR, gap: 6 * MIN }, { id: "today", get label() {
  return l10n("오늘", "Today");
}, span: 0, gap: 15 * MIN }];
export const rangeOf = (id) => RANGES.find((r) => r.id === id) || RANGES[1];
export function rangeWindow(id, now, horizon = -Infinity) {
  const r = rangeOf(id), day = dayStart(now), start = r.span ? now - r.span : Math.max(day, horizon);
  return { range: r.id, start, end: now + (now - start) * 0.03, now, gap: r.gap, cut: !r.span && horizon > day ? horizon : null };
}
export const historyStart = (now) => Math.min(dayStart(now), now - 2 * HOUR);
const taskTitle = (a) => scrub(a?.title).replace(/^#\d+\s*·\s*/, "").replace(/^PM\d+\s*·\s*/, "");
export function agentName(a, replaced = false) {
  if (isLead(a.role) || a.role === "cto") return (isLead(a.role) ? lead() : "CTO") + (replaced ? l10n(" · 이전", " · earlier") : "");
  if (a.role === "pm" && a.project_id != null) return "PM" + a.project_id + (replaced ? l10n(" · 이전", " · earlier") : "");
  return taskTitle(a) || (a.role || "agent") + " " + String(a.id).slice(0, 8);
}
const MODELS = [[/^claude-opus-(\d+)-(\d+)$/, "Opus $1.$2"], [/^claude-sonnet-(\d+)-(\d+)$/, "Sonnet $1.$2"], [/^claude-haiku-(\d+)-(\d+)$/, "Haiku $1.$2"], [/^claude-fable-(\d+)-(\d+)$/, "Fable $1.$2"], [/^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/, (m, v, n) => "GPT-" + v + " " + n[0].toUpperCase() + n.slice(1)]];
export const modelLabel = (id) => {
  if (!id) return "";
  for (const [re, to] of MODELS) if (re.test(id)) return String(id).replace(re, to);
  return String(id);
};
export const modelLine = (a) => a?.model ? [modelLabel(scrub(a.model)), scrub(a.thinking)].filter(Boolean).join(" · ") : "";
export const metaLine = (a) => [scrub(a.seat || hostName(a.host)), modelLine(a)].filter(Boolean).join(" · ");
export function shortTitle(t) {
  let s = scrub(t);
  const colon = s.search(/[:：]/);
  if (colon >= 6) s = s.slice(0, colon);
  s = s.replace(/\s*[(（][^)）]*[)）]/g, "").trim();
  if (s.length > 22) {
    const cut = s.search(/ [+=] | — |, | · /);
    if (cut >= 6) s = s.slice(0, cut);
  }
  return s;
}
export const goalLabel = (g) => g ? "#" + g.id + (shortTitle(g.title) ? " " + shortTitle(g.title) : "") : "";
export const PRIORITY = { owner: 0, running: 2, waiting: 3, idle: 4, done: 5 };
export const STATE_WORD = { get running() {
  return l10n("실행", "running");
}, get waiting() {
  return l10n("대기", "waiting");
}, get idle() {
  return l10n("쉼", "idle");
}, get done() {
  return l10n("끝남", "done");
}, get owner() {
  return myTurn();
} };
export const BAR_WORD = { get running() {
  return l10n("실행", "running");
}, get done() {
  return l10n("끝남", "done");
}, get owner() {
  return myTurn();
}, get "owner-done"() {
  return l10n("끝남", "done");
}, get blocked() {
  return l10n("막혀 끝남", "ended stuck");
}, get failed() {
  return l10n("실패", "failed");
} };
export const barWord = (b) => b.state === "failed" ? BAR_WORD[b.result === "failed" ? "failed" : "blocked"] : BAR_WORD[b.state] || b.state;
export function duration(t) {
  const m = Math.max(0, Math.round(t / MIN));
  if (m < 1) return Math.max(1, Math.round(t / 1e3)) + l10n("초", "s");
  if (m < 60) return m + l10n("분", "m");
  const h = Math.floor(m / 60), r = m % 60;
  if (h >= 48) return Math.floor(h / 24) + l10n("일", "d");
  return h + l10n("시간", "h") + (r && h < 10 ? " " + r + l10n("분", "m") : "");
}
const clock = zoned("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const hhmm = (t) => Number.isFinite(t) ? clock.format(t) : "—";
export function clockAt(t, now) {
  const days = Math.round((dayStart(now) - dayStart(t)) / DAY);
  if (!Number.isFinite(t) || !(days > 0)) return hhmm(t);
  const k = new Date(wall(t));
  return (days === 1 ? l10n("어제", "Yesterday") : k.getUTCMonth() + 1 + "/" + k.getUTCDate()) + " " + hhmm(t);
}
const STARTS = new Set(["agent.turn_started"]);
const ENDS = new Set(["agent.goal_finished", "agent.turn_ended", "agent.child_completed", "agent.closed", "agent.archived"]);
const FAILED_REPORT = /final report RESULT:\s*(blocked|failed)\b/i;
const failResult = (e) => e.kind === "report.blocked" ? "blocked" : FINAL_REPORT.has(e.kind) ? (FAILED_REPORT.exec(e.summary || "")?.[1] || "").toLowerCase() : "";
export function agentTurns(a, list, now, horizon, live) {
  const turns = [];
  let open = null, seen = false;
  for (const e of list) {
    const t = ms(e.at);
    if (STARTS.has(e.kind)) {
      if (!open) open = { start: t };
      seen = true;
    } else if (ENDS.has(e.kind)) {
      if (open) {
        turns.push({ ...open, end: Math.max(t, open.start) });
        open = null;
      } else if (!seen && !["agent.closed", "agent.archived"].includes(e.kind)) {
        const s = Math.max(horizon, ms(a.created_at) || horizon);
        if (t > s) turns.push({ start: s, end: t, clipped: s === horizon });
      }
      seen = true;
    }
    const result = failResult(e);
    if (!result) continue;
    const last = turns[turns.length - 1], into = open || (last && t - last.end <= 2 * MIN ? last : null);
    if (into) Object.assign(into, { failed: true, result });
  }
  if (open) {
    if (live) turns.push({ ...open, end: now, live: true });
    else {
      const ends = [a.ended_at, a.finished_at, a.last_turn_at].map(ms).filter((t) => Number.isFinite(t) && t >= open.start);
      turns.push({ ...open, end: Math.min(now, ends.length ? Math.min(...ends) : open.start + MIN) });
    }
  } else if (live) turns.push(liveTail(a, list, turns, now, horizon));
  return turns;
}
function liveTail(a, list, turns, now, horizon) {
  const lastAt = list.length ? ms(list[list.length - 1].at) : -Infinity;
  const s = Math.max(horizon, ms(a.created_at) || -Infinity, lastAt, turns[turns.length - 1]?.end ?? -Infinity);
  return { start: Math.min(s, now), end: now, live: true, clipped: true };
}
export function joinTurns(list, gap) {
  const bars = [];
  for (const t of list) {
    const last = bars[bars.length - 1];
    if (last && !last.live && t.start - last.end <= gap && (t.goal ?? null) === (last.goal ?? null)) {
      last.end = Math.max(last.end, t.end);
      last.turns.push(t);
      last.live = !!t.live;
      last.failed = !!t.failed;
      last.result = t.result || "";
    } else bars.push({ start: t.start, end: t.end, turns: [t], live: !!t.live, failed: !!t.failed, result: t.result || "", clipped: !!t.clipped, goal: t.goal ?? null, authored: !!t.authored });
  }
  return bars.map((b) => ({ ...b, state: b.live ? "running" : b.failed ? "failed" : "done" }));
}
export function runStart(turns, gap = RANGES[0].gap) {
  let i = turns.length - 1;
  while (i > 0 && turns[i].start - turns[i - 1].end <= gap) i--;
  return turns[i] ? { at: i, start: turns[i].start, unsure: !!turns[i].clipped } : { at: -1, start: NaN, unsure: false };
}
const LIFECYCLE = /^agent\.|^launch\./;
export function authoredRuns(list, now, gap = 4 * MIN, pad = 2e4) {
  const runs = [];
  for (const e of list) {
    if (LIFECYCLE.test(e.kind)) continue;
    const t = ms(e.at), last = runs[runs.length - 1];
    if (last && t - last.lastAt <= gap) {
      last.lastAt = t;
      last.end = Math.min(now, t + pad);
      last.goals.push(e.goal_id);
    } else runs.push({ start: t - pad, end: Math.min(now, t + pad), lastAt: t, goals: [e.goal_id], authored: true });
  }
  for (const r of runs) {
    const tally = new Map();
    for (const g of r.goals) if (g != null) tally.set(g, (tally.get(g) || 0) + 1);
    r.goal = [...tally].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    delete r.goals;
    delete r.lastAt;
  }
  return runs;
}
const askWhat = (r) => l10n("승인 A", "Approval A") + r.id + " · " + (scrub(r.what) || l10n(userKo() + " 승인", "my approval"));
const stepWhat = (r) => scrub(r.what) || l10n(userKo() + " 할 일", "My step");
export function ownerSpans(g, intervals, turn, now) {
  const spans = [], row = turn.find((r) => r.kind === "goal");
  const rowWhat = () => scrub(row.what) || l10n(userKo() + (g.status === "blocked_on_owner" ? " 조치" : " 답"), g.status === "blocked_on_owner" ? "My action" : "My answer");
  let joined = false;
  for (const i of intervals) {
    const start = ms(i.start), what = scrub(i.what) || l10n(userKo() + " 조치", "My action"), unsure = !!i.clipped_start;
    if (i.open && row && !joined) {
      spans.push({ start, end: now, live: true, unsure, what: scrub(row.what) || what });
      joined = true;
    } else spans.push({ start, end: i.open ? Math.min(now, Math.max(start + MIN, ms(g.updated_at) || 0)) : ms(i.end), unsure, what });
  }
  if (row && !joined) spans.push({ start: ms(row.since) || now, end: now, live: true, what: rowWhat() });
  for (const r of turn) if (r.kind === "approval") spans.push({ start: ms(r.since) || now, end: now, live: true, what: askWhat(r) });
  for (const r of turn) if (r.kind === "step") spans.push({ start: ms(r.since) || now, end: now, live: true, what: stepWhat(r) });
  return spans.sort((x, y) => x.start - y.start);
}
const push = (map, key, v) => (map.get(key) || map.set(key, []).get(key)).push(v);
export const noteOf = (node) => node?.state === "warning" ? (node.why || []).join(" · ") : "";
export const warnOf = (a, node) => noteOf(node);
export function prepareTimeline({ dashboard = {}, history = null, now = Date.now(), model = null } = {}) {
  const d = dashboard || {};
  model ||= buildModel(d, now);
  const byId = new Map();
  for (const list of [history?.events, d.today]) for (const e of list || []) {
    if (e?.id == null || !e.kind) continue;
    const t = ms(e.at);
    if (Number.isFinite(t)) byId.set(e.id, { t, e });
  }
  const events = [...byId.values()].sort((a, b) => a.t - b.t || a.e.id - b.e.id).map((x) => namedEvent(x.e));
  const horizon = Number.isFinite(history?.coverage) ? history.coverage : events.length ? ms(events[0].at) : now;
  const goals = new Map();
  for (const g of [...history?.goals || [], ...d.goals || []]) if (g?.id != null) goals.set(g.id, { ...namedGoal(g), request: originRequestId(g, d) ?? null });
  const projects = new Map([...goals.values()].flatMap((g) => g.projects.map((p) => [p.id, p])));
  const records = new Map();
  for (const a of history?.agents || []) if (a?.id) records.set(a.id, { ...pick(a, AGENT_KEYS), history: true });
  for (const a of model.agents || []) if (a?.id) records.set(a.id, pick(a, AGENT_KEYS));
  const byAgent = new Map(), byGoal = new Map(), mentions = new Map(), intervals = new Map();
  for (const i of history?.activity?.owner_intervals?.items || []) if (i?.goal_id != null) push(intervals, i.goal_id, i);
  const prefixes = new Map([...records.keys()].map((id) => [String(id).slice(0, 8), id]));
  for (const e of events) {
    if (e.agent_id) push(byAgent, e.agent_id, e);
    const gid = e.goal_id ?? projects.get(e.project_id)?.goal_id;
    if (gid != null) push(byGoal, gid, e);
    if (MENTION_STEPS.has(e.kind) || isReport(e.kind)) for (const id of new Set(String(e.summary || "").match(/\b[0-9a-f]{8}\b/g) || [])) {
      const full = prefixes.get(id);
      if (full && full !== e.agent_id) push(mentions, full, e);
    }
  }
  const turn = (model.turn || []).map((r) => pick(r, TURN_KEYS));
  const P = { now, horizon, events, goals, projects, records, byAgent, byGoal, mentions, model, turn, active: activeGoalIds(d), agents: new Map(), owners: new Map() };
  for (const a of records.values()) {
    const node = a.history ? null : model.nodes?.get("agent:" + a.id), warn = a.history ? "" : warnOf(a, node);
    const state = a.history ? ended(a.status) ? "done" : "idle" : { done: "done", running: "running", waiting: "waiting" }[node?.state] || "idle";
    const own = byAgent.get(a.id) || [], live = state === "running";
    const busyKinds = own.some((e) => STARTS.has(e.kind) || ENDS.has(e.kind) && e.kind !== "agent.closed" && e.kind !== "agent.archived");
    let turns;
    if (standing(a) && !busyKinds) {
      turns = authoredRuns(own, now);
      if (live) turns.push(liveTail(a, own.filter((e) => !LIFECYCLE.test(e.kind)), turns, now, horizon));
    } else turns = agentTurns(a, own, now, horizon, live);
    const project = projects.get(a.project_id), titled = /^#(\d+)\s*·/.exec(a.title || ""), named = titled && goals.has(Number(titled[1])) ? Number(titled[1]) : null;
    const goalId = standing(a) ? null : a.goal_id ?? project?.goal_id ?? named;
    const last = turns[turns.length - 1], run = live ? runStart(turns) : null;
    const since = live ? run.start : state === "done" ? ms(a.ended_at) || last?.end : last ? last.end : NaN;
    const replaced = a.role === "pm" ? project?.pm_agent_id != null && project.pm_agent_id !== a.id : standing(a) && (ended(a.status) || [...records.values()].some((n) => n.role === a.role && n.status === "active" && ms(n.created_at) > ms(a.created_at)));
    P.agents.set(a.id, { key: "a:" + a.id, kind: "agent", id: a.id, agent: a, name: agentName(a, replaced), codex: isCodex(a), meta: metaLine(a), goalId, project, turns, state, unavailable: node?.stateAvailable === false, warn, since, sinceUnsure: live ? run.unsure || run.start < horizon : false, runAt: run ? run.at : -1, next: state === "waiting" ? node?.next ?? NaN : NaN, events: own });
  }
  for (const g of goals.values()) {
    const spans = ownerSpans(g, intervals.get(g.id) || [], turn.filter((r) => r.goal_id === g.id), now), live = spans.find((s) => s.live);
    if (spans.length) P.owners.set(g.id, { key: "o:" + g.id, kind: "owner", goalId: g.id, spans, name: userKo(), state: live ? "owner" : "done", what: (live || spans[spans.length - 1]).what, since: live ? live.start : spans[spans.length - 1].end, sinceUnsure: !!live && (!!live.unsure || live.start < horizon) });
  }
  return P;
}
const NOISE = new Set(["agent.goal_finished", "agent.turn_ended", "agent.registered", "agent.token_revoked", "health.recovered"]);
const ROLE_RANK = (a) => isCodex(a) ? 3 : { pm: 0, worker: 1, reviewer: 2 }[a.role] ?? 4;
const HOT = new Set(["running", "owner"]);
export const hot = (s) => HOT.has(s);
const union = (list) => {
  const out = [];
  for (const b of [...list].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ start: b.start, end: b.end });
  }
  return out;
};
export function treeRows(list, project, { first = 1 } = {}) {
  const ids = new Set(list.map((a) => a.id)), kids = new Map(), roots = [];
  for (const a of list) {
    const up = a.parent_id || a.launcher_id;
    if (up && ids.has(up) && up !== a.id) push(kids, up, a);
    else roots.push(a);
  }
  const rank = (a) => a.role === "pm" && project?.pm_agent_id === a.id ? -1 : ROLE_RANK(a);
  const order = (x, y) => rank(x) - rank(y) || ms(x.created_at) - ms(y.created_at) || String(x.id).localeCompare(String(y.id));
  const out = [], seen = new Set();
  const walk = (nodes, depth, trail) => nodes.sort(order).forEach((a, i) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    const last = i === nodes.length - 1;
    out.push({ a, depth, guides: [...trail, last ? "elbow" : "tee"] });
    walk(kids.get(a.id) || [], depth + 1, [...trail, last ? "blank" : "pipe"]);
  });
  walk(roots, first, []);
  return out;
}
export function timelineView(P, win, { folded = new Set(), opened = new Set(), idleShown = new Set(), restingShown = false } = {}) {
  const now = P.now, inWin = (s, e) => s < win.end && e > win.start, inside = (t) => t >= win.start && t <= win.end;
  const join = (list, base) => joinTurns(list, win.gap).map((b) => ({ ...b, key: base + ":" + Math.round(b.turns[0].start / 1e3) }));
  const rows = new Map();
  for (const r of P.agents.values()) {
    const parts = r.runAt > 0 ? [r.turns.slice(0, r.runAt), r.turns.slice(r.runAt)] : [r.turns];
    const bars = parts.flatMap((list) => join(list, "b:" + r.id)).filter((b) => inWin(b.start, b.end));
    rows.set(r.id, { ...r, bars, depth: 1, guides: [] });
  }
  const ownerRow = (o) => {
    const bars = o.spans.filter((s) => inWin(s.start, s.end)).map((s) => ({ start: s.start, end: s.end, turns: [s], live: !!s.live, key: "b:" + o.key + ":" + Math.round(s.start / 1e3), clipped: !!s.unsure, state: s.live ? "owner" : "owner-done", what: s.what }));
    return { ...o, bars, show: bars.length > 0 || hot(o.state) };
  };
  const members = new Map();
  for (const r of rows.values()) if (!standing(r.agent) && r.goalId != null) push(members, r.goalId, r);
  const groups = [], resting = [];
  for (const id of new Set([...P.goals.keys(), ...members.keys(), ...P.owners.keys()])) {
    const g = P.goals.get(id) || { id, title: "", status: "unknown", projects: [] }, list = members.get(id) || [];
    const node = P.model.nodes?.get("goal:" + id), over = !P.active.has(id);
    const owner = P.owners.has(id) ? ownerRow({ ...P.owners.get(id), word: P.owners.get(id).state === "owner" ? node?.stateLabel : "" }) : null;
    const unavailable = node?.stateAvailable === false || list.some((r) => r.unavailable);
    const state = node?.stateAvailable === false ? "idle" : over ? "done" : g.status === "paused" ? "idle" : owner?.state === "owner" ? "owner" : list.some((r) => r.state === "running") ? "running" : node?.state === "waiting" ? "waiting" : "idle";
    const warn = over ? "" : noteOf(node);
    const prio = Math.min(PRIORITY[state], ...list.filter((r) => !ended(r.agent.status)).map((r) => PRIORITY[r.state]));
    const goalEvents = P.byGoal.get(id) || [];
    const activity = list.some((r) => r.bars.length) || !!owner?.bars.length || goalEvents.some((e) => !NOISE.has(e.kind) && inside(ms(e.at)));
    if (!unavailable && prio > 2 && !activity && over) continue;
    const key = "g:" + id, short = shortTitle(g.title);
    const many = node?.state === "waiting" && node.waitingFirst ? node.waitingMore : 0;
    const waitingOn = node?.state === "waiting" && (node.waitingFirst || node.waitingOn) || [...P.projects.values()].find((p) => p.goal_id === id && !ended(p.status) && p.waiting_on)?.waiting_on || g.waiting_on;
    const whose = state === "owner" || over ? null : node?.whose;
    const text = state === "owner" ? owner.what : over ? "" : scrub(whose?.what || waitingOn), who = whose?.name || "";
    const said = goalSteps(P, id, 1)[0] || null;
    const word = state === "idle" ? "" : over ? statusWord(g.status, "goals").word : node?.stateLabel || "";
    const group = { key, kind: "goal", id, goal: g, title: scrub(g.title), short, state, word, unavailable, warn, prio, open: false, rows: [], idle: 0, next: text ? { text: text + (many && state !== "owner" ? l10n(" 외 " + many, " and " + many + " more") : ""), who, all: many && state !== "owner" ? scrub(node.waitingOnFull) : "" } : null, said, nextCheck: node?.next ?? NaN, createdAt: ms(g.created_at), last: Math.max(0, ...list.flatMap((r) => r.bars.map((b) => b.end)), ...goalEvents.filter((e) => !NOISE.has(e.kind)).map((e) => ms(e.at))), span: { start: Math.max(ms(g.created_at) || win.start, win.start), end: Math.min(over ? ms(g.updated_at) || now : now, win.end) }, runs: union(list.flatMap((r) => r.bars)), owner: owner ? owner.bars : [], ownerRow: owner, members: list };
    if (!unavailable && prio > 2 && !activity) {
      resting.push(group);
      continue;
    }
    groups.push(group);
  }
  const shape = (group, open) => {
    const list = group.members, shown = new Set(list.filter((r) => r.unavailable || hot(r.state) || r.bars.length).map((r) => r.id));
    for (const id of [...shown]) {
      let a = P.records.get(id), guard = 0;
      while (a && guard++ < 8) {
        const up = a.parent_id || a.launcher_id;
        if (!up || !list.some((r) => r.id === up)) break;
        shown.add(up);
        a = P.records.get(up);
      }
    }
    const idle = list.filter((r) => !shown.has(r.id) && !ended(r.agent.status));
    group.idle = idle.length;
    if (idleShown.has(group.key)) for (const r of idle) shown.add(r.id);
    const pm = list.find((r) => r.agent.role === "pm" && r.project?.pm_agent_id === r.id) || list.find((r) => r.agent.role === "pm");
    const tree = treeRows(list.filter((r) => shown.has(r.id)).map((r) => r.agent), pm?.project).map(({ a, depth, guides }) => ({ ...rows.get(a.id), depth, guides }));
    const owner = group.ownerRow?.show ? { ...group.ownerRow, depth: 1, guides: [tree.length ? "tee" : "elbow"] } : null;
    group.all = [owner, ...tree].filter(Boolean);
    group.open = open;
    group.rows = open ? group.all : [];
    return group;
  };
  for (const group of groups) shape(group, group.prio <= 2 || group.unavailable ? !folded.has(group.key) : opened.has(group.key));
  groups.sort((x, y) => x.prio - y.prio || (x.prio <= 2 ? y.id - x.id : y.last - x.last));
  const all = [...rows.values()];
  const heads = all.filter((r) => standing(r.agent) && (r.unavailable || !ended(r.agent.status) || r.bars.length)).sort((x, y) => (isLead(x.agent.role) ? 0 : 1) - (isLead(y.agent.role) ? 0 : 1) || ms(y.agent.created_at) - ms(x.agent.created_at));
  const temps = all.filter((r) => !standing(r.agent) && r.goalId == null && (r.unavailable || hot(r.state) || r.bars.length));
  const upOf = (r) => r.agent.parent_id || r.agent.launcher_id;
  const standingRows = [];
  const orphans = temps.filter((t) => !heads.some((h) => h.id === upOf(t)));
  heads.forEach((h, i) => {
    const kids = temps.filter((t) => upOf(t) === h.id), lastHead = i === heads.length - 1 && !orphans.length;
    standingRows.push({ ...h, depth: 1, guides: [lastHead ? "elbow" : "tee"] });
    kids.forEach((t, k) => standingRows.push({ ...t, depth: 2, guides: [lastHead ? "blank" : "pipe", k === kids.length - 1 ? "elbow" : "tee"] }));
  });
  orphans.forEach((t, k) => standingRows.push({ ...t, depth: 1, guides: [k === orphans.length - 1 ? "elbow" : "tee"] }));
  const out = groups.filter((g) => g.prio <= 2);
  if (standingRows.length) {
    const st = standingRows.some((r) => r.state === "running") ? "running" : "idle";
    const open = !folded.has("standing");
    out.push({ key: "standing", kind: "standing", id: 0, title: l10n("상주 · 목표 밖", "Standing · no goal"), short: l10n("상주 · 목표 밖", "Standing · no goal"), state: st, prio: 2, open, idle: 0, all: standingRows, rows: open ? standingRows : [], next: null, said: null, span: null, runs: union(standingRows.flatMap((r) => r.bars)), owner: [], members: standingRows });
  }
  out.push(...groups.filter((g) => g.prio > 2));
  resting.sort((x, y) => y.last - x.last || y.id - x.id);
  if (restingShown) for (const group of resting) out.push(shape(group, opened.has(group.key)));
  const visible = out.flatMap((g) => g.rows), keys = new Set(visible.map((r) => r.key));
  const links = [];
  for (const r of visible) {
    if (r.kind !== "agent") continue;
    const parent = upOf(r), born = ms(r.agent.created_at), first = r.bars[0];
    if (!parent || !keys.has("a:" + parent) || !first || !(born >= win.start && born <= win.end && born >= P.horizon)) continue;
    links.push({ key: "l:" + r.id, from: "a:" + parent, to: r.key, at: born, bar: first.key, toAt: Math.max(first.start, win.start) });
  }
  const pictured = new Set(out.flatMap((g) => g.all || []).filter((r) => r.kind === "agent").map((r) => r.id));
  const alive = all.filter((r) => !ended(r.agent.status));
  const counts = { agents: pictured.size, running: alive.filter((r) => r.state === "running").length };
  return { win, now, horizon: P.horizon, groups: out, restingCount: resting.length, restingShown, links, rows: visible, counts };
}
const actorName = (P, e) => {
  const a = P.records.get(e.agent_id);
  return a ? agentName(a) : scrub(e.actor);
};
export function nowStep(P, r) {
  if (r.kind !== "agent") return null;
  const a = r.agent, up = a.parent_id || a.launcher_id;
  const list = [...(P.byAgent.get(a.id) || []).filter((e) => OWN_STEPS.has(e.kind) || isReport(e.kind) || isFinalReport(e)), ...P.mentions.get(a.id) || []];
  const near = (e) => e.agent_id === a.id || e.agent_id === up || P.records.get(e.agent_id)?.role === "pm" && P.records.get(e.agent_id)?.project_id === a.project_id;
  let fallback = null;
  for (const e of [...new Map(list.map((e2) => [e2.id, e2])).values()].sort((x, y) => ms(y.at) - ms(x.at) || y.id - x.id)) {
    if (TURN_EDGES.has(e.kind)) continue;
    const text = stepText(e);
    if (!text) continue;
    const step = { id: e.id, at: ms(e.at), kind: e.kind, text, actor: e.agent_id === a.id ? "" : actorName(P, e) };
    if (near(e)) return step;
    fallback ||= step;
  }
  return fallback;
}
export function goalSteps(P, id, n = 3) {
  const out = [], list = P.byGoal.get(id) || [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) {
    const e = list[i];
    if (!["project.note", "goal.note", "goal.waiting", "goal.status"].includes(e.kind) && !isReport(e.kind)) continue;
    const text = stepText(e);
    if (text) out.push({ id: e.id, at: ms(e.at), kind: e.kind, text, line: stepLine(e) });
  }
  return out;
}
export function stepsFor(P, row, bar, n = 3) {
  const until = (bar ? bar.end : P.now) + 5e3, short = row.kind === "agent" ? String(row.id).slice(0, 8) : null;
  const goalId = row.goalId, projectId = row.kind === "agent" ? row.agent.project_id : null;
  const mine = [], named = [], goal = [], filler = [];
  for (let i = P.events.length - 1; i >= 0; i--) {
    const e = P.events[i];
    if (ms(e.at) > until || !(e.kind in STEP_TAG)) continue;
    if (FINAL_REPORT.has(e.kind) && !/final report/.test(e.summary || "")) continue;
    const own = row.kind === "agent" && e.agent_id === row.id;
    if (own) (FILLER.has(e.kind) ? filler : mine).push(e);
    else if (FILLER.has(e.kind)) continue;
    else if (short && String(e.summary || "").includes(short)) named.push(e);
    else if (goalId != null && (e.goal_id === goalId || projectId != null && e.project_id === projectId) && (row.kind !== "agent" || !standing(row.agent)) && (row.kind !== "owner" || ["goal.waiting", "goal.status", "goal.note"].includes(e.kind))) goal.push(e);
    if (mine.length + named.length >= n && filler.length >= n) break;
  }
  const rich = [...mine, ...named].sort((a, b) => ms(b.at) - ms(a.at) || b.id - a.id).slice(0, n);
  const near = bar ? goal.filter((e) => ms(e.at) >= bar.start - 10 * MIN) : goal;
  const picked = [...rich, ...near.slice(0, n - rich.length)];
  if (picked.length < n) picked.push(...filler.slice(0, n - picked.length));
  return picked.sort((a, b) => ms(b.at) - ms(a.at) || b.id - a.id).slice(0, n).map(stepLine);
}
