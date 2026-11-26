import { standingAgent } from "../model.js";
import { has } from "../names.js";
export const MINUTES = 30, MINUTE = 6e4;
const STARTS = new Set(["agent.turn_started"]), ENDS = new Set(["agent.goal_finished", "agent.turn_ended", "agent.child_completed", "agent.closed", "agent.archived"]);
const at = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
export function turnsOf(a, list, now, horizon, live) {
  const turns = [];
  let open = null, seen = false;
  for (const e of list) {
    const t = at(e.at);
    if (STARTS.has(e.kind)) {
      if (!open) open = { start: t };
      seen = true;
    } else if (ENDS.has(e.kind)) {
      if (open) {
        turns.push({ ...open, end: Math.max(t, open.start) });
        open = null;
      } else if (!seen && !["agent.closed", "agent.archived"].includes(e.kind)) {
        const s = Math.max(horizon, at(a?.created_at) || horizon);
        if (t > s) turns.push({ start: s, end: t });
      }
      seen = true;
    }
  }
  if (open) {
    if (live) turns.push({ ...open, end: now });
    else {
      const ends = [a?.ended_at, a?.finished_at, a?.last_turn_at].map(at).filter((t) => t !== null && t >= open.start);
      turns.push({ ...open, end: Math.min(now, ends.length ? Math.min(...ends) : open.start + MINUTE) });
    }
  } else if (live) {
    const s = Math.max(horizon, at(a?.created_at) ?? -Infinity, list.length ? at(list[list.length - 1].at) : -Infinity, turns.length ? turns[turns.length - 1].end : -Infinity);
    turns.push({ start: Math.min(s, now), end: now });
  }
  return turns;
}
export const REST_WINDOW = 1e4, FULL = 300;
const rest = { events: [], through: -Infinity, version: 0, busy: false, asked: -Infinity };
const oldest = (d) => Math.min(...(d.today || []).map((e) => at(e?.at)).filter((t) => t !== null));
const short = (d, now) => (d.today || []).length >= FULL && oldest(d) > now - MINUTES * MINUTE;
export async function readRest(load = async () => (await (await import("/client.js")).api("/today-rest")).json(), through = Infinity, now = Date.now()) {
  rest.busy = true;
  rest.asked = now;
  try {
    const answer = await load();
    if (answer?.ok === true && Array.isArray(answer.events)) {
      rest.events = answer.events;
      rest.through = through;
      rest.version++;
    }
  } catch {
  }
  rest.busy = false;
}
export const restDue = (d, now, shown = typeof document !== "undefined" && !document.hidden) => has("network") && shown && !rest.busy && now - rest.asked >= REST_WINDOW && short(d, now) && oldest(d) > rest.through;
export const restFeed = () => rest;
const PREPARED = new WeakMap();
function prepared(d, now) {
  if (restDue(d, now)) void readRest(void 0, oldest(d), now);
  let p = PREPARED.get(d);
  if (p && p.version === rest.version) return p;
  const byAgent = new Map(), seen = new Set(), named = new Map();
  const projectGoal = new Map((d.goals || []).flatMap((g) => (g?.projects || []).map((p2) => [p2?.id, p2?.goal_id ?? g.id])));
  for (const e of [...d.today || [], ...short(d, now) ? rest.events : []]) {
    if (!e?.agent_id || e.id != null && seen.has(e.id) || at(e.at) === null) continue;
    if (e.id != null) seen.add(e.id);
    if (!byAgent.has(e.agent_id)) byAgent.set(e.agent_id, []);
    byAgent.get(e.agent_id).push(e);
  }
  for (const list of byAgent.values()) list.sort((x, y) => at(x.at) - at(y.at) || x.id - y.id);
  const records = new Map((d.agents || []).filter((a) => a?.id != null).map((a) => [a.id, a])), mine = new Map();
  for (const a of records.values()) if (!standingAgent(a)) {
    const g = a.goal_id ?? projectGoal.get(a.project_id);
    if (!mine.has(g)) mine.set(g, []);
    mine.get(g).push(a.id);
  }
  for (const [id, list] of byAgent) if (!records.has(id)) for (const e of list) {
    if (!named.has(e.goal_id)) named.set(e.goal_id, new Set());
    named.get(e.goal_id).add(id);
  }
  PREPARED.set(d, p = { byAgent, records, mine, named, version: rest.version });
  return p;
}
export function goalSpans(d, goalId, now) {
  if (!d) return [];
  const start = now - MINUTES * MINUTE, { byAgent, records, mine, named } = prepared(d, now), spans = [];
  for (const id of new Set([...mine.get(goalId) || [], ...named.get(goalId) || []])) {
    const a = records.get(id);
    let list = byAgent.get(id) || [];
    if (list.length && at(list[list.length - 1].at) > now) list = list.filter((e) => at(e.at) <= now);
    const live = a?.network_state === "running";
    for (const turn of turnsOf(a, list, now, start, live)) spans.push({ who: id, from: turn.start, to: turn.end });
  }
  return spans.filter((s) => s.to > start).map((s) => ({ ...s, from: Math.max(s.from, start), to: Math.min(s.to, now) }));
}
export function perMinute(spans, now) {
  const start = now - MINUTES * MINUTE;
  return Array.from({ length: MINUTES }, (_, i) => {
    const a = start + i * MINUTE, b = a + MINUTE, inside = spans.filter((s) => s.from < b && s.to > a);
    return { n: new Set(inside.map((s) => s.who)).size, state: inside.some((s) => !s.state || s.state === "running") ? "running" : inside.length ? "waiting" : null };
  });
}
export const busyMinutes = (bins) => bins.filter((b) => b.n > 0).length;
