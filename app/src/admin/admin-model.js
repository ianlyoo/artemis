import { buildModel, busyCount, terminal, standingAgent, ms, liveAide, reportedBlock, attentionLine, agentLabel } from "../model.js";
import { approvalTitle } from "../approvals.js";
import { clean as tidy, shortTitle as short } from "../mobile/format.js";
import { stepLink } from "../step-route.js";
import { hostName } from "../pc-data.js";
import { seatFigures } from "../seats.js";
import { antigravityRows } from "../antigravity.js";
import { ownerTurn } from "../owner-steps.js";
import { cardLabel } from "../card-md.js";
import { goalPlace } from "../goal-place.js";
import { lead, leadKo, leadRole, isLead, userKo, myTurn, l10n } from "../names.js";
export const clean = (s) => tidy(String(s ?? "").replace(/\[\^[^\]\s]+\](?!:)/g, ""));
export const commas = (s) => clean(s).replace(/\s+·\s+/g, ", ");
export function cardLine(a, goal) {
  if (a.kind === "roadmap" && clean(goal?.title)) return clean(goal.title);
  const text = clean(approvalTitle({ ...a, goal_title: a.goal_title || goal?.title }).text), note = text.match(/\s#\s*([^#]*[가-힣][^#]*)$/);
  return note ? clean(note[1]) : text;
}
const SENTENCE = /^(.+?[.?!。])(?=\s|$)/;
const sentence = (s) => clean(s).match(SENTENCE)?.[1] || clean(s);
export const shortTitle = (title) => short(clean(title));
export const goalName = (g, title = g?.title) => clean(g?.short_name) || shortTitle(title);
export const STATES = ["owner", "blocked", "running", "person", "waiting", "paused"];
export const startQueueOrder = (a, b) => (a.startQueue?.position ?? Infinity) - (b.startQueue?.position ?? Infinity);
export function startQueueAge(since, now) {
  const minutes = Math.max(0, Math.floor((now - ms(since)) / 6e4)), hours = Math.floor(minutes / 60);
  return l10n((hours ? hours + "시간" + (minutes % 60 ? " " + minutes % 60 + "분" : "") : minutes + "분") + "째", hours ? hours + "h" + (minutes % 60 ? " " + minutes % 60 + "m" : "") : minutes + "m");
}
const ROLES = () => [[leadRole(), lead()], ["cto", "CTO"], ["pm", "PM"], ["worker", "Worker"], ["reviewer", "Reviewer"], ["aide", l10n("보좌관", "Aide")]];
const person = (k) => isLead(k) || ["owner", "cto", "pm"].includes(k);
const future = (t, now) => Number.isFinite(t) && t > now;
const TOD = "(?:오전|오후|새벽|아침|점심|저녁|밤|낮|자정|정오)";
const CLOCK_T = String.raw`(?:\d{1,2}:\d{2}(?!\d)|\d{1,2}\s*시(?!간)(?:\s*\d{1,2}\s*분)?)`;
const TIME_TOKEN = new RegExp(String.raw`(?:${TOD}\s*)?(?:(?<![\d/#.])(?:1[0-2]|0?[1-9])/(?:3[01]|[12]\d|0?[1-9])(?![\d/])(?:\s*\([월화수목금토일]\))?` + String.raw`(?:\s*${TOD})?(?:\s*${CLOCK_T})?|(?<![\d#])${CLOCK_T}|\d{1,2}\s*월\s*\d{1,2}\s*일)(?:\s*${TOD})?(?:까지|부터|에는|에|쯤|경)?`, "g");
export function untimed(text) {
  return clean(String(text ?? "").replace(TIME_TOKEN, " ").replace(/\(\s*[,，·]?\s*\)/g, "").replace(/\(\s*[,，·]?\s*/g, "(").replace(/\s*[,，·]\s*\)/g, ")").replace(/\s+([,，)])/g, "$1").replace(/([,，])(?:\s*[,，])+/g, "$1").replace(/^[\s,，·:]+|[\s,，·]+$/g, "").replace(/\s{2,}/g, " "));
}
export function doingLine(what, who, since) {
  const text = untimed(what);
  return text ? { what: commas(text), who: who || null, since: since ?? null } : null;
}
const role = (a) => ROLES().find(([r]) => r === a.role)?.[1] || clean(a.role) || "Agent";
const agentName = (a) => a.role === "pm" && /\bPM\d+\b/.test(a.title || "") ? a.title.match(/\bPM\d+\b/)[0] : role(a);
export function adminData(work, dashboard = {}, now = Date.now(), isDone = () => false) {
  work = work || {};
  const items = new Map((work.approvals?.items || dashboard.approvals || []).map((a) => [String(a.id), a]));
  const goals = new Map((dashboard.goals || []).map((g) => [g.id, g]));
  for (const g of work.goals || []) goals.set(g.id, { ...goals.get(g.id), ...g });
  const row = (t) => {
    if (t.kind === "approval") {
      const a = items.get(String(t.id)) || { id: t.id, goal_id: t.goal_id, scope_text: t.what, status: "pending", level: "owner" }, goal = goals.get(a.goal_id ?? t.goal_id);
      return { key: "approval:" + a.id, kind: "approval", id: String(a.id), state: "owner", line: cardLabel(cardLine(a, goal)), since: t.since ?? a.created_at ?? null, approval: a, goal: goal?.id ?? null, title: goalName(goal) };
    }
    if (t.kind === "question") return { key: "question:" + t.id, kind: "question", id: String(t.id), state: "owner", line: clean(t.what) || l10n(leadKo() + " 질문", "Question from " + lead()), since: t.since, goal: null, title: null, permission: t.permission ?? null };
    if (t.kind === "step") return { key: "step:" + t.id, kind: "step", id: String(t.id), state: "owner", line: clean(t.what) || l10n(userKo() + " 할 일", "My step"), since: t.since, link: stepLink(t.link), permission: t.permission ?? null, goal: t.goal_id ?? null, title: goalName(goals.get(t.goal_id), t.title || goals.get(t.goal_id)?.title) };
    const id = t.goal_id ?? t.id, g = goals.get(id), blocked = g?.status === "blocked_on_owner";
    return { key: "goal:" + id, kind: "goal", id: String(id), state: blocked ? "blocked" : "owner", line: clean(t.what) || clean(g?.owner_action) || clean(t.title || g?.title), goal: g?.id ?? t.goal_id ?? t.id, title: goalName(g, t.title || g?.title), since: t.since };
  };
  const selected = ownerTurn(work, isDone), turnOf = new Map(selected.map((t) => [t.key, (t.actions.length ? t.actions : [t]).map(row)]));
  const live = (work.requests || []).filter((r) => r.state?.kind !== "done");
  const newest = (a, b) => (ms(b.at) || 0) - (ms(a.at) || 0);
  const requests = live.map((r) => ({ key: "request:" + r.id, id: r.id, words: clean(r.owner_text) || "#" + r.id, at: r.at, state: r.state?.label ? { kind: r.state.kind, label: clean(r.state.label), who: r.state.whose?.name ?? null } : null }));
  const asksById = new Map(requests.map((r) => [r.id, r]));
  const leadTurn = Array.isArray(work.lead_turn) ? new Map(work.lead_turn.map((r) => [r.key, r])) : null;
  const marks = new Map();
  for (const a of work.attention || []) {
    if (!marks.has(a.goal_id)) marks.set(a.goal_id, []);
    marks.get(a.goal_id).push(a);
  }
  const model = buildModel(dashboard, now), pop = dashboard.owner_resources?.populations;
  const roster = new Set((dashboard.agents || []).map((a) => a.id));
  const leftover = new Set([...work.goals || [], ...dashboard.goals || []].flatMap((g) => (g.attention_reasons || []).filter((r) => r.kind === "leftover_agent").map((r) => r.entity_id)));
  const active = model.agents.filter((a) => roster.has(a.id) && a.status === "active"), isBusy = (a) => a.busy === true;
  const running = active.filter(isBusy);
  const projects = new Map((dashboard.goals || []).flatMap((g) => (g.projects || []).map((p) => [p.id, { ...p, goal_id: p.goal_id ?? g.id }])));
  const goalOf = (a) => standingAgent(a) ? null : a.goal_id ?? projects.get(a.project_id)?.goal_id ?? null;
  const mark = (a) => ({ key: "agent:" + a.id, name: agentName(a), role: role(a), host: hostName(clean(a.host)) || "—", seat: clean(a.seat), model: clean(a.model), effort: clean(a.thinking), busy: isBusy(a) && !leftover.has(a.id), at: a.last_turn_at ?? null, task: clean(String(a.title || "").replace(/^#\d+\s*·\s*/, "").replace(/^PM\d+\s*·\s*/, "")) });
  const onGoal = new Map();
  for (const a of active) {
    const g = goalOf(a);
    if (g != null) {
      if (!onGoal.has(g)) onGoal.set(g, []);
      onGoal.get(g).push(mark(a));
    }
  }
  const listed = new Set((work.work_groups || []).map((g) => g.key));
  const groups = [...work.work_groups || [], ...selected.filter((t) => !listed.has(t.key)).map((t) => t.goal_id != null ? { key: t.key, kind: "goal", id: t.goal_id, request_ids: [] } : { key: t.key, kind: t.kind, id: t.id, request_ids: [] })];
  const cards = groups.map((group) => ({ group, asks: (group.request_ids || []).map((id) => asksById.get(id)).filter(Boolean).sort(newest) })).map(({ group, asks }) => {
    if (group.kind === "request") {
      const a = asks[0], k2 = a?.state?.kind, state2 = k2 === "running" ? "running" : person(k2) ? "person" : "waiting", who2 = state2 === "person" ? a.state.who : null;
      const full2 = a?.words || "#" + group.id, rr2 = leadTurn?.get("request:" + group.id);
      return { key: "request:" + group.id, kind: "request", id: group.id, goal: null, title: sentence(full2), full: full2, state: state2, who: who2, word: a?.state?.label ?? "", doing: rr2 ? doingLine(rr2.action, leadKo(), rr2.since) : doingLine(state2 === "person" ? l10n("답하거나 목표에 붙이기", "answer it or put it on a goal") : "", who2, a?.at), next: { who: null, what: "" }, stage: { parts: [], done: 0, total: 0 }, eta: null, check: null, attention: [], agents: [], asks, last: a?.at ?? null };
    }
    if (group.kind !== "goal") {
      const t = selected.find((t2) => t2.key === group.key), turn = turnOf.get(t.key), item = turn?.[0] || row(t);
      return { key: t.key, kind: t.kind, id: t.id, goal: null, title: item.line, full: item.line, state: "owner", who: userKo(), word: t.label, doing: doingLine(item.line, userKo(), t.since), turn, next: { who: null, what: "" }, stage: { parts: [], done: 0, total: 0 }, eta: null, check: null, attention: [], agents: [], asks, last: t.since };
    }
    const g = goals.get(group.id) || { id: group.id }, open = (g.projects || []).filter((p) => !terminal(p.status)), built = (g.projects || []).filter((p) => !["aborted", "cancelled", "dropped"].includes(p.status));
    const agents2 = (onGoal.get(g.id) || []).sort((a, b) => Number(b.busy) - Number(a.busy) || (a.role === "PM" ? -1 : b.role === "PM" ? 1 : 0));
    const busyOn = (p) => agents2.some((a) => a.busy && active.find((x) => x.id === a.key.slice(6))?.project_id === p.id);
    const checks = [ms(g.next_check_at), ...open.map((p) => ms(p.next_check_at))].filter((t) => future(t, now)).sort((a, b) => a - b);
    const line = g.whose || { what: clean(g.waiting_on) }, move = g.current_move || {}, k = move.kind;
    const state = turnOf.has(group.key) ? "owner" : ["blocked", "running", "paused"].includes(k) ? k : person(k) ? "person" : "waiting";
    const who = state === "owner" ? userKo() : state === "person" ? line.name ?? null : null;
    const rr = leadTurn?.get("goal:" + g.id);
    const doing = open.find(busyOn) || open.slice().sort((a, b) => (ms(a.next_check_at) || Infinity) - (ms(b.next_check_at) || Infinity))[0];
    const step = clean(doing?.whose?.what ?? doing?.waiting_on), why = state === "running" ? step || clean(line.what) : clean(line.what) || step || (state === "owner" ? clean(g.owner_action) || turnOf.get(group.key)?.[0]?.line || "" : "");
    const parts = built.sort((a, b) => a.id - b.id).map((p) => ({ id: p.id, title: clean(p.title), why: commas(p.waiting_on), check: future(ms(p.next_check_at), now) ? p.next_check_at : null, state: terminal(p.status) ? "done" : busyOn(p) ? "running" : future(ms(p.next_check_at), now) ? "date" : "waiting" }));
    const full = clean(g.title) || asks[0]?.words || "G" + g.id, title = goalName(g, full);
    const word = clean(move.label);
    const busyAgent = agents2.find((a) => a.busy && (!doing || active.find((x) => x.id === a.key.slice(6))?.project_id === doing.id)) || agents2.find((a) => a.busy);
    const doingNow = rr && state === "person" ? doingLine(rr.action, leadKo(), rr.since) : state === "running" ? doingLine(why || clean(doing?.title), line.name ?? busyAgent?.name, doing?.updated_at ?? g.updated_at) : doingLine(why, state === "owner" ? userKo() : line.name, g.updated_at);
    const nextWho = state === "owner" ? userKo() : why && why === clean(line.what) ? line.name ?? null : null;
    const place = goalPlace(g, now), later = place === "later" ? g.next_check_at : null;
    return { key: "goal:" + g.id, kind: "goal", id: g.id, goal: g.id, title, full, state, who, word, doing: doingNow, tone: state === "person" && who === userKo() ? "owner" : null, turn: turnOf.get(group.key) ?? null, place, later, startQueue: g.start_queue ?? null, next: { who: nextWho && (word.startsWith(nextWho) || commas(why).startsWith(nextWho)) ? null : nextWho, what: untimed(commas(why)) }, stage: { parts, done: parts.filter((p) => p.state === "done").length, total: parts.length }, eta: g.eta ?? null, check: checks.length ? new Date(checks[0]).toISOString() : null, attention: (marks.get(g.id) || []).map((a) => ({ ...a, line: attentionLine(a) })), agents: agents2, asks, last: g.last_turn_at ?? g.updated_at ?? null };
  });
  const bare = (s) => commas(s).replace(/[\s.…]+$/, "");
  for (const c of cards) if (c.doing && c.next?.what) c.doing.same = bare(c.doing.what) === bare(doingLine(c.next.what)?.what || "");
  const order = (s) => STATES.indexOf(s), soon = (c) => Math.min(ms(c.eta?.at) || Infinity, ms(c.check) || Infinity);
  const busyWorkers = (c) => goals.get(c.goal)?.busy_worker_count ?? 0;
  cards.sort((a, b) => startQueueOrder(a, b) || order(a.state) - order(b.state) || (a.state === "running" ? busyWorkers(b) - busyWorkers(a) : 0) || soon(a) - soon(b) || (ms(b.asks[0]?.at) || 0) - (ms(a.asks[0]?.at) || 0));
  const slices = [];
  for (const c of cards.filter((c2) => !c2.later)) {
    const key = c.state === "person" ? "person:" + c.who : c.state, s = slices.find((x) => x.key === key), n = c.turn?.length || 1;
    if (!s) slices.push({ key, state: c.tone || c.state, label: key === "owner" ? myTurn() : c.word, n });
    else s.n += n;
  }
  const hostRows = (dashboard.resources?.hosts || []).filter((h) => h.kind === "host" || h.key);
  const hostKeys = [...new Set([...hostRows.map((h) => h.key), ...active.map((a) => a.host).filter(Boolean)])];
  const hosts = hostKeys.map((key) => {
    const h = hostRows.find((r) => r.key === key) || {}, on = active.filter((a) => a.host === key), cpu = Number(h.data?.load) / Number(h.data?.cpus), n = model.nodes.get("host:" + key);
    return { key, label: hostName(key), state: h.state || (h.online === false ? "off" : "online"), online: h.online !== false && h.state !== "asleep" && h.state !== "off", agents: on.map(mark).sort((a, b) => Number(b.busy) - Number(a.busy)), busy: n?.busy ?? 0, active: n?.active ?? 0, cpu: Number.isFinite(cpu) ? cpu : null, disk: Number.isFinite(h.data?.disk_used_pct) ? h.data.disk_used_pct : null };
  }).sort((a, b) => b.agents.length - a.agents.length || Number(b.online) - Number(a.online) || a.key.localeCompare(b.key));
  const roles = ROLES().map(([r, label]) => ({ key: r, label, total: active.filter((a) => a.role === r).length, busy: running.filter((a) => a.role === r).length })).filter((r) => r.total);
  const seats = (dashboard.resources?.seats || []).map((s) => {
    const f = seatFigures(s.data);
    return { key: s.key, use: f.five_hour, resets: f.five_hour_resets_at, week: f.weekly, weekResets: f.weekly_resets_at, red: !!s.data?.red, busy: model.nodes.get("seat:" + s.key)?.busy ?? 0, agents: model.nodes.get("seat:" + s.key)?.active ?? 0 };
  });
  const antigravity = antigravityRows(dashboard.resources?.antigravity, now);
  const busy = busyCount(dashboard), idle = pop ? Math.max(0, pop.active - pop.busy) : 0;
  const named = new Map(cards.map((c) => [c.goal, c.title]));
  const agents = active.filter((a) => isBusy(a) || reportedBlock(a) || liveAide(a)).map((a) => ({ ...mark(a), name: agentLabel(a).name, label: agentLabel(a).state, stuck: reportedBlock(a), project: standingAgent(a) ? null : projects.get(a.project_id), goal: goals.get(goalOf(a)), work: standingAgent(a) ? "" : named.get(goalOf(a)) || goalName(goals.get(goalOf(a))), standing: standingAgent(a) })).sort((a, b) => Number(b.standing) - Number(a.standing) || (ms(b.at) || 0) - (ms(a.at) || 0));
  return { now, all: cards, work: cards.filter((c) => !c.later), later: cards.filter((c) => c.later).sort((a, b) => ms(a.later) - ms(b.later)), slices, requests: requests.sort(newest), agents, idle, load: { hosts, roles, seats, antigravity, busy, idle, active: busy + idle }, counts: { requests: requests.length, running: busy, work: cards.length, attention: work.attention_count ?? 0 } };
}
