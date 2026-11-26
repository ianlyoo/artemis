const grouping = (w) => ({ owner_groups: w.owner_groups, owner_contract_version: w.owner_contract_version });
export function fromFrame(d) {
  const w = d?.owner_work;
  if (!w || !Array.isArray(w.requests) || !Array.isArray(d.owner_turn)) return null;
  const facts = new Map((w.goals || []).map((g) => [g.id, g])), listed = new Set((d.goals || []).map((g) => g.id));
  return { ...grouping(w), schema_version: 1, requests: w.requests, request_count: w.request_count ?? w.requests.length, owner_turn: d.owner_turn, approvals: { ...w.approvals, items: d.approvals || [] }, ...Array.isArray(w.lead_turn) ? { lead_turn: w.lead_turn } : {}, attention: Array.isArray(w.attention) ? w.attention : [], attention_count: w.attention_count ?? 0, ...Array.isArray(w.work_groups) ? { work_groups: w.work_groups, work_group_count: w.work_group_count ?? w.work_groups.length } : {}, goals: [...(d.goals || []).map((g) => ({ ...g, ...facts.get(g.id) })), ...[...facts.values()].filter((g) => !listed.has(g.id))] };
}
export function createAdminData() {
  let work = null;
  return { lanes: (dashboard) => (work = fromFrame(dashboard) ?? work) ?? {}, get work() {
    return work;
  } };
}
