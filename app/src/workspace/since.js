import { el } from "../boards/dom.js";
import { onDocRendered, onTabClosed, registerDocTool, updateDocTools } from "./extensions.js";
import { stylesheet, keyOf, saved } from "./core.js";
import { iconButton } from "./icons.js";
import { lineDiff } from "./diff.js";
import { changes } from "./changes.js";
import { has } from "../names.js";
import { zoned } from "../zone.js";
const longDay = zoned("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const STORE_KEY = "p2-since", KEEP = 300, MAX_BLOCKS = 4e3;
const encoder = new TextEncoder();
export function fnv32(text) {
  let hash = 2166136261;
  for (const byte of encoder.encode(String(text))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
export const normalise = (text) => String(text ?? "").normalize("NFC").replace(/[\u0000-\u0008\u000e-\u001f\u007f​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
const SKIP = [".ide-fold", ".fold-note", ".bv-code-head", ".text-control", ".p2-since-mark", "button", "[data-astryx-island]"];
export function blockText(node) {
  let out = "";
  const walk = (at) => {
    for (const child of at.childNodes ?? []) {
      if (typeof child.matches === "function") {
        if (SKIP.some((selector) => child.matches(selector))) continue;
        walk(child);
        out += " ";
      } else out += child.textContent ?? "";
    }
  };
  walk(node);
  return normalise(out);
}
export const blocksOf = (root) => root ? [...root.querySelectorAll(".pane-block")] : [];
export const hashBlocks = (nodes) => nodes.slice(0, MAX_BLOCKS).map((node) => fnv32(blockText(node)));
export function compare(then, now) {
  const ops = lineDiff(then.map(String), now.map(String), { max: 4e6 });
  const changed = [], fresh = [];
  let removed = 0, dels = 0, adds = [];
  const flush = () => {
    const pairs = Math.min(dels, adds.length);
    changed.push(...adds.slice(0, pairs));
    fresh.push(...adds.slice(pairs));
    removed += dels - pairs;
    dels = 0;
    adds = [];
  };
  for (const op of ops) {
    if (op.type === " ") flush();
    else if (op.type === "-") dels++;
    else adds.push(op.b);
  }
  flush();
  return { changed, fresh, removed };
}
export function createMemory({ store = saved, keep = KEEP } = {}) {
  const read = () => {
    const list = store.read(STORE_KEY, []);
    return Array.isArray(list) ? list.filter((entry) => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string" && typeof entry[2] === "string") : [];
  };
  const write = (list) => {
    if (store.write(STORE_KEY, list.slice(0, keep))) return true;
    return store.write(STORE_KEY, list.slice(0, Math.max(1, Math.floor(Math.min(list.length, keep) / 2))));
  };
  return { get(key) {
    const entry = read().find((item) => item[0] === key);
    return entry ? { at: entry[1], hashes: entry[2] ? entry[2].split(",").map((part) => parseInt(part, 36) >>> 0) : [] } : null;
  }, put(key, hashes, at = (new Date()).toISOString()) {
    const list = read().filter((item) => item[0] !== key);
    list.unshift([key, at, hashes.slice(0, MAX_BLOCKS).map((hash) => (hash >>> 0).toString(36)).join(",")]);
    return write(list);
  }, keys: () => read().map((item) => item[0]) };
}
export const memory = createMemory();
export function ago(at, now = Date.now()) {
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return "last time";
  const s = Math.max(0, (now - then) / 1e3);
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  if (s < 2 * 86400) return "yesterday";
  if (s < 30 * 86400) return Math.round(s / 86400) + " days ago";
  return longDay.format(new Date(then));
}
const kinds = new Set(["file", "board"]);
const held = new Map();
export const watched = held;
export const baselineOf = (target) => {
  const state = held.get(keyOf(target));
  return state ? state.baseline : memory.get(keyOf(target));
};
const headOf = (root) => root?.closest?.(".doc-page")?.querySelector(".doc-head") ?? root?.querySelector?.(".doc-head") ?? null;
function clearMarks(state) {
  for (const node of blocksOf(state.root)) {
    node.classList.remove("p2-since-changed", "p2-since-new");
    node.querySelector(":scope > .p2-since-mark")?.remove();
  }
  state.line?.remove();
  state.line = null;
  state.landed = -1;
}
export function step(state, by) {
  const marks = blocksOf(state.root).filter((node2) => node2.classList.contains("p2-since-changed") || node2.classList.contains("p2-since-new"));
  if (!marks.length) return null;
  const n = marks.length, at = state.landed >= 0 && state.landed < n ? (state.landed + (by > 0 ? 1 : n - 1)) % n : by > 0 ? 0 : n - 1;
  state.landed = at;
  const node = marks[at];
  node.scrollIntoView({ block: "start", behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  node.classList.add("is-landed");
  setTimeout(() => node.classList.remove("is-landed"), 900);
  return node;
}
export function markSeen(key, { store = memory, now = () => (new Date()).toISOString() } = {}) {
  const state = held.get(key);
  if (!state) return false;
  store.put(key, state.hashes, now());
  state.baseline = store.get(key);
  clearMarks(state);
  return true;
}
export function mark(doc, { store = memory, now = () => Date.now() } = {}) {
  const target = doc?.target;
  if (!target || !kinds.has(target.kind) || !doc.root) return null;
  void stylesheet("p2-views.css");
  const key = keyOf(target), nodes = blocksOf(doc.root), hashes = hashBlocks(nodes);
  let state = held.get(key);
  if (state && state.root !== doc.root) {
    clearMarks(state);
    state = null;
  }
  if (!state) {
    const baseline = store.get(key);
    state = { key, root: doc.root, line: null, landed: -1, hashes, baseline, at: now(), store };
    held.set(key, state);
    if (!baseline) store.put(key, hashes, new Date(now()).toISOString());
  }
  state.hashes = hashes;
  clearMarks(state);
  if (!state.baseline) return { changed: 0, fresh: 0, removed: 0 };
  const { changed, fresh, removed } = compare(state.baseline.hashes, hashes);
  const when = ago(state.baseline.at, now());
  for (const [list, cls, word] of [[changed, "p2-since-changed", "Changed"], [fresh, "p2-since-new", "New"]]) {
    for (const n of list) {
      const node = nodes[n];
      if (!node) continue;
      node.classList.add(cls);
      node.prepend(el("span", { class: "p2-since-mark", title: word + " since " + when, "aria-label": word + " since " + when }));
    }
  }
  const count = changed.length + fresh.length;
  if (count || removed) {
    const head = doc.head ?? headOf(doc.root);
    const prev = iconButton("up", "Previous change", { class: "is-small p2-since-prev" }), next = iconButton("down", "Next change", { class: "is-small p2-since-next" });
    const seen = iconButton("check", "Mark seen", { class: "is-small p2-since-seen" });
    prev.addEventListener("click", () => step(state, -1));
    next.addEventListener("click", () => step(state, 1));
    seen.addEventListener("click", () => markSeen(key, { store }));
    prev.disabled = next.disabled = !count;
    const words = count ? `${count} changed since ${when}` + (removed ? ` · ${removed} removed` : "") : `${removed} removed since ${when}`;
    state.line = el("p", { class: "p2-since-line", role: "status" }, el("span", { class: "p2-since-words" }, words), el("span", { class: "p2-since-tools" }, prev, next, seen));
    if (head?.parentNode) head.after(state.line);
    else doc.root.before?.(state.line);
  }
  return { changed: changed.length, fresh: fresh.length, removed };
}
export function closedTab({ target }, { now = () => (new Date()).toISOString() } = {}) {
  const key = target && keyOf(target), state = key && held.get(key);
  if (!state) return false;
  held.delete(key);
  state.store.put(key, state.hashes, now());
  return true;
}
onTabClosed(closedTab);
onDocRendered((doc) => {
  try {
    mark(doc);
    if (doc?.target?.kind === "file" && has("drafts")) void changes.loadRepos();
  } catch (error) {
    console.error("Since:", error);
  }
});
const tool = { id: "since", glyph: "history", label: "Changes since last open", order: 40, when: ({ target }) => target?.kind === "file" && !!changes.forPath(target.path) && !!baselineOf(target), run: ({ target, open }) => {
  const baseline = baselineOf(target);
  if (baseline) void open({ kind: "since", path: target.path, since: baseline.at }, { from: "tool" });
} };
registerDocTool(tool);
let reposKnown = false;
changes.listen(() => {
  if (reposKnown || changes.repos()?.state !== "ready") return;
  reposKnown = true;
  updateDocTools();
});
