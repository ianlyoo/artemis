import { el } from "../boards/dom.js";
import { control } from "../chat/visuals.js";
import { getJSON, postJSON, homeApi } from "./api.js";
import { SYSTEM, fileName, isolate, stylesheet } from "./core.js";
import { registerDocTool, onDocRendered, onDashboard, updateDocTools } from "./extensions.js";
import { lineDiff, splitView } from "./diff.js";
import { has } from "../names.js";
const q = (value) => encodeURIComponent(value);
export const EDIT_PATHS = { source: (path) => "/ide/source?target=" + q("file:" + path), save: () => "/ide/save", edits: () => "/ide/edits" };
export const REASONS = { masked: "Read-only · Home masked a secret in this file", binary: "Read-only · a binary file", not_utf8: "Read-only · not UTF-8 text", too_large: "Read-only · over 2 MB", read_only: "Read-only · Home's user can't write this file", owner_edits: "Read-only · the owner-edits copy: edit the file in system instead", untracked: "Read-only · git doesn't track this system file, and Home makes no new files", conflict_pending: "Read-only · a pending owner edit clashes with main; the CTO applies or refuses it first", denied: "Read-only · Home doesn't write this file", outside: "Read-only · outside Home's folders", unavailable: "Read-only · Home couldn't open it to edit", unsynced: "Read-only · Home couldn't sync the owner-edits copy now; try again, or ask the CTO" };
export const reasonLine = (reason) => reason ? REASONS[reason] ?? REASONS.unavailable : null;
const UNREADABLE = ["binary", "not_utf8", "too_large"], SHA = /^[0-9a-f]{64}$/;
const unsynced = ({ status, body } = {}, path) => status === 503 && body?.error === "unavailable" && repoPath(path) != null;
const codeBody = (body) => body?.kind === "text" && Array.isArray(body.blocks) && body.blocks.length === 1 && body.blocks[0]?.type === "code";
export const canSource = (target, item) => target?.kind === "file" && (["md", "html"].includes(item?.type) || item?.type === "sheet" && /\.csv$/i.test(target.path));
export function pickSource(body, read, { source = false, path = null } = {}) {
  const rendered = !source && codeBody(body) ? String(body.blocks[0].text ?? "") : null;
  const src = read?.ok && typeof read.body?.text === "string" ? read.body : null;
  const stay = (reason) => ({ text: rendered, editable: false, reason: reason ?? null, sha: null, origin: src?.origin ?? null, pending: null, bom: false });
  if (!read) return stay(null);
  if (!src) return stay(read.body?.reason ?? (unsynced(read, path) ? "unsynced" : "unavailable"));
  if (UNREADABLE.includes(src.reason)) return stay(src.reason);
  if (Number(body?.masked) > 0 && src.reason !== "masked") return stay("masked");
  const bom = src.text.startsWith("\uFEFF"), editable = src.editable === true && SHA.test(String(src.sha256));
  return { text: bom ? src.text.slice(1) : src.text, editable, reason: editable ? null : src.reason ?? "unavailable", sha: src.sha256 ?? null, origin: src.origin ?? null, pending: pendingOf(src.pending), bom };
}
const pendingOf = (held) => held?.commit ? { commit: String(held.commit), id: held.id ?? null } : null;
export function lineBreakOf(text) {
  const value = String(text ?? ""), breaks = value.split("\n").length - 1;
  return breaks && value.split("\r\n").length - 1 === breaks ? "\r\n" : "\n";
}
export const asLines = (text, lineBreak) => lineBreak === "\n" ? String(text ?? "") : String(text ?? "").split(lineBreak).join("\n");
const TWO = new Set(["javascript", "jsx", "typescript", "tsx", "json", "yaml", "html", "css", "xml", "markdown", "ruby", "lua", "dart", "scala", "toml"]);
export function indentOf(text, lang = "text") {
  let tabs = 0, spaced = 0, last = 0;
  const steps = new Map();
  for (const line of String(text ?? "").split("\n", 2e4)) {
    if (!line.trim()) continue;
    const lead = /^[ \t]*/.exec(line)[0];
    if (lead[0] === "	") {
      tabs++;
      last = 0;
      continue;
    }
    if (lead) spaced++;
    const step = lead.length - last;
    last = lead.length;
    if ([2, 3, 4, 8].includes(step)) steps.set(step, (steps.get(step) ?? 0) + 1);
  }
  if (tabs > spaced) return "	";
  const best = [...steps].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  if (best && spaced) return " ".repeat(best);
  return lang === "go" ? "	" : " ".repeat(TWO.has(lang) ? 2 : 4);
}
export const saveBody = (path, base, text, bom = false) => ({ target: "file:" + path, base_sha256: base, text: (bom ? "\uFEFF" : "") + text });
export const SAVE_ERRORS = { conflict_pending: "Not saved · a pending owner edit clashes with main; the CTO applies or refuses it first", secret_detected: "Not saved · it holds something shaped like a secret", forbidden: "Not saved · Home doesn't write this file", not_found: "Not saved · the file isn't there anymore, and Home makes no new files", too_large: "Not saved · over 2 MB", unsupported: "Not saved · Home can't save this kind of file", busy: "Not saved · Home is busy: save again in a moment", unavailable: "Not saved · Home's save path isn't available now", unsynced: "Not saved · Home couldn't sync the owner-edits copy now; your changes are kept", bad_request: "Not saved · Home refused the request", offline: "Not saved · Home didn't answer", failed: "Not saved · something went wrong" };
const BY_STATUS = { 0: "offline", 400: "bad_request", 403: "forbidden", 404: "not_found", 413: "too_large", 415: "unsupported", 422: "secret_detected", 429: "busy", 503: "unavailable" };
export function saveOutcome({ ok, status, body } = {}, { path = null } = {}) {
  if (ok && SHA.test(String(body?.sha256))) return { kind: "saved", sha: body.sha256, mtime: body.mtime ?? null, origin: body.origin ?? null, commit: body.commit ?? null, id: body.id ?? null };
  const error = typeof body?.error === "string" ? body.error : "";
  if (error === "conflict_pending") return { kind: "pending", line: SAVE_ERRORS.conflict_pending };
  if (unsynced({ status, body }, path)) return { kind: "error", line: SAVE_ERRORS.unsynced };
  if (status === 409 && (error === "conflict" || !error)) return { kind: "conflict", sha: body?.sha256 ?? null, mtime: body?.mtime ?? null };
  const readOnly = error === "forbidden" ? /^read-only: ([a-z_]+)/.exec(String(body?.detail ?? ""))?.[1] ?? body?.reason : null;
  if (readOnly && REASONS[readOnly]) return { kind: "error", line: "Not saved · " + REASONS[readOnly].replace(/^Read-only · /, "") };
  return { kind: "error", line: SAVE_ERRORS[error] ?? SAVE_ERRORS[BY_STATUS[status]] ?? SAVE_ERRORS.failed };
}
export function dropQuestion(why, name) {
  if (why === "reload") return `Reload ${name} from disk and drop your changes?`;
  if (why === "rendered") return `Show ${name} rendered and drop your changes?`;
  return `Close ${name} and drop your changes?`;
}
const linesOfText = (text) => {
  const value = String(text ?? "").replace(/\r?\n$/, "");
  return value ? value.split("\n").map((line) => line.replace(/\r$/, "")) : [];
};
export function hunksBetween(theirs, mine, context = 3) {
  const a = linesOfText(theirs), b = linesOfText(mine);
  const rows = lineDiff(a, b).map((op) => op.type === " " ? { type: " ", text: a[op.a], old: op.a + 1, new: op.b + 1 } : op.type === "-" ? { type: "-", text: a[op.a], old: op.a + 1, new: null } : { type: "+", text: b[op.b], old: null, new: op.b + 1 });
  const hunks = [];
  let oldBefore = 0, newBefore = 0, done = 0;
  for (let at = 0; at < rows.length; at++) {
    if (rows[at].type === " ") continue;
    let end = at;
    for (; ; ) {
      while (end < rows.length && rows[end].type !== " ") end++;
      let next = end;
      while (next < rows.length && rows[next].type === " ") next++;
      if (next < rows.length && next - end <= 2 * context) {
        end = next;
        continue;
      }
      break;
    }
    const from = Math.max(done, at - context), to = Math.min(rows.length, end + context), lines = rows.slice(from, to);
    for (const row of rows.slice(done, from)) {
      if (row.old != null) oldBefore++;
      if (row.new != null) newBefore++;
    }
    const olds = lines.filter((row) => row.old != null), news = lines.filter((row) => row.new != null);
    const range = (list, side, before) => `${list.length ? list[0][side] : before},${list.length}`;
    hunks.push({ header: `@@ -${range(olds, "old", oldBefore)} +${range(news, "new", newBefore)} @@`, section: "", lines });
    oldBefore += olds.length;
    newBefore += news.length;
    done = to;
    at = to - 1;
  }
  return hunks;
}
export const repoPath = (path) => String(path ?? "").startsWith(SYSTEM + "/") ? String(path).slice(SYSTEM.length + 1) : null;
const within = (path, base) => typeof base === "string" && (path === base || String(path).startsWith(base + "/"));
export function touches(item, path) {
  if (item?.op === "delete") return within(path, item.path);
  if (item?.op === "rename") return within(path, item.from) || within(path, item.path);
  return item?.path === path;
}
export const editOf = (items, path) => Array.isArray(items) ? items.find((item) => touches(item, path)) ?? null : null;
export function keepRefused(before, items, left = new Map()) {
  const listed = new Set(items.map((item) => item?.id).filter(Boolean));
  for (const old of before ?? []) if (old?.state === "refused" && old.id && !listed.has(old.id)) {
    left.delete(old.id);
    left.set(old.id, old);
  }
  while (left.size > 200) left.delete(left.keys().next().value);
  const kept = [...left.values()].filter((gone) => !listed.has(gone.id) && !(String(editOf(items, gone.path)?.at ?? "") > String(gone.at ?? "")));
  return [...kept.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))), ...items];
}
export function stateOf(items, path, pending = null, readAt = null) {
  const item = editOf(items, path);
  if (!pending?.commit) return item;
  const same = (entry) => pending.id && entry?.id === pending.id || entry?.commit === pending.commit;
  if (Array.isArray(items) && items.some(same)) return item;
  const fresh = item && pending.at != null && readAt != null && readAt >= pending.at;
  if (fresh) return item;
  const op = pending.op ? { op: pending.op, ...pending.from != null ? { from: pending.from } : {} } : {};
  return { path: pending.op ? pending.path ?? path : path, commit: pending.commit, id: pending.id ?? null, state: "pending", ...op };
}
export function stateLabel(item, path = null) {
  const state = item?.state === "pending" ? "Pending" : item?.state === "applied" ? "Applied" : item?.state === "refused" ? refusedLabel(item) : null;
  if (!state || !item.op) return state;
  if (item.op === "rename") return state + (path != null && within(path, item.from) ? " · Rename to " + isolate(fileName(item.path)) : item.from ? " · Rename from " + isolate(fileName(item.from)) : " · Rename");
  return state + (item.op === "delete" ? " · Delete" : item.op === "create" ? " · Create" : "");
}
function refusedLabel(item) {
  const why = String(item.reason ?? "").replace(/\s+/g, " ").trim();
  return why ? "Rejected (" + (why.length > 120 ? why.slice(0, 119) + "…" : why) + ")" : "Rejected";
}
export const NOTE = "System files save as an owner edit, applied once reviewed.";
export const REMOVED = "Removed on disk";
export const OVERWRITE = "Overwrite the newer version on disk?";
const heads = new WeakMap();
function linesOf(head) {
  if (!head) return null;
  let made = heads.get(head);
  if (!made) {
    const line = (cls, role) => {
      const node = el("p", { class: "code-edit-line " + cls, role });
      node.hidden = true;
      return node;
    };
    made = { node: el("div", { class: "code-edit" }), reason: line("is-reason"), gone: line("is-gone", "status"), state: line("is-state"), note: line("is-note", "status"), error: line("is-error", "status") };
    made.node.append(made.reason, made.gone, made.state, made.note, made.error);
    head.append(made.node);
    heads.set(head, made);
  }
  return made;
}
const put = (line, text) => {
  if (!line) return;
  line.textContent = text ?? "";
  line.hidden = !text;
};
export function noteReason(head, reason) {
  put(linesOf(head)?.reason, reasonLine(reason));
}
const watched = new Map();
const edits = { items: null, at: 0, readAt: null, reading: null, again: false, timer: 0, left: new Map() };
let lastApi = null;
const apiNow = () => lastApi ?? homeApi;
function readEdits() {
  if (edits.reading) {
    edits.again = true;
    return edits.reading;
  }
  return edits.reading = (async () => {
    const started = Date.now();
    try {
      const result = await getJSON(apiNow(), EDIT_PATHS.edits());
      if (result.ok && Array.isArray(result.body?.items)) {
        edits.items = keepRefused(edits.items, result.body.items, edits.left);
        edits.readAt = started;
      }
    } finally {
      edits.reading = null;
      edits.at = Date.now();
    }
    paintStates();
    for (const session of [...sessions.values()]) session.listed();
    if (edits.items) for (const fn of [...heard]) {
      try {
        fn(edits.items);
      } catch (error) {
        console.error("Edits:", error);
      }
    }
    if (edits.again) {
      edits.again = false;
      await readEdits();
    }
  })();
}
const heard = new Set();
export function onEdits(fn) {
  heard.add(fn);
  return () => heard.delete(fn);
}
const statesNow = () => edits.items && new Map(edits.items.filter((item) => item?.id || item?.commit).map((item) => [item.id ?? item.commit, item.state]));
export function ctoActed(before, after) {
  if (!before || !after) return false;
  for (const [id, state] of after) if ((state === "applied" || state === "refused") && before.get(id) !== state) return true;
  for (const [id, state] of before) if (state === "pending" && !after.has(id)) return true;
  return false;
}
function paintState(head) {
  const held = watched.get(head), lines = linesOf(head);
  if (!held || !lines) return;
  const item = stateOf(edits.items, held.path, held.pending, edits.readAt), label = stateLabel(item, held.path);
  put(lines.state, null);
  if (!label) return;
  lines.state.className = "code-edit-line is-state is-" + item.state;
  lines.state.replaceChildren(el("span", { class: "code-edit-dot", "aria-hidden": "true" }), el("span", { class: "code-edit-state" }, label), item.commit ? el("span", { class: "code-edit-commit" }, " · " + String(item.commit).slice(0, 7)) : null);
  lines.state.title = item.at ? "Owner edit " + item.commit + ", " + item.at : "Owner edit " + (item.commit ?? "");
  lines.state.hidden = false;
}
function paintStates() {
  for (const head of [...watched.keys()]) {
    if (head.isConnected === false) watched.delete(head);
    else paintState(head);
  }
}
function watchSystem(head, path, pending) {
  if (!head || path == null) return;
  const held = watched.get(head), before = held?.path === path ? held.pending : null;
  const next = pending === void 0 ? before : pending && { ...pending, at: before?.commit === pending.commit ? before.at : Date.now() };
  watched.set(head, { path, pending: next });
  if (!edits.items && !edits.reading) void readEdits();
  else paintState(head);
}
onDocRendered((doc) => {
  if (doc?.target?.kind === "file" && doc.head && has("edit")) watchSystem(doc.head, repoPath(doc.target.path));
});
export function noteOp(done, api = null) {
  if (api) lastApi = api;
  const path = repoPath(done?.path), from = done?.from != null ? repoPath(done.from) : null;
  if (path == null || !done.commit) return;
  const pending = { commit: String(done.commit), id: done.id ?? null, op: done.op, path, ...from != null ? { from } : {} };
  for (const [head, held] of [...watched]) if (touches(pending, held.path)) watchSystem(head, held.path, pending);
  void readEdits();
}
onDashboard(() => {
  if (edits.timer || ![...watched.keys()].some((head) => head.isConnected !== false)) return;
  edits.timer = setTimeout(() => {
    edits.timer = 0;
    void readEdits();
  }, Math.max(1500, 5e3 - (Date.now() - edits.at)));
});
const sessions = new Map();
let noted = false, serial = 0;
export const sessionOf = (root) => (root && sessions.get(root)) ?? null;
export function createSession({ target, api, head, scroller, root, file, view }) {
  if (api) lastApi = api;
  const lines = linesOf(head), system = () => now.origin === "system" || repoPath(target.path) != null;
  let now = { ...file }, saving = false, sheet = null, dead = false, refused = null;
  function paint() {
    put(lines?.reason, now.editable ? null : reasonLine(now.reason));
    if (system()) watchSystem(head, repoPath(target.path), now.pending);
  }
  function closeSheet() {
    sheet?.pin.remove();
    sheet = null;
    refused = null;
  }
  function openSheet(theirSha = null) {
    closeSheet();
    const id = "code-sheet-" + ++serial;
    const button = (text, title, cls, fn) => {
      const made = control(text, { class: "code-sheet-button " + cls, title });
      made.addEventListener("click", fn);
      return made;
    };
    const theirs = button("Reload theirs", "Drop your changes and read the file as it is now", "is-drop", () => {
      closeSheet();
      view.drop();
      void view.reload();
    });
    const force = SHA.test(String(theirSha)) ? button("Save mine anyway", "Write your changes over the newer version", "is-force", () => {
      if (!globalThis.confirm?.(OVERWRITE)) return;
      void session.save({ over: theirSha });
    }) : null;
    const compare = button("Compare", "Your changes against the file as it is now", "is-compare", () => void showCompare());
    const keep = button("Keep editing", "Keep your changes: the next save meets this again", "is-keep", () => {
      closeSheet();
      view.focus();
    });
    const diff = el("div", { class: "code-sheet-diff" });
    diff.hidden = true;
    const card = el("div", { class: "code-sheet", role: "alertdialog", "aria-labelledby": id, "aria-describedby": id + "-line" }, el("p", { class: "code-sheet-title", id }, "This file changed since you opened it"), el("p", { class: "code-sheet-line", id: id + "-line" }, system() ? "Main or another owner edit changed it. Your changes are still here." : "It changed on disk. Your changes are still here."), el("div", { class: "code-sheet-actions" }, theirs, force, compare, keep), diff);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSheet();
        view.focus();
      }
    });
    const pin = el("div", { class: "code-sheet-pin" }, card);
    (scroller ?? head)?.prepend(pin);
    sheet = { pin, card, diff, compare, buttons: { theirs, force, compare, keep } };
    keep.focus?.({ preventScroll: true });
    return sheet;
  }
  async function showCompare() {
    const held = sheet;
    if (!held) return;
    if (!held.diff.hidden && held.compare.getAttribute("aria-pressed") === "true") {
      held.diff.hidden = true;
      held.compare.setAttribute("aria-pressed", "false");
      return;
    }
    held.compare.setAttribute("aria-pressed", "true");
    held.diff.hidden = false;
    void stylesheet("p2-views.css");
    held.diff.replaceChildren(el("p", { class: "code-sheet-quiet" }, "Reading the file…"));
    const read = await getJSON(api, EDIT_PATHS.source(target.path));
    if (sheet !== held || dead) return;
    const text = read.ok && typeof read.body?.text === "string" && !UNREADABLE.includes(read.body.reason) ? read.body.text.replace(/^\ufeff/, "") : null;
    if (text == null) {
      held.diff.replaceChildren(el("p", { class: "code-sheet-quiet" }, "Couldn't read the file as it is now"));
      return;
    }
    const hunks = hunksBetween(text, view.text());
    held.diff.replaceChildren(...hunks.length ? [el("div", { class: "code-sheet-sides", "aria-hidden": "true" }, el("span", {}, "On disk"), el("span", {}, "Yours")), splitView(hunks)] : [el("p", { class: "code-sheet-quiet" }, "The text is the same as yours")]);
  }
  const session = { target, root, get editable() {
    return !dead && now.editable;
  }, get dirty() {
    return !dead && view.dirty();
  }, get sheet() {
    return sheet;
  }, set(file2) {
    now = { ...file2 };
    paint();
    updateDocTools();
  }, async save({ over = null } = {}) {
    if (dead || saving || !now.editable) return false;
    if (!view.dirty()) {
      view.flash("No changes");
      return true;
    }
    const blocked = () => !over && refused && refused.base === view.sha() && refused.text === view.text();
    if (blocked() && refused.waits && !edits.reading && Date.now() - edits.at >= 1500) {
      saving = true;
      try {
        await readEdits();
      } catch {
      } finally {
        saving = false;
      }
      if (dead || !view.dirty()) return false;
    }
    if (blocked()) {
      if (sheet) sheet.buttons.keep.focus?.({ preventScroll: true });
      else put(lines?.error, refused.line);
      return false;
    }
    const doc = view.doc(), base = view.sha(), text = view.text();
    saving = true;
    closeSheet();
    put(lines?.error, null);
    view.busy(true);
    const result = await postJSON(api, EDIT_PATHS.save(), saveBody(target.path, over ?? base, text, view.bom()));
    saving = false;
    if (dead) return false;
    view.busy(false);
    const out = saveOutcome(result, { path: target.path });
    if (out.kind === "saved") {
      view.saved(doc, out.sha);
      view.flash("Saved");
      if (out.origin === "system" || system()) {
        if (out.commit) now = { ...now, pending: pendingOf(out) };
        paint();
        if (!noted) {
          noted = true;
          put(lines?.note, NOTE);
        }
        void readEdits();
      }
      if (view.source && !view.dirty()) void switches.get(root)?.set(false);
      return true;
    }
    if (out.kind === "conflict") openSheet(out.sha);
    else put(lines?.error, out.line);
    const status = Number(result?.status) || 0;
    if (status && status !== 429 && status < 500) refused = { base, text, line: out.line ?? null, waits: out.kind === "pending" ? { states: statesNow() } : null };
    return false;
  }, listed() {
    const waits = refused?.waits;
    if (!waits) return;
    const states = statesNow();
    if (!waits.states) waits.states = states;
    else if (ctoActed(waits.states, states)) refused = null;
  }, keepOpen(why = "close") {
    if (dead || !view.dirty()) return false;
    if (!globalThis.confirm?.(dropQuestion(why, fileName(target.path)))) return true;
    if (why === "reload") view.drop();
    return false;
  }, clearError() {
    put(lines?.error, null);
  }, removed(on) {
    put(lines?.gone, on ? REMOVED : null);
    if (!on) {
      refused = null;
      put(lines?.error, null);
    }
  }, destroy() {
    if (dead) return;
    dead = true;
    closeSheet();
    put(lines?.reason, null);
    put(lines?.gone, null);
    put(lines?.error, null);
    if (sessions.get(root) === session) sessions.delete(root);
    updateDocTools();
  } };
  sessions.set(root, session);
  paint();
  updateDocTools();
  return session;
}
if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("beforeunload", (event) => {
  if ([...sessions.values()].some((session) => session.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
const switches = new WeakMap();
export function bindSource(root, control2) {
  switches.set(root, control2);
}
export const sourceShown = (root) => !!switches.get(root)?.on;
async function editSource({ target, doc, api }) {
  const control2 = switches.get(doc?.root);
  if (!control2 || control2.on) return;
  if (api) lastApi = api;
  const read = Number(doc.item?.masked) > 0 ? null : await getJSON(apiNow(), EDIT_PATHS.source(target.path));
  const file = read ? pickSource({ masked: doc.item?.masked }, read, { source: true, path: target.path }) : { editable: false, reason: "masked" };
  if (!file.editable) {
    noteReason(doc.head, file.reason);
    return;
  }
  noteReason(doc.head, null);
  await control2.set(true);
}
async function showRendered({ doc }) {
  const control2 = switches.get(doc?.root);
  if (!control2?.on) return;
  if (sessionOf(doc.root)?.keepOpen("rendered")) return;
  await control2.set(false);
}
const GLYPH = { save: "M5.5 4H16l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z M8 4v4h7.5V4 M7.5 20v-5.5h9V20", source: "M8.5 7.5 4 12l4.5 4.5 M15.5 7.5 20 12l-4.5 4.5 M13.5 5l-3 14" };
export const TOOLS = { save: "Save", source: "Edit source", rendered: "Show rendered" };
registerDocTool({ id: "save", glyph: GLYPH.save, label: TOOLS.save, order: 1, when: ({ doc }) => !!sessionOf(doc?.root)?.editable, run: ({ doc }) => {
  void sessionOf(doc?.root)?.save();
} });
registerDocTool({ id: "edit-source", glyph: GLYPH.source, label: TOOLS.source, order: 2, when: ({ target, doc }) => canSource(target, doc?.item) && !!switches.get(doc?.root) && !switches.get(doc.root).on, run: (context) => {
  editSource(context).catch((error) => console.error("Edit source:", error));
} });
registerDocTool({ id: "show-rendered", glyph: "report", label: TOOLS.rendered, order: 2, when: ({ doc }) => sourceShown(doc?.root), run: (context) => {
  showRendered(context).catch((error) => console.error("Show rendered:", error));
} });
