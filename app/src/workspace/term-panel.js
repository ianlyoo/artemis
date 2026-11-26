import { el } from "../boards/dom.js";
import { control } from "../chat/visuals.js";
import { iconButton, setIcon } from "./icons.js";
import { dragTerm } from "./panes.js";
import { mountTerminal, keyRow, closeTerminal, holdKey } from "./terminal.js";
import { termName, saved, on } from "./core.js";
import { termReadOnly, termStatus, closeAsks, listLine, waitsOnOwner, isHome, termWhere, newTerminal, warmTerminal, NEW_LINES, panel as step } from "./terms.js";
import { lead } from "../names.js";
export const MOUNT_CAP = 6, MOUNT_IDLE = 30 * 6e4;
export const WARM_EVERY = 3e4, WARM_AFTER = 1500;
const LIST_AGAIN = 400;
const HIDE_SLACK = 100, HIDE_MOST = 2e3;
export const HINT_KEY = "term-hint";
export function hintOnce(term, store = saved) {
  if (!term || termReadOnly(term) || store.read(HINT_KEY, false) === true) return false;
  store.write(HINT_KEY, true);
  return true;
}
export function closeLine(terms, all = false) {
  const leads = terms.filter((term) => !isHome(term)).length, its = ` (${lead()}'s)`;
  if (!all) return `Close ${termName(terms[0])}${leads ? its : ""}? Whatever runs in it stops too.`;
  if (terms.length === 1) return `Close the one terminal${leads ? its : ""}? Whatever runs in it stops too.`;
  return `Close all ${terms.length} terminals${leads ? ` (${leads} of them ${lead()}'s)` : ""}? Whatever runs in them stops too.`;
}
function transitionTime(node, win) {
  const style = win?.getComputedStyle?.(node);
  if (!style || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
  const times = (list) => String(list ?? "").split(",").map((value) => (parseFloat(value) || 0) * (/ms\s*$/.test(value) ? 1 : 1e3));
  const durations = times(style.transitionDuration), delays = times(style.transitionDelay);
  return Math.max(0, ...durations.map((duration, at) => duration + delays[at % delays.length]));
}
function afterTransition(node, time, done) {
  const stop = () => {
    clearTimeout(timer);
    node.removeEventListener("transitionend", end);
    node.removeEventListener("transitioncancel", end);
  };
  const finish = () => {
    stop();
    done();
  };
  const end = (event) => {
    if (event.target === node && !node.getAnimations?.().some((animation) => animation.playState === "running")) finish();
  };
  node.addEventListener("transitionend", end);
  node.addEventListener("transitioncancel", end);
  const timer = setTimeout(finish, Math.min(time, HIDE_MOST) + HIDE_SLACK);
  return stop;
}
export function createTermPanel({ store, root, kept = {}, remember = () => {
}, say = () => {
}, onLayout = () => {
}, mount = mountTerminal, close = closeTerminal, create = newTerminal, warm = warmTerminal, now = () => Date.now(), win = globalThis.window }) {
  const data = store.data;
  let state = { list: kept.list ?? [], active: kept.active ?? null, open: !!kept.open, share: kept.share ?? null, line: !!kept.line };
  const mounted = new Map();
  let destroyed = false, hiding = null, away = false, opening = false, warmed = -Infinity, warmTimer = 0;
  let typed = "", handing = null;
  const toggles = [];
  let waits = false;
  const paintToggle = (button) => {
    button.setAttribute("aria-pressed", String(state.open));
    button.classList.toggle("is-owner", waits);
    setIcon(button, "terminal", waits ? "Terminal · needs input" : "Terminal");
  };
  function toggleButton(prefix = "") {
    const button = iconButton("terminal", "Terminal", { key: "⌘J", class: (prefix ? prefix + "terminal " : "") + "ide-termtoggle" });
    button.addEventListener("click", toggle);
    toggles.push(button);
    paintToggle(button);
    return button;
  }
  const tabs = el("div", { class: "ide-termtabs", role: "tablist", "aria-label": "Terminals" });
  const lineToggle = iconButton("keyboard", "Line input (Korean typing)", { class: "term-inputtoggle", "aria-pressed": String(state.line) });
  const closeAll = iconButton("power", "Close all", { class: "term-closeall" });
  const fold = iconButton("down", "Hide the terminal", { key: "⌘J", class: "term-fold" });
  const yes = control("Close", { class: "term-ask-yes" }), no = control("Keep it", { class: "term-ask-no" });
  const askText = el("span", { class: "ide-term-ask-text" });
  const ask = el("div", { class: "ide-term-ask", role: "alertdialog", "aria-label": "Close terminals", hidden: true }, askText, yes, no);
  let asking = null;
  const closing = new Set();
  const edge = el("div", { class: "ide-term-edge ide-edge", role: "separator", "aria-orientation": "horizontal", "aria-label": "Terminal height", title: "Drag to resize · double-click to reset" });
  const newButton = iconButton("plus", "New terminal", { class: "ide-termnew" });
  const offer = control("New terminal", { class: "ide-term-offer" });
  const emptyText = el("span", { class: "ide-term-empty-text" });
  const empty = el("p", { class: "ide-term-empty", hidden: true }, emptyText, offer);
  const notice = el("p", { class: "ide-term-notice", role: "alert", hidden: true });
  const body = el("div", { class: "ide-term-body" });
  const node = el("section", { class: "ide-term", "aria-label": "Terminal", hidden: true }, edge, el("header", { class: "ide-term-head" }, el("h2", { class: "ide-term-title" }, "Terminal"), el("div", { class: "ide-termstrip" }, tabs, newButton), el("span", { class: "ide-term-ctl" }, lineToggle, closeAll, fold)), ask, notice, empty, body);
  const putShare = () => {
    if (state.share) root.style.setProperty("--term-h", (state.share * 100).toFixed(2) + "%");
    else root.style.removeProperty("--term-h");
  };
  putShare();
  const save = () => remember({ list: state.list, active: state.active, open: state.open, share: state.share, line: state.line });
  function mountOne(id) {
    if (mounted.has(id)) return mounted.get(id);
    const host = el("div", { class: "ide-term-host", "data-term": id });
    body.append(host);
    const readOnly = termReadOnly(data.terminals.find((term) => term.id === id));
    const made = { host, mode: state.line ? "line" : "xterm", readOnly, ended: null, handle: null };
    const early = handing?.id === id ? handing.typed : "", hint = hintOnce(data.terminals.find((term) => term.id === id));
    made.handle = mount(host, { id, readOnly, input: made.mode, onExit: ({ reason }) => {
      made.ended = reason;
      void refresh(true);
    }, ...early ? { typed: early } : {}, ...hint ? { hint } : {}, ...handing?.id === id ? { fresh: true } : {} });
    made.used = now();
    mounted.set(id, made);
    while (mounted.size > MOUNT_CAP) {
      const [oldest] = [...mounted].filter(([other]) => other !== id).sort(([, a], [, b]) => a.used - b.used)[0];
      unmount(oldest);
    }
    return made;
  }
  function unmount(id) {
    const made = mounted.get(id);
    if (!made) return;
    made.handle.dispose();
    made.host.remove();
    mounted.delete(id);
  }
  const onScreen = () => state.open && !away && !destroyed && globalThis.document?.visibilityState !== "hidden";
  function sweep() {
    const at = now();
    for (const [id, item] of [...mounted]) {
      if (id === state.active && onScreen()) item.used = at;
      else if (at - item.used >= MOUNT_IDLE) unmount(id);
    }
  }
  function warmUp(again = false) {
    if (destroyed || away || globalThis.document?.visibilityState === "hidden" || !again && now() - warmed < WARM_EVERY) return;
    warmed = now();
    Promise.resolve().then(() => warm()).catch(() => false);
  }
  function paint() {
    const listed = data.terminals;
    for (const [id, made] of mounted) if (!made.readOnly && termReadOnly(listed.find((term) => term.id === id))) {
      made.readOnly = true;
      made.handle.freeze();
    }
    tabs.replaceChildren(...listed.map((term) => {
      const shown = term.id === state.active, status = termStatus(term);
      const home = isHome(term), where = termWhere(term, listed);
      const button = el("button", { type: "button", class: "ide-termtab" + (shown ? " is-active" : ""), role: "tab", "aria-selected": String(shown), "data-term": term.id, "data-owner": home ? "home" : "lead", title: termName(term) + (term.cwd ? " · " + term.cwd : "") + (home ? " · opened from Home" : " · opened by " + lead()) }, el("span", { class: "ide-termtab-name" }, termName(term)), where ? el("span", { class: "ide-termtab-where" }, where) : null, status.line ? el("span", { class: "ide-termtab-state" + (status.owner ? " is-owner" : "") }, status.line) : null);
      button.addEventListener("click", () => show(term.id));
      const x = iconButton("close", "Close " + termName(term), { class: "ide-termtab-x is-small", "data-term": term.id });
      x.addEventListener("click", () => closeOne(term.id, x));
      return el("div", { class: "ide-termtab-item" + (shown ? " is-active" : ""), role: "presentation" }, button, termReadOnly(term) ? null : x);
    }));
    const line = listLine(data.termState, listed);
    emptyText.textContent = line ?? "";
    empty.hidden = !line || listed.some((term) => term.id === state.active);
    for (const button of [newButton, offer]) {
      button.setAttribute("aria-disabled", String(opening));
      button.setAttribute("aria-busy", String(opening));
    }
    const active = listed.some((term) => term.id === state.active) ? state.active : null;
    if (state.open && active) {
      let made = mountOne(active);
      for (const [id, item] of mounted) item.host.hidden = id !== active;
      if (!made.readOnly && made.mode !== (state.line ? "line" : "xterm")) {
        unmount(active);
        made = mountOne(active);
      }
      made.used = now();
    } else for (const item of mounted.values()) item.host.hidden = true;
    lineToggle.hidden = !active || termReadOnly(listed.find((term) => term.id === active));
    closeAll.hidden = !listed.some((term) => !termReadOnly(term));
    lineToggle.setAttribute("aria-pressed", String(state.line));
    root.dataset.term = state.open ? "open" : "shut";
    if (state.open) {
      hiding?.();
      hiding = null;
      node.hidden = false;
    } else if (!node.hidden && !hiding) {
      const time = transitionTime(node, win);
      if (time) hiding = afterTransition(node, time, () => {
        hiding = null;
        node.hidden = true;
        onLayout();
      });
      else node.hidden = true;
    }
    waits = waitsOnOwner(listed);
    for (const button of toggles) paintToggle(button);
    onLayout();
  }
  function tell(line) {
    notice.textContent = line ?? "";
    notice.hidden = !line;
  }
  function focusShown() {
    const made = mounted.get(state.active);
    if (made) made.handle.focus();
    else if (!empty.hidden) offer.focus();
  }
  function show(id) {
    state = step.show(state, id);
    hideAsk();
    tell(null);
    save();
    paint();
    focusShown();
  }
  function refuse(line) {
    hideAsk();
    if (!state.open) {
      state = { ...state, open: true };
      save();
    }
    paint();
    tell(line);
  }
  function toggle() {
    state = step.toggle(state, data.terminals);
    hideAsk();
    tell(null);
    save();
    paint();
    if (state.open) {
      warmUp();
      void refresh(true);
      focusShown();
    }
  }
  async function open({ cwd = null } = {}) {
    if (opening || destroyed) return null;
    opening = true;
    tell(null);
    hideAsk();
    if (!state.open) {
      state = { ...state, open: true };
      save();
    }
    paint();
    if (document.activeElement !== offer) newButton.focus();
    let answer;
    try {
      answer = await create({ cwd });
    } catch {
      answer = { ok: false, line: NEW_LINES.failed };
    }
    if (destroyed) return null;
    if (!answer.ok) {
      opening = false;
      typed = "";
      tell(answer.line);
      paint();
      return null;
    }
    const id = answer.terminal.id;
    await store.terminals({ force: true });
    if (!data.terminals.some((term) => term.id === id)) {
      await new Promise((done) => setTimeout(done, LIST_AGAIN));
      await store.terminals({ force: true });
    }
    opening = false;
    if (destroyed) return null;
    handing = { id, typed };
    typed = "";
    show(id);
    handing = null;
    warmUp(true);
    return id;
  }
  async function refresh(force = false) {
    await store.terminals({ force });
    sync();
  }
  function sync() {
    if (destroyed) return;
    sweep();
    const next = step.prune(state, data.termState, data.terminals);
    for (const id of state.list) if (!next.list.includes(id)) unmount(id);
    if (data.termState === "ready") {
      for (const id of [...mounted.keys()]) if (!data.terminals.some((term) => term.id === id)) unmount(id);
    }
    if (next !== state) {
      state = next;
      save();
    }
    paint();
  }
  const stopTerms = on("data", (what) => {
    if (what === "terms") sync();
  });
  const visible = () => {
    if (globalThis.document?.visibilityState === "visible" && !away) warmUp();
  };
  globalThis.document?.addEventListener?.("visibilitychange", visible);
  fold.addEventListener("click", toggle);
  newButton.addEventListener("click", () => void open());
  offer.addEventListener("click", () => void open());
  node.addEventListener("keydown", (event) => {
    if (!opening || event.target !== newButton && event.target !== offer) return;
    const next = holdKey(typed, event, state.line);
    if (next !== null) {
      event.preventDefault();
      typed = next;
    }
  });
  lineToggle.addEventListener("click", () => {
    if (!state.active || termReadOnly(data.terminals.find((term) => term.id === state.active))) return;
    state = { ...state, line: !state.line };
    save();
    unmount(state.active);
    paint();
    focusShown();
  });
  function hideAsk() {
    asking = null;
    ask.hidden = true;
  }
  function askClose(ids, from) {
    const terms = data.terminals.filter((term) => ids.includes(term.id) && !termReadOnly(term)), all = from === closeAll;
    if (!terms.length) return;
    asking = { ids: terms.map((term) => term.id), from };
    askText.textContent = closeLine(terms, all);
    yes.querySelector(".control-label").textContent = all && terms.length > 1 ? "Close all" : "Close";
    no.querySelector(".control-label").textContent = terms.length > 1 ? "Keep them" : "Keep it";
    ask.hidden = false;
    no.focus();
  }
  function afterClose(gone) {
    const listed = data.terminals.map((term) => term.id), was = state.active, open2 = state.open;
    for (const id of gone) {
      unmount(id);
      state = step.drop(state, id);
    }
    if (!gone.includes(was)) return;
    const at = listed.indexOf(was), next = [...listed.slice(at + 1), ...listed.slice(0, Math.max(at, 0)).reverse()].find((id) => !gone.includes(id));
    if (next && open2) state = step.show(state, next);
  }
  function closeOne(id, from) {
    const term = data.terminals.find((item) => item.id === id);
    if (!term || termReadOnly(term)) return;
    if (closeAsks(term, mounted.get(id)?.handle)) {
      askClose([id], from);
      return;
    }
    hideAsk();
    void closeIds([id]);
  }
  async function closeIds(asked) {
    const ids = asked.filter((id) => !closing.has(id) && data.terminals.some((term) => term.id === id && !termReadOnly(term)));
    if (!ids.length) return;
    for (const id of ids) closing.add(id);
    const results = await Promise.all(ids.map((id) => Promise.resolve().then(() => close(id)).catch(() => false)));
    for (const id of ids) closing.delete(id);
    if (destroyed) return;
    const gone = ids.filter((id, at) => results[at]), failed = ids.length - gone.length;
    if (gone.length) {
      afterClose(gone);
      save();
    }
    say(failed ? ids.length === 1 ? "Couldn't close the terminal" : `Couldn't close ${failed} of ${ids.length} terminals` : gone.length === 1 ? "Terminal closed" : `Closed ${gone.length} terminals`);
    await refresh(true);
    if (state.open) focusShown();
    else (toggles.find((button) => button.getClientRects?.().length) ?? toggles[0])?.focus();
  }
  closeAll.addEventListener("click", () => askClose(data.terminals.map((term) => term.id), closeAll));
  no.addEventListener("click", () => {
    const back = asking?.from;
    hideAsk();
    if (back?.isConnected) back.focus();
    else focusShown();
  });
  yes.addEventListener("click", () => {
    const job = asking;
    hideAsk();
    if (job) void closeIds(job.ids);
  });
  let drag = null;
  edge.addEventListener("pointerdown", (event) => {
    drag = { y: event.clientY, h: node.getBoundingClientRect().height, total: node.parentElement?.getBoundingClientRect().height || innerHeight };
    edge.setPointerCapture?.(event.pointerId);
    root.classList.add("is-resizing");
  });
  edge.addEventListener("pointermove", (event) => {
    if (drag) {
      state = { ...state, share: dragTerm({ height: drag.total }, drag.h + drag.y - event.clientY) };
      putShare();
    }
  });
  const dragged = () => {
    if (!drag) return;
    drag = null;
    root.classList.remove("is-resizing");
    save();
    onLayout();
  };
  edge.addEventListener("pointerup", dragged);
  edge.addEventListener("pointercancel", dragged);
  edge.addEventListener("dblclick", () => {
    state = { ...state, share: null };
    putShare();
    save();
    onLayout();
  });
  paint();
  void refresh();
  warmTimer = setTimeout(() => warmUp(), WARM_AFTER);
  return { node, toggleButton, toggle, show, refresh, refuse, newTerminal: open, get state() {
    return state;
  }, handle: (id) => mounted.get(id ?? state.active)?.handle ?? null, away(on2) {
    away = !!on2;
    if (!away) {
      warmUp();
      void refresh();
    }
  }, get mounted() {
    return [...mounted.keys()];
  }, sweep, destroy() {
    destroyed = true;
    stopTerms();
    clearTimeout(warmTimer);
    globalThis.document?.removeEventListener?.("visibilitychange", visible);
    hiding?.();
    hiding = null;
    for (const id of [...mounted.keys()]) unmount(id);
    node.remove();
    for (const button of toggles) button.remove();
  } };
}
export const PHONE_LINE = "phone-term-line", PHONE_SIZE = "phone-term-size";
export function mountPhoneTerminal(host, { id, readOnly = false, onExit = () => {
}, hint = false, mount = mountTerminal, row = keyRow, store = saved }) {
  let line = store.read(PHONE_LINE, false) === true, size = store.read(PHONE_SIZE, null), handle = null, keys = null;
  const toggle = iconButton("keyboard", "Line input (Korean typing)", { class: "ap-term-line", "aria-pressed": String(line) });
  const put = (first) => {
    handle?.dispose();
    keys?.remove();
    handle = mount(host, { id, readOnly, input: line ? "line" : "xterm", onExit, ...first && hint ? { hint } : {}, ...Number.isFinite(size) ? { size } : {} });
    keys = readOnly ? null : row(handle);
    if (keys) host.append(keys);
    toggle.hidden = readOnly;
  };
  put(true);
  toggle.addEventListener("click", () => {
    if (readOnly) return;
    line = !line;
    store.write(PHONE_LINE, line);
    toggle.setAttribute("aria-pressed", String(line));
    put(false);
    handle.focus?.();
  });
  const tap = (event) => {
    if (!line && !event.target?.closest?.(".term-keys,.term-hint,.term-catch")) handle.focus?.();
  };
  host.addEventListener("click", tap);
  const stopPinch = pinch(host, () => handle, (px) => {
    size = px;
    store.write(PHONE_SIZE, px);
  });
  return { get handle() {
    return handle;
  }, get keys() {
    return keys;
  }, toggle, freeze() {
    readOnly = true;
    handle.freeze();
    keys?.remove();
    keys = null;
    toggle.hidden = true;
  }, dispose() {
    handle.dispose();
    keys?.remove();
    host.removeEventListener("click", tap);
    stopPinch();
    toggle.remove();
  } };
}
function pinch(host, current, keep) {
  let from = null;
  const gap = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) || 1;
  const down = (event) => {
    if (event.touches?.length !== 2) return;
    from = { gap: gap(event.touches), size: current()?.textSize?.() ?? null };
    event.stopPropagation();
  };
  const move = (event) => {
    if (!from || event.touches?.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    if (from.size) current()?.textSize?.(from.size * gap(event.touches) / from.gap);
  };
  const up = (event) => {
    if (!from || event.touches?.length >= 2) return;
    const was = from;
    from = null;
    const now = current()?.textSize?.();
    if (now && now !== was.size) keep(now);
  };
  const options = { capture: true, passive: false };
  host.addEventListener("touchstart", down, options);
  host.addEventListener("touchmove", move, options);
  host.addEventListener("touchend", up, options);
  host.addEventListener("touchcancel", up, options);
  return () => {
    for (const [type, fn] of [["touchstart", down], ["touchmove", move], ["touchend", up], ["touchcancel", up]]) host.removeEventListener(type, fn, options);
  };
}
export function phoneClose(term, { gone = () => {
}, close = closeTerminal, latest = () => term, screen = () => null } = {}) {
  const text = el("span", { class: "ap-term-ask-text" }), yes = control("Close", { class: "ap-term-yes" }), no = control("Keep it", { class: "ap-term-no" });
  const ask = el("div", { class: "ap-term-ask", role: "alertdialog", "aria-label": "Close the terminal", hidden: true }, text, yes, no);
  const button = iconButton("close", "Close this terminal", { class: "ap-term-close" });
  const paint = () => {
    button.hidden = termReadOnly(latest());
    if (button.hidden) ask.hidden = true;
  };
  paint();
  let busy = false;
  async function closeNow(asked) {
    if (busy || termReadOnly(latest())) return;
    busy = true;
    yes.setAttribute("aria-busy", "true");
    let done = false;
    try {
      done = await close(term.id);
    } catch {
    }
    busy = false;
    yes.setAttribute("aria-busy", "false");
    if (!done) {
      text.textContent = "Couldn't close the terminal · try again";
      if (!asked) {
        ask.hidden = false;
        no.focus();
      }
      return;
    }
    ask.hidden = true;
    await gone();
  }
  button.addEventListener("click", () => {
    if (termReadOnly(latest())) return;
    if (!closeAsks(latest(), screen())) {
      void closeNow(false);
      return;
    }
    text.textContent = closeLine([term]);
    ask.hidden = false;
    no.focus();
  });
  no.addEventListener("click", () => {
    ask.hidden = true;
    button.focus();
  });
  yes.addEventListener("click", () => void closeNow(true));
  return { button, ask, paint };
}
export function phoneTermList({ data, open = () => {
}, create = async () => null, refresh = async () => {
}, close = closeTerminal }) {
  const newButton = iconButton("plus", "New terminal", { class: "ap-term-new" }), closeAll = iconButton("power", "Close all", { class: "ap-term-all" });
  const text = el("span", { class: "ap-term-ask-text" }), yes = control("Close", { class: "ap-term-yes" }), no = control("Keep it", { class: "ap-term-no" });
  const ask = el("div", { class: "ap-term-ask", role: "alertdialog", "aria-label": "Close terminals", hidden: true }, text, yes, no);
  const notice = el("p", { class: "ap-quiet ap-term-notice", role: "alert", hidden: true });
  const rows = el("div", { class: "ap-term-rows" });
  const body = el("div", { class: "ap-terms" }, ask, notice, rows);
  let asking = null, closing = false, making = false;
  const tell = (line) => {
    notice.textContent = line ?? "";
    notice.hidden = !line;
  };
  function paint() {
    const listed = data.terminals ?? [];
    rows.replaceChildren(...listed.length ? listed.map((term) => {
      const status = termStatus(term), note = [termWhere(term, listed), status.line].filter(Boolean).join(" · ");
      const row = el("button", { type: "button", class: "ap-row ide-row" + (status.owner ? " is-owner" : ""), "data-term": term.id, onclick: () => open(term.id) }, el("span", { class: "ap-row-name" }, termName(term)), note ? el("span", { class: "ap-row-note" }, note) : null);
      const x = iconButton("close", "Close " + termName(term), { class: "ap-term-x", "data-term": term.id });
      x.addEventListener("click", () => askClose([term.id], x));
      return el("div", { class: "ap-term-item" }, row, termReadOnly(term) ? null : x);
    }) : [el("p", { class: "ap-quiet" }, listLine(data.termState, listed) ?? "No terminals open")]);
    closeAll.hidden = !listed.some((term) => !termReadOnly(term));
    newButton.setAttribute("aria-busy", String(making));
  }
  const hideAsk = () => {
    asking = null;
    ask.hidden = true;
  };
  function askClose(ids, from) {
    const terms = (data.terminals ?? []).filter((term) => ids.includes(term.id) && !termReadOnly(term)), all = from === closeAll;
    if (!terms.length) return;
    asking = { ids: terms.map((term) => term.id), from };
    text.textContent = closeLine(terms, all);
    tell(null);
    yes.querySelector(".control-label").textContent = all && terms.length > 1 ? "Close all" : "Close";
    no.querySelector(".control-label").textContent = terms.length > 1 ? "Keep them" : "Keep it";
    ask.hidden = false;
    no.focus();
  }
  async function closeIds(ids) {
    if (closing) return;
    ids = ids.filter((id) => (data.terminals ?? []).some((term) => term.id === id && !termReadOnly(term)));
    if (!ids.length) {
      hideAsk();
      return;
    }
    closing = true;
    yes.setAttribute("aria-busy", "true");
    const results = await Promise.all(ids.map((id) => Promise.resolve().then(() => close(id)).catch(() => false)));
    closing = false;
    yes.setAttribute("aria-busy", "false");
    hideAsk();
    const failed = results.filter((done) => !done).length;
    tell(!failed ? null : ids.length === 1 ? "Couldn't close the terminal · try again" : `Couldn't close ${failed} of ${ids.length} terminals`);
    await refresh();
    paint();
  }
  newButton.addEventListener("click", async () => {
    if (making) return;
    making = true;
    hideAsk();
    tell(null);
    paint();
    let line = null;
    try {
      line = await create();
    } catch {
      line = NEW_LINES.failed;
    }
    making = false;
    tell(line);
    paint();
  });
  closeAll.addEventListener("click", () => askClose((data.terminals ?? []).map((term) => term.id), closeAll));
  no.addEventListener("click", () => {
    const back = asking?.from;
    hideAsk();
    if (back?.isConnected) back.focus();
  });
  yes.addEventListener("click", () => {
    const job = asking;
    if (job) void closeIds(job.ids);
  });
  paint();
  return { head: [newButton, closeAll], body, paint };
}
