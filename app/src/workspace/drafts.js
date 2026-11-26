import { el } from "../boards/dom.js";
import { registerSection, registerKind } from "./extensions.js";
import { row } from "./explorer.js";
import { iconButton } from "./icons.js";
import { getJSON, paths } from "./api.js";
import { day, clip } from "./core.js";
import { createSender } from "./send.js";
import { lead } from "../names.js";
export const NAME = /^[a-z0-9-]{1,80}$/;
export const PAGE = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}\/){0,3}[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}\.html$/;
export const SANDBOX = "allow-scripts allow-same-origin";
export const PRESETS = [{ id: "1920", w: 1920, h: 1080, glyph: "screen", label: "1920 × 1080" }, { id: "1536", w: 1536, h: 864, glyph: "laptop", label: "1536 × 864 · 1920 at 125 %" }, { id: "2560", w: 2560, h: 1440, glyph: "wide", label: "2560 × 1440" }, { id: "390", w: 390, h: 844, glyph: "phone", label: "390 × 844 · phone" }];
const PRESET = Object.fromEntries(PRESETS.map((preset) => [preset.id, preset]));
const AGAIN = 3e4;
export const NOT_SERVED = "Drafts aren't served on this host";
export const NOTE_SECRET = "The note looks like it holds a secret · nothing was sent";
export const draftTarget = (raw) => raw && NAME.test(String(raw.name)) && PAGE.test(String(raw.page)) ? { kind: "draft", name: String(raw.name), page: String(raw.page) } : null;
export const draftKey = (target) => "draft:" + target.name + "/" + target.page;
export const draftRef = (target) => target.name + "/" + target.page;
export const frameSrc = (origin, target) => String(origin).replace(/\/+$/, "") + "/drafts/" + target.name + "/" + target.page.split("/").map(encodeURIComponent).join("/");
export function pickMessage(target, other = null, note = "") {
  const head = "시안 선택 · " + draftRef(target) + (other ? " (비교: " + draftRef(other) + ")" : "");
  const said = String(note ?? "").trim();
  return said ? head + "\n" + said : head;
}
export function readDrafts(body) {
  let origin = null;
  try {
    const url = new URL(body?.origin);
    if (["http:", "https:"].includes(url.protocol)) origin = url.origin;
  } catch {
  }
  const drafts = (Array.isArray(body?.drafts) ? body.drafts : []).filter((draft) => NAME.test(String(draft?.name))).map((draft) => ({ name: String(draft.name), mtime: Number.isFinite(Date.parse(draft.mtime)) ? String(draft.mtime) : null, pages: [...new Set((Array.isArray(draft.pages) ? draft.pages : []).filter((page) => PAGE.test(String(page))))].slice(0, 40) })).filter((draft) => draft.pages.length).sort((a, b) => (Date.parse(b.mtime) || 0) - (Date.parse(a.mtime) || 0) || a.name.localeCompare(b.name));
  return { origin, drafts };
}
export const firstPage = (draft) => draft.pages.includes("index.html") ? "index.html" : draft.pages[0];
let ide = { compare: null, beside: () => null };
export function bindDrafts(hooks) {
  ide = { ...ide, ...hooks };
  return () => {
    ide = { compare: null, beside: () => null };
  };
}
const list = { state: "idle", origin: null, drafts: [], at: 0, reading: null, repaint: null, revision: null, shown: null, timer: null };
function readList(api) {
  const path = paths.drafts() + (list.state === "ready" && list.revision ? "?revision=" + encodeURIComponent(list.revision) : "");
  list.reading ??= getJSON(api, path).then((answer) => {
    list.at = Date.now();
    if (answer.ok && answer.body?.unchanged === true && answer.body.revision === list.revision) return false;
    if (answer.ok) Object.assign(list, readDrafts(answer.body), { state: "ready", revision: typeof answer.body?.revision === "string" ? answer.body.revision : null });
    else if (list.state !== "ready") list.state = "failed";
    return true;
  }, () => {
    if (list.state !== "ready") list.state = "failed";
    return true;
  }).then((changed) => {
    list.reading = null;
    if (changed) list.repaint?.();
  });
  return list.reading;
}
let lastApi = null;
const showing = () => !!list.shown?.isConnected && list.shown.getClientRects().length > 0 && document.visibilityState === "visible";
function again() {
  clearTimeout(list.timer);
  list.timer = null;
  if (!list.shown?.isConnected) return;
  list.timer = setTimeout(() => {
    if (lastApi && showing() && Date.now() - list.at >= AGAIN) void readList(lastApi);
    again();
  }, AGAIN);
  list.timer.unref?.();
}
const folds = new Set();
let comparing = null;
function section({ open, api, refresh }) {
  const rows = drawSection({ open, api, refresh }), nodes = Array.isArray(rows) ? rows : [rows];
  list.shown = nodes[0] ?? null;
  queueMicrotask(again);
  return rows;
}
function drawSection({ open, api, refresh }) {
  lastApi = api;
  list.repaint = refresh;
  if (list.state === "idle") {
    list.state = "loading";
    void readList(api);
  } else if (list.state === "ready" && !list.reading && Date.now() - list.at >= AGAIN) void readList(api);
  if (list.state === "loading") return el("p", { class: "ex-quiet" }, "Loading…");
  if (list.state === "failed") return el("p", { class: "ex-quiet" }, "Couldn't read the drafts");
  if (!list.origin) return el("p", { class: "ex-quiet" }, NOT_SERVED);
  if (!list.drafts.length) return el("p", { class: "ex-quiet" }, "No drafts yet");
  const picked = (target) => comparing?.findIndex((one) => draftKey(one) === draftKey(target)) ?? -1;
  function choose(target) {
    if (!comparing) {
      void open(target);
      return;
    }
    const at = picked(target);
    if (at >= 0) comparing.splice(at, 1);
    else comparing.push(target);
    if (comparing.length === 2) {
      const [a, b] = comparing;
      comparing = null;
      void startCompare(a, b, open);
    }
    refresh();
  }
  const mark = (target) => {
    const at = picked(target);
    return at < 0 ? null : at ? "Right" : "Left";
  };
  const rows = [];
  rows.push(row({ name: comparing ? comparing.length ? "Pick one more to compare" : "Pick two to compare" : "Compare two", note: comparing ? "Cancel" : "", muted: !comparing, cls: "dv-compare" + (comparing ? " is-on" : ""), title: comparing ? "Cancel comparing" : "Pick two drafts or pages, then see them side by side at one size", onClick: () => {
    comparing = comparing ? null : [];
    refresh();
  } }));
  for (const draft of list.drafts) {
    const one = draft.pages.length === 1, target = { kind: "draft", name: draft.name, page: firstPage(draft) };
    if (one) {
      rows.push(row({ name: draft.name, note: day(draft.mtime), target, mark: mark(target), title: draftRef(target), onClick: () => choose(target) }));
      continue;
    }
    const shut = !folds.has(draft.name);
    rows.push(row({ name: draft.name, note: day(draft.mtime) + " · " + draft.pages.length + " pages", dir: shut ? "shut" : "open", title: draft.name, onClick: () => {
      if (shut) folds.add(draft.name);
      else folds.delete(draft.name);
      refresh();
    } }));
    if (!shut) for (const page of draft.pages) {
      const each = { kind: "draft", name: draft.name, page };
      rows.push(row({ name: page, depth: 1, target: each, mark: mark(each), title: draftRef(each), onClick: () => choose(each) }));
    }
  }
  return rows;
}
async function startCompare(a, b, open) {
  const size = sizes.get(draftKey(a)) ?? sizes.get(draftKey(b)) ?? "1920";
  setSize(draftKey(a), size);
  setSize(draftKey(b), size);
  pairs.set(draftKey(a), draftKey(b));
  pairs.set(draftKey(b), draftKey(a));
  if (ide.compare) await ide.compare(a, b);
  else await open(a);
}
const sizes = new Map(), pairs = new Map(), views = new Map();
function setSize(key, id) {
  if (!PRESET[id]) return;
  sizes.set(key, id);
  views.get(key)?.size(id);
  const other = pairs.get(key);
  if (other && sizes.get(other) !== id) {
    sizes.set(other, id);
    views.get(other)?.size(id);
  }
}
async function view({ target, api, signal }) {
  lastApi = api;
  if (list.state !== "ready") await readList(api);
  const key = draftKey(target);
  if (!list.origin) return { node: el("div", { class: "dv dv-none" }, el("p", { class: "pane-muted" }, list.state === "failed" ? "Couldn't read the drafts" : NOT_SERVED)), head: false };
  const origin = list.origin;
  let size = sizes.get(key) ?? "1920", frame = null;
  const buttons = PRESETS.map((preset) => {
    const button = iconButton(preset.glyph, preset.label, { class: "dv-preset", "data-preset": preset.id, "aria-pressed": "false" });
    button.addEventListener("click", () => setSize(key, preset.id));
    return button;
  });
  const said = el("span", { class: "dv-size", "aria-live": "polite" });
  const pick = iconButton("star", "Pick this draft", { class: "dv-pick", "aria-haspopup": "dialog", "aria-expanded": "false" });
  const bar = el("div", { class: "dv-bar" }, el("span", { class: "dv-presets", role: "group", "aria-label": "Screen size" }, ...buttons), said, el("span", { class: "dv-gap" }), pick);
  const holder = el("div", { class: "dv-frame" }), box = el("div", { class: "dv-box" }, holder);
  const blocked = el("p", { class: "dv-blocked", role: "status", hidden: true }, "Home's page policy doesn't let it frame the drafts' origin (frame-src)");
  const stage = el("div", { class: "dv-stage" }, box, blocked);
  const refused = (event) => {
    if (event.effectiveDirective === "frame-src" && String(event.blockedURI).startsWith(origin)) blocked.hidden = false;
  };
  document.addEventListener("securitypolicyviolation", refused);
  const sheet = pickSheet(target, () => {
    pick.setAttribute("aria-expanded", "false");
    pick.focus({ preventScroll: true });
  });
  const node = el("div", { class: "dv", "data-draft": target.name }, bar, stage, sheet.node);
  function make() {
    const made = el("iframe", { sandbox: SANDBOX, src: frameSrc(origin, target), title: "Draft " + draftRef(target) });
    holder.replaceChildren(made);
    frame = made;
  }
  function fit() {
    const preset = PRESET[size], room = stage.getBoundingClientRect(), pad = 24;
    const scale = room.width > 0 && room.height > 0 ? Math.min(1, (room.width - pad) / preset.w, (room.height - pad) / preset.h) : 1;
    holder.style.width = preset.w + "px";
    holder.style.height = preset.h + "px";
    holder.style.transform = `scale(${scale})`;
    box.style.width = Math.round(preset.w * scale) + "px";
    box.style.height = Math.round(preset.h * scale) + "px";
    said.textContent = preset.label.split(" · ")[0] + " · " + Math.round(scale * 100) + " %";
  }
  function paintSize(id) {
    size = id;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.preset === id));
    node.dataset.size = id;
    fit();
  }
  pick.addEventListener("click", () => {
    const now = sheet.toggle();
    pick.setAttribute("aria-expanded", String(now));
  });
  const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  watcher?.observe(stage);
  views.set(key, { size: paintSize });
  make();
  paintSize(size);
  const dispose = () => {
    document.removeEventListener("securitypolicyviolation", refused);
    watcher?.disconnect();
    if (views.get(key)?.size === paintSize) views.delete(key);
    sheet.close();
    frame?.remove();
    frame = null;
  };
  signal?.addEventListener("abort", dispose, { once: true });
  return { node, head: false, outline: [], refresh() {
    make();
    fit();
  }, dispose };
}
const sender = createSender();
function pickSheet(target, onClose) {
  const line = el("p", { class: "dv-sheet-msg" });
  const note = el("textarea", { class: "dv-note", rows: "3", placeholder: `A note for ${lead()} (optional)`, "aria-label": "Note", spellcheck: "false" });
  const state = el("span", { class: "dv-state", role: "status" });
  const send = iconButton("send", "Send to " + lead(), { key: "⌘Enter", class: "dv-send" });
  const close = iconButton("close", "Close", { key: "Esc", class: "dv-close is-small" });
  const node = el("div", { class: "dv-sheet", role: "dialog", "aria-label": "Pick this draft", hidden: true }, el("header", { class: "dv-sheet-head" }, el("h3", { class: "dv-sheet-title" }, "Pick this draft"), close), line, note, el("footer", { class: "dv-sheet-foot" }, state, send));
  let timer = 0;
  const other = () => {
    const beside = ide.beside(draftKey(target));
    return beside?.kind === "draft" ? beside : null;
  };
  const paint = () => {
    line.textContent = clip(pickMessage(target, other()), 200);
  };
  function show(text = "", kind = "") {
    state.textContent = text;
    state.dataset.state = kind;
  }
  function open() {
    clearTimeout(timer);
    paint();
    show("");
    send.disabled = false;
    node.hidden = false;
    note.focus({ preventScroll: true });
    return true;
  }
  function shut() {
    clearTimeout(timer);
    if (node.hidden) return false;
    node.hidden = true;
    onClose();
    return false;
  }
  async function go() {
    if (sender.busy || send.disabled) return;
    paint();
    send.disabled = true;
    const sent = await sender.send({ text: pickMessage(target, other(), note.value) }, { secret: note.value, secretLine: NOTE_SECRET, onState: (now) => show(now.line, now.state) });
    show(sent.line, sent.ok ? "sent" : "failed");
    if (sent.ok) {
      note.value = "";
      timer = setTimeout(shut, 1600);
    } else send.disabled = false;
  }
  send.addEventListener("click", () => {
    void go();
  });
  close.addEventListener("click", shut);
  note.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void go();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      shut();
    }
  });
  node.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      shut();
    }
  });
  return { node, toggle: () => node.hidden ? open() : shut(), close: shut };
}
export const undo = [registerSection({ id: "drafts", title: "Drafts", glyph: "draft", order: 10, render: section, count: () => list.state === "ready" && list.origin ? list.drafts.length : null }), registerKind("draft", { key: (target) => draftRef(target), toTarget: draftTarget, label: (target) => target.page === "index.html" ? target.name : target.name + " · " + target.page.replace(/\.html$/, ""), title: (target) => "Draft " + draftRef(target), crumbs: (target) => ["Drafts", target.name, ...target.page.split("/")], watch: (target) => "draft:" + target.name, kept: true, render: view })];
export function resetDrafts() {
  clearTimeout(list.timer);
  Object.assign(list, { state: "idle", origin: null, drafts: [], at: 0, reading: null, repaint: null, revision: null, shown: null, timer: null });
  sizes.clear();
  pairs.clear();
  views.clear();
  folds.clear();
  comparing = null;
  lastApi = null;
}
