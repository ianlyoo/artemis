import { historyStart, namedEvent, namedAgent, namedGoal, ms, MIN } from "./tl-model.js";
const RETRY = 6e4;
const HQ_STATE = new Set(["goal.created", "goal.status", "goal.waiting"]);
export function createHistory(load, { changed = () => {
} } = {}) {
  const events = new Map(), agents = new Map(), goals = new Map();
  let from = NaN, coverage = NaN, newest = -Infinity, loading = null, failedAt = -Infinity, read = false;
  let shown = null, activity = null;
  let moved = false;
  const keep = (list, map, named) => {
    for (const x of list || []) if (x?.id != null) map.set(x.id, named(x));
  };
  const add = (list) => {
    for (const e of list || []) {
      if (e?.id == null || !e.kind || events.has(e.id)) continue;
      const t = ms(e.at);
      if (!Number.isFinite(t)) continue;
      events.set(e.id, namedEvent(e));
      shown = null;
      if (t > newest) newest = t;
    }
  };
  async function fetch(start2, end, whole) {
    let body = null;
    try {
      body = await load(start2, end);
    } catch {
    }
    if (!body || body.ok === false || !Array.isArray(body.events)) {
      failedAt = Date.now();
      return false;
    }
    add(body.events);
    keep(body.agents, agents, namedAgent);
    keep(body.goals, goals, namedGoal);
    if (whole) activity = body.activity?.schema_version === 1 ? body.activity : null;
    const oldest = Math.min(...body.events.map((e) => ms(e.at)).filter(Number.isFinite));
    if (whole) {
      from = start2;
      coverage = body.truncated && Number.isFinite(oldest) ? Math.max(start2, oldest) : start2;
      read = true;
    }
    return true;
  }
  function start(task) {
    loading = task.finally(() => {
      loading = null;
      changed();
    });
    return loading;
  }
  function frame(dashboard, now = Date.now()) {
    const today = (dashboard?.today || []).filter((e) => Number.isFinite(ms(e?.at)));
    const before = newest, oldest = Math.min(...today.map((e) => ms(e.at)));
    moved ||= read && today.some((e) => HQ_STATE.has(e.kind) && !events.has(e.id));
    add(today);
    keep(dashboard?.agents, agents, namedAgent);
    keep(dashboard?.goals, goals, namedGoal);
    if (!loading && now - failedAt >= RETRY) {
      const want = historyStart(now);
      if (!read || moved) {
        moved = false;
        start(fetch(want, now, true));
      } else if (today.length >= 200 && Number.isFinite(before) && oldest > before + 1e3) start(fetch(Math.max(want, before - MIN), Math.ceil(oldest) + 1, false));
    }
    prune(now);
    return view();
  }
  function prune(now) {
    const cut = historyStart(now) - 30 * MIN;
    if (!(cut > from)) return;
    for (const [id, e] of events) if (ms(e.at) < cut) events.delete(id);
    from = cut;
    coverage = Math.max(coverage, cut);
    shown = null;
  }
  function view() {
    shown ??= [...events.values()];
    return { events: shown, agents: [...agents.values()], goals: [...goals.values()], coverage: read ? coverage : NaN, ...activity ? { activity } : {} };
  }
  return { frame, view, get loading() {
    return loading;
  }, get ready() {
    return read;
  } };
}
