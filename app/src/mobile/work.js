import { standingAgent, ownerBlocked, lanePriority, laneData, reportedBlock, agentName } from "../model.js";
import { runningSummary } from "../requests.js";
import { hostName } from "../pc-data.js";
import { clean, when, elapsed } from "./format.js";
import { isLead, leadKo, l10n } from "../names.js";
const PRIORITY = { running: 0, warning: 1, owner: 2, idle: 3, waiting: 4, done: 5 };
const priority = (n) => PRIORITY[n.state] ?? 3;
const agentTitle = (a) => clean(a.title).replace(/^#\d+\s*·\s*/, "");
const projectTitle = (title, goal) => {
  const t = clean(title), g = clean(goal), rest = g && t.startsWith(g) ? t.slice(g.length).match(/^\s*[·:|/—–-]\s*(\S.*)$/) : null;
  return rest ? rest[1] : t;
};
const more = (n) => n > 0 ? " +" + n : "";
export const waitingOn = (n) => {
  if (n?.state !== "waiting" || !n.waitingOn) return null;
  const short = n.waitingFirst ? n.waitingFirst + more(n.waitingMore) : n.waitingOn;
  return { short, full: n.waitingOnFull || short };
};
export const ATTENTION = { warning: 1, owner: 2 }, LONG = 2 * 36e5;
const at = (v) => typeof v === "number" ? v : v ? Date.parse(v) : NaN, minutes = (t, now) => Math.floor(Math.max(0, now - at(t)) / 6e4);
export const lasting = (t, now = Date.now()) => {
  if (!Number.isFinite(at(t))) return "";
  const m = minutes(t, now), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return m < 1 ? "just started" : m < 60 ? m + "m" : h < 24 ? h + "h" + (m % 60 ? " " + m % 60 + "m" : "") : d + "d" + (h % 24 ? " " + h % 24 + "h" : "");
};
export const ago = (t, now = Date.now()) => {
  if (!Number.isFinite(at(t))) return "";
  const m = minutes(t, now), h = Math.floor(m / 60);
  return m < 1 ? "just now" : m < 60 ? m + "m ago" : h < 24 ? h + "h ago" : Math.floor(h / 24) + "d ago";
};
const WORD = { running: "working", warning: "needs a look", owner: "owner" };
const turn = (a) => at(a.last_turn_at), observed = (a) => a.source === "codex";
const names = (list) => {
  const c = new Map();
  for (const n of list) {
    const k = agentName(n.data);
    c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c].map(([k, v]) => v > 1 ? k + " " + v : k).join(" · ");
};
function team(list, now) {
  const busy = list.filter((n) => n.state === "running"), flagged = list.filter((n) => n.state in ATTENTION), idle = list.filter((n) => n.state !== "running" && !(n.state in ATTENTION));
  const count = (l, word) => l.length ? l.length + " " + word : "";
  if (busy.length) {
    const t2 = Math.min(...busy.map((n) => turn(n.data)).filter(Number.isFinite));
    return { who: names(busy) + " working", when: lasting(t2, now), long: now - t2 >= LONG, rest: [count(idle, "idle"), count(flagged, "need" + (flagged.length > 1 ? "" : "s") + " a look")].filter(Boolean).join(" · ") };
  }
  const lead = flagged.length ? flagged : idle, t = Math.max(...lead.map((n) => at(n.data.last_turn_at)).filter(Number.isFinite));
  return { who: lead.length ? names(lead) + (flagged.length ? " needs a look" : " idle") : "no agent on it", when: Number.isFinite(t) ? "last turn " + ago(t, now) : "", long: false, rest: flagged.length ? count(idle, "idle") : "" };
}
const agentNow = (n, now) => {
  const a = n.data, busy = n.state === "running", title = agentTitle(a);
  return { key: n.key, state: n.state, name: agentName(a) + (a.role === "aide" ? " · " + (isLead(a.launcher_role) ? leadKo() : a.launcher_role === "cto" ? "CTO" : "—") : ""), title: title.toLowerCase() === String(a.role).toLowerCase() ? "" : title, seat: a.seat || (a.source === "codex" ? "codex" : ""), long: busy && now - turn(a) >= LONG, act: reportedBlock(a) ? l10n("막힘", "stuck") : busy ? ["working", lasting(turn(a), now)].filter(Boolean).join(" ") : a.role === "aide" ? n.state : a.last_turn_at ? "last turn " + ago(a.last_turn_at, now) : observed(a) ? "idle" : "no turn yet", ...n.why ? { why: n.why.join(" · ") } : {} };
};
function doing(m, n, rows, loose, now) {
  const g = n.data, projects = rows.map((r) => r.node), agents = [...rows.flatMap((r) => r.agents), ...loose];
  const urgent = ownerBlocked(g) && n.state in ATTENTION ? n : [n, ...projects, ...agents].filter((x) => x.state in ATTENTION).sort((a, b) => ATTENTION[a.state] - ATTENTION[b.state])[0];
  let step;
  if (urgent) {
    const x = urgent.data, action = urgent.kind === "goal" && ownerBlocked(x) ? clean(x.owner_action) : "";
    const asked = urgent.kind === "goal" && urgent.state === "owner" ? (m.d.approvals || []).find((a) => a.status === "pending" && a.level === "owner" && a.goal_id === x.id) : null;
    const since = at(asked ? asked.created_at : urgent.attention ? urgent.attention.since : urgent.kind === "goal" ? x.updated_at : urgent.kind === "project" ? null : turn(x));
    step = { state: urgent.state, text: action || urgent.why?.[0] || WORD[urgent.state], since: lasting(since, now), long: Number.isFinite(since) && now - since >= LONG };
  } else {
    const running = projects.filter((p) => p.state === "running"), from = running.length ? running : projects, said = [...new Set(from.map((p) => clean(p.data.waiting_on)).filter(Boolean))];
    step = { state: "running", text: said.length ? said[0] + more(said.length - 1) : from.length ? "running · " + projectTitle(from[0].data.title, g.title) : "running", since: "", long: false };
  }
  const why = [...new Set([ownerBlocked(g) ? clean(g.owner_action) : "", ...n.why || []])].filter((t) => t && t !== step.text).join(" · ");
  const detail = { projects: rows.map(({ node: p, agents: crew }) => ({ key: p.key, state: p.state, name: "P" + p.id, place: (hostName(p.data.host) || "—") + " / " + (p.data.seat || "—"), title: projectTitle(p.data.title, g.title), note: p.why ? p.why.join(" · ") : clean(p.data.waiting_on), agents: crew.map((a) => agentNow(a, now)) })), loose: loose.map((a) => agentNow(a, now)) };
  return { attn: urgent ? ATTENTION[urgent.state] : 3, step, why, team: team(agents, now), detail };
}
export function workTree(m, now = Date.now()) {
  const node = (kind, id) => m.nodes.get(kind + ":" + id), open = (n) => n && n.state !== "done";
  const rank = (n) => lanePriority(m, n);
  const byRank = (a, b) => rank(a) - rank(b) || a.id - b.id;
  const row = (n, name, title, since) => ({ key: n.key, state: n.state, name, title, since: elapsed(since, now), next: n.state !== "waiting" ? "" : n.next ? "next " + when(n.next, now) : n.stateLabel || "", ...n.why ? { why: { short: n.why[0] + more(n.why.length - 1), full: n.why.join(" · ") } } : {} });
  const goals = m.goals.map((g) => node("goal", g.id)).filter(open);
  const lanes = new Map(laneData(m).map((l) => [l.key, l]));
  const live = goals.filter((n) => lanes.has(n.key)).sort(byRank).map((n) => {
    const { rows, loose } = lanes.get(n.key);
    return { key: n.key, state: n.state, name: "G" + n.id, title: clean(n.data.title), ...doing(m, n, rows, loose, now) };
  }).sort((a, b) => a.attn - b.attn);
  const quiet = goals.filter((n) => !lanes.has(n.key)).sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity) || a.id - b.id).map((n) => {
    const r = row(n, "G" + n.id, clean(n.data.title), n.data.created_at), why = waitingOn(n);
    return why ? { ...r, why } : r;
  });
  const standing = (a) => isLead(a.data.role) ? 0 : a.data.role === "cto" ? 1 : 2;
  const agents = m.agents.filter((a) => standingAgent(a) || a.project_id == null && a.goal_id == null).map((a) => node("agent", a.id)).filter((n) => open(n) && (standingAgent(n.data) || priority(n) < 3)).sort((a, b) => standing(a) - standing(b) || Number(b.state === "running") - Number(a.state === "running")).map((n) => {
    const a = n.data;
    return { key: n.key, state: n.state, name: agentName(a), word: WORD[n.state] || "idle", act: n.state === "running" ? lasting(turn(a), now) : a.last_turn_at ? "last turn " + ago(a.last_turn_at, now) : "", ...n.why ? { why: n.why.join(" · ") } : {} };
  });
  return { agents, live, quiet, tone: runningSummary(m.d)?.tone ?? ([...live, ...quiet].some((g) => g.state === "owner") ? "owner" : live.length ? "running" : "idle") };
}
