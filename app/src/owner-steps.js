const FAIL = () => globalThis.document?.documentElement?.getAttribute?.("lang") === "en" ? "Not marked done. Try again." : "완료로 바꾸지 못했어요. 다시 시도해 주세요.";
const states = new Map(), answered = new Set(), listeners = new Set();
let frame = null;
const changed = () => {
  for (const fn of [...listeners]) fn();
};
const key = (id) => String(id ?? "");
export const stepState = (id) => states.get(key(id)) ?? {};
export const stepDone = (id) => states.get(key(id))?.done === true;
export function onOwnerTurn(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const ownerFrame = () => frame;
export async function markStepDone(api, id) {
  id = key(id);
  if (!/^[1-9]\d{0,11}$/.test(id) || states.get(id)?.pending || stepDone(id)) return;
  states.set(id, { pending: true });
  changed();
  try {
    const response = await api("/owner-steps/" + id + "/done", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const refused = response.status === 403 ? await response.json().catch(() => ({})) : {};
    states.set(id, response.ok ? { done: true } : { error: refused.error === "browser_host" && refused.message || FAIL() });
  } catch {
    states.set(id, { error: FAIL() });
  }
  changed();
}
const actionKey = (kind, id) => kind + ":" + key(id);
export function markAnswered(kind, id) {
  if (answered.has(actionKey(kind, id))) return;
  answered.add(actionKey(kind, id));
  changed();
}
export function setOwnerFrame(d) {
  if (!d || typeof d !== "object") return;
  frame = d;
  const actions = groupsOf(d).flatMap((g) => g.actions ?? []);
  const live = new Set(actions.filter((r) => r.kind === "step").map((r) => key(r.id))), listed = new Set(actions.map((r) => actionKey(r.kind, r.id)));
  for (const [id, st] of states) if (st.done && !live.has(id)) states.delete(id);
  for (const k of answered) if (!listed.has(k)) answered.delete(k);
  changed();
}
const groupsOf = (d) => (d?.owner_work ?? d)?.owner_groups ?? [];
export function ownerTurn(d, isDone = stepDone) {
  const groups = groupsOf(d);
  return groups.map((g) => ({ ...g, actions: (g.actions ?? []).filter((a) => a.kind === "step" ? !isDone(a.id) : !answered.has(actionKey(a.kind, a.id))) })).filter((g, i) => !groups[i].actions?.length || g.actions.length);
}
export const ownerCount = (d = frame, isDone = stepDone) => ownerTurn(d, isDone).reduce((n, g) => n + (g.actions.length || 1), 0);
