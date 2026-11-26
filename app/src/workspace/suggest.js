import { el } from "../boards/dom.js";
import { registerDocTool, onDocRendered, onTabClosed } from "./extensions.js";
import { stylesheet, keyOf, rel, fileName, looksSecret } from "./core.js";
import { iconButton } from "./icons.js";
import { feed } from "../chat/feed.js";
import { SEND_LIMITS } from "../chat/store.js";
import { stateLine } from "../chat/view.js";
import { editsDiff, splitLines, counts } from "./diff.js";
import { blockText } from "./since.js";
import { lead, l10n } from "../names.js";
export const HEAD = () => l10n("수정 제안 · ", "Suggested edit · ");
export const HQ_BYTES = 65536, WHY_MAX = 300, LONG_BLOCK = 400;
const BOM = "\uFEFF";
export const LINES = { tooLong: "The suggestion doesn't fit in one message · 20,000 characters at most. Send fewer edits at once", secret: "The suggestion looks like it holds a secret · nothing was sent", replacementSecret: "The replacement looks like it holds a secret · it wasn't kept", passageSecret: "This passage looks like it holds a secret · suggest an edit elsewhere", whySecret: "The reason looks like it holds a secret", notFound: "Couldn't find this passage in the file's text", masked: "This passage holds a masked secret · suggest an edit elsewhere", overlap: "This passage overlaps an edit you kept · drop that one first", moved: "The file changed where you edited · drop that edit and make it again", long: "This block is long · select the lines to change instead", raw: "Couldn't read the file's text", empty: "No edits to send", same: "Nothing changed", sending: "The last suggestion is still sending" };
export const TEXT_EXT = new Set(["md", "markdown", "txt", "rst", "tex", "ts", "tsx", "js", "mjs", "cjs", "jsx", "py", "sh", "bash", "sql", "css", "json", "jsonl", "yaml", "yml", "toml", "xml"]);
const extOf = (path) => (String(path).split("/").at(-1).match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "").toLowerCase();
export const canSuggest = (target) => target?.kind === "file" && TEXT_EXT.has(extOf(target.path));
const isMarkdown = (path) => ["md", "markdown"].includes(extOf(path));
const DROPPED = /[\s!-\/:-@\[-`{-~​-‍﻿]/;
const MARKDOWN_MARKS = [/\]\([^)\n]*\)/g, /<\/?[A-Za-z][^>\n]*>/g, /&(?:[a-z]+|#\d+);/gi, /^[ \t]*\d+[.)][ \t]+/gm, /\[[ xX]\][ \t]/g, /^[ \t]*```.*$/gm];
export function keyText(text, { markdown = false } = {}) {
  const source = String(text ?? ""), skip = new Uint8Array(source.length);
  if (markdown) for (const mark of MARKDOWN_MARKS) for (const found of source.matchAll(mark)) skip.fill(1, found.index, found.index + found[0].length);
  const key = [], at = [];
  for (let i = 0; i < source.length; i++) {
    if (skip[i] || DROPPED.test(source[i])) continue;
    for (const ch of source[i].toLowerCase()) {
      key.push(ch);
      at.push(i);
    }
  }
  return { key: key.join(""), at };
}
const lineStarts = (text) => {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
};
const lineAt = (starts, index) => {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};
export function findLines(raw, wanted, { before: before2 = "", markdown = false } = {}) {
  const text = String(raw ?? ""), source = keyText(text, { markdown }), want = keyText(wanted).key;
  if (!want) return null;
  const hits = [];
  for (let i = source.key.indexOf(want); i >= 0 && hits.length < 500; i = source.key.indexOf(want, i + 1)) hits.push(i);
  if (!hits.length) return null;
  let best = hits[0];
  if (hits.length > 1) {
    const lead2 = keyText(before2).key.slice(-600);
    const score = (i) => {
      let n = 0;
      while (n < lead2.length && i - 1 - n >= 0 && source.key[i - 1 - n] === lead2[lead2.length - 1 - n]) n++;
      return n;
    };
    let top = -1;
    for (const hit of hits) {
      const s = score(hit);
      if (s > top) {
        top = s;
        best = hit;
      }
    }
  }
  const marks = String(wanted).replace(/\s+/g, ""), keyed = keyText(marks).at;
  let start = source.at[best], end = source.at[best + want.length - 1];
  for (let i = end + 1, n = keyed.at(-1) + 1; n < marks.length; n++) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== marks[n]) break;
    end = i++;
  }
  for (let i = start - 1, n = keyed[0] - 1; n >= 0; n--) {
    while (i >= 0 && /\s/.test(text[i])) i--;
    if (text[i] !== marks[n]) break;
    start = i--;
  }
  const starts = lineStarts(text);
  return { from: lineAt(starts, start), to: lineAt(starts, end) };
}
const fence = (diff) => {
  let run = 2;
  for (const found of diff.matchAll(/`+/g)) run = Math.max(run, found[0].length);
  return "`".repeat(run + 1);
};
export const oneLine = (text) => [...String(text ?? "").replace(/\s+/g, " ").trim()].slice(0, WHY_MAX).join("");
export function message({ path, why = "", diff }) {
  const mark = fence(diff), reason = oneLine(why);
  return HEAD() + path + (reason ? "\n" + reason : "") + "\n\n" + mark + "diff\n" + diff + (diff.endsWith("\n") ? "" : "\n") + mark;
}
export const fits = (text, limit = SEND_LIMITS.text) => [...text].length <= limit && new TextEncoder().encode(text).length <= HQ_BYTES;
export function relocate(lines, edit) {
  const old = edit.old, at = edit.from - 1, same = (start) => old.every((line, n) => lines[start + n] === line);
  if (!old.length) return edit.from <= lines.length + 1 ? edit : null;
  if (same(at)) return edit;
  const found = [];
  for (let start = 0; start + old.length <= lines.length && found.length < 2; start++) if (same(start)) found.push(start);
  return found.length === 1 ? { ...edit, from: found[0] + 1, to: found[0] + old.length } : null;
}
export function compose({ raw, path, edits, why = "", limit = SEND_LIMITS.text }) {
  if (!edits.length) return { ok: false, error: "empty", line: LINES.empty };
  const { lines } = splitLines(raw), placed = [];
  for (const edit of edits) {
    const now = relocate(lines, edit);
    if (!now) return { ok: false, error: "moved", line: LINES.moved, id: edit.id };
    placed.push(now);
  }
  if (looksSecret(why)) return { ok: false, error: "secret", line: LINES.whySecret };
  const name = rel(path);
  const bom = raw.startsWith(BOM), marked = (edit) => bom && edit.from === 1 && edit.to >= 1 && edit.text !== "" && !edit.text.startsWith(BOM) ? BOM + edit.text : edit.text;
  let diff;
  try {
    diff = editsDiff(raw, placed.map((edit) => ({ from: edit.from, to: edit.to, text: marked(edit) })), { path: name });
  } catch {
    return { ok: false, error: "overlap", line: LINES.overlap };
  }
  if (!diff) return { ok: false, error: "same", line: LINES.same };
  const text = message({ path: name, why, diff });
  if (!fits(text, limit)) return { ok: false, error: "too_long", line: LINES.tooLong };
  if (looksSecret(text)) return { ok: false, error: "secret", line: LINES.secret };
  return { ok: true, text, diff, placed };
}
export async function rawText(doc) {
  if (typeof doc?.raw !== "function") return { ok: false, line: LINES.raw };
  try {
    const text = await doc.raw();
    if (typeof text !== "string" || text.includes("\0")) return { ok: false, line: LINES.raw };
    return { ok: true, text: doc.rawBom === true && !text.startsWith(BOM) ? BOM + text : text };
  } catch {
    return { ok: false, line: LINES.raw };
  }
}
let flight = null;
const held = /* @__PURE__ */ new Map();
export function sendEdits(state, { store = feed.store } = {}) {
  flight ??= attempt(state, store).catch((error) => {
    console.error("Suggest:", error);
    return { ok: false, error: "failed", line: "Couldn't send" };
  }).finally(() => {
    flight = null;
  });
  return flight;
}
async function attempt(state, store) {
  if (!state.edits.length) return { ok: false, error: "empty", line: LINES.empty };
  const raw = await rawText(state.doc);
  if (!raw.ok) return { ok: false, error: "raw", line: raw.line };
  const made = compose({ raw: raw.text, path: state.target.path, edits: state.edits, why: state.why });
  if (!made.ok) return made;
  const blocked = stateLine(store);
  if (blocked) return { ok: false, error: "not_ready", line: blocked };
  let again = null;
  for (const [id2, kept] of held) {
    const local2 = store.item?.("local:" + id2)?.local;
    if (kept.store !== store || !local2) {
      held.delete(id2);
      continue;
    }
    if (local2.status === "sending") return { ok: false, error: "sending", line: LINES.sending };
    if (local2.status === "sent") {
      held.delete(id2);
      continue;
    }
    if (!again && kept.text === made.text && local2.retry) again = id2;
  }
  let id = again, ok;
  if (again) ok = await store.retry(again);
  else {
    const sent = await store.send({ text: made.text });
    if (!sent?.id) return { ok: false, error: sent?.error ?? "refused", line: sent?.line ?? "Couldn't send" };
    id = sent.id;
    ok = sent.ok;
  }
  if (ok) {
    held.delete(id);
    return { ok: true, id, text: made.text };
  }
  held.set(id, { store, text: made.text });
  const local = store.item?.("local:" + id)?.local;
  return { ok: false, error: local?.error ?? "failed", line: local?.line ?? "Couldn't send" };
}
const states = /* @__PURE__ */ new Map();
export const pending = (key) => states.get(key)?.edits.length ?? 0;
export const stateOf = (key) => states.get(key) ?? null;
const articleOf = (root) => root?.matches?.(".pane-doc") ? root : root?.querySelector?.(".pane-doc") ?? root;
const pageOf = (root) => root?.closest?.(".doc-page") ?? root?.querySelector?.(".doc-page") ?? null;
const linesWord = (from, to) => to <= from ? "Line " + from : "Lines " + from + "–" + to;
let ids = 0;
function stateFor(target, doc, api) {
  const key = keyOf(target);
  let state = states.get(key);
  if (state && state.root !== doc.root && !state.root?.isConnected) {
    drop(state);
    state = null;
  }
  if (!state) {
    state = { target, key, doc, root: doc.root, api, edits: [], why: "", editor: null, bar: null, picking: false, hint: null, sending: false };
    states.set(key, state);
  }
  state.doc = doc;
  state.root = doc.root;
  state.api = api ?? state.api;
  return state;
}
function drop(state) {
  stopPicking(state);
  state.editor?.node.remove();
  state.bar?.node.remove();
  states.delete(state.key);
}
function before(block, n = 3) {
  const parts = [];
  let at = block?.previousElementSibling;
  while (at && parts.length < n) {
    if (at.classList?.contains("pane-block")) parts.unshift(blockText(at));
    at = at.previousElementSibling;
  }
  return parts.join(" ");
}
function selectionPrefix(block, range) {
  try {
    const lead2 = document.createRange();
    lead2.setStart(block, 0);
    lead2.setEnd(range.startContainer, range.startOffset);
    return lead2.toString();
  } catch {
    return "";
  }
}
async function openEditor(state, { block, wanted, lead: lead2, edit = null }) {
  const raw = await rawText(state.doc);
  if (!raw.ok) return say(state, raw.line, true);
  const { lines } = splitLines(raw.text);
  let span = edit ? relocate(lines, edit) : null;
  if (!edit) {
    if (/•{4}/.test(wanted)) return say(state, LINES.masked, true);
    span = findLines(raw.text, wanted, { before: lead2, markdown: isMarkdown(state.target.path) });
  }
  if (!span) return say(state, edit ? LINES.moved : LINES.notFound, true);
  const old = lines.slice(span.from - 1, span.to);
  if (!edit && old.length > LONG_BLOCK) return say(state, LINES.long, true);
  if (looksSecret(old.join("\n"))) return say(state, LINES.passageSecret, true);
  const other = state.edits.find((kept) => kept !== edit && kept.from <= span.to && span.from <= kept.to);
  if (other) {
    if (!edit && other.from === span.from && other.to === span.to) return openEditor(state, { block, edit: other });
    return say(state, LINES.overlap, true);
  }
  if (state.editor && state.editor.dirty() && !confirm("Drop the edit you are writing?")) return;
  state.editor?.node.remove();
  const crlf = old.some((line) => line.endsWith("\r"));
  const joined = old.map((line) => line.replace(/\r$/, "")).join("\n"), original = span.from === 1 && joined.startsWith(BOM) ? joined.slice(1) : joined;
  const field = el("textarea", { class: "p2-se-text", spellcheck: "false", "aria-label": "Replacement for " + linesWord(span.from, span.to).toLowerCase(), rows: String(Math.min(18, Math.max(2, old.length + 1))) });
  field.value = edit ? edit.text : original;
  const problem = el("p", { class: "p2-se-line", role: "status", hidden: true });
  const keep = iconButton("check", "Keep edit", { key: "Ctrl+Enter", class: "p2-se-keep" }), cancel = iconButton("close", "Cancel", { key: "Esc", class: "p2-se-cancel" });
  const node = el("div", { class: "p2-suggest-editor", role: "group", "aria-label": "Suggested edit" }, el("p", { class: "p2-se-head" }, el("span", { class: "p2-se-where" }, linesWord(span.from, span.to)), el("span", { class: "p2-se-hint" }, "Write the text as it should read")), field, problem, el("div", { class: "p2-se-actions" }, cancel, keep));
  const editor = { node, block, span, dirty: () => field.value !== (edit ? edit.text : original) };
  const close = () => {
    node.remove();
    if (state.editor === editor) state.editor = null;
  };
  const keepIt = () => {
    const text = field.value.replace(/\r\n?/g, "\n");
    if (looksSecret(text)) {
      problem.textContent = LINES.replacementSecret;
      problem.hidden = false;
      field.focus();
      return;
    }
    if (text === original) {
      if (edit) state.edits = state.edits.filter((kept) => kept !== edit);
      close();
      paintBar(state);
      paintMarks(state);
      return;
    }
    const blockId = block?.dataset?.blockId ?? edit?.blockId ?? null;
    if (edit) Object.assign(edit, { text, from: span.from, to: span.to });
    else state.edits.push({ id: "e" + ++ids, from: span.from, to: span.to, old, text, blockId, crlf });
    state.edits.sort((a, b) => a.from - b.from);
    close();
    paintBar(state);
    paintMarks(state);
  };
  keep.addEventListener("click", keepIt);
  cancel.addEventListener("click", close);
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      keepIt();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!editor.dirty() || confirm("Drop the edit you are writing?")) close();
    }
  });
  field.addEventListener("input", () => {
    problem.hidden = true;
  });
  state.editor = editor;
  if (block) block.after(node);
  else articleOf(state.root)?.append(node);
  field.focus?.({ preventScroll: true });
  node.scrollIntoView?.({ block: "nearest" });
  say(state, null);
  return editor;
}
function paintMarks(state) {
  const article = articleOf(state.root);
  if (!article) return;
  const ids2 = new Set(state.edits.map((edit) => edit.blockId).filter(Boolean));
  for (const block of article.querySelectorAll(".pane-block")) block.classList.toggle("p2-suggested", ids2.has(block.dataset.blockId));
}
function paintBar(state) {
  const page = pageOf(state.root);
  if (!state.bar) {
    const count = el("span", { class: "p2-sb-count" }), list = el("ol", { class: "p2-sb-list", "aria-label": "Kept edits" });
    const why = el("input", { class: "p2-sb-why", type: "text", maxlength: String(WHY_MAX), placeholder: "Why (optional)", "aria-label": "Why (optional)", spellcheck: "false" });
    const line = el("p", { class: "p2-sb-line", role: "status", hidden: true });
    const dropAll = iconButton("trash", "Drop all edits", { class: "p2-sb-drop" }), send = iconButton("send", "Send to " + lead(), { class: "p2-sb-send" });
    const node = el("div", { class: "p2-suggest-bar", role: "region", "aria-label": "Suggested edits" }, list, el("div", { class: "p2-sb-row" }, count, why, dropAll, send), line);
    why.addEventListener("input", () => {
      state.why = why.value;
    });
    why.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        send.click();
      }
    });
    dropAll.addEventListener("click", () => {
      if (!state.edits.length || confirm(`Drop ${plural(state.edits.length)}?`)) {
        state.edits = [];
        state.why = "";
        why.value = "";
        paintBar(state);
        paintMarks(state);
      }
    });
    send.addEventListener("click", async () => {
      if (state.sending) return;
      state.sending = true;
      send.disabled = true;
      say(state, "Sending…");
      try {
        const result = await sendEdits(state);
        if (result.ok) {
          state.edits = [];
          state.why = "";
          why.value = "";
          paintBar(state);
          paintMarks(state);
          const sent = "Sent to " + lead() + " · " + rel(state.target.path);
          say(state, sent);
          setTimeout(() => {
            if (state.bar?.line.textContent === sent && !state.edits.length) say(state, "");
          }, SENT_SHOWN)?.unref?.();
        } else say(state, result.line, true);
      } finally {
        state.sending = false;
        send.disabled = false;
      }
    });
    state.bar = { node, count, list, why, line, send };
  }
  const bar = state.bar;
  if (page && bar.node.parentNode !== page) page.append(bar.node);
  bar.node.hidden = !state.edits.length && bar.line.hidden;
  bar.node.classList.toggle("is-empty", !state.edits.length);
  bar.count.textContent = plural(state.edits.length);
  bar.why.value = state.why;
  bar.list.replaceChildren(...state.edits.map((edit) => {
    const removed = edit.old.length, added = edit.text === "" ? 0 : edit.text.split("\n").length;
    const go = el("button", { type: "button", class: "p2-sb-edit ide-row", title: "Change this edit" }, el("span", {}, linesWord(edit.from, edit.to)), counts({ additions: added, deletions: removed }));
    go.addEventListener("click", () => {
      const block = edit.blockId ? articleOf(state.root)?.querySelector(`.pane-block[data-block-id="${edit.blockId}"]`) : null;
      void openEditor(state, { block, edit });
    });
    const off = iconButton("close", "Drop this edit", { class: "is-small p2-sb-off" });
    off.addEventListener("click", () => {
      state.edits = state.edits.filter((kept) => kept !== edit);
      paintBar(state);
      paintMarks(state);
    });
    return el("li", { class: "p2-sb-item" }, go, off);
  }));
}
const SENT_SHOWN = 8e3;
const plural = (n) => n === 1 ? "1 suggested edit" : n + " suggested edits";
function say(state, text, problem = false) {
  if (!state.bar) {
    if (!text) return;
    paintBar(state);
  }
  const line = state.bar.line;
  line.textContent = text ?? "";
  line.hidden = !text;
  line.classList.toggle("is-problem", !!problem);
  state.bar.node.hidden = !state.edits.length && line.hidden;
}
let lastDown = null;
const remember = () => {
  const selection = globalThis.getSelection?.();
  lastDown = selection && selection.rangeCount && !selection.isCollapsed ? { range: selection.getRangeAt(0).cloneRange(), at: Date.now() } : null;
};
function chosenRange(article) {
  const selection = globalThis.getSelection?.();
  let range = selection && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  if (!range && lastDown && Date.now() - lastDown.at < 3e3) range = lastDown.range;
  return range && article?.contains(range.commonAncestorContainer) && range.toString().trim() ? range : null;
}
const blockOf = (node) => (node?.nodeType === 3 ? node.parentElement : node)?.closest?.(".pane-block") ?? null;
function startPicking(state) {
  const article = articleOf(state.root);
  if (!article) return;
  stopPicking(state);
  state.picking = true;
  article.classList.add("p2-picking");
  const stop = iconButton("close", "Stop choosing", { class: "is-small" });
  stop.addEventListener("click", () => stopPicking(state));
  state.hint = el("p", { class: "p2-pick-hint", role: "status" }, el("span", {}, "Click a block to suggest an edit, or select a passage"), stop);
  (state.doc?.head ?? pageOf(state.root)?.querySelector(".doc-head"))?.append(state.hint);
  state.pick = (event) => {
    const block = event.target?.closest?.(".pane-block");
    if (!block || !article.contains(block) || ["button", "a", "input", "textarea", ".p2-suggest-editor"].some((selector) => event.target.closest(selector))) return;
    event.preventDefault();
    event.stopPropagation();
    const range = chosenRange(article);
    stopPicking(state);
    if (range) void openFor(state, range);
    else void openEditor(state, { block, wanted: blockText(block), lead: before(block) });
  };
  state.key_ = (event) => {
    if (event.key === "Escape") stopPicking(state);
  };
  article.addEventListener("click", state.pick, true);
  document.addEventListener("keydown", state.key_);
}
function stopPicking(state) {
  if (!state.picking) return;
  state.picking = false;
  const article = articleOf(state.root);
  article?.classList.remove("p2-picking");
  article?.removeEventListener("click", state.pick, true);
  document.removeEventListener("keydown", state.key_);
  state.hint?.remove();
  state.hint = null;
}
function openFor(state, range) {
  const first = blockOf(range.startContainer), last = blockOf(range.endContainer) ?? first;
  const wanted = range.toString(), lead2 = before(first) + " " + selectionPrefix(first, range);
  globalThis.getSelection?.()?.removeAllRanges();
  return openEditor(state, { block: last, wanted, lead: lead2 });
}
export function suggest({ target, doc, api }) {
  if (!canSuggest(target) || !doc?.root) return;
  void stylesheet("p2-views.css");
  const state = stateFor(target, doc, api);
  if (state.picking) {
    stopPicking(state);
    return;
  }
  const range = chosenRange(articleOf(doc.root));
  if (range) return openFor(state, range);
  startPicking(state);
}
let menuKey = null;
const remembersMenu = (event) => {
  menuKey = event.target?.closest?.(".ide-tab")?.dataset.key ?? null;
};
function closing(event) {
  const at = event.target;
  if (event.type === "auxclick") return event.button === 1 && at?.closest?.(".ide-tab-name") ? at.closest(".ide-tab")?.dataset.key : null;
  const item = at?.closest?.(".ide-tabmenu-item");
  if (item) return item.textContent.trim() === "Close" ? menuKey : null;
  return at?.closest?.(".ide-tab-x") ? at.closest(".ide-tab")?.dataset.key : null;
}
function asks(event) {
  const key = closing(event);
  if (!key) return;
  const state = states.get(key);
  const n = state?.edits.length ?? 0, writing = !!state?.editor?.dirty();
  if (!n && !writing) return;
  const what = n ? plural(n) : "the edit you are writing";
  if (confirm(`Close ${fileName(state.target.path)} and drop ${what}?`)) {
    drop(state);
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", remember, true);
  document.addEventListener("contextmenu", remembersMenu, true);
  document.addEventListener("click", asks, true);
  document.addEventListener("auxclick", asks, true);
  globalThis.addEventListener?.("beforeunload", (event) => {
    if ([...states.values()].some((state) => state.edits.length)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
onTabClosed(({ target }) => {
  const state = target && states.get(keyOf(target));
  if (state) drop(state);
});
onDocRendered((doc) => {
  if (!canSuggest(doc?.target)) return;
  const state = states.get(keyOf(doc.target));
  if (!state) return;
  if (state.root !== doc.root && !state.root?.isConnected) {
    drop(state);
    return;
  }
  state.doc = doc;
  state.root = doc.root;
  if (state.editor && !state.editor.node.isConnected) {
    const id = state.editor.block?.dataset?.blockId, block = id ? articleOf(doc.root)?.querySelector(`.pane-block[data-block-id="${id}"]`) : null;
    if (block) {
      block.after(state.editor.node);
      state.editor.block = block;
    } else articleOf(doc.root)?.append(state.editor.node);
  }
  if (state.picking) {
    const picking = state.pick;
    stopPicking(state);
    if (picking) startPicking(state);
  }
  paintBar(state);
  paintMarks(state);
});
registerDocTool({ id: "suggest", glyph: "edit", label: "Suggest edit", order: 30, when: ({ target, doc }) => canSuggest(target) && typeof doc?.raw === "function", run: suggest });
