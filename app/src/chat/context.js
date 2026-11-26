import { el, svg } from "../boards/dom.js";
import { control } from "./visuals.js";
import { refMark } from "./step-words.js";
import { lead } from "../names.js";
export const PARTS = Object.freeze([{ id: "system", name: "System prompt" }, { id: "tools", name: "Tools" }, { id: "files", name: "Files" }, { id: "conversation", name: "Conversation" }, { id: "memory", name: "Memory" }]);
export const CELLS = 200;
const askFor = (name) => ({ compact: { question: "Compact the conversation?", detail: `Sends /compact to ${name}`, yes: "Compact" }, renew: { question: "Start a new chat?", detail: `Sends /clear to ${name}`, yes: "Start" }, restart: { question: "Start a new chat?", detail: `${name} starts a new session at the next pause`, yes: "Start" } });
export const ACTS = Object.freeze({ compact: { text: "/compact", told: "Compact sent · the numbers drop once it is done" }, renew: { text: "/clear", told: "New chat sent · the chat says when it starts" }, restart: { told: "New chat asked for · the chat says when it starts" } });
export const busyLine = (name = lead()) => `Can't compact while ${name} is answering`;
export const BUSY = busyLine();
export const NOT_SENT = "Not sent · you can send it again from the chat";
const SENDING = "Sending…";
export const WARN = 80, FULL = 95;
export function tokens(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1e6) return +(n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return +(n / 1e3).toFixed(n >= 1e5 && n % 1e3 < 50 ? 0 : 1) + "K";
  return String(Math.round(n));
}
export function share(part, max) {
  const p = max > 0 ? part / max * 100 : 0;
  return (p < 10 ? +p.toFixed(1) : Math.round(p)) + "%";
}
export function cells(context) {
  const per = context.max / CELLS, used = Math.min(CELLS, Math.round(context.used / per));
  if (!context.parts) return [...Array(used).fill("used"), ...Array(CELLS - used).fill("free")];
  const sizes = PARTS.map((part) => context.parts[part.id] ?? 0), sum = sizes.reduce((a, b) => a + b, 0) || 1;
  const exact = sizes.map((size) => size / sum * used), counts = exact.map(Math.floor);
  const order = exact.map((value, n) => [value - counts[n], n]).sort((a, b) => b[0] - a[0]);
  for (let k = 0, left = used - counts.reduce((a, b) => a + b, 0); k < left; k++) counts[order[k % order.length][1]]++;
  return [...PARTS.flatMap((part, n) => Array(counts[n]).fill(part.id)), ...Array(CELLS - used).fill("free")];
}
export const toneOf = (percent) => percent >= FULL ? "full" : percent >= WARN ? "warn" : null;
const percentOf = (context) => Math.round(context.used / context.max * 100);
export function ringOf(context) {
  const arc = Math.round(Math.min(100, Math.max(0, context.used / context.max * 100)) * 100) / 100, percent = percentOf(context);
  return { arc, percent, tone: toneOf(percent), label: `Context ${percent}% · ${tokens(context.used)} / ${tokens(context.max)} tokens` };
}
export function createContext({ store, phone = false, act = async () => null, name = () => lead() }) {
  const ring = svg("svg", { class: "ctx-ring", viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("circle", { cx: 8, cy: 8, r: 6, class: "ctx-ring-track" }), svg("circle", { cx: 8, cy: 8, r: 6, class: "ctx-ring-fill", pathLength: 100 }));
  const word = el("button", { type: "button", class: "composer-context text-control", "aria-haspopup": "dialog", "aria-expanded": "false", hidden: true }, el("span", { class: "control-label" }, ring));
  let panel = null, lit = null, shown = "", renewable = { agent: void 0, clear: false };
  word.addEventListener("click", () => panel ? close() : open());
  function open() {
    const context = store.context;
    if (!context) return;
    panel = build();
    paint();
    const agent = store.agent?.id ?? null;
    void store.commands().then((list) => {
      renewable = { agent, clear: list.some((command) => command?.name === "clear") };
      if (panel) paint();
    });
    word.setAttribute("aria-expanded", "true");
    (phone ? word.closest(".chat") ?? document.body : word.closest(".composer-box") ?? word.parentElement).append(panel.root);
    addEventListener("pointerdown", outside, true);
    addEventListener("keydown", escape, true);
    if (!phone) {
      room();
      addEventListener("resize", room);
    }
    panel.focus();
  }
  function room() {
    const box = panel?.root.parentElement?.getBoundingClientRect?.(), thread = word.closest(".chat")?.querySelector(".chat-scroll")?.getBoundingClientRect?.();
    if (box) panel.root.style.setProperty("--room", `${Math.max(180, Math.floor(box.top - Math.max(0, thread?.top ?? 0) - 12))}px`);
  }
  function close(back = false) {
    if (!panel) return;
    const gone = panel;
    panel = null;
    lit = null;
    removeEventListener("pointerdown", outside, true);
    removeEventListener("keydown", escape, true);
    removeEventListener("resize", room);
    word.setAttribute("aria-expanded", "false");
    gone.leave();
    if (back) word.focus({ preventScroll: true });
  }
  const outside = (event) => {
    if (panel && !panel.box.contains(event.target) && !word.contains(event.target)) close();
  };
  const escape = (event) => {
    if (event.key !== "Escape" || !panel) return;
    event.preventDefault();
    event.stopPropagation();
    if (panel.asking) panel.ask(null);
    else close(true);
  };
  function build() {
    const model = el("span", { class: "ctx-model" }), big = el("b", { class: "ctx-big" }), of = el("span", { class: "ctx-of" }), total = el("span", { class: "ctx-share" });
    const grid = el("div", { class: "ctx-grid", "aria-hidden": "true" }, Array.from({ length: CELLS }, (_, n) => el("i", { style: `--n:${n}` })));
    const note = el("p", { class: "ctx-note", role: "status", "aria-live": "polite" });
    const renew = control("New chat →", { class: "ctx-renew", onclick: () => ask(renewable.clear ? "renew" : "restart") });
    const compactFoot = control("Compact", { class: "ctx-compact ctx-compact-foot", onclick: () => ask("compact") });
    const foot = el("div", { class: "ctx-foot" }, note, compactFoot, renew);
    const unknown = el("p", { class: "ctx-unknown" }, "Part sizes aren't known right now");
    const rows = new Map(), files = el("ul", { class: "ctx-files" });
    let expanded = false, asking = null, told = null, toldTimer = 0, listed = "", shownNote = "";
    for (const part of PARTS) {
      const size = el("span", { class: "ctx-size" });
      const name2 = part.id === "files" ? el("button", { type: "button", class: "ctx-name ctx-expand", "aria-expanded": "false" }, part.name, svg("svg", { class: "ctx-chev", viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("path", { d: "m4.5 6.5 3.5 3.5 3.5-3.5" }))) : el("span", { class: "ctx-name", tabindex: phone ? null : "0" }, part.name);
      const compact = part.id === "conversation" ? control("Compact", { class: "ctx-compact", onclick: () => ask("compact") }) : null;
      const row = el("li", { class: "ctx-row", "data-part": part.id }, el("i", { class: "ctx-key", "aria-hidden": "true" }), name2, el("span", { class: "ctx-gap" }), compact, size, part.id === "files" ? files : null);
      row.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") light(part.id);
      });
      row.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") light(null);
      });
      row.addEventListener("focusin", () => light(part.id));
      row.addEventListener("focusout", (event) => {
        if (!row.contains(event.relatedTarget)) light(null);
      });
      if (phone) row.addEventListener("click", () => light(lit === part.id && part.id !== "files" ? null : part.id));
      if (part.id === "files") name2.addEventListener("click", () => {
        expanded = !expanded;
        name2.setAttribute("aria-expanded", String(expanded));
        row.toggleAttribute("data-open", expanded);
        paint();
      });
      rows.set(part.id, { row, size });
    }
    const box = el("section", { class: "ctx" + (phone ? " ctx-sheet" : " ctx-panel"), role: "dialog", "aria-label": "Context", tabindex: "-1" }, phone ? el("i", { class: "ctx-grab", "aria-hidden": "true" }) : null, el("div", { class: "ctx-top" }, el("span", { class: "ctx-title" }, "Context"), model, phone ? control("Close", { class: "ctx-close", onclick: () => close(true) }) : null), el("p", { class: "ctx-total" }, big, of, el("span", { class: "ctx-gap" }), total), grid, el("p", { class: "ctx-est" }, "Estimated"), el("ul", { class: "ctx-rows" }, [...rows.values()].map((entry) => entry.row)), unknown, foot);
    const est = box.querySelector(".ctx-est"), rowList = box.querySelector(".ctx-rows");
    const root = phone ? el("div", { class: "ctx-layer" }, el("div", { class: "ctx-backdrop", onclick: () => close(true) }), box) : box;
    function ask(kind) {
      asking = kind;
      told = null;
      clearTimeout(toldTimer);
      paint();
      if (kind) foot.querySelector(".ctx-yes")?.focus({ preventScroll: true });
    }
    async function yes() {
      const kind = asking;
      if (kind === "compact" && running()) return;
      asking = null;
      told = SENDING;
      paint();
      told = await act(kind) ?? null;
      if (panel?.box === box) paint();
      clearTimeout(toldTimer);
      toldTimer = setTimeout(() => {
        told = null;
        if (panel?.box === box) paint();
      }, 4e3);
    }
    function draw(context) {
      const known = !!context.parts, busy = running(), who = name(), ASK = askFor(who), BUSY2 = busyLine(who);
      if (!known) lit = null;
      const free = Math.max(0, context.max - context.used), percent = percentOf(context), part = lit && PARTS.find((one) => one.id === lit);
      model.textContent = context.model?.label ?? store.settings?.model?.label ?? "";
      big.textContent = tokens(part ? context.parts[part.id] : context.used);
      of.textContent = part ? part.name + " · Estimated" : `/ ${tokens(context.max)} tokens`;
      total.textContent = percent + "%";
      total.dataset.tone = toneOf(percent) ?? "";
      const kinds = cells(context);
      grid.childNodes.forEach((cell, n) => {
        if (cell.dataset.part !== kinds[n]) cell.dataset.part = kinds[n];
      });
      box.dataset.lit = lit ?? "";
      est.hidden = rowList.hidden = !known;
      unknown.hidden = known;
      if (known) for (const one of PARTS) rows.get(one.id).size.textContent = tokens(context.parts[one.id]);
      const read = context.files ?? [], readSign = JSON.stringify(read);
      if (readSign !== listed) {
        listed = readSign;
        files.replaceChildren(...read.map((file) => {
          const mark = refMark({ kind: "file", path: file.path });
          return el("li", { class: "ctx-file", title: file.path }, el("i", { class: "th-mark" }, mark.mark), el("span", { class: "ctx-file-name" }, mark.name), el("span", { class: "ctx-size" }, tokens(file.tokens)));
        }));
      }
      files.hidden = !expanded || !read.length;
      for (const one of PARTS) rows.get(one.id).row.toggleAttribute("data-lit", one.id === lit);
      for (const compact of [rows.get("conversation").row.querySelector(".ctx-compact"), compactFoot]) {
        compact.disabled = !!asking || busy;
        compact.title = busy ? BUSY2 : "Shortens the conversation to free the window";
      }
      compactFoot.hidden = known || !!asking;
      renew.hidden = !!asking || renewable.agent !== (store.agent?.id ?? null) || !(renewable.clear || store.controls?.renew);
      const waits = busy && (!part || part.id === "conversation");
      foot.dataset.mode = asking ? "ask" : told ? "told" : waits ? "busy" : part ? "part" : context.saved ? "saved" : "free";
      const noteSign = JSON.stringify([who, foot.dataset.mode, asking, asking === "compact" && busy, told, part?.id, context.saved, free, percent]);
      if (noteSign === shownNote) return;
      shownNote = noteSign;
      if (asking) {
        const words = ASK[asking], wait = asking === "compact" && busy;
        note.replaceChildren(el("span", { class: "ctx-q" }, words.question), el("span", { class: "ctx-detail" }, wait ? BUSY2 : words.detail), el("span", { class: "ctx-answer" }, control("Cancel", { class: "ctx-no", onclick: () => ask(null) }), control(words.yes, { class: "ctx-yes", disabled: wait, onclick: yes })));
      } else if (told) note.replaceChildren(told);
      else if (waits) note.replaceChildren(el("span", { class: "ctx-busy" }, BUSY2));
      else if (part) note.replaceChildren(el("b", {}, part.name), ` · ${share(context.parts[part.id], context.max)} of the window`);
      else if (context.saved) note.replaceChildren(el("span", { class: "ctx-saved" }, `Last compaction saved ${tokens(context.saved)} tokens`), ` · ${tokens(free)} left`);
      else note.replaceChildren(`${tokens(free)} left`);
    }
    return { root, box, draw, ask, get asking() {
      return asking;
    }, focus() {
      box.focus({ preventScroll: true });
    }, leave() {
      clearTimeout(toldTimer);
      const done = () => root.remove();
      if (!root.isConnected || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        done();
        return;
      }
      root.classList.add("is-leaving");
      setTimeout(done, 180);
    } };
  }
  function light(id) {
    if (lit === id || !panel || !store.context?.parts) return;
    lit = id;
    paint();
  }
  const running = () => !!store.turn?.running;
  function paint() {
    const context = store.context;
    word.hidden = !context;
    if (!context) {
      close();
      return;
    }
    const now = ringOf(context), text = now.percent + "%";
    if (shown && shown !== text) {
      word.classList.remove("is-changed");
      void word.offsetWidth;
      word.classList.add("is-changed");
    }
    shown = text;
    word.dataset.tone = now.tone ?? "";
    word.style.setProperty("--used", String(now.arc));
    word.title = now.label;
    word.setAttribute("aria-label", now.label);
    panel?.draw(context);
  }
  paint();
  return { node: word, paint, close, get open() {
    return !!panel;
  } };
}
