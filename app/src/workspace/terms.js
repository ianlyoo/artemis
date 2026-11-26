import { postJSON, homeApi } from "./api.js";
import { lead } from "../names.js";
export const LIST_LINES = { get offline() {
  return `Can't reach ${lead()}'s Paseo`;
}, get no_target() {
  return lead() + " isn't found yet";
}, version_mismatch: "Paseo's version doesn't match, so terminals can't open", failed: "Couldn't load the terminals", empty: "No terminals open" };
export const listLine = (state, terminals) => state === "failed" ? LIST_LINES.failed : terminals?.length ? null : state && state !== "ready" ? LIST_LINES[state] ?? LIST_LINES.failed : LIST_LINES.empty;
const ACTIVITY = { idle: "idle", working: "working", attention: "needs a look" }, ATTENTION = { needs_input: "needs input", finished: "finished" };
export const termReadOnly = (term) => term?.closed === true || term?.readOnly === true;
export const termStatus = (term) => termReadOnly(term) ? { line: "closed", owner: false } : { line: ATTENTION[term?.attention] ?? ACTIVITY[term?.activity] ?? "", owner: term?.attention === "needs_input" };
export const waitsOnOwner = (terminals) => (terminals ?? []).some((term) => !termReadOnly(term) && term.attention === "needs_input");
export const termBusy = (term) => !termReadOnly(term) && (term?.activity === "working" || term?.attention === "needs_input");
export const closeAsks = (term, screen) => termBusy(term) || !screen?.atPrompt?.();
export const isHome = (term) => term?.owner === "home";
export function termWhere(term, terminals = null) {
  if (termReadOnly(term)) return "Previous " + lead();
  const where = isHome(term) ? String(term.cwd ?? "") : lead();
  if (!isHome(term) || !terminals) return where;
  const same = terminals.filter((other) => isHome(other) && other.name === term.name && String(other.cwd ?? "") === where);
  return same.length > 1 ? `${where} (${same.findIndex((other) => other.id === term.id) + 1})` : where;
}
export const NEW_LINES = { busy: "8 of Home's terminals are open, the most at once · end one to open another", forbidden: "Can't open a terminal there · only in a folder under work or system", refused: "Home refused to open a terminal", offline: "Can't reach Paseo, so no terminal opened", create_failed: "Paseo couldn't open a terminal", failed: "Couldn't open a terminal" };
const NEW_ERRORS = { 429: "busy", 403: "forbidden", 502: "create_failed", 503: "offline" };
export async function newTerminal({ api = homeApi, cwd = null } = {}) {
  const answer = await postJSON(api, "/term/new", cwd ? { cwd } : {});
  const terminal = answer.body?.terminal;
  if (answer.ok && typeof terminal?.id === "string" && terminal.id) return { ok: true, terminal };
  const error = NEW_LINES[answer.body?.error] ? answer.body.error : NEW_ERRORS[answer.status] ?? "failed";
  return { ok: false, error, line: error === "forbidden" && !cwd ? NEW_LINES.refused : NEW_LINES[error] };
}
export async function warmTerminal({ api = homeApi } = {}) {
  try {
    const answer = await postJSON(api, "/term/warm", {});
    return answer.ok && answer.body?.warm === true;
  } catch {
    return false;
  }
}
export const panel = { show: (state, id) => ({ ...state, list: state.list.includes(id) ? state.list : [...state.list, id], active: id, open: true }), drop(state, id) {
  const at = state.list.indexOf(id), list = state.list.filter((item) => item !== id);
  const active = state.active !== id ? state.active : list[at] ?? list[at - 1] ?? null;
  return { ...state, list, active, open: state.open && list.length > 0 };
}, toggle(state, terminals) {
  if (state.open) return { ...state, open: false };
  const ids = (terminals ?? []).map((term) => term.id);
  const pick = (terminals ?? []).find((term) => term.attention === "needs_input" && !state.list.includes(term.id))?.id ?? (ids.includes(state.active) ? state.active : null) ?? state.list.find((id) => ids.includes(id)) ?? ids[0] ?? null;
  return pick ? panel.show(state, pick) : { ...state, open: true };
}, prune(state, listState, terminals) {
  if (listState !== "ready") return state;
  const ids = new Set((terminals ?? []).map((term) => term.id));
  let next = state;
  for (const id of state.list) if (!ids.has(id)) next = panel.drop(next, id);
  return next;
} };
