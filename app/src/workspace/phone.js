import { updateButton } from "../update.js";
import { el } from "../boards/dom.js";
import { control } from "../chat/visuals.js";
import { feed } from "../chat/feed.js";
import { reduced } from "../chat/motion.js";
import { homeApi } from "./api.js";
import { stylesheet, lists as makeLists, keyOf, parseKey, sameTarget, label, title, day, clip, saved, setOpener, setActive, highlight, looksSecret, toTarget, termName, RECENT, on } from "./core.js";
import { createStore, ownerViewWatch, ownerViewApi } from "./store.js";
import { readWorkspace, writeWorkspace } from "./workspace.js";
import { createWatch, startLive, ridePhone, pageFocused, watchSight } from "./live.js";
import { ideHash } from "./route.js";
import { createDoc } from "./doc.js";
import { createOutline } from "./outline.js";
import { mountPhoneTerminal, phoneClose, phoneTermList, hintOnce } from "./term-panel.js";
import { termReadOnly, termStatus, termWhere, newTerminal, NEW_LINES } from "./terms.js";
import { quickRows, findNames } from "./find.js";
import { marked } from "./quick.js";
import { createPane } from "./pane-bridge.js";
import { stillServed } from "./image.js";
import { comments, canComment, anchorFrom, sectionFrom, sendFeedback, decorate, refOf, refOfItem, isElement, elementLine, sectionLabel, SECRET_LINE } from "./feedback.js";
import { shellMenu } from "./shell-menu.js";
import { iconButton, setIcon, glyph } from "./icons.js";
import { QUOTE_EVENT } from "../chat/quote.js";
import { snapAfter } from "./panes.js";
import { isExtKind } from "./extensions.js";
import { mountDb } from "./db.js";
import { mountSystemMap, TARGET as MAP } from "./sysmap.js";
import { mountLearning, TARGET as LEARN } from "./learn.js";
import { mountComputer, computerChoices, OFF_LINE } from "./computer.js";
import { byMonth, shownItems, kindName, itemDay, archiveTarget } from "./archive.js";
import { tabOrder, shownTab, opensOn, createTabRow, boardDays, hhmm, posted, reportItems, BOARDS_SHOWN } from "./explorer-tabs.js";
import { mirrorPins } from "./pins-mirror.js";
import { holdReload } from "../stale.js";
import { lead, has, hosts, l10n } from "../names.js";
const PRESS = 480, SLOP = 8;
const TEXT_BLOCK = "p,li,td,th,pre,blockquote,dd,dt,figcaption";
const SPOTS = 40;
function sentenceAt(block, x, y) {
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: (node) => node.parentElement?.closest("button,.bv-code-head") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let text = "";
  while (walker.nextNode()) {
    nodes.push({ node: walker.currentNode, from: text.length });
    text += walker.currentNode.data;
  }
  if (!text.trim()) return null;
  let at = -1;
  const probe = document.createRange(), near = (rect) => y >= rect.top - 2 && y <= rect.bottom + 2;
  find: for (const { node, from } of nodes) {
    probe.selectNodeContents(node);
    if (![...probe.getClientRects()].some(near)) continue;
    for (let i = 0; i < node.data.length; i++) {
      probe.setStart(node, i);
      probe.setEnd(node, i + 1);
      for (const rect of probe.getClientRects()) if (near(rect) && x >= rect.left - 1 && x <= rect.right + 1) {
        at = from + i;
        break find;
      }
    }
  }
  if (at < 0) at = 0;
  const stops = block.closest("pre") ? /\n/g : /[.!?。]+(?=\s|$)|\n/g;
  let start = 0, end = text.length;
  for (const found of text.matchAll(stops)) {
    const stop = found.index + found[0].length;
    if (stop <= at) start = stop;
    else {
      end = stop;
      break;
    }
  }
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start) return null;
  const place = (offset, last) => {
    const entry = nodes.find(({ node, from }) => last ? offset > from && offset <= from + node.data.length : offset >= from && offset < from + node.data.length) ?? nodes.at(last ? -1 : 0);
    return [entry.node, Math.max(0, Math.min(entry.node.data.length, offset - entry.from))];
  };
  const range = document.createRange();
  range.setStart(...place(start, false));
  range.setEnd(...place(end, true));
  return range;
}
function draggable(handles, box, drop) {
  let drag = null, dropAt = -Infinity;
  for (const handle of handles) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.isPrimary && (event.pointerType !== "mouse" || event.button === 0)) drag = { y: event.clientY, dy: 0, on: false, id: event.pointerId, handle };
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dy = event.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dy) < 8) return;
        drag.on = true;
        drag.handle.setPointerCapture?.(drag.id);
        box.classList.add("is-drag");
      }
      drag.dy = dy;
      box.style.setProperty("--ap-drag", dy + "px");
    });
    const end = () => {
      if (!drag) return;
      const { on: on2, dy } = drag;
      drag = null;
      if (!on2) return;
      dropAt = performance.now();
      box.classList.remove("is-drag");
      if (!drop(dy)) box.style.removeProperty("--ap-drag");
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("click", (event) => {
      if (performance.now() - dropAt < 350) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }
}
export async function mountPhone(page, { api = homeApi, menu = false, stream = null } = {}) {
  await Promise.all([stylesheet("ide.css"), stylesheet("phone.css")]);
  const store = createStore({ api }), data = store.data, list = makeLists(), origin = location.origin, kept = readWorkspace();
  let phonePart = { last: kept.phone.last, spots: kept.phone.spots };
  const rememberPhone = (part) => {
    phonePart = { ...phonePart, ...part };
    writeWorkspace({ phone: phonePart });
  };
  const agentTitle = el("div", { class: "g151-phone-title" });
  const top = el("header", { class: "ap-top" }, agentTitle);
  const host = el("div", { class: "ap-chat" });
  page.replaceChildren(top, host);
  const shell = menu ? shellMenu(page, top, { onOpen: () => {
    drawer(false);
    showMenu(false);
  } }) : null;
  const layer = el("div", { class: "chat ide ap-layer" });
  document.body.append(layer);
  let full = null, sheet = null;
  const unhold = holdReload(() => !!full?.doc?.dirty);
  const tocFolds = new Map();
  const field = el("input", { type: "search", class: "ap-search", placeholder: "Find goals, reports, boards, files", "aria-label": "Find", autocomplete: "off", spellcheck: "false", enterkeyhint: "search" });
  const results = el("div", { class: "ap-results", hidden: true }), lists = el("div", { class: "ap-lists", role: "tabpanel" });
  let tab = null;
  const tabRow = createTabRow({ cls: "ap-tabs", label: "Explore sections", pick: (id) => {
    tab = id;
    drawLists();
    panel.querySelector(".ap-drawer-body").scrollTop = 0;
  } });
  const grab = el("button", { type: "button", class: "ap-grab", "aria-label": "Explore height", title: "Half or full height", "aria-expanded": "false", onclick: () => snap(drawerNode.dataset.snap === "full" ? "half" : "full") });
  const panel = el("div", { class: "ap-drawer-sheet", role: "dialog", "aria-modal": "true", "aria-label": "Explore" }, grab, el("header", { class: "ap-drawer-head" }, el("h2", { class: "ap-drawer-title" }, "Explore"), iconButton("close", "Close", { class: "ap-close", onclick: () => drawer(false) })), el("div", { class: "ap-drawer-find" }, field), tabRow.node, el("div", { class: "ap-drawer-body" }, results, lists));
  const scrim = el("div", { class: "ap-scrim" });
  const drawerNode = el("div", { class: "ap-drawer", "data-open": "false", "data-snap": "half" }, scrim, panel);
  const DB = { kind: "db", id: "search" };
  if (has("recap")) panel.querySelector(".ap-drawer-head > .ap-close").before(iconButton("database", "DB: chat recap", { class: "ap-db-open", onclick: () => void open(DB, { from: "drawer" }) }));
  if (has("sysmap")) panel.querySelector(".ap-drawer-head > .ap-close").before(iconButton("network", "Map: Artemis System", { class: "ap-map-open", onclick: () => void open(MAP, { from: "drawer" }) }));
  if (has("learn")) panel.querySelector(".ap-drawer-head > .ap-close").before(iconButton("learn", "Learn: cards, sparring, labs", { class: "ap-learn-open", onclick: () => void open(LEARN, { from: "drawer" }) }));
  const PINNED = new Set();
  top.dataset.pinned = [...PINNED].join(" ");
  const ACTION_NEEDS = { terms: "terminals", computer: "pc", db: "recap", map: "sysmap", learn: "learn" };
  const ACTIONS = [{ id: "todo", glyph: "checklist", name: "To-do", run: () => top.querySelector(".ap-head .turn-button")?.click() }, { id: "aides", glyph: "aide", name: "Aides", run: () => top.querySelector(".ap-head .aide-button")?.click() }, { id: "explore", glyph: "explore", name: "Explore", cls: "ap-explore", attrs: { "aria-haspopup": "dialog", "aria-expanded": "false" }, run: () => drawer(true) }, { id: "terms", glyph: "terminal", name: "Terminals", cls: "ap-terms-open", attrs: { "aria-haspopup": "dialog" }, run: () => termSheet() }, { id: "computer", glyph: "screen", name: "Computer", cls: "ap-computer-open", attrs: { "aria-haspopup": "dialog" }, run: () => computerSheet() }, { id: "db", glyph: "database", name: "DB", cls: "ap-db-open", run: () => void open(DB, { from: "drawer" }) }, { id: "map", glyph: "network", name: "Map", cls: "ap-map-open", run: () => void open(MAP, { from: "drawer" }) }, { id: "learn", glyph: "learn", name: "Learn", cls: "ap-learn-open", run: () => void open(LEARN, { from: "drawer" }) }].filter((action) => !ACTION_NEEDS[action.id] || has(ACTION_NEEDS[action.id]));
  const actionOf = (id) => ACTIONS.find((action) => action.id === id);
  const bar = Object.fromEntries(ACTIONS.filter((action) => PINNED.has(action.id) && action.id !== "todo").map((action) => [action.id, iconButton(action.glyph, action.name, { class: action.cls, ...action.attrs, onclick: action.run })]));
  const rows = ACTIONS.filter((action) => !PINNED.has(action.id)).map((action) => el("button", { type: "button", role: "menuitem", tabindex: "-1", class: "ap-menu-item", "data-act": action.id }, el("span", { class: "ap-menu-name" }, action.name), el("span", { class: "ap-menu-note" }), glyph(action.glyph)));
  const actMenu = el("div", { class: "ap-menu", id: "ap-top-menu", role: "menu", "aria-label": "More", hidden: true }, ...rows);
  const update = updateButton();
  const moreCount = el("span", { class: "ap-more-count", "aria-hidden": "true" });
  const moreButton = iconButton("more", "More", { class: "ap-more", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": "ap-top-menu" });
  moreButton.append(moreCount);
  let menuOpen = false;
  function showMenu(on2, { focus = null } = {}) {
    if (on2 === menuOpen || on2 && !rows.length) return;
    menuOpen = on2;
    actMenu.hidden = !on2;
    moreButton.setAttribute("aria-expanded", String(on2));
    if (!on2) {
      if (actMenu.contains(document.activeElement)) moreButton.focus({ preventScroll: true });
      return;
    }
    shell?.close();
    paintMenu();
    void store.terminals({ force: true });
    if (!reduced()) actMenu.animate([{ opacity: 0, transform: "translateY(-6px) scale(.96)", clipPath: "inset(0 0 55% 35% round 16px)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0 round 16px)" }], { duration: 240, easing: "cubic-bezier(.16,1,.3,1)" });
    if (focus) rows.at(focus === "last" ? -1 : 0).focus();
  }
  moreButton.addEventListener("click", (event) => showMenu(!menuOpen, { focus: event.detail === 0 ? "first" : null }));
  moreButton.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      showMenu(true, { focus: event.key === "ArrowUp" ? "last" : "first" });
    }
  });
  actMenu.addEventListener("click", (event) => {
    const row2 = event.target.closest(".ap-menu-item");
    if (!row2) return;
    showMenu(false);
    actionOf(row2.dataset.act).run?.();
  });
  actMenu.addEventListener("keydown", (event) => {
    const at = rows.indexOf(document.activeElement), to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 }[event.key];
    if (to !== void 0) {
      event.preventDefault();
      rows[(to + rows.length) % rows.length].focus();
    } else if (event.key === "Tab") showMenu(false);
  });
  const away = (event) => {
    if (menuOpen && !actMenu.contains(event.target) && !moreButton.contains(event.target)) showMenu(false);
  };
  document.addEventListener("pointerdown", away, true);
  const todoCount = () => top.querySelector(".ap-head .turn-count")?.textContent ?? "";
  function paintMenu() {
    const terms = data.terminals.filter((term) => !termReadOnly(term)), waiting = terms.filter((term) => term.attention === "needs_input").length, todo = todoCount();
    const notes = { todo: [todo, !!todo], aides: [top.querySelector(".ap-head .aide-count")?.textContent ?? "", false], terms: waiting ? [waiting + " waiting", true] : [terms.length ? String(terms.length) : "", false] };
    for (const row2 of rows) {
      const [note, owner] = notes[row2.dataset.act] ?? ["", false];
      row2.querySelector(".ap-menu-note").textContent = note;
      row2.classList.toggle("is-owner", owner);
    }
    bar.terms?.classList.toggle("is-owner", waiting > 0);
    const count = PINNED.has("todo") ? "" : todo, waits = !PINNED.has("terms") && waiting > 0;
    moreCount.textContent = count;
    moreButton.classList.toggle("is-owner", waits);
    moreButton.setAttribute("aria-label", ["More", count && count + " to-do", waits && "a terminal waits on you"].filter(Boolean).join(" · "));
  }
  const counted = new MutationObserver(paintMenu);
  const paintTerms = () => {
    paintMenu();
    sheet?.terms?.paint();
    const term = data.terminals.find((item) => item.id === full?.target?.id);
    if (full?.term && termReadOnly(term)) {
      full.term.freeze();
      full.closing?.paint();
      const note = full.head.querySelector(".ap-full-note");
      if (note) {
        note.textContent = `Previous ${lead()} · closed`;
        note.classList.remove("is-owner");
      }
    }
  };
  const quiet = (text) => el("p", { class: "ap-quiet" }, text);
  const group = (name, nodes) => el("section", { class: "ap-group" }, el("h3", { class: "ap-group-title" }, name), nodes);
  const row = ({ name, note = "", target, owner = false, query = "" }) => el("button", { type: "button", class: "ap-row ide-row" + (owner ? " is-owner" : ""), "data-key": keyOf(target), onclick: () => open(target, { from: "drawer" }) }, el("span", { class: "ap-row-name" }, ...query ? marked(name, query) : [name]), note ? el("span", { class: "ap-row-note" }, note) : null);
  const shown = new Set();
  const docs = (items) => items.filter((item) => item.kind === "file" || item.kind === "board");
  const docNote = (target) => target.kind === "board" ? "Board" : day(data.reports.find((report) => report.path === target.path)?.mtime);
  const more = (id, total, cap) => !shown.has(id) && total > cap ? [el("button", { type: "button", class: "ap-row is-muted", onclick: () => {
    shown.add(id);
    drawLists();
  } }, el("span", { class: "ap-row-name" }, `Show ${total - cap} more`))] : [];
  const dayLine = (text) => el("p", { class: "ap-day" }, text);
  function pinnedRows() {
    return docs(list.pins()).map((target) => row({ name: title(target, data), note: docNote(target), target }));
  }
  const recentItems = () => posted({ boards: data.boards, reports: data.reports }).slice(0, RECENT);
  function recentRows() {
    const items = recentItems();
    return items.length ? items.map((target) => row({ name: title(target, data), note: docNote(target), target })) : [quiet("New boards and reports show here")];
  }
  function dayRows(items, id) {
    const { today, earlier } = boardDays(items), all = [...today, ...earlier], cut = new Set(shown.has(id) ? all : all.slice(0, BOARDS_SHOWN));
    const itemRow = (item, note) => row({ name: item.target.kind === "file" ? title(item.target, data) : item.title, note, target: item.target });
    const todays = today.filter((item) => cut.has(item)), earliers = earlier.filter((item) => cut.has(item));
    return [...todays.length ? [dayLine("Today"), ...todays.map((item) => itemRow(item, hhmm(item.updatedAt)))] : [], ...earliers.length ? [...todays.length ? [dayLine("Earlier")] : [], ...earliers.map((item) => itemRow(item, day(item.updatedAt)))] : [], ...more(id, all.length, BOARDS_SHOWN)];
  }
  function boardRows() {
    if (!data.boards.length) return [quiet(data.state.boards === "failed" ? "Couldn't load the boards" : data.state.boards === "idle" ? "Loading…" : "No boards yet")];
    return dayRows(data.boards.map((board) => ({ title: board.title || board.id.slice(0, 8), updatedAt: board.updatedAt, target: { kind: "board", id: board.id } })), "bd:more");
  }
  function reportRows() {
    const items = reportItems({ boards: data.boards, reports: data.reports });
    if (!items.length) return [quiet(data.state.reports === "failed" ? "Couldn't load the reports" : data.state.reports === "idle" ? "Loading…" : "No reports yet")];
    return dayRows(items, "rp:more");
  }
  function internalRows() {
    return [dayLine("Archive"), ...archiveRows()];
  }
  const ROWS = { pinned: pinnedRows, recent: recentRows, boards: boardRows, reports: reportRows, internal: internalRows };
  function drawLists() {
    const pinCount = docs(list.pins()).length, tabs = tabOrder({ pinned: pinCount > 0 });
    const [shown2, kept2] = shownTab(tabs, tab, opensOn({ pinned: pinCount, recent: recentItems().length, boards: data.boards.length }));
    tab = kept2 ? shown2 : null;
    tabRow.set(tabs, shown2);
    lists.setAttribute("aria-label", tabs.find(([id]) => id === shown2)[1]);
    lists.replaceChildren(...ROWS[shown2]());
  }
  const archiveOpen = new Set(), ARCHIVE_SHOWN = 12;
  function archiveRows() {
    const items = shownItems(data.archive.items), state = data.state.archive;
    const line = state === "failed" ? "Couldn't load the archive" : state === "idle" ? "Loading…" : data.archive.state === "invalid" ? "The archive's index can't be read" : !items.length ? "Nothing archived yet" : null;
    if (line) return [quiet(line)];
    const toggle = (id) => {
      if (!archiveOpen.delete(id)) archiveOpen.add(id);
      drawLists();
    };
    const nodes = [];
    for (const { month, items: list2 } of byMonth(items)) {
      const opened = archiveOpen.has(month), more2 = archiveOpen.has(month + ":more");
      nodes.push(el("button", { type: "button", class: "ap-row ap-month", "aria-expanded": String(opened), onclick: () => toggle(month) }, el("span", { class: "ex-twist", "aria-hidden": "true" }), el("span", { class: "ap-row-name" }, month), el("span", { class: "ap-row-note" }, String(list2.length))));
      if (!opened) continue;
      for (const item of more2 ? list2 : list2.slice(0, ARCHIVE_SHOWN)) {
        const node = row({ name: item.title || item.id, note: itemDay(item) + " · " + kindName(item), target: archiveTarget(item) });
        node.classList.add("is-sub");
        nodes.push(node);
      }
      if (!more2 && list2.length > ARCHIVE_SHOWN) nodes.push(el("button", { type: "button", class: "ap-row is-sub is-muted", onclick: () => toggle(month + ":more") }, el("span", { class: "ap-row-name" }, `Show ${list2.length - ARCHIVE_SHOWN} more`)));
    }
    return nodes;
  }
  let termOpening = false, termNotice = null;
  async function newTerm() {
    if (termOpening) return;
    termOpening = true;
    termNotice = null;
    let answer;
    try {
      answer = await newTerminal({ api });
    } catch {
      answer = { ok: false, line: NEW_LINES.failed };
    }
    if (answer.ok) {
      await store.terminals({ force: true });
      if (!data.terminals.some((term) => term.id === answer.terminal.id)) {
        await new Promise((done) => setTimeout(done, 400));
        await store.terminals({ force: true });
      }
    }
    termOpening = false;
    termNotice = answer.ok ? null : answer.line;
    if (answer.ok) void open({ kind: "terminal", id: answer.terminal.id }, { from: "drawer" });
    paintTerms();
    return termNotice;
  }
  let hits = [], hitLine = null, asked = null, findTimer = 0;
  function paintFound() {
    const query = field.value.trim();
    results.hidden = !query;
    lists.hidden = !!query;
    tabRow.node.hidden = !!query;
    if (!query) return;
    const found = quickRows(query, { data, lists: list, hits }).filter((item) => !item.dir && !item.act), groups = [];
    for (const item of found) {
      let box = groups.find((entry) => entry.name === item.group);
      if (!box) groups.push(box = { name: item.group, rows: [] });
      box.rows.push(row({ name: item.name, note: item.detail, target: item.target, query }));
    }
    results.replaceChildren(...groups.length ? groups.map((box) => group(box.name, box.rows)) : [quiet(asked ? "Searching…" : "Nothing found")], ...hitLine ? [quiet(hitLine)] : []);
  }
  function find() {
    clearTimeout(findTimer);
    asked?.abort();
    asked = null;
    hits = [];
    hitLine = null;
    const query = field.value, now = new AbortController();
    if (query.trim()) asked = now;
    paintFound();
    if (!query.trim()) return;
    findTimer = setTimeout(() => {
      findNames(query, { api, signal: now.signal }).then((result) => {
        if (asked !== now) return;
        asked = null;
        hits = result.hits;
        hitLine = result.line;
        paintFound();
      }, () => {
      });
    }, 160);
  }
  field.addEventListener("input", find);
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      field.blur();
    }
  });
  let drawerOpen = false;
  function drawer(on2) {
    if (on2 === drawerOpen) return;
    if (on2) {
      shell?.close();
      showMenu(false);
    }
    drawerOpen = on2;
    drawerNode.dataset.open = String(on2);
    bar.explore?.setAttribute("aria-expanded", String(on2));
    if (on2) {
      snap("half");
      field.value = "";
      tab = null;
      find();
      drawLists();
      panel.querySelector(".ap-drawer-body").scrollTop = 0;
      tabRow.node.scrollLeft = 0;
      void Promise.all([store.turn(), store.reports(), store.terminals(), store.archive()]).then(() => {
        paintTerms();
        if (drawerOpen) drawLists();
      });
    } else {
      field.blur();
      asked?.abort();
      asked = null;
    }
  }
  scrim.addEventListener("click", () => drawer(false));
  function snap(to) {
    drawerNode.dataset.snap = to;
    grab.setAttribute("aria-expanded", String(to === "full"));
  }
  field.addEventListener("focus", () => snap("full"));
  draggable([grab, panel.querySelector(".ap-drawer-head")], drawerNode, (dy) => {
    const to = snapAfter(drawerNode.dataset.snap, dy, panel.getBoundingClientRect().height);
    if (to === "closed") drawer(false);
    else snap(to);
  });
  async function open(target, how = {}) {
    if (!target || target.kind === "block" || isExtKind(target.kind) && !["computer", "db", "sysmap", "learn"].includes(target.kind)) return null;
    drawer(false);
    closeSheet();
    shell?.close();
    showMenu(false);
    if (full && sameTarget(full.target, target)) {
      if (how.anchor) full.doc?.reveal(how.anchor);
      return full.doc;
    }
    closeFull({ quiet: true });
    const name = target.kind === "db" ? "DB" : target.kind === "file" ? title(target, data) : label(target, data);
    const head = el("header", { class: "ap-full-head" }, el("span", { class: "ap-full-grab", "aria-hidden": "true" }), iconButton("back", "Back to the chat", { class: "ap-back", onclick: () => closeFull() }), el("p", { class: "ap-full-title" }, name));
    const body = el("div", { class: "ap-full-body" });
    const node = el("section", { class: "ap-full" + ({ terminal: " is-term", image: " is-image", db: " is-db", sysmap: " is-db", computer: " is-computer" }[target.kind] ?? ""), role: "dialog", "aria-label": name }, head, body);
    const shade = el("div", { class: "ap-full-shade", onclick: () => {
      if (full === now) closeFull();
    } });
    const now = full = { target, node, head, body, shade, doc: null, term: null, db: null, computer: null, bar: null, findBar: null, life: new AbortController(), offs: [] };
    const signal = now.life.signal;
    layer.append(shade, node);
    if (!reduced() && how.from !== "restore") {
      node.classList.add("is-entering");
      shade.classList.add("is-entering");
    }
    draggable([head], node, (dy) => {
      if (dy <= 110 || full !== now) return false;
      closeFull();
      return true;
    });
    if (target.kind === "computer") {
      now.computer = mountComputer(target.id, target.name);
      body.replaceChildren(now.computer.node);
      return null;
    }
    if (target.kind === "sysmap") {
      now.db = mountSystemMap({ api });
      body.replaceChildren(now.db.node);
      return null;
    }
    if (target.kind === "db") {
      now.db = mountDb({ api, open: (next) => void open(next, { from: "link" }), touch: true, leave: () => closeFull() });
      body.replaceChildren(now.db.node);
      return null;
    }
    if (target.kind === "learn") {
      now.db = mountLearning({ api, open: (next) => open(next, { from: "link" }), leave: () => closeFull() });
      body.replaceChildren(now.db.node);
      return null;
    }
    setActive(target);
    if (target.kind === "terminal") {
      void fileWatch.report();
      await store.terminals();
      if (!data.terminals.some((item) => item.id === target.id)) await store.terminals({ force: true });
      if (full !== now) return null;
      const term = data.terminals.find((item) => item.id === target.id);
      if (!term) {
        body.replaceChildren(quiet("That terminal is closed, or not one Home can open"));
        return null;
      }
      head.querySelector(".ap-full-title").textContent = termName(term);
      const status = termStatus(term), note = [termWhere(term, data.terminals), status.line].filter(Boolean).join(" · ");
      if (note) head.append(el("span", { class: "ap-full-note" + (status.owner ? " is-owner" : "") }, note));
      const closing = now.closing = phoneClose(term, { latest: () => data.terminals.find((item) => item.id === term.id) ?? term, screen: () => now.term?.handle, gone: async () => {
        if (full === now) closeFull();
        await store.terminals({ force: true });
        paintTerms();
        if (drawerOpen) drawLists();
      } });
      now.term = mountPhoneTerminal(body, { id: term.id, readOnly: termReadOnly(term), hint: hintOnce(term) });
      head.append(now.term.toggle, closing.button);
      head.after(closing.ask);
      return null;
    }
    rememberPhone({ last: toTarget(target) });
    list.touch(target);
    const kept2 = unpark(keyOf(target), { take: true });
    const doc = now.doc = kept2?.doc ?? createDoc({ target, api, store, phone: true, origin });
    if (kept2) {
      now.target = target = kept2.target;
      if (kept2.stale || list.changed(keyOf(target))) void doc.reload({ quiet: true });
    }
    body.replaceChildren(doc.node);
    if (kept2) doc.scroller.scrollTop = 0;
    doc.show(true);
    void watch.set([keyOf(target), ...parked.keys()]);
    if (target.kind === "image") {
      if (target.from) head.append(el("span", { class: "ap-full-note" }, target.from));
      now.offs.push(doc.onChange((what) => {
        if (what === "loaded" && full === now) now.head.querySelector(".ap-full-title").textContent = doc.item?.title ?? name;
      }));
      await doc.ready;
      return doc;
    }
    const findField = el("input", { class: "find-field ap-find-field", type: "search", placeholder: "Find in this document", "aria-label": "Find in this document", autocomplete: "off", spellcheck: "false", enterkeyhint: "search" });
    const findCount = el("span", { class: "find-count" });
    const paintCount = ({ count, now: at }) => {
      const typed = !!findField.value.trim();
      findCount.textContent = !typed ? "" : count ? `${at + 1} / ${count}` : "None";
      findCount.classList.toggle("is-none", typed && !count);
    };
    const findBar = now.findBar = el("div", { class: "ap-find", role: "search", hidden: true }, findField, findCount, iconButton("up", "Previous match", { class: "ap-find-step", onclick: () => paintCount(doc.step(-1)) }), iconButton("down", "Next match", { class: "ap-find-step", onclick: () => paintCount(doc.step(1)) }), iconButton("close", "Close Find", { class: "ap-find-step", onclick: () => {
      findBar.hidden = true;
      doc.find("");
      findButton.setAttribute("aria-pressed", "false");
    } }));
    findField.addEventListener("input", () => paintCount(doc.find(findField.value)));
    findField.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        paintCount(doc.step(1));
        findField.blur();
      }
    });
    head.after(findBar);
    const tocButton = iconButton("outline", "Contents", { class: "ap-bar-item", onclick: () => tocSheet() });
    const findButton = iconButton("find", "Find in this document", { class: "ap-bar-item", "aria-pressed": "false", onclick: () => {
      const on2 = findBar.hidden;
      findBar.hidden = !on2;
      findButton.setAttribute("aria-pressed", String(on2));
      if (on2) {
        findField.focus();
        paintCount(doc.find(findField.value));
      } else doc.find("");
    } });
    const fbCount = el("span", { class: "ap-bar-count" });
    const fbButton = iconButton("comment", "Feedback", { class: "ap-bar-item ap-fb-open", onclick: () => collectedSheet() });
    fbButton.append(fbCount);
    const bar2 = now.bar = el("nav", { class: "ap-bar", "aria-label": "Document" }, tocButton, findButton, fbButton);
    now.paintBar = () => {
      const n = comments.all().length;
      fbCount.textContent = n ? String(n) : "";
      fbButton.setAttribute("aria-label", n ? `Feedback · ${n} kept` : "Feedback");
      fbButton.hidden = !canComment(target);
    };
    now.paintBar();
    head.append(bar2);
    doc.scroller.addEventListener("scroll", () => node.classList.toggle("is-past", doc.scroller.scrollTop > 64), { passive: true, signal });
    pressable(now);
    keepSpot(now);
    now.offs.push(doc.onChange((what) => {
      if (what === "loaded" && full === now) {
        now.head.querySelector(".ap-full-title").textContent = doc.item?.title ? clip(doc.item.title, 80) : name;
        if (doc.item?.updatedAt) list.see(keyOf(target), doc.item.updatedAt);
      }
    }));
    now.offs.push(doc.onChange((what) => {
      if (what === "text" && full === now && !findBar.hidden) paintCount(doc.find(findField.value, { keep: true }));
    }));
    if (kept2?.doc.item) {
      now.head.querySelector(".ap-full-title").textContent = doc.item.title ? clip(doc.item.title, 80) : name;
    }
    await doc.ready;
    if (how.anchor) requestAnimationFrame(() => requestAnimationFrame(() => doc.reveal(how.anchor)));
    else if (how.from === "restore") putSpot(now);
    else if (saved.read("phone-hint", 0) < 2) {
      saved.write("phone-hint", saved.read("phone-hint", 0) + 1);
      hintLine(now, l10n("문장을 꾹 누르면 그곳에 바로 의견을 달 수 있어요", "Press and hold a sentence to comment right there"));
    }
    return doc;
  }
  function hintLine(now, text) {
    now.hint?.remove();
    const line = now.hint = el("p", { class: "ap-hint", role: "status" }, text);
    now.node.append(line);
    setTimeout(() => line.remove(), 4600);
  }
  function keepSpot(now) {
    const { doc } = now;
    let timer = 0;
    now.life.signal.addEventListener("abort", () => clearTimeout(timer));
    doc.scroller.addEventListener("scroll", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (full !== now) return;
        const id = doc.currentHeading(), head = id && doc.headings.find((h) => h.id === id)?.node, scrollTop = Math.round(doc.scroller.scrollTop);
        const spots = { ...phonePart.spots };
        delete spots[keyOf(now.target)];
        spots[keyOf(now.target)] = head ? { top: scrollTop, id, dy: Math.round(scrollTop - offsetIn(doc, head)) } : { top: scrollTop };
        rememberPhone({ spots: Object.fromEntries(Object.entries(spots).slice(-SPOTS)) });
      }, 240);
    }, { passive: true, signal: now.life.signal });
  }
  const offsetIn = (doc, node) => node.getBoundingClientRect().top - doc.scroller.getBoundingClientRect().top + doc.scroller.scrollTop;
  function putSpot(now) {
    const spot = phonePart.spots[keyOf(now.target)];
    if (!spot) return;
    requestAnimationFrame(() => {
      const { doc } = now, head = typeof spot.id === "string" && doc.headings.find((h) => h.id === spot.id)?.node;
      if (head) {
        doc.unfoldTo(head);
        doc.scroller.scrollTop = offsetIn(doc, head) + (Number.isFinite(spot.dy) ? spot.dy : 0);
      } else if (spot.top) doc.scroller.scrollTop = spot.top;
    });
  }
  function closeFull({ quiet: still = false } = {}) {
    if (!full) return;
    const now = full;
    full = null;
    closeSheet();
    now.life.abort();
    for (const off of now.offs) off();
    const kept2 = now.doc && park(now);
    if (!still) {
      if (now.doc) rememberPhone({ last: null });
      setActive(null);
      void watch.set([...parked.keys()]);
    }
    const done = () => {
      if (!kept2) now.doc?.destroy();
      now.term?.dispose();
      now.db?.dispose();
      now.computer?.dispose();
      now.node.remove();
      now.shade.remove();
    };
    if (still || reduced()) done();
    else {
      for (const box of [now.node, now.shade]) {
        box.classList.remove("is-entering");
        box.classList.add("is-leaving");
      }
      let gone = false;
      const once = () => {
        if (!gone) {
          gone = true;
          done();
        }
      };
      now.node.addEventListener("animationend", once, { once: true });
      setTimeout(once, 420);
    }
  }
  const PARK_MAX = 4, PARK_IDLE = 10 * 6e4;
  const parked = new Map();
  function park(now) {
    const { doc, target } = now, key = keyOf(target);
    if (!["file", "board"].includes(target.kind) || !doc.item || doc.dirty) return false;
    unpark(key);
    doc.show(false);
    parked.set(key, { doc, target, stale: false, timer: setTimeout(() => {
      unpark(key);
      if (!full) void watch.set([...parked.keys()]);
    }, PARK_IDLE) });
    for (const old of [...parked.keys()].slice(0, Math.max(0, parked.size - PARK_MAX))) unpark(old);
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
  let reloadTimer = 0;
  const openTabs = () => ({ visible: document.visibilityState !== "hidden" && page.style.display !== "none", focused: pageFocused(), shown: full ? keyOf(full.target) : null, tabs: full ? [{ target: keyOf(full.target), title: title(full.target, data) }] : [] });
  const leadTab = ({ do: act, target: key }) => {
    if (act === "show") {
      const target = parseKey(key);
      if (!target) return;
      if (page.style.display === "none") location.hash = ideHash();
      void open(target);
    } else if (full && keyOf(full.target) === key) closeFull();
  };
  const fileWatch = createWatch({ api, device: "phone", tabs: openTabs, onTab: leadTab, onChanged({ target, mtime }) {
    list.know(target, mtime);
    const kept2 = parked.get(target);
    if (kept2) kept2.stale = true;
    const now = full;
    if (!now?.doc || keyOf(now.target) !== target) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      await now.doc.reload({ quiet: true });
      if (full === now && !now.doc.echo) hintLine(now, now.doc.item ? "Reloaded the changes" : "It changed, but couldn't be read again");
    }, 300);
  } }), connection = fileWatch.connection;
  fileWatch.connection = (live) => {
    if (!live) for (const entry of parked.values()) entry.stale = true;
    return connection(live);
  };
  const watch = ownerViewWatch(store, fileWatch);
  const life = new AbortController();
  life.signal.addEventListener("abort", on("data", (what) => {
    if (what === "terms") paintTerms();
  }), { once: true });
  life.signal.addEventListener("abort", store.watchTerminals(), { once: true });
  watchSight(() => void fileWatch.report(), { signal: life.signal });
  const stopOwnerViews = store.subscribe(() => {
    if (drawerOpen) drawLists();
  });
  life.signal.addEventListener("abort", stopOwnerViews, { once: true });
  const hooks = { watch, store, dashboard: (payload) => shell?.dashboard(payload), connection: (live) => shell?.connection(live), stale: () => shell?.stale() };
  if (stream) {
    const letGo = ridePhone({ stream, api: ownerViewApi(store, api), ...hooks });
    life.signal.addEventListener("abort", letGo, { once: true });
  } else void startLive({ api: ownerViewApi(store, api, { listing: true }), chat: feed, signal: life.signal, onUnauthorized: () => location.assign("/login"), ...hooks });
  const stopPins = mirrorPins({ api, list });
  life.signal.addEventListener("abort", stopPins, { once: true });
  function openSheet(name, nodes, { cls = "" } = {}) {
    closeSheet();
    const box = el("section", { class: "ap-sheet " + cls, role: "dialog", "aria-label": name }, el("header", { class: "ap-sheet-head" }, el("h2", { class: "ap-sheet-title" }, name), ...nodes.head ?? [], iconButton("close", "Close", { class: "ap-close", onclick: () => closeSheet() })), el("div", { class: "ap-sheet-body" }, nodes.body));
    let down = false;
    const shade = el("div", { class: "ap-sheet-scrim", onpointerdown: () => {
      down = true;
    }, onclick: () => {
      if (down) closeSheet();
      down = false;
    } });
    layer.append(shade, box);
    if (!reduced()) box.classList.add("is-entering");
    sheet = { box, shade, onClose: nodes.onClose, terms: nodes.terms ?? null };
    return sheet;
  }
  function closeSheet() {
    if (!sheet) return;
    const now = sheet;
    sheet = null;
    now.onClose?.();
    now.box.remove();
    now.shade.remove();
  }
  function tocSheet() {
    const doc = full?.doc;
    if (!doc) return;
    const outline = createOutline({ name: "Contents", phone: true, empty: "This document has no headings", pick: (id) => {
      closeSheet();
      doc.goTo(id);
    } });
    outline.set(doc.headings.map((h) => ({ id: h.id, level: h.level, text: h.text.replace(/`/g, ""), note: doc.folded.has(h.id) ? "folded" : "" })));
    const key = keyOf(full.target);
    for (const id of tocFolds.get(key) ?? []) outline.fold(id, true);
    const paintAll = () => {
      if (outline.folded.size) setIcon(all, "unfoldAll", "Unfold every heading");
      else setIcon(all, "foldAll", "Fold to the top headings");
    };
    const all = iconButton("foldAll", "Fold to the top headings", { class: "ap-toc-all" });
    paintAll();
    all.addEventListener("click", () => {
      outline.foldAll(!outline.folded.size, 1);
      paintAll();
    });
    all.hidden = !outline.node.querySelector(".ol-twist");
    const here = doc.currentHeading();
    if (here) outline.light(here);
    openSheet("Contents", { head: [all], body: el("div", { class: "ap-toc" }, outline.node), onClose: () => tocFolds.set(key, [...outline.folded]) }, { cls: "is-toc" });
  }
  function collectedSheet() {
    const all = comments.all();
    const said = el("p", { class: "ap-said", role: "status" });
    const items = all.map((item, n) => el("div", { class: "ap-fb-item" }, el("p", { class: "ap-fb-ref" }, n + 1 + ". " + refOfItem(item) + (sectionLabel(item.section) ? " › " + sectionLabel(item.section) : "")), item.anchor ? el("p", { class: "ap-fb-quote" }, "“" + clip(item.anchor.exact, 120) + "”") : isElement(item) ? el("p", { class: "ap-fb-quote" }, elementLine(item.element)) : null, el("p", { class: "ap-fb-text" }, item.text || "The whole section")));
    const send = control("Send all", { class: "ap-primary", onclick: async () => {
      const result = await sendFeedback();
      if (!result.ok) {
        said.textContent = result.line;
        return;
      }
      sent();
    } });
    const drop = iconButton("trash", "Discard all", { class: "ap-quiet-control", onclick: () => {
      comments.remove(all.map((item) => item.id));
      closeSheet();
      full?.paintBar?.();
    } });
    openSheet("Feedback", { body: el("div", { class: "ap-fb" }, items.length ? items : [quiet("No feedback kept · press and hold a sentence to leave some")], items.length ? el("div", { class: "ap-fb-foot" }, said, drop, send) : null) }, { cls: "is-fb" });
  }
  function termSheet() {
    const terms = phoneTermList({ data, open: (id) => void open({ kind: "terminal", id }, { from: "drawer" }), create: () => newTerm(), refresh: async () => {
      await store.terminals({ force: true });
      paintTerms();
      if (drawerOpen) drawLists();
    } });
    openSheet("Terminals", { head: terms.head, body: terms.body, terms }, { cls: "is-terms" });
    void store.terminals({ force: true }).then(paintTerms, () => {
    });
  }
  function computerSheet() {
    const picks = computerChoices(store.cached("resources")).flatMap(({ id, name, off }) => {
      const pick = row({ name, target: { kind: "computer", id, name } });
      if (off) {
        pick.disabled = true;
        pick.classList.add("is-muted");
      }
      return [pick, off ? quiet(OFF_LINE) : null];
    });
    openSheet("Computer", { body: picks });
  }
  function pressable(now) {
    const scroller = now.doc.scroller, signal = now.life.signal;
    let timer = 0, start = null, fired = false;
    signal.addEventListener("abort", () => clearTimeout(timer));
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    scroller.addEventListener("pointerdown", (event) => {
      fired = false;
      if (!event.isPrimary || event.pointerType === "mouse" && event.button !== 0 || !canComment(now.target)) return;
      const block = event.target.closest?.(".pane-block");
      if (!block || !now.doc.article.contains(block) || event.target.closest("button,a,input,summary,.bv-code-head")) return;
      start = { x: event.clientX, y: event.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => {
        const at = start;
        cancel();
        if (at) {
          fired = true;
          pressed(now, at.x, at.y);
        }
      }, PRESS);
    }, { signal });
    scroller.addEventListener("pointermove", (event) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) cancel();
    }, { signal });
    for (const type of ["pointerup", "pointercancel"]) scroller.addEventListener(type, cancel, { signal });
    scroller.addEventListener("scroll", cancel, { passive: true, signal });
    scroller.addEventListener("contextmenu", (event) => {
      if (!event.target.closest?.("a")) event.preventDefault();
    }, { signal });
    scroller.addEventListener("selectstart", (event) => {
      if (fired) event.preventDefault();
    }, { signal });
    scroller.addEventListener("click", (event) => {
      if (fired) {
        fired = false;
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true, signal });
  }
  function pressed(now, x, y) {
    const hit = document.elementFromPoint(x, y), block = hit?.closest?.(".pane-block");
    if (!block) return;
    navigator.vibrate?.(8);
    getSelection()?.removeAllRanges();
    if (block.dataset.hlevel) {
      passageSheet(now, sectionFrom(now.doc, block), null);
      return;
    }
    const range = sentenceAt(hit.closest(TEXT_BLOCK) ?? block, x, y);
    const fields = range && anchorFrom(now.doc, range);
    if (fields) passageSheet(now, fields, range);
  }
  function passageSheet(now, fields, range) {
    if (range) highlight("ide-quote", [range]);
    const secret = fields.anchor && looksSecret(fields.anchor.exact);
    const text = el("textarea", { class: "ap-fb-field", rows: "3", placeholder: "Your comment on this", "aria-label": "Comment", enterkeyhint: "enter" });
    const said = el("p", { class: "ap-said", role: "status" }, secret ? SECRET_LINE : "");
    const others = comments.all().length;
    const keep = () => {
      comments.add({ target: toTarget(now.target), ...fields, text: text.value.trim() });
      now.paintBar?.();
    };
    const send = control(others ? `Send all ${others + 1}` : "Send", { class: "ap-primary", disabled: secret, onclick: async () => {
      keep();
      const result = await sendFeedback();
      if (!result.ok) {
        said.textContent = result.line;
        return;
      }
      sent();
    } });
    const later = control("Keep for later", { class: "ap-quiet-control", disabled: secret, onclick: () => {
      keep();
      closeSheet();
      hintLine(now, "Kept · send it all from Feedback");
    } });
    const where = refOf(now.target) + (sectionLabel(fields.section) ? " › " + sectionLabel(fields.section) : "");
    let frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (sheet === opened) clearOf(now, range);
      });
    };
    const sizes = new ResizeObserver(settle);
    const opened = openSheet("Feedback", { body: el("div", { class: "ap-passage" }, el("p", { class: "ap-fb-ref" }, where), el("p", { class: "ap-fb-quote" }, fields.anchor ? "“" + clip(fields.anchor.exact, 160) + "”" : "The whole section"), text, el("div", { class: "ap-fb-foot" }, said, later, send)), onClose: () => {
      sizes.disconnect();
      viewport?.removeEventListener("resize", settle);
      if (full?.doc) full.doc.show(true);
      else highlight("ide-quote", []);
    } }, { cls: "is-passage" });
    if (range) {
      sizes.observe(opened.box);
      viewport?.addEventListener("resize", settle);
    }
    requestAnimationFrame(() => {
      text.focus({ preventScroll: true });
      clearOf(now, range);
    });
  }
  function clearOf(now, range) {
    const box = range?.getBoundingClientRect(), edge = sheet ? sheet.box.getBoundingClientRect().top - new DOMMatrixReadOnly(getComputedStyle(sheet.box).transform).m42 : null;
    if (!box || edge == null || box.bottom <= edge - 16) return;
    const scroller = now.doc.scroller, frame = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + Math.min(box.bottom - edge + 28, box.top - frame.top - 12), behavior: reduced() ? "auto" : "smooth" });
  }
  function sent() {
    closeSheet();
    closeFull();
    const end = () => {
      const scroller = host.querySelector(".chat-scroll");
      scroller?.scrollTo({ top: scroller.scrollHeight });
    };
    requestAnimationFrame(() => requestAnimationFrame(end));
    setTimeout(end, 700);
  }
  const bare = (text) => String(text ?? "").replace(/…$/, "").replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  async function openAt(target, anchor) {
    const doc = await open(target, { from: "feedback", anchor: anchor?.exact ? anchor : null });
    if (!doc || !anchor || anchor.exact) return;
    if (anchor.blockId && doc.headings.some((h) => h.id === anchor.blockId)) {
      doc.goTo(anchor.blockId);
      return;
    }
    const heading = anchor.heading && doc.headings.find((h) => bare(h.text).startsWith(bare(anchor.heading)));
    if (heading) doc.goTo(heading.id);
  }
  const viewport = window.visualViewport;
  const fit = () => {
    for (const node of [page, layer]) {
      node.style.setProperty("--vvh", Math.round(viewport.height) + "px");
      node.style.setProperty("--vvt", Math.round(viewport.offsetTop) + "px");
    }
    layer.dataset.keyboard = String(viewport.height < innerHeight * 0.8);
  };
  if (viewport) {
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
  }
  const keys = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.target.closest?.("dialog")) return;
    if (menuOpen) showMenu(false);
    else if (drawerOpen) drawer(false);
    else if (sheet) closeSheet();
    else if (full) closeFull();
    else return;
    event.preventDefault();
  };
  document.addEventListener("keydown", keys);
  setOpener(open);
  const composed = (node) => {
    top.querySelector(".ap-head")?.remove();
    counted.disconnect();
    if (!node) return;
    node.classList.add("ap-head");
    node.prepend(...Object.values(bar));
    if (rows.length) node.append(update, moreButton, actMenu);
    top.append(node);
    for (const count of node.querySelectorAll(".turn-count, .aide-count")) counted.observe(count, { childList: true, characterData: true, subtree: true });
    paintMenu();
  };
  composed(el("div", { class: "chat-head" }));
  layer.append(drawerNode);
  let unmountChat = null;
  try {
    unmountChat = await (await import("../chat/chat.js")).mountChat(host, { layout: "phone", head: composed, makePane: createPane, agentTitle, selectedAgent: kept.chat.agentId, rememberAgent: (agentId) => writeWorkspace({ chat: { agentId } }) });
  } catch (error) {
    (await import("../chat/chat.js")).mountProblem(host, error);
  }
  const undecorate = decorate(host, { data, openAt });
  void store.turn();
  void store.reports();
  void store.boards();
  void store.terminals().then(paintTerms, () => {
  });
  const [last] = phonePart.last ? await stillServed([phonePart.last], { api }) : [];
  if (phonePart.last && !last) rememberPhone({ last: null });
  if (last) await open(last, { from: "restore" });
  document.documentElement.dataset.ideReady = "1";
  const quoted = () => {
    if (full) closeFull();
  };
  addEventListener(QUOTE_EVENT, quoted);
  const unmount = function unmount2() {
    removeEventListener(QUOTE_EVENT, quoted);
    unhold();
    life.abort();
    clearTimeout(reloadTimer);
    clearTimeout(findTimer);
    asked?.abort();
    document.removeEventListener("keydown", keys);
    document.removeEventListener("pointerdown", away, true);
    counted.disconnect();
    if (viewport) {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    }
    page.style.removeProperty("--vvh");
    page.style.removeProperty("--vvt");
    closeFull({ quiet: true });
    for (const key of [...parked.keys()]) unpark(key);
    undecorate();
    unmountChat?.();
    setOpener(null);
    shell?.destroy();
    layer.remove();
    page.replaceChildren();
    delete document.documentElement.dataset.ideReady;
  };
  unmount.explore = () => {
    drawer(true);
    field.focus();
  };
  unmount.terminal = (id) => open({ kind: "terminal", id }, { from: "link" });
  unmount.screen = () => {
    const pick = computerChoices(store.cached("resources")).find((pick2) => pick2.id === hosts().screen);
    return pick ? open({ kind: "computer", id: pick.id, name: pick.name }, { from: "link" }) : false;
  };
  unmount.learn = () => has("learn") ? open({ ...LEARN }, { from: "link" }) : null;
  unmount.board = (target) => {
    if (target) return open(target, { from: "link" });
    drawer(true);
    tab = "boards";
    drawLists();
  };
  unmount.show = (on2) => {
    if (!on2) {
      closeSheet();
      drawer(false);
      shell?.close();
      showMenu(false);
    }
    page.style.display = layer.style.display = on2 ? "" : "none";
    void fileWatch.report();
  };
  return unmount;
}
