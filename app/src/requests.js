import { goalPlace } from "./goal-place.js";
const list = (v) => Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
const read = new WeakMap();
export function ownerWork(d) {
  if (!d || typeof d !== "object") return ownerWork({});
  if (read.has(d)) return read.get(d);
  const w = d.owner_work && typeof d.owner_work === "object" && Array.isArray(d.owner_work.requests) ? d.owner_work : null;
  const requests = list(w?.requests), groups = list(w?.work_groups);
  const facts = new Map(list(w?.goals).map((g) => [g.id, g]));
  const turn = list(d.owner_turn).filter((r) => ["approval", "goal", "step"].includes(r.kind));
  const owner_turn = turn, owner = w ?? {};
  const approvals = { ...w?.approvals, items: list(d.approvals) };
  const out = { source: w ? "ledger" : "unavailable", requests, request_count: requests.length, work_groups: groups, work_group_count: groups.length, facts, running_goal_count: w ? [...facts.values()].filter((g) => g.is_running === true).length : null, owner_turn, owner_groups: owner.owner_groups ?? [], owner_contract_version: owner.owner_contract_version, approvals, completed: d.completed ?? null, attention: list(w?.attention), attention_count: w?.attention_count ?? 0 };
  read.set(d, out);
  return out;
}
export const activeGoalIds = (d) => new Set(ownerWork(d).work_groups.filter((g) => g.kind === "goal").map((g) => g.id));
export const goalFacts = (d, id) => ownerWork(d).facts.get(id) ?? null;
export const liveById = (d) => new Map(ownerWork(d).requests.map((r) => [r.id, r]));
export const originFirst = (requests) => [...requests].sort((a, b) => (b.how === "origin") - (a.how === "origin"));
export function goalRequests(goal, d) {
  if (Array.isArray(goal.requests)) return originFirst(goal.requests);
  return ownerWork(d).requests.filter((r) => list(r.goals).some((g) => g.id === goal.id)).map((r) => ({ ...r, how: "attach" }));
}
export const originRequestId = (goal, d) => goalRequests(goal, d).find((r) => r.how === "origin")?.id ?? goalRequests(goal, d)[0]?.id;
export function requestGoalIds(request, d) {
  const ids = list(request.goals).map((g) => g.id);
  for (const goal of d.goals || []) if (list(goal.requests).some((r) => r.id === request.id)) ids.push(goal.id);
  return [...new Set(ids)];
}
export function runningSummary(d) {
  const w = ownerWork(d), goals = [...w.facts.values()], running = goals.filter((g) => goalPlace(g) === "live");
  return w.source === "ledger" ? { count: running.length, tone: goals.some((g) => g.state === "owner") ? "owner" : running.length ? "running" : "idle" } : null;
}
