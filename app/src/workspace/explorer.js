import { el } from "../boards/dom.js";
import { WORK, SYSTEM, rel, fileName, label, day, on, keyOf, sameTarget, current, isolate } from "./core.js";
import { glyph, iconButton } from "./icons.js";
import { extSections, sectionBody, sectionCount, onRegistry } from "./extensions.js";
import { byMonth, shownItems, kindName, itemDay, archiveTarget } from "./archive.js";
import { offers, nameProblem, refusalLine, purgeNote, trashName, trashFrom, doneLine, originOf, inRoots, CONFIRM, FS_LABELS } from "./files.js";
import { createServerStatus } from "./server-status.js";
import { boardDays, hhmm, posted, BOARDS_SHOWN } from "./explorer-tabs.js";
import { has } from "../names.js";
const FOLDED_NOTE = "A folded folder (node_modules, dist and the like) · click to open";
export const RAIL = [["find", "find", "Find"], ["boards", "report", "Boards"], ["recent", "clock", "Recent"], ["files", "folder", "Files"]];
const FLASH = 1100;
const REPORTS_SHOWN = 12;
const TOAST = 6e3, UNDO_TOAST = 1e4;
const parentOf = (path) => String(path).replace(/\/[^/]*$/, "");
const within = (path, base) => path === base || String(path).startsWith(base + "/");
export function row({ name, note = "", onClick, onMenu = null, target = null, depth = 0, muted = false, dir = null, title = null, mark = null, cls = "" }) {
  const button = el("button", { type: "button", class: ("ex-row ide-row " + cls + (muted ? " is-muted" : "") + (dir ? " is-dir" : "")).trim(), title: title ?? name, style: { "--d": String(depth) }, "data-key": target ? keyOf(target) : null }, dir ? el("span", { class: "ex-twist", "aria-hidden": "true" }) : el("span", { class: "ex-twist-slot" }), el("span", { class: "ex-name" }, name), mark ? el("span", { class: "ex-mark" }, mark) : null, note ? el("span", { class: "ex-note" }, note) : null);
  if (dir) button.setAttribute("aria-expanded", String(dir === "open"));
  if (onClick) button.addEventListener("click", onClick);
  if (onMenu) button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    onMenu(event);
  });
  return button;
}
const quiet = (text, depth = 0) => el("p", { class: "ex-quiet", style: { "--d": String(depth) } }, text);
function moreButton(onMenu) {
  const more = iconButton("more", "More actions", { class: "ex-more is-small" });
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    onMenu(event);
  });
  return more;
}
function menuRow(button, onMenu) {
  if (!onMenu) return button;
  return el("div", { class: "ex-menurow" }, button, moreButton(onMenu));
}
function place(host, nodes) {
  const wanted = new Set(nodes);
  let at = host.firstElementChild;
  for (const node of nodes) {
    while (at && !wanted.has(at)) {
      const next = at.nextElementSibling;
      at.remove();
      at = next;
    }
    if (at === node) at = at.nextElementSibling;
    else host.insertBefore(node, at);
  }
  while (at) {
    const next = at.nextElementSibling;
    at.remove();
    at = next;
  }
}
export function createExplorer({ store, lists, open, quick, collapse, expand = () => {
}, kept = {}, remember = () => {
}, api = null, menu = null, termHere = null, files: fileOps = null, filed = () => {
}, tools = [] }) {
  const data = store.data;
  const folds = Object.fromEntries((kept.folds ?? []).map((id) => [id, true]));
  folds.internal = true;
  const openDirs = new Set(kept.dirs ?? []);
  const listings = new Map();
  const links = new Set();
  const linkedAt = (path) => {
    for (let at = path; at; at = parentOf(at)) if (links.has(at)) return true;
    return false;
  };
  let roots = [{ name: "work", path: WORK }, { name: "system", path: SYSTEM }].filter((root) => typeof root.path === "string");
  const sections = el("div", { class: "ex-scroll ex-sections" });
  const search = el("button", { type: "button", class: "ex-search", title: "Find reports, boards and files by name · ⌘K" }, el("span", { class: "ex-search-text" }, glyph("find"), "Find"), el("kbd", {}, "⌘K"));
  search.addEventListener("click", () => quick());
  const fold = iconButton("sidebar", "Hide the explorer", { key: "⌘B", class: "ex-collapse" });
  fold.addEventListener("click", () => collapse());
  const head = el("header", { class: "ex-head" }, el("h2", { class: "ex-title" }, "Explorer"), fold);
  const status = createServerStatus({ store, host: kept.host ?? null, change: () => save(), open, tools });
  const toast = el("div", { class: "ex-toast", role: "status", hidden: true });
  const node = el("aside", { class: "ide-explorer", "aria-label": "Explorer" }, head, el("div", { class: "ex-find" }, search), sections, toast, status.foot);
  const railOpen = iconButton("sidebar", "Show the explorer", { key: "⌘B", class: "ide-rail-open" });
  railOpen.addEventListener("click", () => expand());
  const railButton = (id, name, text) => {
    const button = iconButton(name, text, { key: id === "find" ? "⌘K" : "", class: "ide-rail-" + id, "data-sec": id });
    button.addEventListener("click", () => {
      if (id === "find") quick();
      else {
        expand();
        show(id);
      }
    });
    return button;
  };
  const railButtons = RAIL.map(([id, name, text]) => railButton(id, name, text));
  const rail = el("nav", { class: "ide-rail", "aria-label": "Explorer" }, railOpen, el("span", { class: "ide-rail-gap", "aria-hidden": "true" }), ...railButtons, status.railFoot);
  let extRail = [];
  function railExtras(list) {
    const ids = list.map((spec) => spec.id + " " + spec.glyph + " " + spec.title).join("|");
    if (rail.dataset.ext === ids) return;
    for (const button of extRail) button.remove();
    extRail = list.map((spec) => {
      const button = railButton(spec.id, spec.glyph, spec.title);
      button.classList.add("ide-rail-ext");
      button.append(el("span", { class: "ide-rail-count", "aria-hidden": "true" }));
      return button;
    });
    for (const button of extRail) rail.insertBefore(button, status.railFoot);
    rail.dataset.ext = ids;
  }
  const save = () => remember({ folds: Object.keys(folds).filter((id) => folds[id]), dirs: [...openDirs], host: status.host });
  function section(id, title, count, body) {
    const shut = !!folds[id];
    const toggle = el("button", { type: "button", class: "ex-sec-head", "aria-expanded": String(!shut) }, el("span", { class: "ex-twist", "aria-hidden": "true" }), el("span", { class: "ex-sec-title" }, title), count != null ? el("span", { class: "ex-sec-count" }, String(count)) : null);
    const box = el("section", { class: "ex-sec" + (shut ? " is-shut" : ""), "data-sec": id }, toggle, el("div", { class: "ex-sec-body" }, body));
    toggle.addEventListener("click", () => {
      folds[id] = !folds[id];
      save();
      box.classList.toggle("is-shut", !!folds[id]);
      toggle.setAttribute("aria-expanded", String(!folds[id]));
    });
    return box;
  }
  const openRow = (target, extra = {}) => row({ target, onClick: () => open(target, { from: "explorer" }), ...extra });
  const changedMark = (target) => lists.changed(keyOf(target)) ? "changed" : null;
  const pinRow = (target, pinned2, where) => {
    const file = target.kind === "file" ? target.path : null;
    if (file && renaming(file, where)) return [nameField(0)];
    const note = file ? fileName(file.replace(/\/[^/]+$/, "")) : "Board";
    const onMenu = file && inRoots(file) ? rowMenu(file, "file", parentOf(file), where) : null;
    const button = openRow(target, { name: label(target, data), note, mark: changedMark(target), title: file ? rel(file) : label(target, data), onMenu });
    const pin = iconButton(pinned2 ? "unpin" : "pin", pinned2 ? "Unpin" : "Pin to the top", { class: "ex-pin is-small" });
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      lists.pin(target, !pinned2);
    });
    const box = el("div", { class: "ex-pinrow" + (onMenu ? " ex-menurow" : "") }, button, onMenu ? moreButton(onMenu) : null, pin);
    return file && askingAt(file, where) ? [box, askRow(0)] : [box];
  };
  const docsOnly = (list) => list.filter((item) => item.kind === "file" || item.kind === "board");
  function pinned() {
    const pins = docsOnly(lists.pins());
    return pins.length ? section("pinned", "Pinned", null, pins.flatMap((item) => pinRow(item, true, "pinned"))) : null;
  }
  function recent() {
    const pins = docsOnly(lists.pins()), rest = posted({ boards: data.boards, reports: data.reports }).filter((item) => !pins.some((pin) => sameTarget(pin, item))).slice(0, 6);
    return section("recent", "Recent", null, rest.length ? rest.flatMap((item) => pinRow(item, false, "recent")) : [quiet(pins.length ? "Other new boards and reports show here" : "New boards and reports show here")]);
  }
  const dirRow = (id, name, count, opened) => row({ name, note: String(count), dir: opened ? "open" : "shut", onClick: () => toggleDir(id) });
  function boards() {
    const more = openDirs.has("bd:more"), { today, earlier } = boardDays(data.boards), all = [...today, ...earlier], shown = new Set(more ? all : all.slice(0, BOARDS_SHOWN)), rows = [];
    const boardRow = (board, note) => openRow({ kind: "board", id: board.id }, { name: board.title || board.id.slice(0, 8), note, mark: changedMark({ kind: "board", id: board.id }) });
    const todays = today.filter((board) => shown.has(board)), earliers = earlier.filter((board) => shown.has(board));
    if (todays.length) rows.push(el("p", { class: "ex-day" }, "Today"), ...todays.map((board) => boardRow(board, hhmm(board.updatedAt))));
    if (earliers.length) rows.push(...todays.length ? [el("p", { class: "ex-day" }, "Earlier")] : [], ...earliers.map((board) => boardRow(board, day(board.updatedAt))));
    if (!more && all.length > BOARDS_SHOWN) rows.push(row({ name: `Show ${all.length - BOARDS_SHOWN} more`, muted: true, onClick: () => toggleDir("bd:more") }));
    if (!all.length) rows.push(quiet(data.state.boards === "failed" ? "Couldn't load the boards" : data.state.boards === "idle" ? "Loading…" : "No boards yet"));
    return section("boards", "Boards", null, rows);
  }
  function internal() {
    const list = [], reportsOpen = openDirs.has("rb:reports"), more = openDirs.has("rb:more");
    list.push(dirRow("rb:reports", "Reports", data.reports.length, reportsOpen));
    if (reportsOpen) {
      const shown = more ? data.reports : data.reports.slice(0, REPORTS_SHOWN);
      for (const report of shown) list.push(openRow({ kind: "file", path: report.path }, { name: reportName(report), note: day(report.mtime), depth: 1, title: rel(report.path) + "\n" + (report.title || ""), mark: changedMark({ kind: "file", path: report.path }) }));
      if (!more && data.reports.length > REPORTS_SHOWN) list.push(row({ name: `Show ${data.reports.length - REPORTS_SHOWN} more`, depth: 1, muted: true, onClick: () => toggleDir("rb:more") }));
      if (data.state.reports === "failed") list.push(quiet("Couldn't load the reports", 1));
    }
    if (has("archive")) archive(list, dirRow);
    return section("internal", "Internal", data.reports.length, list);
  }
  function archive(list, folder) {
    const found = data.archive, items = shownItems(found.items), opened = openDirs.has("rb:archive");
    list.push(folder("rb:archive", "Archive", items.length, opened));
    if (!opened) return;
    const line = data.state.archive === "failed" ? "Couldn't load the archive" : data.state.archive === "idle" ? "Loading…" : found.state === "invalid" ? "The archive's index can't be read" : !items.length ? "Nothing archived yet" : null;
    if (line) {
      list.push(quiet(line, 1));
      return;
    }
    for (const { month, items: monthItems } of byMonth(items)) {
      const id = "rb:archive:" + month, monthOpen = openDirs.has(id), more = openDirs.has(id + ":more");
      list.push(row({ name: month, note: String(monthItems.length), dir: monthOpen ? "open" : "shut", depth: 1, onClick: () => toggleDir(id) }));
      if (!monthOpen) continue;
      for (const item of more ? monthItems : monthItems.slice(0, REPORTS_SHOWN)) list.push(openRow(archiveTarget(item), { name: item.title || item.id, note: itemDay(item) + " · " + kindName(item), depth: 2, title: item.title + "\n" + kindName(item) + " · " + item.date + " · Archive " + month }));
      if (!more && monthItems.length > REPORTS_SHOWN) list.push(row({ name: `Show ${monthItems.length - REPORTS_SHOWN} more`, depth: 2, muted: true, onClick: () => toggleDir(id + ":more") }));
    }
  }
  const reportName = (report) => {
    const parts = rel(report.path).split("/");
    return parts.length > 2 ? parts.at(-2) + "/" + parts.at(-1) : parts.at(-1);
  };
  function listing(path) {
    const known = listings.get(path);
    if (known) return known;
    const entry = { state: "loading" };
    listings.set(path, entry);
    void store.tree(path).then((answer) => {
      if (listings.get(path) !== entry) return;
      if (!answer.ok) {
        Object.assign(entry, { state: "failed", line: answer.body?.error === "forbidden" ? "Can't open this folder" : answer.body?.error === "not_found" ? "No such folder" : "Couldn't load the list" });
      } else {
        Object.assign(entry, { state: "ready", entries: answer.body.entries ?? [], truncated: !!answer.body.truncated, total: answer.body.total ?? null, skipped: answer.body.skipped ?? 0 });
        for (const item of entry.entries) {
          if (item.kind === "file") lists.know(keyOf({ kind: "file", path: item.path }), item.mtime);
          if (item.link) links.add(item.path);
          else links.delete(item.path);
        }
      }
      paint();
    });
    return entry;
  }
  const termOffer = (folder) => !!termHere && folder !== `${WORK}/owner-edits` && !folder.startsWith(`${WORK}/owner-edits/`);
  function rowMenu(path, kind, folder, where = "files") {
    if (!menu) return null;
    const link = linkedAt(path), offered = fileOps ? offers(path, kind, null, link) : [], term = termOffer(folder);
    if (!offered.length && !term) return null;
    return async (event) => {
      let list = offered, read = null;
      if (kind === "file" && offered.length) {
        read = await fileOps.check(path);
        list = offers(path, kind, read, link);
      }
      const items = [...list.map((id) => ({ text: FS_LABELS[id], run: () => start(id, path, kind, read, where) })), ...term ? [{ text: "Open terminal here", run: () => termHere(folder) }] : []];
      if (items.length) menu(event, items);
    };
  }
  function files() {
    const list = [];
    for (const root of roots) {
      const id = "f:" + root.path, opened = openDirs.has(id), onMenu = rowMenu(root.path, "root", root.path);
      list.push(menuRow(row({ name: root.name, dir: opened ? "open" : "shut", title: root.path, onClick: () => toggleDir(id), onMenu }), onMenu));
      if (opened) tree(root.path, 1, list);
    }
    if (fileOps) trashRows(list);
    return section("files", "Files", null, list);
  }
  function tree(path, depth, list) {
    if (naming && naming.op !== "rename" && naming.folder === path) list.push(nameField(depth));
    const found = listing(path);
    if (found.state === "loading") {
      list.push(quiet("Loading…", depth));
      return;
    }
    if (found.state === "failed") {
      list.push(row({ name: found.line + " · retry", depth, muted: true, onClick: () => {
        listings.delete(path);
        paint();
      } }));
      return;
    }
    if (!found.entries.length && !(naming && naming.folder === path)) list.push(quiet("Empty", depth));
    for (const item of found.entries) {
      const kind = item.kind === "dir" ? "folder" : "file";
      if (renaming(item.path, "files")) list.push(nameField(depth));
      else if (item.kind === "dir") {
        const id = "f:" + item.path, opened = openDirs.has(id), onMenu = rowMenu(item.path, kind, item.path);
        list.push(menuRow(row({ name: item.name, note: item.folded && !opened ? "folded" : item.link ? "link" : "", dir: opened ? "open" : "shut", depth, muted: !!item.folded, title: item.folded ? FOLDED_NOTE : rel(item.path), onClick: () => toggleDir(id), onMenu }), onMenu));
      } else {
        const target = { kind: "file", path: item.path }, onMenu = rowMenu(item.path, kind, path);
        list.push(menuRow(openRow(target, { name: item.name, note: item.link ? "link" : "", depth, title: rel(item.path), mark: changedMark(target), onMenu }), onMenu));
      }
      if (askingAt(item.path, "files")) list.push(askRow(depth));
      if (item.kind === "dir" && openDirs.has("f:" + item.path) && !renaming(item.path, "files")) tree(item.path, depth + 1, list);
    }
    if (found.truncated) list.push(quiet(`Showing the first ${found.entries.length}` + (found.total ? ` of ${found.total}` : ""), depth));
    if (found.skipped) list.push(quiet(found.skipped === 1 ? "1 unreadable folder left out" : `${found.skipped} unreadable folders left out`, depth));
  }
  let naming = null, asking = null, toastTimer = 0, toastHeld = null, painting = false, trashRead = null;
  const trash = { state: "idle", items: [], truncated: false, line: "", lines: new Map(), busy: new Set() };
  const renaming = (path, where) => naming?.op === "rename" && naming.where === where && naming.path === path;
  const askingAt = (path, where) => asking?.where === where && asking.path === path;
  function start(id, path, kind, read, where = "files") {
    asking = null;
    naming = null;
    if (id === "newFile" || id === "newFolder") {
      naming = { op: id, folder: path, kind: id === "newFile" ? "file" : "folder", value: "", line: "", where };
      if (!openDirs.has("f:" + path)) {
        openDirs.add("f:" + path);
        if (listings.get(path)?.state !== "loading") listings.delete(path);
        save();
      }
    } else if (id === "rename") naming = { op: "rename", path, kind, value: fileName(path), line: "", where };
    else if (id === "delete") {
      if (originOf(path) === "system") asking = { path, kind, sha: kind === "file" ? read?.sha ?? null : null, where };
      else {
        void remove(path, kind === "file" ? read?.sha ?? null : null);
        return;
      }
    }
    paint();
    if (naming) {
      const field = naming.input;
      field?.focus?.({ preventScroll: true });
      if (naming.op === "rename") {
        const dot = naming.kind === "file" ? naming.value.lastIndexOf(".") : -1;
        field?.setSelectionRange?.(0, dot > 0 ? dot : naming.value.length);
      }
    } else asking?.yes?.focus?.({ preventScroll: true });
  }
  function nameField(depth) {
    const held = naming;
    if (!held.node) {
      const label2 = held.op === "rename" ? "New name for " + fileName(held.path) : held.kind === "folder" ? "New folder name" : "New file name";
      const input = el("input", { class: "ex-field", type: "text", "aria-label": label2, title: "Enter to " + (held.op === "rename" ? "rename" : "create") + " · Esc to cancel", autocomplete: "off", spellcheck: "false", enterkeyhint: "done" });
      input.value = held.value;
      const line = el("p", { class: "ex-field-line", role: "status", hidden: true });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          void commitName(held);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          endNaming(held);
        }
      });
      input.addEventListener("input", () => {
        held.value = input.value;
        if (held.line) {
          held.line = "";
          paintField(held);
        }
      });
      input.addEventListener("blur", () => setTimeout(() => {
        if (naming === held && !held.busy && !painting && globalThis.document?.activeElement !== input && globalThis.document?.hasFocus?.() !== false) endNaming(held);
      }, 0));
      held.input = input;
      held.lineNode = line;
      held.node = el("div", { class: "ex-naming" + (held.kind === "folder" ? " is-dir" : ""), style: { "--d": String(depth) } }, el("span", { class: held.kind === "folder" ? "ex-twist" : "ex-twist-slot", "aria-hidden": "true" }), el("div", { class: "ex-field-box" }, input, line));
    }
    held.node.style.setProperty("--d", String(depth));
    paintField(held);
    return held.node;
  }
  function paintField(held) {
    held.lineNode.textContent = held.line;
    held.lineNode.hidden = !held.line;
    held.node.classList.toggle("is-busy", !!held.busy);
    held.input.readOnly = !!held.busy;
  }
  function endNaming(held) {
    if (naming !== held) return;
    naming = null;
    paint();
  }
  async function commitName(held) {
    if (held.busy) return;
    const name = held.input.value.trim(), op = held.op === "rename" ? "rename" : "create", problem = nameProblem(name);
    if (problem) {
      held.line = refusalLine(op, { status: 400, body: { reason: "name", detail: "name: " + problem } });
      paintField(held);
      return;
    }
    if (op === "rename" && name === fileName(held.path)) {
      endNaming(held);
      return;
    }
    held.busy = true;
    held.line = "";
    paintField(held);
    const answer = op === "rename" ? await fileOps.rename(held.path, name) : await fileOps.create(held.folder, held.kind, name);
    held.busy = false;
    if (answer.ok) {
      if (naming === held) naming = null;
      afterOp(answer.done);
      return;
    }
    if (naming !== held) {
      say(answer.line);
      return;
    }
    held.line = answer.line;
    paintField(held);
    held.input.focus?.({ preventScroll: true });
  }
  function askRow(depth) {
    const held = asking;
    if (!held.node) {
      const yes = el("button", { type: "button", class: "ex-ask-yes" }, FS_LABELS.delete), no = el("button", { type: "button", class: "ex-ask-no" }, "Cancel");
      yes.addEventListener("click", async () => {
        if (held.busy) return;
        held.busy = true;
        yes.disabled = true;
        const answer = await fileOps.remove(held.path, held.sha);
        held.busy = false;
        yes.disabled = false;
        if (asking === held) asking = null;
        if (answer.ok) afterOp(answer.done);
        else {
          say(answer.line);
          paint();
        }
      });
      no.addEventListener("click", () => {
        if (asking === held) {
          asking = null;
          paint();
        }
      });
      held.node = el("div", { class: "ex-ask", role: "group", "aria-label": CONFIRM }, el("span", { class: "ex-ask-text" }, CONFIRM), yes, no);
      held.node.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && asking === held) {
          event.preventDefault();
          event.stopPropagation();
          asking = null;
          paint();
        }
      });
      held.yes = yes;
    }
    held.node.style.setProperty("--d", String(depth));
    return held.node;
  }
  async function remove(path, sha) {
    const answer = await fileOps.remove(path, sha);
    if (answer.ok) afterOp(answer.done);
    else say(answer.line);
  }
  function readTrash() {
    if (!fileOps) return null;
    if (trashRead) return trashRead;
    if (trash.state !== "ready") trash.state = "loading";
    return trashRead = fileOps.trash().then((answer) => {
      trashRead = null;
      if (answer.ok) Object.assign(trash, { state: "ready", items: answer.items, truncated: answer.truncated, line: "" });
      else if (trash.state !== "ready") Object.assign(trash, { state: "failed", line: answer.line });
      paint();
    });
  }
  function trashRows(list) {
    const opened = openDirs.has("trash");
    list.push(row({ name: FS_LABELS.trash, note: trash.state === "ready" && trash.items.length ? String(trash.items.length) + (trash.truncated ? "+" : "") : "", dir: opened ? "open" : "shut", title: "Work files and folders you deleted · each kept 14 days", cls: "ex-trash-row", onClick: () => toggleDir("trash") }));
    if (!opened) return;
    if (trash.state === "idle") void readTrash();
    if (trash.state === "idle" || trash.state === "loading") {
      list.push(quiet("Loading…", 1));
      return;
    }
    if (trash.state === "failed") {
      list.push(row({ name: trash.line + " · retry", depth: 1, muted: true, onClick: () => void readTrash() }));
      return;
    }
    if (!trash.items.length) {
      list.push(quiet("The Trash is empty", 1));
      return;
    }
    for (const item of trash.items) list.push(trashItem(item));
    if (trash.truncated) list.push(quiet(`Showing the newest ${trash.items.length}`, 1));
  }
  function trashItem(item) {
    const busy = trash.busy.has(item.id), line = trash.lines.get(item.id);
    const restore = el("button", { type: "button", class: "ex-restore", disabled: busy, title: "Put it back at " + isolate(rel(item.path)) }, busy ? "Restoring…" : FS_LABELS.restore);
    restore.addEventListener("click", () => void putBack(item));
    return el("div", { class: "ex-trash-item", style: { "--d": "1" }, "data-id": item.id, title: isolate(rel(item.path)) + "\nDeleted " + (day(item.deleted_at) || "") }, el("div", { class: "ex-trash-head" }, el("span", { class: "ex-twist-slot", "aria-hidden": "true" }), el("span", { class: "ex-name" }, isolate(trashName(item)) + (item.kind === "folder" ? "/" : "")), el("span", { class: "ex-note" }, purgeNote(item)), restore), el("p", { class: "ex-trash-from" }, isolate(trashFrom(item))), line ? el("p", { class: "ex-trash-line", role: "status" }, line) : null);
  }
  async function putBack(item, { undo = false } = {}) {
    if (trash.busy.has(item.id)) return;
    trash.busy.add(item.id);
    trash.lines.delete(item.id);
    paint();
    const answer = await fileOps.restore(item);
    trash.busy.delete(item.id);
    if (!answer.ok) {
      if (undo) say(answer.line);
      else trash.lines.set(item.id, answer.line);
      paint();
      return;
    }
    trash.items = trash.items.filter((other) => other.id !== item.id);
    afterOp(answer.done);
  }
  function afterOp(done) {
    const at = String(done.path ?? ""), from = done.from ?? null;
    if (done.origin === "work") {
      relist(parentOf(at));
      if (from) relist(parentOf(from));
      if (done.op === "rename" && from) moveDirs(from, at);
      if (done.op === "delete") moveDirs(at, null);
      if (done.op === "create" && done.kind === "folder") openDirs.add("f:" + at);
      if (done.op === "delete" && done.trash && trash.state === "ready") trash.items = [done.trash, ...trash.items.filter((item) => item.id !== done.trash.id)];
      if ((done.op === "delete" || done.op === "restore") && (trash.state !== "idle" || openDirs.has("trash"))) void readTrash();
      save();
    }
    say(doneLine(done), done.origin === "work" && done.op === "delete" && done.trash ? done.trash : null);
    try {
      filed(done);
    } catch (error) {
      console.error("Explorer:", error);
    }
    paint();
    if (done.origin === "work" && done.op === "create" && done.kind === "file") open({ kind: "file", path: at }, { from: "explorer" });
  }
  const relist = (path) => {
    if (listings.has(path)) listings.delete(path);
  };
  function moveDirs(from, to) {
    for (const id of [...openDirs]) if (id.startsWith("f:") && within(id.slice(2), from)) {
      openDirs.delete(id);
      if (to) openDirs.add("f:" + to + id.slice(2 + from.length));
    }
    for (const path of [...listings.keys()]) if (within(path, from)) listings.delete(path);
  }
  function say(text, undo = null) {
    clearTimeout(toastTimer);
    toastHeld = undo;
    const parts = [el("span", { class: "ex-toast-text" }, text)];
    if (undo) {
      const button = el("button", { type: "button", class: "ex-toast-undo", title: "Put " + isolate(trashName(undo)) + " back at " + isolate(rel(undo.path)) }, "Undo");
      button.addEventListener("click", () => {
        button.disabled = true;
        clearTimeout(toastTimer);
        void putBack(undo, { undo: true });
      });
      parts.push(button);
    }
    toast.replaceChildren(...parts);
    toast.hidden = false;
    hideLater();
  }
  const hideLater = () => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.replaceChildren();
      toastHeld = null;
    }, toastHeld ? UNDO_TOAST : TOAST);
  };
  toast.addEventListener("pointerenter", () => clearTimeout(toastTimer));
  toast.addEventListener("pointerleave", () => {
    if (!toast.hidden) hideLater();
  });
  function toggleDir(id) {
    if (openDirs.has(id)) openDirs.delete(id);
    else {
      openDirs.add(id);
      if (id.startsWith("f:") && listings.get(id.slice(2))?.state !== "loading") listings.delete(id.slice(2));
      if (id === "rb:archive") void store.archive();
      if (id === "trash") void readTrash();
    }
    save();
    paint();
  }
  function reveal(target, { dir = false } = {}) {
    if (target?.kind !== "file") return;
    const root = roots.find((item) => target.path === item.path || target.path.startsWith(item.path + "/"));
    if (!root) return;
    let at = root.path;
    openDirs.add("f:" + at);
    folds.files = false;
    const parts = target.path.slice(root.path.length + 1).split("/").filter(Boolean);
    for (const part of dir ? parts : parts.slice(0, -1)) {
      at += "/" + part;
      openDirs.add("f:" + at);
    }
    save();
    paint();
    requestAnimationFrame(() => sections.querySelector(`.ex-row[data-key="${CSS.escape(keyOf(target))}"], .ex-row[title="${CSS.escape(rel(target.path))}"]`)?.scrollIntoView({ block: "nearest" }));
  }
  function extras() {
    const list = extSections(), boxes = [];
    railExtras(list);
    for (const spec of list) {
      const count = sectionCount(spec, data), body = sectionBody(spec, { open: (target) => open(target, { from: "explorer" }), api, data, refresh: later });
      const button = extRail.find((item) => item.dataset.sec === spec.id);
      button.querySelector(".ide-rail-count").textContent = count ? String(count) : "";
      button.setAttribute("aria-label", count ? `${spec.title} · ${count}` : spec.title);
      if (body) boxes.push(section(spec.id, spec.title, count, body));
    }
    return boxes;
  }
  function paint() {
    const now = globalThis.document?.activeElement, held = now && [naming?.node, asking?.node].some((box) => box?.contains(now)) ? now : null;
    const top = sections.scrollTop;
    painting = true;
    try {
      const next = [pinned(), boards(), recent(), files()].filter(Boolean), more = extras(), last = internal();
      if (typeof sections.isEqualNode !== "function") sections.replaceChildren(...next, ...more, last);
      else {
        for (const box of [...next, last]) light(box);
        place(sections, [...next.map(reuse), ...more, reuse(last)]);
      }
    } finally {
      painting = false;
    }
    lightActive();
    sections.scrollTop = top;
    status.paint();
    if (held?.isConnected && globalThis.document?.activeElement !== held) held.focus({ preventScroll: true });
  }
  let flashTimer = 0;
  function show(id) {
    if (id === "reports") id = "internal";
    const flash = (box2) => {
      clearTimeout(flashTimer);
      for (const other of node.querySelectorAll(".is-flash")) other.classList.remove("is-flash");
      box2.classList.add("is-flash");
      flashTimer = setTimeout(() => box2.classList.remove("is-flash"), FLASH);
    };
    if (folds[id]) {
      folds[id] = false;
      save();
      paint();
    }
    const box = sections.querySelector(`[data-sec="${id}"]`);
    if (!box) return;
    sections.scrollTop = Math.max(0, box.offsetTop - sections.offsetTop);
    flash(box);
  }
  function light(root) {
    const now = current(), key = now ? keyOf(now) : null;
    for (const button of root.querySelectorAll(".ex-row[data-key]")) {
      if (key && button.dataset.key === key) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }
  const lightActive = () => light(sections);
  function reuse(box) {
    const was = [...sections.children].find((node2) => node2.dataset.sec === box.dataset.sec);
    if (!was || was.isEqualNode(box)) return was ?? box;
    const [head2, body] = box.children, [wasHead, wasBody] = was.children;
    if (!wasHead?.isEqualNode(head2) || !wasBody || was.classList.contains("is-shut") !== box.classList.contains("is-shut")) return box;
    const pool = new Map();
    for (const node2 of wasBody.children) {
      const html = node2.outerHTML;
      if (!pool.has(html)) pool.set(html, []);
      pool.get(html).push(node2);
    }
    place(wasBody, [...body.children].map((node2) => pool.get(node2.outerHTML)?.shift() ?? node2));
    return was;
  }
  let frame = 0, statusFrame = 0;
  const later = () => {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
    });
  };
  const laterStatus = () => {
    if (!frame && !statusFrame) statusFrame = requestAnimationFrame(() => {
      statusFrame = 0;
      status.paint();
    });
  };
  const offs = [on("active", lightActive), on("recent", later), on("pins", later), on("seen", later), on("data", (what) => {
    if (what !== "ledger" || !store.subscribe) later();
  }), store.subscribe?.(laterStatus) ?? (() => {
  }), onRegistry((what) => {
    if (what === "sections") later();
  })];
  void store.tree(null).then((answer) => {
    const found = answer.ok ? (answer.body.entries ?? []).filter((item) => item.kind === "dir" && typeof item.path === "string") : [];
    if (found.length) {
      roots = found.map((item) => ({ name: item.name, path: item.path }));
      paint();
    }
  });
  void store.reports();
  void store.boards();
  void store.archive();
  paint();
  function removed(path) {
    moveDirs(path, null);
    relist(parentOf(path));
    paint();
  }
  return { node, rail, pops: status.pops, paint, reveal, show, removed, focusSearch: () => search.focus(), destroy() {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(statusFrame);
    clearTimeout(flashTimer);
    clearTimeout(toastTimer);
    status.destroy();
    for (const off of offs) off();
  } };
}
