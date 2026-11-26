import { el } from "../boards/dom.js";
import { keyOf } from "./core.js";
import { quickRows, findNames, searchDocs } from "./find.js";
export function marked(text, query) {
  const words = String(query).toLocaleLowerCase().split(/\s+/).map((word) => word.replace(/^#/, "")).filter(Boolean);
  if (!words.length) return [text];
  const lower = text.toLocaleLowerCase(), hits = [];
  for (const word of words) {
    const at2 = lower.indexOf(word);
    if (at2 >= 0) hits.push([at2, at2 + word.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let at = 0;
  for (const [start, end] of hits) {
    if (start < at) continue;
    parts.push(text.slice(at, start), el("b", {}, text.slice(start, end)));
    at = end;
  }
  parts.push(text.slice(at));
  return parts.filter((part) => part !== "");
}
export function createQuick({ store, lists, open, dir = () => {
}, act = () => {
}, onClose = () => {
}, accept = () => true, api }) {
  const data = store.data;
  const field = el("input", { class: "qo-field", type: "text", placeholder: "Goal number, report, board or file name…", "aria-label": "Quick open", autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "true", "aria-controls": "qo-list" });
  const byName = el("button", { type: "button", class: "text-control qo-mode", "aria-pressed": "true", title: "Find by name · ⌘K" }, el("span", { class: "control-label" }, "Names"));
  const byText = el("button", { type: "button", class: "text-control qo-mode", "aria-pressed": "false", title: "Find in documents · ⌘⇧F" }, el("span", { class: "control-label" }, "Contents"));
  const list = el("div", { class: "qo-list", id: "qo-list", role: "listbox", "aria-label": "Results" });
  const line = el("p", { class: "qo-line", role: "status", hidden: true });
  const hint = el("p", { class: "qo-hint" }, el("span", {}, "↑↓ pick · Enter open · Tab names/contents · Esc close"));
  const box = el("div", { class: "qo chat", role: "dialog", "aria-label": "Quick open", hidden: true }, el("div", { class: "qo-head" }, field, el("span", { class: "qo-modes" }, byName, byText)), list, line, hint);
  const scrim = el("div", { class: "qo-scrim", hidden: true });
  document.body.append(scrim, box);
  let rows = [], pick = 0, shown = false, lastFocus = null, mode = "names", hits = [], hitLine = null, asked = null, timer = 0;
  const options = api ? { api } : {};
  function say(text) {
    line.textContent = text ?? "";
    line.hidden = !text;
  }
  function draw(nodes) {
    if (!rows.length) nodes.push(el("p", { class: "qo-empty" }, mode === "text" && field.value.trim().length < 2 ? "Type words to find in the documents" : asked ? "Searching…" : "Nothing found"));
    list.replaceChildren(...nodes);
    light();
  }
  function paintNames() {
    const found = quickRows(field.value, { data, lists, hits, ledger: false }).filter(accept);
    rows = found.map((item) => ({ target: item.target, dir: item.dir, act: item.act }));
    pick = Math.min(pick, Math.max(0, rows.length - 1));
    const nodes = [];
    let group = null;
    found.forEach((item, n) => {
      if (item.group !== group) {
        group = item.group;
        nodes.push(el("p", { class: "qo-group", role: "presentation" }, group));
      }
      nodes.push(option(n, item.key, [el("span", { class: "qo-name" }, ...marked(item.name, field.value)), el("span", { class: "qo-detail" }, item.detail)]));
    });
    say(hitLine);
    draw(nodes);
  }
  function paintText(result) {
    rows = [];
    const nodes = [];
    for (const group of result?.groups ?? []) {
      nodes.push(el("p", { class: "qo-group qo-file", role: "presentation", title: group.where }, el("span", { class: "qo-name" }, group.name), el("span", { class: "qo-detail" }, group.where)));
      for (const hit of group.hits) {
        const n = rows.length;
        rows.push({ target: group.target, find: field.value.trim(), line: hit.line });
        nodes.push(option(n, keyOf(group.target) + ":" + hit.line, [el("span", { class: "qo-lineno" }, String(hit.line)), el("span", { class: "qo-snippet" }, ...marked(hit.snippet, field.value))]));
      }
    }
    pick = Math.min(pick, Math.max(0, rows.length - 1));
    say(result?.line ?? null);
    draw(nodes);
  }
  function option(n, key, parts) {
    const button = el("button", { type: "button", class: "qo-row ide-row", role: "option", id: "qo-" + n, "aria-selected": String(n === pick), "data-key": key }, ...parts);
    button.addEventListener("pointermove", () => {
      if (pick !== n) {
        pick = n;
        light();
      }
    });
    button.addEventListener("click", () => choose(n));
    return button;
  }
  function light() {
    for (const button of list.querySelectorAll(".qo-row")) button.setAttribute("aria-selected", String(button.id === "qo-" + pick));
    const now = list.querySelector("#qo-" + pick);
    field.setAttribute("aria-activedescendant", now ? now.id : "");
    now?.scrollIntoView({ block: "nearest" });
  }
  function ask() {
    clearTimeout(timer);
    asked?.abort();
    asked = null;
    const query = field.value, now = new AbortController();
    if (mode === "names") {
      hits = [];
      hitLine = null;
      if (query.trim()) asked = now;
      paintNames();
      if (!query.trim()) return;
      timer = setTimeout(() => {
        findNames(query, { ...options, signal: now.signal }).then((result) => {
          if (asked !== now) return;
          asked = null;
          hits = result.hits;
          hitLine = result.line;
          paintNames();
        }, () => {
        });
      }, 120);
      return;
    }
    if (query.trim().length < 2) {
      paintText(null);
      return;
    }
    asked = now;
    paintText({ groups: [], line: null });
    timer = setTimeout(() => {
      searchDocs(query, { ...options, signal: now.signal }).then((result) => {
        if (asked !== now) return;
        asked = null;
        paintText(result);
      }, () => {
      });
    }, 280);
  }
  function setMode(next) {
    mode = next;
    byName.setAttribute("aria-pressed", String(mode === "names"));
    byText.setAttribute("aria-pressed", String(mode === "text"));
    field.placeholder = mode === "names" ? "Goal number, report, board or file name…" : "Find in documents (two characters or more)";
    box.dataset.mode = mode;
    pick = 0;
    ask();
    field.focus();
  }
  function choose(n) {
    const item = rows[n];
    if (!item) return;
    hide();
    if (item.act) act(item.act);
    else if (item.dir) dir(item.target);
    else open(item.target, item.find ? { from: "search", find: item.find } : { from: "quick" });
  }
  field.addEventListener("input", () => {
    pick = 0;
    ask();
  });
  field.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length) {
        pick = (pick + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
        light();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(pick);
    } else if (event.key === "Escape") {
      event.preventDefault();
      hide();
    } else if (event.key === "Tab") {
      event.preventDefault();
      setMode(mode === "names" ? "text" : "names");
    }
  });
  byName.addEventListener("click", () => setMode("names"));
  byText.addEventListener("click", () => setMode("text"));
  scrim.addEventListener("pointerdown", () => hide());
  function show(query = "", how = "names") {
    lastFocus = document.activeElement;
    shown = true;
    box.hidden = false;
    scrim.hidden = false;
    field.value = query;
    pick = 0;
    setMode(how);
    field.select();
  }
  function hide() {
    if (!shown) return;
    shown = false;
    clearTimeout(timer);
    asked?.abort();
    asked = null;
    box.hidden = true;
    scrim.hidden = true;
    onClose();
    if (lastFocus?.isConnected && !lastFocus.closest?.(".qo")) lastFocus.focus?.({ preventScroll: true });
  }
  return { node: box, show, hide, get shown() {
    return shown;
  }, get mode() {
    return mode;
  }, type(value) {
    field.value = value;
    pick = 0;
    ask();
  }, destroy() {
    hide();
    box.remove();
    scrim.remove();
  } };
}
