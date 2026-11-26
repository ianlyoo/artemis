import { closeShortcut } from "./close-shortcut.js";
import "./p2-views.js";
import "./computer.js";
import "./preview.js";
import { showDb } from "./db.js";
import { showSystemMap } from "./sysmap.js";
import { showLearn } from "./learn.js";
import { bindDrafts } from "./drafts.js";
import { el } from "../boards/dom.js";
import { loadStyles } from "../chat/entry.js";
import { homeApi } from "./api.js";
import { stylesheet, lists as makeLists, keyOf, watchKeyOf, parseKey, label, title, rel, fileName, setOpener, setActive, on, ledgerHash } from "./core.js";
import { createDocTools, onRegistry, isExtKind, tabClosed } from "./extensions.js";
import { createStore, ownerViewWatch, ownerViewApi } from "./store.js";
import { createTabs, canSplitSame, tabKeyOf } from "./tabs.js";
import { holdReload } from "../stale.js";
import { createSplit } from "./split.js";
import { readWorkspace, writeWorkspace } from "./workspace.js";
import { createWatch, rideLive, changedAction, pageFocused, watchSight } from "./live.js";
import { ideHash } from "./route.js";
import { createDoc } from "./doc.js";
import { createDocOutline } from "./doc-outline.js";
import { createExplorer } from "./explorer.js";
import { createFiles, followTabs, settled } from "./files.js";
import { noteOp, onEdits } from "./edit.js";
import { createTermPanel } from "./term-panel.js";
import { newTerminal } from "./terms.js";
import { createQuick } from "./quick.js";
import { createTurnList, clearSheet } from "../chat/turn-list.js";
import { createDeskMenu } from "../desk-menu.js";
import { createAideMenu } from "../aide-menu.js";
import { createPane } from "./pane-bridge.js";
import { createReview, decorate, canComment, refOf } from "./feedback.js";
import { createMarkup } from "./markup.js";
import { createElementPick } from "./element-pick.js";
import { createPeek } from "./peek.js";
import { stillServed } from "./image.js";
import { keyedNodes } from "./tab-strip.js";
import { tabMotion } from "./tab-motion.js";
import { iconButton, setIcon, glyph } from "./icons.js";
import { layout, dragExplorer, dragChat, splitFits, splitWidths, dragSplit } from "./panes.js";
import { bindZoom, zoomControl, paneKeys, clampZoom, FRAMED_NOTE } from "./zoom.js";
import { mirrorPins } from "./pins-mirror.js";
import { lead, has, hosts, isLedger } from "../names.js";
const REVIEW_ROOM = 1700;
const RELOAD_AFTER = 300;
const EDGE_TITLE = "Drag to resize · double-click to reset";
export async function mountIDE(view, { api = homeApi, stream } = {}) {
  await loadStyles();
  await Promise.all([stylesheet("ide.css"), stylesheet("ide-p2.css")]);
  const store = createStore({ api }), data = store.data, list = makeLists(), origin = location.origin, kept = readWorkspace();
  const tabs = createTabs();
  const split = createSplit();
  let shown = null, before = null, exShown = kept.explorer.open, foldedForReview = false, foldedForSplit = false, sayTimer = 0, saidAbout = null, reloadTimer = 0, olIds = new Map();
  let exPart = { ...kept.explorer }, panes = { ...kept.panes }, cols = null, focusTop = null, putAway = false, zoom = clampZoom(kept.panes.zoom ?? 1);
  const rememberExplorer = (part) => {
    exPart = { ...exPart, ...part };
    writeWorkspace({ explorer: exPart });
  };
  const rememberPanes = () => writeWorkspace({ panes });
  const ide = el("div", { class: "ide chat", "data-explorer": "open", "data-term": "shut", "data-review": "off", "data-focus": "off" });
  const crumbs = el("nav", { class: "ide-crumbs", "aria-label": "Document path" });
  const said = el("span", { class: "ide-said", role: "status" });
  const findOpen = iconButton("find", "Find in this document", { key: "⌘F", class: "ide-findopen" });
  const reviewToggle = iconButton("review", "Review: comment on the text, then send it all at once", { class: "ide-reviewtoggle", "aria-pressed": "false" });
  const pinToggle = iconButton("pin", "Pin to the explorer", { class: "ide-pin" });
  const reloadButton = iconButton("refresh", "Read it again from disk", { class: "ide-reload" });
  const splitButton = iconButton("split", "Split right", { key: "⌘\\", class: "ide-splitbtn", "aria-pressed": "false" });
  const captureButton = iconButton("capture", "Capture this tab and mark it up", { class: "ide-capturebtn" });
  const pickButton = iconButton("pick", "Pick an element to comment on", { key: "Esc ends it", class: "ide-pickbtn", "aria-pressed": "false" });
  const zoomer = zoomControl({ get: () => zoom, set: (value) => setZoom(value) });
  const docTools = createDocTools(() => shown?.doc ? { target: shown.target, doc: shown.doc.facts(), api, store, open: openTab } : null);
  const sideMark = el("span", { class: "ide-side-mark", hidden: true });
  const docOutline = createDocOutline({ pick: (id) => {
    const at = olIds.get(id);
    if (at) shown?.doc?.goTo(at);
  }, onOpen: () => lightOutline({ force: true }) });
  const outline = docOutline.tree;
  const dochead = el("div", { class: "ide-dochead", hidden: true }, sideMark, crumbs, said, el("div", { class: "ide-docctl" }, docOutline.button, docOutline.pop, zoomer.node, findOpen, reviewToggle, pinToggle, reloadButton, splitButton, captureButton, pickButton, docTools.node));
  const docctl = dochead.lastChild;
  const findField = el("input", { class: "find-field", type: "text", placeholder: "Find in this document", "aria-label": "Find in this document", autocomplete: "off", spellcheck: "false", enterkeyhint: "search" });
  const findCount = el("span", { class: "find-count", "aria-live": "polite" });
  const findPrev = iconButton("up", "Previous match", { key: "Shift+Enter", class: "find-prev" }), findNext = iconButton("down", "Next match", { key: "Enter", class: "find-next" });
  const findClose = iconButton("close", "Close Find", { key: "Esc", class: "find-close" });
  const findBar = el("div", { class: "ide-find", role: "search", hidden: true }, findField, findCount, findPrev, findNext, findClose);
  const empty = el("div", { class: "ide-empty", hidden: true }, el("p", {}, "No document open"), el("p", { class: "ide-empty-hint" }, "Pick one in the explorer, or find it with ⌘K"));
  const splitEdge = el("div", { class: "ide-split-edge ide-edge", role: "separator", "aria-orientation": "vertical", "aria-label": "Split width", title: EDGE_TITLE, hidden: true });
  const dropHalves = { a: el("div", { class: "ide-drop-half", "data-side": "a" }, el("span", {}, "Left")), b: el("div", { class: "ide-drop-half", "data-side": "b" }, el("span", {}, "Split right")) };
  const dropZone = el("div", { class: "ide-drop", hidden: true }, dropHalves.a, dropHalves.b);
  const docs = el("div", { class: "ide-docs", "data-split": "off" }, empty, splitEdge, dropZone);
  const review = createReview({ active: () => shown?.doc ? { doc: shown.doc, target: shown.target } : null, onMode(now) {
    ide.dataset.review = now ? "on" : "off";
    reviewToggle.setAttribute("aria-pressed", String(now));
    if (now && exShown && innerWidth < REVIEW_ROOM) {
      setExplorer(false, { keep: false });
      foldedForReview = true;
    } else if (!now && foldedForReview) {
      setExplorer(true, { keep: false });
      foldedForReview = false;
    }
    requestAnimationFrame(() => review.refresh());
  }, onSent() {
    say("Feedback sent · it is in the chat");
    const scroller = host.querySelector(".chat-scroll"), end = () => scroller?.scrollTo({ top: scroller.scrollHeight });
    requestAnimationFrame(() => requestAnimationFrame(end));
    setTimeout(end, 700);
  } });
  const terms = !has("terminals") ? null : createTermPanel({ store, root: ide, kept: kept.terms, remember: (part) => writeWorkspace({ terms: part }), say, onLayout: () => requestAnimationFrame(() => review.refresh()), create: ({ cwd }) => newTerminal({ api, cwd }) });
  const tablist = el("div", { class: "ide-tablist", role: "tablist", "aria-label": "Open documents" });
  const tabNodes = keyedNodes(tablist), motion = tabMotion(tablist);
  const newTab = iconButton("plus", "Open a document", { key: "⌘K", class: "ide-newtab" });
  const tabbar = el("header", { class: "ide-tabs" }, tablist, el("div", { class: "ide-tabs-end" }, newTab));
  const main = el("section", { class: "ide-main", "aria-label": "Documents" }, tabbar, dochead, findBar, review.bar, docs, terms?.node);
  const chatCol = el("section", { class: "ide-chat", "aria-label": "Chat with " + lead() });
  const turns = createTurnList({ api, open: (target, how) => openTab(target, how) }), desk = createDeskMenu(), aides = createAideMenu();
  const focusButton = iconButton("focus", "Focus on the chat", { class: "ide-focus", "aria-pressed": "false" });
  const agentTitle = el("div", { class: "g151-title" });
  const chatHead = el("header", { class: "ide-chat-head g151-chat-head" }, agentTitle, aides.button, aides.panel, desk.button, desk.panel, turns.button, focusButton, turns.panel);
  const host = el("div", { class: "ide-chat-host" });
  chatCol.append(chatHead, host);
  const unsheet = clearSheet(turns.panel, host, host);
  const dbButton = (prefix) => {
    const button = iconButton("database", "DB: chat recap", { class: prefix + "db" });
    button.addEventListener("click", () => void showDb((target) => openTab(target)));
    return button;
  };
  const mapButton = (prefix) => iconButton("network", "Map: Artemis System", { class: prefix + "map", onclick: () => void showSystemMap((target) => openTab(target)) });
  const learnButton = (prefix) => iconButton("learn", "Learn: cards, sparring, labs", { class: prefix + "learn", onclick: () => void showLearn((target) => openTab(target)) });
  const act = (name) => {
    if (name === "term-new") void terms?.newTerminal();
    else if (name === "db") void showDb((target) => openTab(target));
    else if (name === "learn" && has("learn")) void showLearn((target) => openTab(target));
  };
  const quick = createQuick({ store, lists: list, api, open: (target, how) => openTab(target, how), dir: (target) => {
    setExplorer(true);
    explorer.reveal(target, { dir: true });
  }, act });
  const explorer = createExplorer({ store, lists: list, api, open: (target, how) => openTab(target, how), quick: () => quick.show(), collapse: () => setExplorer(false), expand: () => setExplorer(true), kept: kept.explorer, remember: rememberExplorer, menu: (event, items) => tabMenu.items(items, event), termHere: terms ? (cwd) => void terms.newTerminal({ cwd }) : null, files: has("edit") ? createFiles({ api }) : null, filed: (done) => filesDone(done), tools: [terms?.toggleButton, has("recap") && dbButton, has("sysmap") && mapButton, has("learn") && learnButton].filter(Boolean) });
  const exEdge = el("div", { class: "ide-ex-edge ide-edge", role: "separator", "aria-orientation": "vertical", "aria-label": "Explorer width", title: EDGE_TITLE });
  const chatEdge = el("div", { class: "ide-chat-edge ide-edge", role: "separator", "aria-orientation": "vertical", "aria-label": "Chat width", title: EDGE_TITLE });
  ide.append(explorer.rail, explorer.node, ...explorer.pops, exEdge, main, chatEdge, chatCol);
  view.replaceChildren(ide);
  const refNow = (tab) => !tab ? "Workspace" : isExtKind(tab.target.kind) ? keyOf(tab.target) : refOf(tab.target);
  const markup = createMarkup({ host: ide, ref: () => refNow(shown), onSent: () => say("Markup sent · it is in the chat") });
  const pick = createElementPick({ root: ide, where: (node) => {
    const tab = tabs.list.find((item) => item.doc?.node.contains(node)) ?? shown;
    return tab ? { target: tab.target, ref: refNow(tab), doc: tab.doc } : { ref: "Workspace" };
  }, onAdded: () => {
    review.setOn(true);
    review.paint();
    say("Added to the review · Send there sends it with the rest");
  }, markup: ({ box, text }) => markup.show({ capture: true, box, text }) });
  captureButton.addEventListener("click", () => {
    pick.cancel();
    void markup.show({ capture: true });
  });
  pick.button(pickButton);
  setOpener(openTab);
  function tabName(tab) {
    const name = label(tab.target, data);
    if (tab.target.kind !== "file") return [name, null];
    const twin = tabs.list.some((other) => other.target.path !== tab.target.path && other.target.kind === "file" && fileName(other.target.path) === name);
    return [name, twin ? fileName(tab.target.path.replace(/\/[^/]+$/, "")) : null];
  }
  const changedTab = (tab) => tab !== shown && (!!tab.stale || list.changed(keyOf(tab.target)));
  function tabNode(key) {
    const label2 = el("span", { class: "ide-tab-label" }), button = el("button", { type: "button", class: "ide-tab-name", role: "tab" }, label2);
    const x = iconButton("close", "Close", { key: "Ctrl+W / ⌘W", class: "ide-tab-x is-small" });
    const withTab = (fn) => () => {
      const tab = tabs.find(key);
      if (tab) fn(tab);
    };
    button.addEventListener("click", withTab(activate));
    button.addEventListener("auxclick", (event) => {
      if (event.button === 1) {
        event.preventDefault();
        withTab(closeTab)();
      }
    });
    button.addEventListener("contextmenu", (event) => {
      const tab = tabs.find(key);
      if (!tab) return;
      event.preventDefault();
      tabMenu.show(tab, event);
    });
    x.addEventListener("click", withTab(closeTab));
    const node = el("div", { class: "ide-tab", "data-key": key, draggable: "true" }, button, x);
    node.addEventListener("dragstart", (event) => {
      if (!tabs.find(key)) return;
      event.dataTransfer.setData(TAB_DRAG, key);
      event.dataTransfer.effectAllowed = "move";
      dragging(key);
    });
    node.addEventListener("dragend", () => dragging(null));
    return { node, button, label: label2, x, dir: null, mark: null, side: null };
  }
  function paintTabs() {
    motion.record();
    const nodes = tabNodes.place(tabs.list.map((tab) => tab.key), tabNode);
    for (const tab of tabs.list) {
      const item = nodes.get(tab.key), [name, dir] = tabName(tab), now2 = tab === shown, side = split.sideOf(tab.key);
      item.node.classList.toggle("is-active", now2);
      item.node.classList.toggle("is-dirty", !!tab.doc?.dirty);
      item.node.classList.toggle("is-side", !!side && !now2);
      if (side) item.node.dataset.side = side;
      else delete item.node.dataset.side;
      if (item.side && item.side.dataset.side !== side) {
        item.side.remove();
        item.side = null;
      }
      if (side) {
        item.side ??= el("span", { class: "ide-tab-side", "data-side": side }, glyph(side === "a" ? "sideA" : "sideB"));
        if (item.side.parentNode !== item.button) item.button.prepend(item.side);
      }
      item.button.setAttribute("aria-selected", String(now2));
      item.button.setAttribute("title", (tab.target.kind === "file" ? rel(tab.target.path) : title(tab.target, data)) + (side ? " · " + SIDE_NAME[side] : ""));
      item.label.textContent = name;
      if (dir) {
        item.dir ??= el("span", { class: "ide-tab-dir" });
        item.dir.textContent = dir;
        if (item.dir.parentNode !== item.button) item.label.after(item.dir);
      } else item.dir?.remove();
      if (changedTab(tab)) {
        item.mark ??= el("span", { class: "ide-tab-mark", title: "Changed since you last saw it" }, "changed");
        if (item.mark.parentNode !== item.button) item.button.append(item.mark);
      } else item.mark?.remove();
      item.x.setAttribute("aria-label", "Close " + name);
    }
    const now = tablist.querySelector(".is-active");
    if (now) {
      const start = now.offsetLeft, end = start + now.offsetWidth;
      if (start < tablist.scrollLeft) tablist.scrollLeft = Math.max(0, start - 12);
      else if (end > tablist.scrollLeft + tablist.clientWidth) tablist.scrollLeft = end - tablist.clientWidth + 12;
    }
    motion.play();
  }
  function tabsChanged() {
    writeWorkspace({ tabs: { ...tabs.state(), split: split.state() } });
    void watch.set([shown, otherTab(), ...tabs.list, ...parked.values()].map((tab) => tab && watchKeyOf(tab.target)).filter(Boolean));
  }
  async function openTerminal(id) {
    if (!terms) return null;
    await store.terminals();
    if (!data.terminals.some((term) => term.id === id)) await store.terminals({ force: true });
    if (!data.terminals.some((term) => term.id === id)) {
      terms.refuse("That terminal is closed, or not one Home can open");
      return null;
    }
    terms.show(id);
    return null;
  }
  function openTab(target, how = {}) {
    if (panes.focus) setFocus(false);
    const hash = isLedger(target.kind) && ledgerHash(target.ref);
    if (hash) {
      location.hash = hash;
      return Promise.resolve(false);
    }
    if (target.kind === "terminal") return openTerminal(target.id);
    const { tab } = tabs.open(target);
    if (!tab) return Promise.resolve(null);
    tab.offs ??= [];
    activate(tab);
    const ready = tab.doc.ready.then(() => tab.doc);
    if (how.find) void ready.then(() => {
      if (shown === tab) openFind(how.find);
    });
    return ready;
  }
  const seen = (tab) => {
    const mtime = tab.doc?.item?.updatedAt;
    if (mtime && ["file", "board"].includes(tab.target.kind)) list.see(keyOf(tab.target), mtime);
  };
  const PARK_MAX = 8, PARK_IDLE = 10 * 6e4;
  const parked = new Map();
  function park(tab) {
    const doc = tab.doc;
    if (!doc || !["file", "board"].includes(tab.target.kind) || !doc.item || doc.dirty) return false;
    unpark(tab.key);
    doc.show(false);
    doc.node.hidden = true;
    delete doc.node.dataset.side;
    doc.node.classList.remove("is-focus");
    for (const media of doc.node.querySelectorAll("video,audio")) media.pause();
    const entry = { doc, target: tab.target, stale: !!tab.stale || list.changed(keyOf(tab.target)), timer: setTimeout(() => unpark(tab.key), PARK_IDLE) };
    parked.set(tab.key, entry);
    for (const key of [...parked.keys()].slice(0, Math.max(0, parked.size - PARK_MAX))) unpark(key);
    return true;
  }
  function unpark(key, { take = false } = {}) {
    const entry = parked.get(key);
    if (!entry) return null;
    parked.delete(key);
    clearTimeout(entry.timer);
    if (take) return entry;
    entry.doc.destroy();
    return null;
  }
  function mountDoc(tab) {
    const kept2 = unpark(tab.key, { take: true });
    const doc = kept2?.doc ?? createDoc({ target: tab.target, api, store, origin });
    if (kept2) {
      tab.target = kept2.target;
      tab.stale = false;
      if (kept2.stale || list.changed(keyOf(tab.target))) void doc.reload({ quiet: true });
    }
    tab.doc = doc;
    doc.node.hidden = true;
    if (!kept2) docs.append(doc.node);
    let frame = 0;
    const scrolled = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        if (tab === shown) lightOutline();
      });
    };
    doc.scroller.addEventListener("scroll", scrolled, { passive: true });
    tab.offs.push(() => doc.scroller.removeEventListener("scroll", scrolled));
    tab.offs.push(doc.onChange((what) => {
      if (what === "dirty") {
        paintTabs();
        return;
      }
      if (tab !== shown) return;
      if (what === "text") {
        if (!findBar.hidden) paintCount(doc.find(findField.value, { keep: true }));
        return;
      }
      if (what === "loaded") seen(tab);
      if (what === "folds") paintOutline();
      else {
        paintHead();
        paintOutline();
        paintTabs();
        if (!findBar.hidden) runFind();
      }
    }), review.watch(doc));
  }
  function activate(tab) {
    if (shown === tab && tab.doc) return;
    if (shown?.doc) {
      shown.doc.show(false);
      shown.olFolded = new Set(outline.folded);
    }
    if (shown && shown !== tab) before = shown;
    tabs.show(tab);
    shown = tab;
    tab.offs ??= [];
    split.show(tab.key);
    if (!tab.doc) mountDoc(tab);
    else if (tab.stale || list.changed(keyOf(tab.target))) {
      tab.stale = false;
      void tab.doc.reload({ quiet: true });
    }
    placeDocs();
    empty.hidden = true;
    tab.doc.show(true);
    setActive(tab.target);
    list.touch(tab.target);
    if (tab.doc.item) seen(tab);
    paintTabs();
    paintHead();
    paintOutline();
    if (!findBar.hidden) {
      if (tab.target.kind === "image") closeFind();
      else runFind();
    }
    tabsChanged();
  }
  function closeTab(tab) {
    if (!tabs.list.includes(tab)) return;
    if (tab.doc?.keepOpen?.("close")) return;
    const wasShown = tab === shown, rest = split.close(tab.key), { next } = tabs.close(tab);
    if (rest != null) splitEnded();
    if (before === tab) before = null;
    for (const off of tab.offs ?? []) off();
    tab.offs = [];
    if (!park(tab)) tab.doc?.destroy();
    tab.doc = null;
    tabClosed(tab.target);
    if (saidAbout === tab) {
      said.textContent = "";
      saidAbout = null;
      clearTimeout(sayTimer);
    }
    if (!wasShown) {
      if (rest != null) {
        placeDocs();
        paintHead();
      }
      paintTabs();
      tabsChanged();
      return;
    }
    shown = null;
    const after = rest != null ? tabs.find(rest) : next;
    if (after) {
      activate(after);
      return;
    }
    setActive(null);
    empty.hidden = false;
    closeFind();
    paintTabs();
    paintHead();
    paintOutline();
    tabsChanged();
  }
  const sentDeletes = new Map();
  function filesDone(done) {
    if (done.origin === "system") {
      noteOp(done, api);
      if (done.op === "delete" && (done.id || done.commit)) sentDeletes.set(done.id ?? done.commit, done);
      return;
    }
    for (const [key, entry] of [...parked]) if ([done.path, done.from].some((path) => path && (entry.target.path === path || entry.target.path?.startsWith(path + "/")))) unpark(key);
    if (done.op === "rename" && done.from) list.move(done.from, done.path);
    else if (done.op === "delete") list.forget(done.path);
    else if (done.op === "restore") list.recall(done.path);
    follow(done);
  }
  function follow(done) {
    for (const { tab, act: act2, path } of followTabs(done, tabs.list)) {
      if (act2 === "retarget") retarget(tab, path);
      else if (act2 === "close") closeTab(tab);
      else void tab.doc?.reload({ quiet: true });
    }
  }
  function editsRead(items) {
    for (const { done, state } of settled([...sentDeletes.values()], items)) {
      sentDeletes.delete(done.id ?? done.commit);
      if (state === "applied") {
        follow({ ...done, applied: true });
        list.forget(done.path);
        explorer.removed(done.path);
      }
    }
  }
  function retarget(tab, path) {
    const from = tab.key, key = tabKeyOf({ kind: "file", path, view: tab.view }), other = tabs.find(key);
    if (other && other !== tab) {
      closeTab(other);
      if (tabs.list.includes(other)) {
        void tab.doc?.reload({ quiet: true });
        return;
      }
    }
    tab.target.path = path;
    tab.key = key;
    split.rekey(from, key);
    void tab.doc?.retarget?.();
    if (tab === shown) {
      setActive(tab.target);
      paintHead();
      paintOutline();
    }
    paintTabs();
    tabsChanged();
  }
  const SIDE_NAME = { a: "Left side", b: "Right side" };
  const otherTab = () => split.on ? tabs.find(split.other()) : null;
  const visible = (tab) => !!tab && (tab === shown || tab === otherTab());
  function placeDocs() {
    const other = otherTab();
    if (other) {
      other.offs ??= [];
      if (!other.doc) mountDoc(other);
      else if (other.stale) {
        other.stale = false;
        void other.doc.reload({ quiet: true });
      }
    }
    for (const tab of tabs.list) {
      if (!tab.doc) continue;
      const side = split.sideOf(tab.key);
      tab.doc.node.hidden = !(tab === shown || side);
      if (side) tab.doc.node.dataset.side = side;
      else delete tab.doc.node.dataset.side;
      tab.doc.node.classList.toggle("is-focus", !!side && tab === shown);
    }
    docs.dataset.split = split.on ? "on" : "off";
    ide.dataset.split = docs.dataset.split;
    splitEdge.hidden = !split.on;
    splitButton.setAttribute("aria-pressed", String(split.on));
    setIcon(splitButton, "split", split.on ? "Back to one side" : "Split right");
    fitSplit();
  }
  function splitRoom() {
    const width = ide.clientWidth;
    if (!width) return null;
    const area = (explorerOpen) => layout({ width, ui: ui(), ex: panes.ex, chat: panes.chat, explorer: explorerOpen, focus: false }).doc;
    const fits = (explorerOpen) => splitFits({ width: area(explorerOpen), ui: ui(), scale: devicePixelRatio });
    return fits(exShown) ? "fits" : exShown && fits(false) ? "fold" : null;
  }
  function splitWith(tab, side = "b") {
    if (!tab || !tabs.list.includes(tab)) return false;
    if (panes.focus) setFocus(false);
    if (!split.on) {
      const rest = tab === shown ? partner(tab) : shown;
      if (!rest) {
        if (canSplitSame(tab.target)) return splitSame(tab, side);
        say("Open a second document to split");
        return false;
      }
      const room = splitRoom();
      if (!room) {
        say("Split needs a wider window");
        return false;
      }
      split.start(side === "b" ? rest.key : tab.key, side === "b" ? tab.key : rest.key, side);
      if (room === "fold") {
        foldedForSplit = true;
        setExplorer(false, { keep: false });
      }
    } else split.put(tab.key, side);
    if (shown !== tab) activate(tab);
    else sidesChanged();
    return true;
  }
  function splitSame(tab, side = "b") {
    if (!tab || !tabs.list.includes(tab) || !canSplitSame(tab.target)) return false;
    if (panes.focus) setFocus(false);
    const room = splitRoom();
    if (!room) {
      say("Split needs a wider window");
      return false;
    }
    const other = tabs.duplicate(tab);
    split.start(side === "b" ? tab.key : other.key, side === "b" ? other.key : tab.key, side);
    if (room === "fold") {
      foldedForSplit = true;
      setExplorer(false, { keep: false });
    }
    if (shown !== other) activate(other);
    else sidesChanged();
    return true;
  }
  function partner(tab) {
    if (before && before !== tab && tabs.list.includes(before)) return before;
    const at = tabs.list.indexOf(tab);
    return tabs.list[at + 1] ?? tabs.list[at - 1] ?? null;
  }
  function endSplit(note = "") {
    if (!split.on) return;
    split.end();
    splitEnded();
    sidesChanged();
    if (note) say(note);
  }
  function splitEnded() {
    if (foldedForSplit) {
      foldedForSplit = false;
      if (!exShown) setExplorer(true, { keep: false });
    }
  }
  function sidesChanged() {
    placeDocs();
    paintTabs();
    paintHead();
    paintOutline();
    tabsChanged();
    requestAnimationFrame(() => review.refresh());
  }
  const toggleSplit = () => {
    if (split.on) endSplit();
    else if (shown) splitWith(partner(shown) ?? shown, "b");
  };
  async function compare(a, b) {
    if (split.on) endSplit();
    await openTab(a);
    const { tab } = tabs.open(b);
    if (!tab) return;
    tab.offs ??= [];
    if (!splitWith(tab, "b")) {
      paintTabs();
      tabsChanged();
    }
  }
  const beside = (key) => {
    const side = split.sideOf(key);
    return side ? tabs.find(split.keyOn(side === "a" ? "b" : "a"))?.target ?? null : null;
  };
  function fitSplit() {
    if (!split.on || panes.focus || !cols) return;
    if (!splitFits({ width: cols.doc, ui: ui(), scale: devicePixelRatio })) {
      endSplit("Back to one side · the window is too narrow for two");
      return;
    }
    const { a, b } = splitWidths({ width: cols.doc, ui: ui(), share: panes.split ?? null });
    docs.style.setProperty("--split-a", a + "px");
    docs.style.setProperty("--split-b", b + "px");
  }
  docs.addEventListener("pointerdown", (event) => {
    const side = event.target.closest?.(".doc-scroll")?.dataset.side;
    if (split.on && side && side !== split.focus) {
      const tab = tabs.find(split.keyOn(side));
      if (tab) activate(tab);
    }
  }, true);
  splitButton.addEventListener("click", toggleSplit);
  const TAB_DRAG = "application/x-ide-tab";
  let dragKey = null;
  function dragging(key) {
    dragKey = key;
    ide.classList.toggle("is-dragtab", !!key);
    dropZone.hidden = !key || panes.focus;
    for (const half of Object.values(dropHalves)) half.classList.remove("is-over");
  }
  const halfAt = (event) => {
    const box = docs.getBoundingClientRect();
    return event.clientX >= box.left + box.width / 2 ? "b" : "a";
  };
  dropZone.addEventListener("dragover", (event) => {
    if (!dragKey || !event.dataTransfer.types.includes(TAB_DRAG)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const side = halfAt(event);
    for (const [name, half] of Object.entries(dropHalves)) half.classList.toggle("is-over", name === side);
  });
  dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) for (const half of Object.values(dropHalves)) half.classList.remove("is-over");
  });
  dropZone.addEventListener("drop", (event) => {
    const key = event.dataTransfer.getData(TAB_DRAG) || dragKey;
    if (!key) return;
    event.preventDefault();
    const side = halfAt(event), tab = tabs.find(key);
    dragging(null);
    if (!tab) return;
    if (side === "b" || split.on) splitWith(tab, side);
    else activate(tab);
  });
  const tabMenu = (() => {
    const node = el("div", { class: "ide-tabmenu", role: "menu", hidden: true });
    let off = null;
    const hide = () => {
      node.hidden = true;
      off?.();
      off = null;
    };
    function item(text, run, key = "") {
      const button = el("button", { type: "button", class: "ide-tabmenu-item ide-row", role: "menuitem" }, el("span", {}, text), key ? el("span", { class: "ide-tabmenu-key" }, key) : null);
      button.addEventListener("click", () => {
        hide();
        run();
      });
      return button;
    }
    function show(tab, event) {
      const side = split.sideOf(tab.key);
      place([side !== "b" ? item("Split right", () => splitWith(tab, "b"), tab === shown && !split.on ? "⌘\\" : "") : null, canSplitSame(tab.target) ? item("Split same document", () => splitSame(tab)) : null, split.on && side !== "a" ? item("Move to the left side", () => splitWith(tab, "a")) : null, split.on ? item("Back to one side", () => endSplit(), "⌘\\") : null, item("Close", () => closeTab(tab))].filter(Boolean), event);
    }
    function items(list2, event) {
      if (!event.clientX && !event.clientY && event.target?.getBoundingClientRect) {
        const box = event.target.getBoundingClientRect();
        event = { clientX: box.left + 24, clientY: box.bottom - 6 };
      }
      place(list2.map((entry) => item(entry.text, entry.run)), event);
    }
    function place(nodes, event) {
      node.replaceChildren(...nodes);
      node.hidden = false;
      const box = ide.getBoundingClientRect();
      node.style.left = Math.max(8, Math.min(event.clientX - box.left, box.width - 240)) + "px";
      node.style.top = Math.max(8, event.clientY - box.top + 6) + "px";
      node.querySelector("button")?.focus({ preventScroll: true });
      const away = (e) => {
        if (!node.contains(e.target)) hide();
      }, esc = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          hide();
        }
      };
      off?.();
      setTimeout(() => {
        if (node.hidden) return;
        document.addEventListener("pointerdown", away, true);
        document.addEventListener("keydown", esc, true);
      }, 0);
      off = () => {
        document.removeEventListener("pointerdown", away, true);
        document.removeEventListener("keydown", esc, true);
      };
    }
    return { node, show, items, hide };
  })();
  ide.append(tabMenu.node);
  function changedOnDisk({ target: key, mtime }) {
    list.know(key, mtime);
    const watched = (tab) => tab ? watchKeyOf(tab.target) : null;
    for (const entry of parked.values()) if (watched(entry) === key) entry.stale = true;
    if (putAway) {
      for (const tab of tabs.list) if (tab.doc && watched(tab) === key) tab.stale = true;
      return;
    }
    const action = changedAction(key, { shown: watched(shown), open: tabs.list.map(watched) });
    let marked = false;
    for (const tab of tabs.list) if (tab !== shown && tab.doc && watched(tab) === key) {
      if (tab === otherTab()) pending.add(tab);
      else {
        tab.stale = true;
        marked = true;
      }
    }
    if (action === "reload") pending.add(shown);
    if (pending.size) {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadShown, RELOAD_AFTER);
    }
    if (marked) paintTabs();
  }
  const pending = new Set();
  async function reloadShown() {
    const now = [...pending];
    pending.clear();
    for (const tab of now) {
      if (!tab.doc || !tabs.list.includes(tab)) continue;
      if (!visible(tab)) {
        tab.stale = true;
        paintTabs();
        continue;
      }
      await tab.doc.reload({ quiet: true });
      if (shown === tab && !tab.doc.dirty && !tab.doc.echo) say(tab.doc.item ? "Reloaded the changes" : "It changed, but couldn't be read again", tab);
    }
  }
  const openTabs = () => ({ visible: document.visibilityState !== "hidden" && !putAway, focused: pageFocused(), shown: shown ? keyOf(shown.target) : null, tabs: [...new Map(tabs.list.map((tab) => [keyOf(tab.target), { target: keyOf(tab.target), title: title(tab.target, data) }])).values()] });
  const leadTab = ({ do: act2, target: key }) => {
    if (act2 === "show") {
      const target = parseKey(key);
      if (!target) return;
      if (putAway) location.hash = ideHash();
      void openTab(target);
      return;
    }
    for (const tab of tabs.list.filter((tab2) => keyOf(tab2.target) === key)) closeTab(tab);
  };
  const fileWatch = createWatch({ api, onChanged: changedOnDisk, device: "pc", tabs: openTabs, onTab: leadTab }), connection = fileWatch.connection;
  fileWatch.connection = (live) => {
    if (!live) for (const entry of parked.values()) entry.stale = true;
    return connection(live);
  };
  const watch = ownerViewWatch(store, fileWatch);
  const letGo = rideLive({ stream, api: ownerViewApi(store, api), watch, store });
  function paintHead() {
    const slot = shown?.doc?.controls ?? null;
    if (slot) {
      if (docctl.parentNode !== slot) slot.append(docctl);
    } else if (docctl.parentNode !== dochead) dochead.append(docctl);
    dochead.hidden = !shown || !!slot;
    if (!shown) {
      docOutline.close();
      return;
    }
    const side = split.sideOf(shown.key);
    sideMark.hidden = !side;
    if (side) {
      sideMark.replaceChildren(glyph(side === "a" ? "sideA" : "sideB"));
      sideMark.title = SIDE_NAME[side];
      sideMark.setAttribute("aria-label", SIDE_NAME[side]);
      sideMark.setAttribute("role", "img");
    }
    const parts = shown.doc.meta().crumbs;
    crumbs.replaceChildren(...parts.flatMap((part, n) => [n ? el("span", { class: "ide-crumb-sep", "aria-hidden": "true" }, "›") : null, el("span", { class: "ide-crumb" + (n === parts.length - 1 ? " is-last" : "") }, part)]).filter(Boolean));
    crumbs.title = shown.target.kind === "file" ? shown.target.path : parts.join(" › ");
    const own = shown.doc.tools === false;
    findOpen.hidden = shown.target.kind === "image" || own;
    zoomer.node.hidden = own;
    pickButton.hidden = own;
    docOutline.button.hidden = findOpen.hidden;
    if (docOutline.button.hidden) docOutline.close();
    reviewToggle.hidden = !canComment(shown.target);
    const pinnable = ["file", "board"].includes(shown.target.kind);
    pinToggle.hidden = !pinnable;
    reloadButton.hidden = !pinnable && !isExtKind(shown.target.kind);
    if (slot) reloadButton.hidden = true;
    if (pinnable) {
      const pinned = list.pinned(shown.target);
      setIcon(pinToggle, pinned ? "unpin" : "pin", pinned ? "Unpin from the explorer" : "Pin to the explorer");
      pinToggle.setAttribute("aria-pressed", String(pinned));
    }
    docTools.paint();
    paintZoom();
  }
  function say(text, about = null) {
    said.textContent = text;
    saidAbout = about;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      said.textContent = "";
      saidAbout = null;
    }, 6e3);
  }
  pinToggle.addEventListener("click", () => {
    if (shown) {
      list.pin(shown.target, !list.pinned(shown.target));
      paintHead();
    }
  });
  reviewToggle.addEventListener("click", () => review.toggle());
  reloadButton.addEventListener("click", async () => {
    const tab = shown;
    if (!tab?.doc) return;
    if (tab.doc.keepOpen?.("reload")) return;
    tab.stale = false;
    await tab.doc.reload({ quiet: true });
    if (shown === tab) {
      say(tab.doc.item ? "Reloaded" : "Couldn't read it again", tab);
      seen(tab);
      paintTabs();
    }
  });
  newTab.addEventListener("click", () => quick.show());
  const olId = (id) => shown.key + "§" + id;
  function paintOutline() {
    const doc = shown?.doc;
    docOutline.name(shown ? label(shown.target, data) : "");
    if (!doc) {
      olIds = new Map();
      outline.set([]);
      docOutline.paintAll();
      return;
    }
    olIds = new Map(doc.headings.map((h) => [olId(h.id), h.id]));
    outline.set(doc.headings.map((h) => ({ id: olId(h.id), level: h.level, text: h.text.replace(/`/g, ""), note: doc.folded.has(h.id) ? "folded" : "" })));
    if (shown.olFolded) {
      for (const id of shown.olFolded) outline.fold(id, true);
      shown.olFolded = null;
    }
    docOutline.paintAll();
    lightOutline();
  }
  function lightOutline({ force = false } = {}) {
    const id = shown?.doc?.currentHeading();
    if (id) outline.light(olId(id), { follow: docOutline.shown, force });
  }
  function openFind(query) {
    if (!shown?.doc) return;
    if (typeof query === "string") findField.value = query;
    findBar.hidden = false;
    findField.focus();
    findField.select();
    runFind();
  }
  function runFind() {
    if (shown?.doc) paintCount(shown.doc.find(findField.value));
  }
  function paintCount({ count, now }) {
    const asked = !!findField.value.trim();
    findCount.textContent = !asked ? "" : count ? `${now + 1} / ${count}` : "None";
    findCount.classList.toggle("is-none", asked && !count);
  }
  function closeFind() {
    if (findBar.hidden) return;
    findBar.hidden = true;
    shown?.doc?.find("");
  }
  findField.addEventListener("input", runFind);
  findField.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (shown?.doc) paintCount(shown.doc.step(event.shiftKey ? -1 : 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFind();
      shown?.doc?.scroller.focus({ preventScroll: true });
    }
  });
  findPrev.addEventListener("click", () => {
    if (shown?.doc) paintCount(shown.doc.step(-1));
  });
  findNext.addEventListener("click", () => {
    if (shown?.doc) paintCount(shown.doc.step(1));
  });
  findClose.addEventListener("click", closeFind);
  findOpen.addEventListener("click", () => openFind());
  const ui = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 12;
  function fit() {
    const width = ide.clientWidth;
    if (!width) return;
    cols = layout({ width, ui: ui(), ex: panes.ex, chat: panes.chat, explorer: exShown, focus: panes.focus });
    ide.style.setProperty("--ex-w", cols.ex + "px");
    ide.style.setProperty("--chat-w", cols.chat + "px");
    fitSplit();
  }
  function setExplorer(now, { keep = true } = {}) {
    exShown = now;
    ide.dataset.explorer = now ? "open" : "shut";
    if (keep) {
      rememberExplorer({ open: now });
      foldedForReview = false;
    }
    fit();
    requestAnimationFrame(() => review.refresh());
  }
  function setFocus(on2, { keep = true } = {}) {
    if (on2 && shown?.doc) focusTop = shown.doc.scroller.scrollTop;
    panes = { ...panes, focus: on2 };
    ide.dataset.focus = on2 ? "on" : "off";
    focusButton.setAttribute("aria-pressed", String(on2));
    setIcon(focusButton, on2 ? "unfocus" : "focus", on2 ? "Show the documents again" : "Focus on the chat");
    if (keep) rememberPanes();
    fit();
    if (!on2 && focusTop != null && shown?.doc) {
      shown.doc.scroller.scrollTop = focusTop;
      focusTop = null;
    }
    requestAnimationFrame(() => review.refresh());
  }
  focusButton.addEventListener("click", () => setFocus(!panes.focus));
  function framed() {
    return shown?.target.kind === "draft";
  }
  function paintZoom() {
    zoomer.paint(zoom, { framed: framed() });
  }
  function setZoom(value, { keep = true } = {}) {
    if (keep && framed()) {
      say(FRAMED_NOTE);
      return;
    }
    const now = clampZoom(value);
    if (keep && now === zoom) return;
    zoom = now;
    if (zoom === 1) docs.style.removeProperty("--doc-zoom");
    else docs.style.setProperty("--doc-zoom", String(zoom));
    paintZoom();
    if (keep) {
      panes = { ...panes, zoom };
      rememberPanes();
    }
    requestAnimationFrame(() => review.refresh());
  }
  const offZoom = bindZoom({ pane: docs, keys: paneKeys(main), get: () => zoom, set: (value) => setZoom(value), active: () => !view.hidden && ide.isConnected && !putAway && !panes.focus });
  setZoom(zoom, { keep: false });
  function edge(node, { width: from, share, part }) {
    let drag = null;
    node.addEventListener("pointerdown", (event) => {
      if (!cols) return;
      drag = { x: event.clientX, w: from() };
      node.setPointerCapture?.(event.pointerId);
      node.classList.add("is-drag");
      ide.classList.add("is-resizing");
    });
    node.addEventListener("pointermove", (event) => {
      if (!drag) return;
      panes = { ...panes, [part]: share({ width: ide.clientWidth, ui: ui(), ex: cols.ex, chat: cols.chat }, drag.w + (event.clientX - drag.x) * (part === "chat" ? -1 : 1)) };
      fit();
    });
    const done = () => {
      if (!drag) return;
      drag = null;
      node.classList.remove("is-drag");
      ide.classList.remove("is-resizing");
      rememberPanes();
      review.refresh();
    };
    node.addEventListener("pointerup", done);
    node.addEventListener("pointercancel", done);
    node.addEventListener("dblclick", () => {
      panes = { ...panes, [part]: null };
      fit();
      rememberPanes();
      review.refresh();
    });
  }
  edge(exEdge, { part: "ex", width: () => cols.ex, share: dragExplorer });
  edge(chatEdge, { part: "chat", width: () => cols.chat, share: dragChat });
  edge(splitEdge, { part: "split", width: () => splitWidths({ width: cols.doc, ui: ui(), share: panes.split ?? null }).a, share: (_, px) => dragSplit({ width: cols.doc, ui: ui() }, px) });
  const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    fit();
    review.refresh();
  }) : null;
  sizes?.observe(ide);
  const bare = (text) => String(text ?? "").replace(/…$/, "").replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  async function openAt(target, anchor) {
    const doc = await openTab(target, { from: "feedback" });
    if (!doc || !anchor) return;
    if (anchor.exact) {
      doc.reveal(anchor);
      return;
    }
    if (anchor.blockId && doc.headings.some((h) => h.id === anchor.blockId)) {
      doc.goTo(anchor.blockId);
      return;
    }
    const heading = anchor.heading && doc.headings.find((h) => bare(h.text).startsWith(bare(anchor.heading)));
    if (heading) doc.goTo(heading.id);
  }
  const keys = (event) => {
    if (view.hidden || !ide.isConnected || event.altKey) return;
    const inTerm = !!event.target.closest?.(".ide-term-body");
    const mod = event.metaKey || event.ctrlKey && !inTerm, key = event.key.toLowerCase();
    if (mod && key === "k" && !event.shiftKey) {
      event.preventDefault();
      if (quick.shown) quick.hide();
      else quick.show();
      return;
    }
    if (mod && key === "f" && event.shiftKey) {
      event.preventDefault();
      quick.show("", "text");
      return;
    }
    if (quick.shown) return;
    if (mod && !event.shiftKey && key === "s" && shown?.doc?.save) {
      event.preventDefault();
      if (!event.repeat) void shown.doc.save();
      return;
    }
    if (mod && !event.shiftKey && key === "b") {
      event.preventDefault();
      setExplorer(!exShown);
      return;
    }
    if (mod && !event.shiftKey && event.key === "\\") {
      event.preventDefault();
      toggleSplit();
      return;
    }
    if (mod && !event.shiftKey && key === "j" || event.ctrlKey && event.key === "`") {
      event.preventDefault();
      if (!terms) return;
      if (panes.focus) {
        setFocus(false);
        if (ide.dataset.term !== "open") terms.toggle();
      } else terms.toggle();
      return;
    }
    if (mod && !event.shiftKey && key === "f" && !panes.focus && shown?.doc && shown.target.kind !== "image" && !event.target.closest?.(".ide-chat, .ide-term")) {
      event.preventDefault();
      openFind();
    }
  };
  const closeKeys = (event) => {
    if (!view.hidden && ide.isConnected && !putAway) closeShortcut(event, () => {
      if (shown) closeTab(shown);
    });
  };
  document.addEventListener("keydown", closeKeys, true);
  document.addEventListener("keydown", keys);
  const offs = [store.watchTerminals(), holdReload(() => tabs.list.some((tab) => tab.doc?.dirty)), on("seen", paintTabs), on("pins", paintHead), on("data", (what) => {
    if (what === "boards" || what === "archive") paintTabs();
  }), onRegistry((what) => {
    if (what === "tools") paintHead();
    else if (what === "when") docTools.paint();
  }), on("roots", () => {
    paintTabs();
    paintHead();
  }), bindDrafts({ compare, beside }), mirrorPins({ api, list }), onEdits(editsRead)];
  const sight = new AbortController();
  watchSight(() => void fileWatch.report(), { signal: sight.signal });
  offs.push(() => sight.abort());
  const chatReady = import("../chat/chat.js").then((chat) => chat.mountChat(host, { layout: "pc", makePane: createPane, agentTitle, selectedAgent: kept.chat?.agentId, rememberAgent: (agentId) => writeWorkspace({ chat: { agentId } }), onAgent: (agent) => chatCol.setAttribute("aria-label", "Chat with " + agent.displayName) }).then((unmount2) => {
    offs.push(decorate(host, { data, openAt }));
    return unmount2;
  }, (error) => {
    chat.mountProblem(host, error);
    return null;
  }));
  const peek = createPeek({ store, lists: list, api, within: (node) => ide.contains(node) });
  const first = tabs.restore({ ...kept.tabs, list: await stillServed(kept.tabs.list, { api }) });
  for (const tab of tabs.list) tab.offs ??= [];
  if (!shown && split.restore(kept.tabs.split, tabs.list.map((tab) => tab.key))) {
    const room = splitRoom();
    if (room === "fold") {
      foldedForSplit = true;
      exShown = false;
    } else if (!room) split.end();
  }
  if (shown) {
    paintTabs();
    tabsChanged();
  } else if (first) activate(split.on ? tabs.find(split.keyOn(split.focus)) ?? first : first);
  else {
    empty.hidden = false;
    paintTabs();
    paintHead();
    paintOutline();
    tabsChanged();
  }
  setExplorer(exShown, { keep: false });
  setFocus(panes.focus, { keep: false });
  function setAway(now) {
    if (!!now === putAway) return;
    putAway = !!now;
    letGo.away?.(putAway);
    terms?.away(putAway);
    void fileWatch.report();
    if (putAway) {
      clearTimeout(reloadTimer);
      for (const tab of pending) tab.stale = true;
      pending.clear();
      tabMenu.hide();
      quick.hide();
      peek.hide();
      pick.cancel();
      docOutline.close();
      review.hideFloat();
      return;
    }
    fit();
    for (const tab of [shown, otherTab()]) if (tab?.doc && tab.stale) {
      tab.stale = false;
      void tab.doc.reload({ quiet: true });
    }
    paintTabs();
    requestAnimationFrame(() => review.refresh());
  }
  const unmountChat = await chatReady;
  await first?.doc?.ready;
  document.documentElement.dataset.ideReady = "1";
  unmount.boards = () => {
    if (panes.focus) setFocus(false);
    setExplorer(true);
    explorer.show("boards");
  };
  unmount.away = setAway;
  unmount.screen = () => {
    const id = hosts().screen;
    return id ? openTab({ kind: "computer", id }) : false;
  };
  unmount.terminal = (id) => openTerminal(id);
  unmount.learn = () => has("learn") ? showLearn((target) => openTab(target)) : null;
  return unmount;
  function unmount() {
    letGo();
    clearTimeout(reloadTimer);
    clearTimeout(sayTimer);
    sizes?.disconnect();
    offZoom();
    document.removeEventListener("keydown", closeKeys, true);
    document.removeEventListener("keydown", keys);
    for (const off of offs) off();
    for (const tab of tabs.list) {
      for (const off of tab.offs ?? []) off();
      tab.doc?.destroy();
    }
    for (const key of [...parked.keys()]) unpark(key);
    pick.destroy();
    markup.destroy();
    terms?.destroy();
    review.destroy();
    peek.destroy();
    quick.destroy();
    aides.destroy();
    desk.destroy();
    turns.destroy();
    unsheet();
    docOutline.destroy();
    explorer.destroy();
    unmountChat?.();
    setOpener(null);
    setActive(null);
    ide.remove();
    delete document.documentElement.dataset.ideReady;
  }
}
