import { codexCapacity } from "./codex.js";
import { hostRows } from "./host-switches.js";
import { wall } from "./zone.js";
import { useHostNames } from "./pc-data.js";
import { seatWord } from "./seats.js";
import { ownerWork, goalFacts, liveById, goalRequests, requestGoalIds, originRequestId } from "./requests.js";
import { stepText, scrub, clean } from "./tl-steps.js";
import { goalPlace } from "./goal-place.js";
import { lead, leadKo, leadRole, isLead, userKo, josa, l10n, lang } from "./names.js";
export const terminal = (s) => ["done", "closed", "archived", "dropped", "aborted", "cancelled", "denied", "approved", "rejected"].includes(s);
export const ms = (v) => v ? Date.parse(v) : NaN;
export function liveRequests(d = {}) {
  const w = ownerWork(d), byId = liveById(d), goals = new Map((d.goals || []).map((g) => [g.id, g]));
  return w.work_groups.filter((group) => group.request_ids?.length).map((group) => {
    const requests = (group.request_ids || []).map((id) => byId.get(id)).filter(Boolean);
    if (group.kind === "request") return { key: "request:" + group.id, id: group.id, kind: "request", status: "unrouted", requests };
    const g = goals.get(group.id) || {};
    return { key: "goal:" + group.id, id: group.id, kind: "goal", title: g.title, status: g.status, requests: Array.isArray(g.requests) ? goalRequests(g, d) : requests };
  });
}
export const hqTurn = (d) => ownerWork(d).owner_turn;
export const ownerBlocked = (g) => g?.status === "blocked_on_owner";
export const liveAide = (a) => a.role === "aide" && a.status === "active" && !a.ended_at && !a.finished_at;
export const standingRoles = () => [leadRole(), "cto"], standingAgent = (a) => standingRoles().includes(a?.role);
const NETWORK_STATES = ["running", "waiting", "warning", "idle", "done"];
export const networkState = (row) => NETWORK_STATES.includes(row?.network_state) ? row.network_state : "idle";
export const busyCount = (dashboard) => dashboard.owner_resources?.populations?.busy ?? 0;
export function buildModel(d, now = Date.now()) {
  useHostNames(d);
  const nodes = new Map(), edges = [], goals = d.goals || [], projects = goals.flatMap((g) => (g.projects || []).map((p) => ({ ...p, goal_id: p.goal_id ?? g.id })));
  const agentMap = new Map();
  [...goals.flatMap((g) => g.agents || []), ...projects.flatMap((p) => p.agents || []), ...(d.system?.leftover_agents || []).filter((a) => a.id), ...d.agents || []].forEach((a) => agentMap.set(a.id, { ...agentMap.get(a.id), ...a }));
  for (const [id, a] of agentMap) if (a.role === "aide" && !liveAide(a)) agentMap.delete(id);
  projects.forEach((p) => p.agents = [...agentMap.values()].filter((a) => !standingAgent(a) && (a.project_id === p.id || (p.agents || []).some((x) => x.id === a.id))));
  const agents = [...agentMap.values()], goalMap = new Map(goals.map((g) => [g.id, g]));
  const turn = hqTurn(d), turnAsks = new Set(turn.filter((r) => r.kind === "approval").map((r) => r.id));
  const pendingOwner = (d.approvals || []).filter((a) => a.status === "pending" && turnAsks.has(a.id));
  const ownerWaits = new Map(turn.filter((r) => r.kind === "goal").map((r) => [r.id, r]));
  const health = new Map([...d.today || [], ...d.incidents || []].map((e) => [e.id, e]));
  const incidents = (d.open_incident_ids || []).map((id) => health.get(id) || { id, kind: "health.incident" });
  const asks = (d.overdue_asks || []).map((a) => ({ ...health.get(a.event_id), id: a.event_id, ask_id: a.id, kind: "ask.created", at: a.at, goal_id: a.goal_id, project_id: a.project_id, summary: a.summary }));
  const activeEvents = new Set([...incidents, ...asks].map((e) => e.id));
  const add = (kind, id, data, state, label) => {
    const n = { key: kind + ":" + id, kind, id, data, state, label };
    nodes.set(n.key, n);
    return n;
  };
  const link = (from, to) => {
    if (nodes.has(from) && nodes.has(to) && !edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to });
  };
  const live = liveById(d), requests = [...new Map([...goals.flatMap((g) => g.requests || []), ...d.requests || [], ...live.values()].map((r) => [r.id, live.get(r.id) ?? r])).values()];
  for (const r of requests) add("request", r.id, r, live.has(r.id) && !requestGoalIds(r, d).length ? "unrouted" : terminal(r.status) ? "done" : "idle", r.owner_text || "Request #" + r.id);
  for (const g of goals) {
    const facts = goalFacts(d, g.id), wait = facts?.network_wait;
    const n = add("goal", g.id, g, facts?.state ?? "idle", g.title);
    n.stateAvailable = typeof facts?.state === "string";
    if (facts) Object.assign(n, { urgency: facts.urgency, isRunning: facts.is_running, attention: facts.attention ?? null });
    n.place = goalPlace({ ...g, ...facts }, now);
    if (facts?.current_move?.label) n.stateLabel = facts.current_move.label;
    if (facts?.whose) n.whose = facts.whose;
    if (facts?.eta) n.eta = facts.eta;
    if (wait?.at) n.next = ms(wait.at);
    if (n.state === "waiting" && wait?.first) {
      n.waitingFirst = wait.first;
      n.waitingMore = wait.count - 1;
      n.waitingOn = wait.first + (wait.count > 1 ? l10n(" 외 " + (wait.count - 1), " and " + (wait.count - 1) + " more") : "");
      n.waitingOnFull = wait.full;
    }
  }
  for (const p of projects) {
    const n = add("project", p.id, p, networkState(p), p.title);
    n.stateAvailable = NETWORK_STATES.includes(p.network_state);
    n.attention = p.attention ?? null;
    if (n.state === "waiting") {
      n.next = ms(p.next_check_effective_at);
      if (p.status === "executing" && p.waiting_on) n.waitingOn = n.waitingOnFull = p.waiting_on;
    }
  }
  for (const a of agents) {
    const n = add("agent", a.id, a, networkState(a), a.title || a.role || String(a.id).slice(0, 8));
    n.stateAvailable = NETWORK_STATES.includes(a.network_state);
    if (n.state === "waiting") n.next = ms(a.next_check_effective_at);
  }
  const occupancy = (r) => ({ active: r.occupancy?.active ?? 0, busy: r.occupancy?.busy ?? 0 });
  for (const s of d.resources?.seats || []) Object.assign(add("seat", s.key, s, networkState(s), s.key), occupancy(s));
  const codex = codexCapacity(d.resources?.codex, now);
  Object.assign(add("seat", "codex", d.resources?.codex || { key: "codex" }, codex.state, "codex"), { busy: codex.busy, active: codex.active });
  for (const h of hostRows(d)) Object.assign(add("host", h.key, h, networkState(h), h.label || h.key), occupancy(h));
  for (const a of d.approvals || []) add("approval", a.id, a, a.status === "pending" ? turnAsks.has(a.id) ? "owner" : "waiting" : "done", a.scope_text || a.kind);
  const owned = new Set(ownerWork(d).attention.map((r) => r.key));
  for (const e of [...d.today || [], ...incidents, ...asks]) add("event", e.id, e, owned.has("event:" + e.id) ? "warning" : activeEvents.has(e.id) ? "waiting" : "idle", e.summary || e.kind);
  for (const r of requests) for (const id of requestGoalIds(r, d)) link("request:" + r.id, "goal:" + id);
  for (const p of projects) link("goal:" + p.goal_id, "project:" + p.id);
  for (const a of agents) {
    const holder = standingAgent(a) ? null : a.project_id != null ? "project:" + a.project_id : a.goal_id != null ? "goal:" + a.goal_id : a.parent_id != null ? "agent:" + a.parent_id : null;
    if (holder) link(holder, "agent:" + a.id);
    if (a.seat) link("agent:" + a.id, "seat:" + a.seat);
    if (a.host) link("agent:" + a.id, "host:" + a.host);
  }
  const owner = [], unrouted = [];
  for (const r of turn) {
    const a = r.kind === "approval" && pendingOwner.find((x) => x.id === r.id), g = r.kind === "goal" && goalMap.get(r.id);
    if (r.kind === "approval") owner.push({ key: "approval:" + r.id, label: "▲ A" + r.id + " · " + (a ? a.level + " / " + a.kind : "owner"), why: r.what ?? a?.scope_text, at: r.since });
    else if (r.kind === "step") owner.push({ key: "step:" + r.id, id: r.id, label: "▲ S" + r.id + " · " + (r.what ?? ""), why: r.what, at: r.since, link: r.link, goal_id: r.goal_id ?? null });
    else owner.push({ key: "goal:" + r.id, id: r.id, label: "▲ G" + r.id + " · " + (r.title ?? g?.title ?? ""), why: ownerBlocked(g) && g.owner_action || r.what, at: r.since, ...ownerBlocked(g) ? { owner_action: g.owner_action || "" } : {} });
  }
  for (const r of live.values()) if (nodes.get("request:" + r.id)?.state === "unrouted") unrouted.push({ key: "request:" + r.id, label: "R" + r.id + " · unrouted", why: r.owner_text, at: r.at });
  for (const row of d.review_queue || []) {
    const key = "review:" + row.noun + ":" + row.id;
    add("review", row.id, row, "waiting", row.what || row.text || row.noun + " #" + row.id);
    const node = nodes.get("review:" + row.id);
    nodes.delete(node.key);
    node.key = key;
    nodes.set(key, node);
  }
  for (const n of nodes.values()) if (["warning", "owner"].includes(n.state)) {
    const why = nodeWhy(n, { pendingOwner, ownerWaits, asks: new Set(asks.map((e) => e.id)), now });
    if (why.length) {
      n.why = why.map(whyLine);
      n.whyFull = why;
    }
  }
  return { d, nodes, edges, goals, projects, agents, turn, owner, unrouted, now };
}
const koAge = (age) => {
  const m = Math.floor(Math.max(0, age) / 6e4);
  return m < 60 ? m + l10n("분", "m") : Math.floor(m / 60) + l10n("시간", "h") + (m % 60 ? " " + m % 60 + l10n("분", "m") : "");
};
const percent = (v) => Number.isFinite(v) ? Math.round(v) + "%" : "—";
export const attentionLine = (a) => a.mark + " " + a.label;
export const attentionCount = (d) => ownerWork(d).attention_count;
const MARKS = /^\s*(?:#{1,6}|[-*+>•]|\d+[.)])\s+|\*\*|__|`|~~|\[([^\]]*)\]\([^)]*\)/g;
export const whyLine = (s) => {
  const l = [...clean(String(s ?? "").split("\n").find((l2) => l2.replace(MARKS, "$1").trim())?.replace(MARKS, "$1"))];
  return l.length > 60 ? l.slice(0, 60).join("") + "…" : l.join("");
};
export const blockedWhy = (a) => {
  const t = String(a.result_text ?? "").replace(/^\s*(?:[-*_=]{3,}\s*)?(?:\*\*)?RESULT(?:\*\*)?\s*[:·—]?\s*(?:(?:\*\*)?(?:blocked|stopped|partial|done)\b(?:\*\*)?)?\s*[:·—]?/i, "").trim();
  return l10n("막힘", "Stuck") + (t ? " · " + t : "");
};
export const agentName = (a) => a.source === "codex" ? "CODEX" : a.role === "pm" ? "PM" + (a.project_id ?? "") : isLead(a.role) ? lead() : a.role === "cto" ? "CTO" : a.role === "aide" ? l10n("보좌관", "Aide") : String(a.role || a.id || "agent").toUpperCase();
export const agentLabel = (a) => ({ name: a.role === "aide" ? l10n((isLead(a.launcher_role) ? leadKo() : a.launcher_role === "cto" ? "CTO" : "—") + " 보좌관", (isLead(a.launcher_role) ? lead() : a.launcher_role === "cto" ? "CTO" : "—") + " aide") : agentName(a), state: reportedBlock(a) ? whyLine(blockedWhy(a)) : a.busy ? l10n("작업 중", "Working") : l10n("쉬는 중", "Resting") });
export function nodeWhy(n, { pendingOwner = [], ownerWaits = /* @__PURE__ */ new Map(), asks = /* @__PURE__ */ new Set(), now = Date.now() } = {}) {
  const x = n.data || {}, why = [], ask = (age) => l10n("질문에 " + koAge(age) + "째 답이 없어요 (30분 넘음)", "A question unanswered for " + koAge(age) + " (over 30m)");
  const approval = (a) => l10n(userKo() + " 승인 대기: A", "Waiting for my approval: A") + a.id + " · " + a.kind;
  if (n.kind === "agent") {
    if (n.state === "warning") {
      const role = isLead(x.role) ? lead() : "CTO", words = { leftover_project_ended: l10n("남은 에이전트: 프로젝트가 끝났는데 살아 있어요", "Left over: its project ended and it still runs"), leftover_goal_ended: l10n("남은 에이전트: 목표가 끝났는데 살아 있어요", "Left over: its goal ended and it still runs"), replaced_standing: l10n("남은 에이전트: 새 " + josa(role, "가") + " 떠 있는데 이전 " + josa(role, "가") + " 살아 있어요", "Left over: a new " + role + " is up and the earlier one still runs"), replaced_pm: l10n("남은 에이전트: 프로젝트 PM이 바뀌었는데 이전 PM이 살아 있어요", "Left over: the project has a new PM and the earlier one still runs"), other_leftover: l10n("남은 에이전트: 끝난 일의 에이전트가 살아 있어요", "Left over: its work ended and it still runs"), blocked: l10n("확인: 에이전트가 blocked 상태예요", "Check: the agent is blocked"), blocked_on_owner: l10n("확인: 에이전트가 " + userKo() + " 조치를 기다린다고 해요", "Check: the agent says it waits for me") };
      if (reportedBlock(x)) why.push(blockedWhy(x));
      why.push(...(x.attention_codes || []).map((code) => words[code]).filter(Boolean));
    }
  } else if ((n.kind === "goal" || n.kind === "project") && n.attention) {
    why.push(n.attention.label);
    if (String(n.attention.why ?? "").trim()) why.push(String(n.attention.why).trim());
  } else if (n.kind === "goal") {
    if (n.state === "owner" && ownerBlocked(x)) why.push(l10n(userKo() + " 조치를 기다려요", "Waiting for my action"));
    else if (n.state === "owner") {
      for (const a of pendingOwner) if (a.goal_id === x.id) why.push(approval(a));
      if (ownerWaits.has(x.id)) why.push(l10n(userKo() + " 답을 기다려요", "Waiting for my answer") + (ownerWaits.get(x.id).what ? " · " + ownerWaits.get(x.id).what : ""));
    }
  } else if (n.kind === "seat") {
    const s = x.data || {};
    if (x.fault === true) why.push(s.status !== "OK" ? "시트 상태: " + seatWord(x) + " (정상이 아니에요)" : "시트 5시간 사용량 수치가 안 들어와요");
    if (s.red) why.push("사용량이 빨간선을 넘었어요: 5시간 " + percent(s.five_hour) + " · 주간 " + percent(s.weekly));
  } else if (n.kind === "host") why.push("기기 상태: " + (x.label_text ?? "—") + " (정상이 아니에요)");
  else if (n.kind === "approval") why.push(approval(x));
  else if (n.kind === "event") why.push(asks.has(x.id) ? ask(now - ms(x.at)) : l10n((x.kind === "health.core_down" ? "핵심 서비스 중단" : "장애") + ": 복구 기록이 아직 없어요", (x.kind === "health.core_down" ? "Core service down" : "Fault") + ": no recovery recorded yet"));
  else if (n.kind === "review") why.push(ask(reviewAge(x, now)));
  return why;
}
const hangul = (s) => (s.match(/[\uac00-\ud7a3]/g) || []).length, spoken = (s) => !!s && (lang() === "en" || hangul(s) * 3 >= (s.match(/[A-Za-z]/g) || []).length && hangul(s) > 0);
const firstSentence = (s) => scrub(String(s ?? "").split("\n").find((l) => l.trim()) || "").split(/(?<=[.!?。])\s+/)[0];
export const stamp = (t) => {
  const s = new Date(wall(t)).toISOString();
  return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)) + " " + s.slice(11, 16);
};
export function waitFacts(n, events = [], projects = []) {
  if (!(n?.state === "waiting" || n?.place === "later") || !["goal", "project"].includes(n.kind)) return [];
  const x = n.data || {}, own = n.kind === "project" ? [x] : projects.filter((p) => p.goal_id === x.id && !terminal(p.status) && p.status !== "done_candidate");
  const whose = (n.kind === "project" ? x.whose : n.whose) || {}, what = scrub(whose.what || x.waiting_on || n.waitingOnFull || ""), who = whose.name;
  const ids = new Set(own.map((p) => p.id)), blocked = own.map((p) => firstSentence(p.blocked)).find(spoken);
  const note = [...events].filter((e) => e.kind === "project.note" && ids.has(e.project_id) || n.kind === "goal" && e.kind === "goal.note" && e.goal_id === x.id).sort((a, b) => ms(b.at) - ms(a.at) || b.id - a.id).map((e) => firstSentence(stepText(e))).find(Boolean);
  const why = blocked || (spoken(note) ? note : ""), at = Number.isFinite(n.next) ? n.next : ms(x.next_check_at);
  return [[l10n("무엇을", "What"), what || "—", "wrap"], [l10n("누가", "Who"), who || "—", "wrap"], ...why ? [[l10n("왜", "Why"), why, "wrap"]] : [], [l10n("언제까지", "By when"), Number.isFinite(at) ? stamp(at) : "—", "wrap"]];
}
export function trace(model, key) {
  const n = model.nodes.get(key);
  if (n?.kind === "approval" && n.data.goal_id != null) key = "goal:" + n.data.goal_id;
  if (n?.kind === "event") {
    const e = n.data;
    key = e.project_id != null ? "project:" + e.project_id : e.goal_id != null ? "goal:" + e.goal_id : e.agent_id ? "agent:" + e.agent_id : key;
  }
  const all = /* @__PURE__ */ new Set([key]);
  for (const dir of ["up", "down"]) {
    const seen = /* @__PURE__ */ new Set([key]), queue = [key];
    while (queue.length) {
      const current = queue.shift();
      for (const e of model.edges) {
        const next = dir === "up" ? e.to === current ? e.from : null : e.from === current ? e.to : null;
        if (next && !seen.has(next)) {
          seen.add(next);
          all.add(next);
          queue.push(next);
        }
      }
    }
  }
  return all;
}
export { readRoute, routeHash } from "./routing.js";
export function reviewAge(row, now = Date.now()) {
  const at = ms(row.since);
  return Number.isFinite(at) ? Math.max(0, now - at) : Math.max(0, (row.age_seconds ?? 0) * 1e3);
}
export function ageLabel(age) {
  const m = Math.floor(Math.max(0, age) / 6e4);
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h" + m % 60 + "m";
}
const priority = (n) => ({ running: 0, warning: 1, owner: 2, idle: 3, waiting: 4, done: 5 })[n.state] ?? 3;
export const reportedBlock = (a) => ["blocked", "stopped"].includes(a.result_word) && !a.busy && a.network_state === "warning";
export function lanePriority(m, n) {
  return n.kind === "goal" && Number.isInteger(n.urgency) ? n.urgency : n.kind === "project" && n.state !== "done" ? Math.min(priority(n), ...(n.data.agents || []).map((a) => m.nodes.get("agent:" + a.id)).filter(Boolean).map(priority)) : priority(n);
}
export function laneData(m, { showWaiting = false, showLater = false } = {}) {
  const node = (kind, id) => m.nodes.get(kind + ":" + id), rank = (n) => lanePriority(m, n), shown = (kind, o) => node(kind, o.id)?.state !== "done", temporary = (a) => shown("agent", a) && !standingAgent(a), byRank = (a, b) => rank(a) - rank(b) || a.id - b.id;
  const lane = (n, muted) => {
    const g = n.data;
    const left = (a) => a.project_id != null && m.nodes.get("agent:" + a.id)?.state !== "done" && !m.projects.some((p) => p.id === a.project_id && m.nodes.get("project:" + p.id)?.state !== "done") && (a.goal_id === g.id || m.projects.some((p) => p.goal_id === g.id && p.id === a.project_id));
    const rows = m.projects.filter((p) => p.goal_id === g.id && shown("project", p)).map((p) => node("project", p.id)).filter(Boolean).map((p) => ({ node: p, muted: !muted && rank(p) >= 3, agents: (p.data.agents || []).filter((a) => temporary(a) && !left(a)).map((a) => node("agent", a.id)).filter(Boolean) })).filter((r) => muted || r.agents.length || rank(r.node) < 3 || unavailable(r.node)).sort((a, b) => byRank(a.node, b.node));
    const loose = m.agents.filter((a) => (a.project_id == null ? a.goal_id === g.id : left(a)) && temporary(a)).map((a) => node("agent", a.id)).filter(Boolean);
    return { key: n.key, head: n, req: node("request", originRequestId(g, m.d)), rows, loose, muted };
  };
  const unavailable = (n) => n.stateAvailable === false || n.kind === "project" && (n.data.agents || []).some((a) => node("agent", a.id)?.stateAvailable === false);
  const goals = m.goals.map((g) => node("goal", g.id)).filter(Boolean), open = goals.filter((n) => n.state !== "done");
  return [...open.filter((n) => n.place === "live" || n.place == null).sort(byRank).map((n) => lane(n, false)), ...showWaiting ? open.filter((n) => n.place === "waiting").sort(byRank).map((n) => lane(n, true)) : [], ...showLater ? open.filter((n) => n.place === "later").sort((a, b) => (ms(a.data.next_check_at) || Infinity) - (ms(b.data.next_check_at) || Infinity) || a.id - b.id).map((n) => lane(n, true)) : []];
}
