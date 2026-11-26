import { readRoute, screenRoute, learnRoute, canonicalHash, TABS, tabHash, boardHash } from "../routing.js";
import { has } from "../names.js";
const KEYS = { admin: "admin", status: "seats", workspace: "lead", explorer: "explorer" };
const NEEDS = { admin: "approvals", seats: "network", lead: "chat", explorer: "boards" };
export const viewShown = (key) => has(NEEDS[key]);
export const VIEWS = [...TABS.slice(0, 2), ["explorer", "Explorer"], ...TABS.slice(2)].map(([tab, name]) => [KEYS[tab], name]);
export const viewName = (key) => VIEWS.find(([name]) => name === key)?.[1] ?? "";
export function phoneRoute(where) {
  const route = placeOf(where);
  const kept = { ...route, ...route.boards && !has("boards") ? { boards: false, boardId: null } : {}, ...route.screen && !has("pc") ? { screen: false } : {}, ...route.learn && !has("learn") ? { learn: false } : {} };
  return kept.tab == null || viewShown(kept.tab) ? kept : { boardId: null, menu: false, tab: VIEWS.map(([key]) => key).find(viewShown) ?? null };
}
function placeOf(where) {
  where = { ...where, hash: canonicalHash(where) ?? where.hash };
  const path = where.hash.replace(/^#/, ""), base = { boardId: null, menu: false };
  const completed = path.match(/^\/(?:completed|work\/done)(?:\/([1-9]\d*))?\/?$/);
  if (completed) return { ...base, tab: "admin", completed: true, goalId: completed[1] ? Number(completed[1]) : null };
  if (screenRoute(where.hash)) return { ...base, tab: "lead", screen: true };
  if (learnRoute(where.hash)) return { ...base, tab: "lead", learn: true };
  const tab = path.match(/^\/(admin|status|workspace|explorer)(?:\/timeline)?\/?$/);
  if (tab && (tab[1] === "status" || !path.includes("/timeline"))) return { ...base, tab: KEYS[tab[1]] };
  const goal = path.match(/^\/admin\/goal\/([1-9]\d{0,11})\/?$/);
  if (goal) return { ...base, tab: "admin", goal: Number(goal[1]) };
  if (/^\/ide\/?$/.test(path)) return { ...base, tab: "lead" };
  if (/^\/menu\/?$/.test(path)) return { ...base, tab: null, menu: true };
  const pc = readRoute(where);
  if (pc.drawer === "approvals" && pc.approvalId != null) return { ...base, tab: "admin", card: pc.approvalId };
  return pc.view === "boards" ? { ...base, tab: "lead", boards: true, boardId: pc.boardId } : { ...base, tab: "admin" };
}
export const routeHash = (r) => r.completed ? "#/completed" + (r.goalId != null ? "/" + r.goalId : "") : r.tab === "admin" && r.card != null ? "#/approvals/" + encodeURIComponent(r.card) : r.menu ? "#/menu" : r.boards ? boardHash(r.boardId) : hashFor(r.tab);
export const hashFor = (name, id = null) => name === "boards" ? boardHash(id) : tabHash(Object.keys(KEYS).find((tab) => KEYS[tab] === name) ?? name);
