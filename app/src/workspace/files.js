import { getJSON, postJSON } from "./api.js";
import { WORK, SYSTEM, rel, fileName, isolate } from "./core.js";
export const FS_PATHS = { create: "/ide/fs/create", rename: "/ide/fs/rename", delete: "/ide/fs/delete", trash: "/ide/trash", restore: "/ide/trash/restore" };
const sourcePath = (path) => "/ide/source?target=" + encodeURIComponent("file:" + path);
export const FS_LABELS = { newFile: "New file", newFolder: "New folder", rename: "Rename", delete: "Delete", trash: "Trash", restore: "Restore" };
export const FS_LIMITS = { name: 255, trashDays: 14 };
export const CONTROL = /[\x00-\x1f\x7f-\x9f\p{Zl}\p{Zp}]/u;
export function nameProblem(name) {
  if (typeof name !== "string" || name === "") return "a name is needed";
  if (new TextEncoder().encode(name).length > FS_LIMITS.name) return `at most ${FS_LIMITS.name} bytes`;
  if (CONTROL.test(name)) return "no control characters or line separators";
  if (/[/\\]/.test(name)) return "one name, no / or \\";
  if (name === "." || name === "..") return "not . or ..";
  if (name.startsWith(".")) return "no leading dot";
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(name)) return "whole characters only";
  return null;
}
export const CONFIRM = "Delete as an owner edit? It applies once reviewed.";
const within = (path, base) => path === base || String(path).startsWith(base + "/");
const parentOf = (path) => String(path).replace(/\/[^/]*$/, "");
export const isRoot = (path) => path === WORK || path === SYSTEM;
export const inRoots = (path) => within(path, WORK) || within(path, SYSTEM);
export const originOf = (path) => within(path, SYSTEM) ? "system" : within(path, WORK) ? "work" : null;
const worktrees = () => [WORK + "/owner-edits", WORK + "/home-terminals"];
export const inWorktree = (path) => worktrees().some((tree) => within(path, tree));
export function offers(path, kind, read = null, link = false) {
  if (link || !inRoots(path) || inWorktree(path)) return [];
  if (kind === "root" || isRoot(path)) return ["newFile", "newFolder"];
  if (kind === "folder") return ["newFile", "newFolder", "rename", "delete"];
  return read?.refused ? [] : ["rename", "delete"];
}
const REFUSED = new Set(["masked", "owner_edits", "untracked", "denied", "outside"]);
export function readOf(answer) {
  const reason = answer?.body?.reason;
  if (answer?.status === 403 || REFUSED.has(reason)) return { refused: true, sha: null };
  const sha = answer?.ok && /^[0-9a-f]{64}$/.test(String(answer.body?.sha256)) ? answer.body.sha256 : null;
  return { refused: false, sha };
}
const VERB = { create: "Not created", rename: "Not renamed", delete: "Not deleted", restore: "Not restored" };
const WHY = { denied: "Home leaves deny-listed names alone (a secret-looking file, .git, .env, a browser profile)", outside: "outside Home's folders", masked: "Home masked a secret in it; it stays where it is", root: "a root folder is never renamed or deleted", worktree: "Home's own worktrees (owner-edits, home-terminals) are left alone", symlink: "a symlink; file operations follow none", special: "a FIFO, socket or device", read_only: "Home's user can't write there", untracked: "git doesn't track it on owner-edits", ignored: "git ignores this name (.gitignore)", converted: "git converts this file on its way; move it in a checkout", stale: "it changed since you opened the menu; try again", pending: "a pending owner edit clashes with main; the CTO applies or refuses it first", size: "too large for Home to check; use a terminal" };
const BY_STATUS = { 0: "Home didn't answer", 404: "it isn't there anymore", 429: "Home is busy: try again in a moment", 503: "Home can't do that now" };
export function refusalLine(op, { status = 0, body = null } = {}, at = "") {
  const reason = typeof body?.reason === "string" ? body.reason : "";
  let why;
  if (reason === "name") why = String(body?.detail ?? "").replace(/^name: /, "the name: ") || "not a name Home takes";
  else if (reason === "exists") why = (at ? isolate(rel(at)) : "the path") + " is taken; nothing was overwritten";
  else if (reason === "folder_gone") why = at ? "its folder " + isolate(rel(parentOf(at))) + " is gone" : "its folder is gone";
  else why = WHY[reason] ?? (body?.error === "conflict_pending" ? WHY.pending : BY_STATUS[status] ?? "something went wrong");
  return (VERB[op] ?? "Not done") + " · " + why;
}
export function purgeNote(item, now = Date.now()) {
  const at = Date.parse(item?.purge_at);
  if (!Number.isFinite(at)) return "";
  const days = Math.ceil((at - now) / 864e5);
  return days <= 0 ? "purges tonight" : days === 1 ? "purges in 1 day" : `purges in ${days} days`;
}
export const trashName = (item) => fileName(item?.path ?? "");
export const trashFrom = (item) => rel(parentOf(item?.path ?? ""));
export function doneLine(done) {
  const name = isolate(fileName(done.path ?? ""));
  if (done.origin === "system") {
    const what = done.op === "create" ? "New " + (done.kind === "folder" ? "folder" : "file") + " " + name : done.op === "rename" ? "Rename to " + name : "Delete of " + name;
    return what + " sent as an owner edit · Pending until the CTO applies it";
  }
  return done.op === "create" ? "Created " + name : done.op === "rename" ? "Renamed to " + name : done.op === "delete" ? "Deleted " + name + " · in the Trash" : "Restored " + name;
}
export function followTabs(done, tabs) {
  if (done?.origin !== "work" && !(done?.origin === "system" && done.applied && done.op === "delete")) return [];
  const base = done.op === "rename" ? done.from : done.path;
  if (typeof base !== "string" || !base) return [];
  const on = tabs.filter((tab) => tab?.target?.kind === "file" && within(tab.target.path, base));
  if (done.op === "rename") return on.map((tab) => ({ tab, act: "retarget", path: done.path + tab.target.path.slice(base.length) }));
  if (done.op === "delete") return on.map((tab) => ({ tab, act: tab.doc?.dirty ? "reload" : "close" }));
  if (done.op === "restore") return on.filter((tab) => tab.doc).map((tab) => ({ tab, act: "reload" }));
  return [];
}
export function settled(sent, items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const done of sent) {
    const item = items.find((entry) => done.id && entry?.id === done.id || !done.id && done.commit && entry?.commit === done.commit);
    if (item?.state === "applied" || item?.state === "refused") out.push({ done, state: item.state });
  }
  return out;
}
export function createFiles({ api, wait = 1500 }) {
  const act = async (op, body, at) => {
    const answer = await postJSON(api, FS_PATHS[op], body);
    return answer.ok && answer.body?.ok ? { ok: true, done: answer.body } : { ok: false, line: refusalLine(op, answer, at), reason: answer.body?.reason ?? null, status: answer.status };
  };
  return { create: (folder, kind, name) => act("create", { target: "file:" + folder, kind, name }, folder + "/" + name), rename: (path, name) => act("rename", { target: "file:" + path, name }, parentOf(path) + "/" + name), remove: (path, base = null) => act("delete", { target: "file:" + path, ...base ? { base_sha256: base } : {} }, path), restore: (item) => act("restore", { id: item.id }, item.path), async trash() {
    const answer = await getJSON(api, FS_PATHS.trash);
    if (!answer.ok || !Array.isArray(answer.body?.items)) return { ok: false, line: answer.status === 503 ? "Home's Trash isn't available now" : "Couldn't load the Trash" };
    return { ok: true, items: answer.body.items.filter((item) => item && typeof item.id === "string" && typeof item.path === "string"), truncated: !!answer.body.truncated };
  }, async check(path) {
    let timer = 0;
    const late = new Promise((done) => {
      timer = setTimeout(() => done(null), wait);
    });
    try {
      const answer = await Promise.race([getJSON(api, sourcePath(path)), late]);
      return answer ? readOf(answer) : { refused: false, sha: null };
    } catch {
      return { refused: false, sha: null };
    } finally {
      clearTimeout(timer);
    }
  } };
}
