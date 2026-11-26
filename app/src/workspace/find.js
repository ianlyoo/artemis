import { getJSON, paths, homeApi } from "./api.js";
import { keyOf, parseKey, label, rel, fileName, termName, clip, day, ledgerLabel } from "./core.js";
import { statusName } from "./ledger.js";
import { termWhere } from "./terms.js";
import { lead, has, isLedger, ledgerRef } from "../names.js";
export const GROUPS = ["Your turn", "Actions", "Pinned", "Recent", "Ledger", "Goals", "Requests", "Approvals", "Reports", "Boards", "Files", "Folders", "Terminals"];
const LIMIT = { "Your turn": 6, Actions: 3, Pinned: 8, Recent: 8, Ledger: 4, Goals: 6, Requests: 5, Approvals: 4, Reports: 6, Boards: 4, Files: 10, Folders: 4, Terminals: 3 };
export const ACTIONS = [["term-new", "New terminal", "Home · default workspace", "new terminal 터미널 새 터미널 열기 shell console"], ["db", "Chat recap", "DB · what you asked and what came of it", "db database search history records 디비 기록 검색 과거 맥락 recap chat 채팅 요약"], ["learn", "Learn", "Cards, sparring and labs · ask your tutor", "learn learning study tutor 학습 공부 카드 스파링 실습 선생님 용어 언어화"]];
const ACTION_NEEDS = { "term-new": "terminals", db: "recap", learn: "learn" };
const KIND_GROUP = { goal: "Goals", request: "Requests", approval: "Approvals", board: "Boards", report: "Reports", file: "Files", dir: "Folders" };
const LEDGER = [["goals", "목표"], ["requests", "요청"], ["approvals", "승인"], ["resources", "자원"]];
const TURN = { approval: "Awaiting approval", goal: "Your turn", project: "Blocked" };
const row = (group, name, detail, target, extra = {}) => ({ group, name, detail: detail ?? "", target, key: keyOf(target), ...extra });
export function localItems({ data, lists }) {
  const items = [];
  for (const [ref, alias] of LEDGER) {
    const name = ledgerLabel(ref);
    items.push({ ...row("Ledger", name, "Ledger", { kind: ledgerRef(), ref }), hay: `${name} ${alias} 장부 ledger ${ref}` });
  }
  const say = (target) => target.kind === "file" ? rel(target.path) : isLedger(target.kind) ? "Ledger" : "Board";
  for (const target of lists?.pins() ?? []) items.push({ ...row("Pinned", label(target, data), say(target), target), hay: label(target, data) + " " + say(target) });
  for (const target of lists?.recent() ?? []) items.push({ ...row("Recent", label(target, data), say(target), target), hay: label(target, data) + " " + say(target) });
  for (const term of data?.terminals ?? []) {
    const detail = term.owner === "home" ? termWhere(term, data.terminals) : lead() + (term.cwd ? " · " + term.cwd : "");
    items.push({ ...row("Terminals", termName(term), detail, { kind: "terminal", id: term.id }), hay: termName(term) + " " + detail + " terminal 터미널" });
  }
  for (const [act, name, detail, hay] of ACTIONS) if (!ACTION_NEEDS[act] || has(ACTION_NEEDS[act])) items.push({ group: "Actions", name, detail, target: null, key: "act:" + act, act, hay });
  return items.map((item) => ({ ...item, hay: item.hay.toLocaleLowerCase() }));
}
export function turnRows(turn) {
  return (turn ?? []).map((item) => {
    const target = parseKey(item.target);
    if (!target) return null;
    const name = item.kind === "approval" ? `Approval #${item.id} ${clip(item.title, 70)}` : `#${item.goal_id ?? item.id} ${clip(item.title, 70)}`;
    return row("Your turn", name, TURN[item.kind] ?? item.status ?? "", target);
  }).filter(Boolean);
}
export function hitRows(hits) {
  return (hits ?? []).map((hit) => {
    const target = parseKey(hit.target);
    if (!target) return null;
    const group = KIND_GROUP[hit.kind] ?? "Files", title = String(hit.title ?? "");
    const name = hit.kind === "request" ? title.replace(/^request #/, "Request #") : hit.kind === "approval" ? title.replace(/^approval #/, "Approval #") : title || (target.kind === "file" ? fileName(target.path) : label(target));
    const detail = hit.kind === "board" ? "Board" + (day(hit.detail) ? " · " + day(hit.detail) : "") : hit.kind === "report" && target.kind === "file" ? rel(target.path) : ["goal", "request", "approval"].includes(hit.kind) ? statusName(hit.kind, hit.detail) : hit.detail ?? "";
    return row(group, name, detail, target, hit.kind === "dir" ? { dir: true } : {});
  }).filter(Boolean);
}
const words = (query) => String(query ?? "").toLocaleLowerCase().split(/\s+/).map((word) => word.replace(/^#/, "")).filter(Boolean);
export function matchLocal(items, query) {
  const list = words(query);
  if (!list.length) return [];
  const scored = [];
  for (const item of items) {
    let score = 0, ok = true;
    const name = item.name.toLocaleLowerCase();
    for (const word of list) {
      if (/^\d+$/.test(word) && name.startsWith("#" + word + " ")) {
        score += 9;
        continue;
      }
      if (!item.hay.includes(word) && !name.includes(word)) {
        ok = false;
        break;
      }
      score += name.startsWith(word) ? 4 : name.includes(word) ? 3 : 1;
    }
    if (ok) scored.push({ ...item, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}
export function quickRows(query, { data, lists, hits = [], ledger = true }) {
  const empty = !words(query).length;
  const candidates = (empty ? [...turnRows(data?.turn), ...localItems({ data, lists }).filter((item) => item.group === "Pinned" || item.group === "Recent")] : [...matchLocal(localItems({ data, lists }), query), ...hitRows(hits)]).filter((item) => ledger || !isLedger(item.target?.kind));
  const groups = new Map(), seen = new Set();
  const ordered = [...candidates].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  for (const item of ordered) {
    if (seen.has(item.key)) continue;
    const list = groups.get(item.group) ?? [];
    if (list.length >= (LIMIT[item.group] ?? 5)) continue;
    seen.add(item.key);
    list.push(item);
    groups.set(item.group, list);
  }
  return GROUPS.flatMap((group) => groups.get(group) ?? []);
}
export const findLine = (answer) => answer?.index?.state === "building" ? "Still indexing file names · they will show up soon" : null;
export async function findNames(query, { api = homeApi, signal } = {}) {
  const text = String(query ?? "").trim().slice(0, 200);
  if (!text || /[\r\n]/.test(text)) return { hits: [], line: null };
  const answer = await getJSON(api, paths.find(text), { signal });
  if (!answer.ok) return { hits: [], line: "Couldn't search the file names" };
  return { hits: answer.body.items ?? [], line: findLine(answer.body) };
}
export const SEARCH_LINES = { timed_out: "Ran out of time · showing what was found so far", truncated: "Many matches · showing the first 200", busy: "Another search is running · try again when it ends", failed: "Can't search the contents right now", short: "Type at least two characters" };
export function searchLine(answer) {
  if (!answer) return null;
  if (answer.timed_out) return SEARCH_LINES.timed_out;
  if (answer.truncated) return SEARCH_LINES.truncated;
  return null;
}
export function searchGroups(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    if (typeof item?.path !== "string") continue;
    if (!groups.has(item.path)) groups.set(item.path, { target: { kind: "file", path: item.path }, path: item.path, name: fileName(item.path), where: rel(item.path), hits: [] });
    groups.get(item.path).hits.push({ line: item.line, snippet: String(item.snippet ?? "") });
  }
  return [...groups.values()];
}
export async function searchDocs(query, { api = homeApi, scope = "docs", signal } = {}) {
  const text = String(query ?? "").trim();
  if (text.length < 2) return { groups: [], count: 0, line: text ? SEARCH_LINES.short : null };
  const answer = await getJSON(api, paths.search(text.slice(0, 200), scope), { signal });
  if (!answer.ok) return { groups: [], count: 0, line: answer.status === 429 ? SEARCH_LINES.busy : SEARCH_LINES.failed };
  const items = Array.isArray(answer.body.items) ? answer.body.items : [];
  return { groups: searchGroups(items), count: items.length, line: searchLine(answer.body) };
}
