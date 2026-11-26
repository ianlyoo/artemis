import { classifyLink, homeOrigin } from "./links.js";
import { proseOf } from "./markdown-code.js";
import { splitNotes } from "../md.js";
import { stepLink } from "../step-route.js";
import { knownBoardTitle } from "../board-titles.js";
import { l10n } from "../names.js";
const MAX = 8;
const baseName = (path) => String(path).split("/").filter(Boolean).pop() ?? String(path);
const filePath = (path) => typeof path === "string" && path.startsWith("/") && !path.endsWith("/") && !path.split("/").includes("..") && !path.includes("\0");
const boardMaterial = (id) => ({ kind: "board", label: knownBoardTitle(id) || l10n("보드", "Board"), target: { kind: "board", id } });
const fileMaterial = (path) => ({ kind: "file", label: baseName(path), target: { kind: "file", path } });
const short = (url) => {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
};
function fences(text, kind) {
  const out = [];
  let open = null, body = [];
  for (const line of String(text ?? "").split("\n")) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/);
    if (open) {
      if (fence && fence[1][0] === open.run[0] && fence[1].length >= open.run.length && !fence[2]) {
        if (open.kind === kind) out.push(body.join("\n"));
        open = null;
        body = [];
      } else body.push(line);
    } else if (fence) {
      open = { run: fence[1], kind: fence[2] };
      body = [];
    }
  }
  return out;
}
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)|https?:\/\/[^\s<>()[\]{}"'`\u0080-￿]+|(?<![\w/.:#-])#\/boards\/[^\s<>()[\]{}"'`]+/g;
export function linkMaterials(text, origin = globalThis.location?.origin) {
  const out = [];
  for (const match of proseOf(splitNotes(text).text).matchAll(LINK)) {
    const href = (match[2] ?? match[0]).replace(/[.,;:!?]+$/, ""), label = match[1]?.trim() || null, target = classifyLink(href, origin);
    if (target.kind === "board") out.push({ ...boardMaterial(target.id), ...label ? { label } : {} });
    else if (target.kind === "file" && filePath(target.path)) out.push({ ...fileMaterial(target.path), ...label ? { label } : {} });
    else if (target.kind === "other" && /^https:\/\//i.test(href)) {
      let u = null;
      try {
        u = new URL(href);
      } catch {
      }
      if (u && !u.username && !u.password && !homeOrigin(u.origin, origin)) out.push({ kind: "web", label: label ?? short(u.href), url: u.href });
    }
  }
  return out;
}
export function replyMaterials(text, origin) {
  const files = fences(text, "attach").flatMap((body) => body.split("\n").map((line) => line.trim()).filter(filePath)).map(fileMaterial);
  const boards = fences(text, "open").flatMap((body) => {
    try {
      const v = JSON.parse(body);
      return typeof v?.board === "string" && v.board && !v.board.includes("/") ? [{ ...boardMaterial(v.board), ...typeof v.title === "string" && v.title.trim() ? { label: v.title.trim() } : {} }] : [];
    } catch {
      return [];
    }
  });
  return [...files, ...boards, ...linkMaterials(text, origin)];
}
export function stepMaterials(t) {
  const link = stepLink(t?.link);
  if (link?.url) return [{ kind: "web", label: short(link.url), route: "#/screen" }];
  if (!link?.route || /^#\/admin(\/|$)/.test(link.route)) return [];
  const target = classifyLink(link.route, globalThis.location?.origin);
  return [target.kind === "board" ? boardMaterial(target.id) : { kind: "route", label: l10n("열기", "Open"), route: link.route }];
}
export const distinct = (list) => {
  const seen = /* @__PURE__ */ new Set();
  return list.filter((m) => {
    const key = m.target ? m.target.kind + ":" + (m.target.path ?? m.target.id) : m.url ?? m.route;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX);
};
const replies = /* @__PURE__ */ new Map();
let records = null;
export function forgetMaterials() {
  replies.clear();
  records = null;
}
async function json(api, path) {
  const response = await api(path, { expected: ["404"] });
  if (!response?.ok) throw new Error(path + ": " + (response?.status ?? "no answer"));
  return response.json();
}
function questionRecords(api, after = null) {
  if (!records || records === after) {
    const read = records = json(api, "/questions").then((body) => Array.isArray(body?.items) ? body.items : []);
    read.catch(() => {
      if (records === read) records = null;
    });
  }
  return records;
}
export function questionMaterials(api, id, origin) {
  const key = String(id);
  if (replies.has(key)) return replies.get(key);
  const ask = (async () => {
    const seen = questionRecords(api), find = (list) => list.find((r) => String(r.id) === key);
    const record = find(await seen) ?? find(await questionRecords(api, seen));
    if (!record) return null;
    const row = await json(api, "/db/read?kind=conversation&id=" + encodeURIComponent(record.conversation_id));
    if (typeof row?.item?.text !== "string") return null;
    return replyMaterials(row.item.text, origin);
  })().catch(() => null).then((list) => {
    if (list === null && replies.get(key) === ask) replies.delete(key);
    return list;
  });
  replies.set(key, ask);
  return ask;
}
