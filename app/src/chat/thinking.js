import { el, svg } from "../boards/dom.js";
import { reduced } from "./motion.js";
import { stepWords, stepDetail, imageOf, refMark, touched, instant, compactionOf } from "./step-words.js";
import { refTarget } from "./links.js";
export const stateOf = (tool) => tool.stopped ? "stopped" : tool.status === "running" ? tool.waiting ? "waiting" : "running" : tool.status === "failed" ? "failed" : "done";
const open = (state) => state === "running" || state === "waiting";
export const seconds = (n) => {
  n = Math.max(0, Math.floor(n));
  return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m${n % 60 ? ` ${n % 60}s` : ""}`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const alone = (tool) => !instant(tool) && !/^(Task|Agent)$/.test(String(tool?.name ?? ""));
export function runTools(parts, { later = false } = {}) {
  const calls = parts.flatMap((part) => (Array.isArray(part.tools) ? part.tools : []).map((tool) => [tool, !!part.streaming]));
  const tools = new Array(calls.length);
  let after = later;
  for (let i = calls.length - 1; i >= 0; i--) {
    const [tool, streaming] = calls[i], running = tool.status === "running", over = running && after && instant(tool);
    tools[i] = { ...tool, ...over ? { status: "done" } : {}, stopped: running && !over && !streaming };
    if (!running) after = true;
  }
  const blocked = new Set();
  for (const tool of tools) {
    if (tool.batch == null || stateOf(tool) !== "running") continue;
    if (blocked.has(tool.batch)) tool.waiting = true;
    else if (alone(tool)) blocked.add(tool.batch);
  }
  return tools;
}
export const quiet = (tool) => tool?.kind === "compaction";
export function thinkingRows(tools, { more = 0, finished = false, whole = tools } = {}) {
  const rows = [];
  if (more > 0) rows.push({ key: "more", type: "more", count: more });
  for (let i = 0; i < tools.length; ) {
    const batch = tools[i].batch;
    let j = i + 1;
    if (batch != null) while (j < tools.length && tools[j].batch === batch) j++;
    if (j - i >= 2) {
      const group = tools.slice(i, j), merged = group.every((tool) => !open(stateOf(tool)));
      group.forEach((tool, n) => rows.push({ key: "s" + (more + i + n), type: "step", lane: "branch", edge: n ? "mid" : "in", cont: n < group.length - 1 || merged, tool, state: stateOf(tool) }));
      if (merged) rows.push({ key: "m" + (more + i), type: "merge", count: group.length, failed: group.filter((tool) => stateOf(tool) !== "done").length });
      i = j;
    } else {
      const tool = tools[i], state = stateOf(tool), dead = state === "failed" || state === "stopped";
      rows.push({ key: "s" + (more + i), type: "step", lane: dead ? "branch" : "main", edge: dead ? "dead" : null, cont: false, tool, state, ...quiet(tool) ? { quiet: true } : {} });
      i++;
    }
  }
  if (finished && rows.length) {
    const stopped = tools.some((tool) => tool.stopped), failed = whole.filter((tool) => stateOf(tool) === "failed").length;
    rows.push({ key: "end", type: "end", state: stopped ? "stopped" : "done", summary: [touched(whole), failed ? `${failed} failed` : ""].filter(Boolean).join(" · ") });
  }
  return rows;
}
export function rowLabel(row) {
  if (row.type === "more") return `${plural(row.count, "earlier step")}`;
  if (row.type === "merge") return `Merged ${plural(row.count, "result")}` + (row.failed ? ` · ${row.failed} failed` : "");
  if (row.type === "end") return row.state === "stopped" ? "Stopped here" : "Done thinking";
  const words = stepWords(row.tool);
  return { running: words.doing, waiting: words.doing, done: words.done, failed: words.noun + " failed", stopped: words.noun + " stopped" }[row.state];
}
export function headLabel({ live, start, end, now = Date.now(), steps }) {
  if (live) return { word: "Thinking", secs: start != null ? seconds((now - start) / 1e3) : "" };
  const took = start != null && end != null && end >= start ? "Thought for " + seconds((end - start) / 1e3) : "Thought";
  return { word: took, secs: steps ? `· ${plural(steps, "step")}` : "" };
}
const ICONS = { read: "M4.5 2.5h4.6l2.4 2.4v8.6h-7z M9 2.6v2.6h2.5 M6.3 8.2h3.4 M6.3 10.8h3.4", search: "M7 3.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 1 0 0-7.6z M9.8 9.8l3.4 3.4", ledger: "M3 3.5h10v9H3z M3 6.6h10 M3 9.6h10 M6.6 3.5v9", run: "M3.2 4.6l3.2 3.2l-3.2 3.2 M8.2 11.6h4.6", edit: "M10.4 3.1l2.5 2.5l-6.8 6.8H3.6V9.9z M9 4.5l2.5 2.5", web: "M8 2.6a5.4 5.4 0 1 0 0 10.8a5.4 5.4 0 1 0 0-10.8z M2.8 8h10.4 M8 2.6c-2.8 2.9-2.8 7.9 0 10.8 M8 2.6c2.8 2.9 2.8 7.9 0 10.8", hand: "M2.8 8h9.4 M9.2 4.8l3.2 3.2l-3.2 3.2", list: "M6 4.5h7 M6 8h7 M6 11.5h7 M3.2 4.5h.1 M3.2 8h.1 M3.2 11.5h.1", ask: "M3 4.3c0-.8.6-1.3 1.3-1.3h7.4c.7 0 1.3.5 1.3 1.3v5c0 .8-.6 1.3-1.3 1.3H7.4L4.6 13v-2.4h-.3c-.7 0-1.3-.5-1.3-1.3z", board: "M2.6 3.2h10.8v9.6H2.6z M2.6 6h10.8 M7 6v6.8", tool: "M8 6.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z", cross: "M5.2 5.2l5.6 5.6 M10.8 5.2l-5.6 5.6", check: "M4.9 8.3l2.1 2.1l4.1-4.5", chev: "M5.2 6.6L8 9.4l2.8-2.8", image: "M2.8 3.6h10.4v8.8H2.8z M2.8 10.6l3-3l2.7 2.7l1.7-1.7l3 3 M10.3 6h.1", archive: "M2.6 3.4h10.8v2.8H2.6z M3.6 6.2v6.4h8.8V6.2 M6.4 8.6h3.2", alert: "M8 2.8l5.6 9.8H2.4z M8 6.6v2.8 M8 11.2h.1", gpu: "M4.4 4.4h7.2v7.2H4.4z M6.6 6.6h2.8v2.8H6.6z M6.2 2.4v2 M9.8 2.4v2 M6.2 11.6v2 M9.8 11.6v2 M2.4 6.2h2 M2.4 9.8h2 M11.6 6.2h2 M11.6 9.8h2", compact: "M2.8 8h10.4 M5.4 2.8L8 5.4l2.6-2.6 M5.4 13.2L8 10.6l2.6 2.6" };
const icon = (name, cls = "th-icon") => svg("svg", { class: cls, viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("path", { d: ICONS[name] }));
const arc = () => svg("svg", { class: "th-arc", viewBox: "0 0 20 20", "aria-hidden": "true" }, svg("circle", { cx: 10, cy: 10, r: 8.6, pathLength: 100 }));
const curve = (back, dashed) => svg("svg", { class: "th-curve" + (back ? " is-back" : "") + (dashed ? " is-dashed" : ""), viewBox: "0 0 10 10", preserveAspectRatio: "none", "aria-hidden": "true" }, svg("path", { d: back ? "M10 0C10 5.6 0 4.4 0 10" : "M0 0C0 5.6 10 4.4 10 10", "vector-effect": "non-scaling-stroke" }));
function nodeOf(row) {
  if (row.type === "more") return el("i", { class: "th-node th-dots", "aria-hidden": "true" });
  if (row.type === "merge") return el("i", { class: "th-node th-ring", "aria-hidden": "true" });
  if (row.type === "end") return el("i", { class: "th-node th-end", "aria-hidden": "true" }, icon(row.state === "stopped" ? "cross" : "check"));
  if (row.state === "failed" || row.state === "stopped") return el("i", { class: "th-node th-x", "aria-hidden": "true" }, icon("cross"));
  if (row.state === "waiting") return el("i", { class: "th-node th-ring", "aria-hidden": "true" });
  if (row.lane === "branch") return el("i", { class: "th-node th-dot", "aria-hidden": "true" }, row.state === "running" ? arc() : null);
  const kind = stepWords(row.tool).icon;
  return el("i", { class: "th-node th-kind", "data-icon": kind, "aria-hidden": "true" }, icon(kind), row.state === "running" ? arc() : null);
}
export const CHIPS = 3;
export function chipsOf(refs, all = false) {
  const marks = (refs ?? []).map(refMark).filter(Boolean), shown = all ? marks : marks.slice(0, CHIPS);
  return { shown, rest: marks.length - shown.length };
}
export function refChip(source, chips, n = 0) {
  const ref = refMark(source), target = chips.open ? refTarget(source) : null, opens = !!target && chips.can(target);
  const attrs = { class: "th-chip", "data-kind": ref.kind, "data-mark": ref.mark, "data-peek-word": ref.mark, "data-peek-line": ref.title || null, "data-peek-plain": "", title: chips.peek ? null : ref.title || null, style: { "--i": n } };
  const parts = [el("b", { class: "th-mark" }, ref.mark), el("span", { class: "th-chip-name" }, ref.name)];
  return opens ? el("button", { ...attrs, type: "button", "aria-label": "Open " + (ref.title || ref.name), onclick: () => chips.open(target) }, parts) : el("span", attrs, parts);
}
function refsOf(row, all, onMore, chips) {
  const image = row.type === "step" ? imageOf(row.tool) : null;
  const refs = (row.tool?.refs ?? []).filter((ref) => !(image?.name && ref?.kind === "file" && refMark(ref)?.name === image.name));
  const { shown, rest } = chipsOf(refs, all), sources = refs.filter((ref) => refMark(ref));
  if (!shown.length) return null;
  return el("span", { class: "th-refs" }, shown.map((ref, n) => refChip(sources[n], chips, n)), rest > 0 ? el("button", { type: "button", class: "th-more-refs", style: { "--i": shown.length }, onclick: onMore }, `+${rest} more`) : null);
}
const bandOf = (text) => el("span", { class: "th-band", "aria-hidden": "true", "data-text": text });
const clipBand = (band) => el("span", { class: "th-shimmer", "aria-hidden": "true" }, band);
function labelOf(row, label, detail, image, peek, took) {
  const phone = !!peek?.phone;
  return el("span", { class: "th-label", "data-peek-word": detail?.word || null, "data-peek-line": detail?.line ?? null, tabindex: detail && peek && !phone ? "0" : null }, el("span", { class: "th-text" }, label, clipBand(bandOf(label))), image?.name ? el("span", { class: "th-name" }, image.name) : null, took ? el("span", { class: "th-took" }, took) : null, row.type === "end" && row.summary ? el("span", { class: "th-sum" }, row.summary) : null, detail && phone ? el("button", { type: "button", class: "peek-toggle th-peek", "aria-label": "What it did", "aria-expanded": "false" }, icon("chev", "th-peek-icon")) : null);
}
function thumbOf(image) {
  if (!image?.src) return null;
  const img = el("img", { src: image.src, alt: "", decoding: "async", loading: "lazy", draggable: "false" });
  const button = el("button", { type: "button", class: "th-thumb", "aria-label": "View " + (image.name ?? "the image"), "data-name": image.name ?? null }, img);
  img.addEventListener("error", () => button.remove(), { once: true });
  return button;
}
const SLOTS = ["curve", "node", "label", "thumb", "refs"];
function put(item, slot, next) {
  const old = item[slot];
  if (old === next) return;
  if (old && next) old.replaceWith(next);
  else if (old) old.remove();
  else if (next) {
    const before = SLOTS.slice(0, SLOTS.indexOf(slot)).map((name) => item[name]).filter(Boolean).at(-1);
    before ? before.after(next) : item.li.prepend(next);
  }
  item[slot] = next;
}
const EASE = "cubic-bezier(.2,.8,.2,1)";
export const FOLD = 260;
const SETTLE = "cubic-bezier(.4,0,.2,1)";
export function createThinking({ open: open2 = false, fresh = false, onToggle = () => {
}, peek = null, openRef = null, opens = () => true, onImage = null, onFold = null } = {}) {
  const chev = el("i", { class: "th-node th-chev", "aria-hidden": "true" }, icon("chev"));
  const said = document.createTextNode(""), band = bandOf(""), word = el("span", { class: "th-word" }, said, clipBand(band)), secs = el("span", { class: "th-secs" });
  const head = el("button", { type: "button", class: "th-head", "aria-expanded": String(open2) }, chev, word, secs);
  const list = el("ol", { class: "th-steps" }), body = el("div", { class: "th-body", hidden: !open2 }, list);
  const node = el("section", { class: "th", "data-open": open2 ? "" : null }, head, body);
  let rows = new Map(), state = null, timer = 0, owned = false, painted = false, folding = null, growing = null;
  const full = new Set(), chips = { open: openRef, can: opens, peek };
  const isOpen = () => node.hasAttribute("data-open");
  head.addEventListener("click", () => {
    if (!rows.size) return;
    owned = true;
    fold(!isOpen(), true);
    onToggle(isOpen());
  });
  const unpeek = peek?.wire(list) ?? (() => {
  });
  list.addEventListener("click", (event) => {
    const thumb = event.target.closest?.(".th-thumb");
    if (!thumb || !onImage) return;
    event.preventDefault();
    const shown = [...list.querySelectorAll(".th-thumb")].map((one) => one.querySelector("img")).filter((img2) => img2 && (img2.complete && img2.naturalWidth > 0 || img2.parentNode === thumb)), img = thumb.querySelector("img");
    onImage(shown.map((one) => ({ url: one.currentSrc || one.src, alt: one.parentNode.dataset.name ?? "" })), Math.max(0, shown.indexOf(img)), img);
  });
  function fold(next, animate, { start = null, settle = false } = {}) {
    if (next === isOpen() && !folding) return;
    const from = next ? 0 : start ?? (animate && node.isConnected && !body.hidden ? body.offsetHeight : 0);
    folding?.cancel();
    folding = null;
    growing?.cancel();
    growing = null;
    node.toggleAttribute("data-open", next);
    head.setAttribute("aria-expanded", String(next));
    if (!animate || reduced() || !node.isConnected) {
      body.hidden = !next;
      return;
    }
    body.hidden = false;
    const to = next ? list.offsetHeight : 0;
    folding = body.animate([{ height: from + "px", opacity: next ? 0 : 1 }, { height: to + "px", opacity: next ? 1 : 0 }], { duration: next ? 380 : settle ? FOLD : 320, easing: settle ? SETTLE : EASE });
    folding.finished.then(() => {
      folding = null;
      body.hidden = !isOpen();
    }, () => {
    });
  }
  function tick() {
    if (!state) return;
    const label = headLabel({ ...state, now: Date.now() });
    if (word.textContent !== label.word) {
      if (painted && !state.live && word.dataset.live === "1" && !reduced()) word.animate([{ opacity: 0, transform: "translateY(.4em)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 420, easing: EASE });
      said.nodeValue = label.word;
      band.dataset.text = label.word;
    }
    word.dataset.live = state.live ? "1" : "0";
    secs.textContent = label.secs;
  }
  function paint(next, folds = false) {
    const animate = (painted || fresh) && !reduced();
    const wanted = thinkingRows(next.tools, { more: next.more, finished: !next.live && !next.turnLive && next.last !== false, whole: next.whole ?? next.tools });
    const before = animate && painted && isOpen() && !folding && !folds && node.isConnected ? list.offsetHeight : null;
    const kept = new Map();
    let prev = null;
    for (const row of wanted) {
      let item = rows.get(row.key);
      const born = !item;
      if (born) {
        item = { li: el("li", { class: "th-row" }) };
        if (animate) item.li.classList.add("is-in");
      }
      const li = item.li, was = li.dataset.state;
      li.dataset.type = row.type;
      li.dataset.lane = row.lane ?? "main";
      if (row.edge) li.dataset.edge = row.edge;
      else delete li.dataset.edge;
      li.toggleAttribute("data-cont", !!row.cont);
      li.toggleAttribute("data-quiet", !!row.quiet);
      li.dataset.state = row.state ?? "";
      const curveSign = row.type === "merge" ? "back" : row.edge === "in" || row.edge === "dead" ? row.edge : "";
      if (item.curveSign !== curveSign) {
        put(item, "curve", curveSign ? curve(curveSign === "back", curveSign === "dead") : null);
        item.curveSign = curveSign;
      }
      const nodeSign = [row.type, row.lane, row.state, row.type === "step" ? stepWords(row.tool).icon : ""].join("|");
      if (item.nodeSign !== nodeSign) {
        const mark = nodeOf(row);
        if (animate && !born) mark.classList.add("is-pop");
        put(item, "node", mark);
        item.nodeSign = nodeSign;
      }
      const image = row.type === "step" ? imageOf(row.tool) : null, detail = row.type === "step" && !image ? stepDetail(row.tool) : null;
      const ms = row.type === "step" && row.state === "done" ? compactionOf(row.tool)?.took ?? null : null, took = row.state === "waiting" ? "waiting" : ms !== null ? seconds(ms / 1e3) : "";
      const label = rowLabel(row), labelSign = JSON.stringify([label, row.summary ?? "", detail, image?.name ?? null, took]);
      if (item.labelSign !== labelSign) {
        const text = labelOf(row, label, detail, image, peek, took);
        if (peek?.shown && peek.shown === item.label) peek.hide();
        put(item, "label", text);
        item.labelSign = labelSign;
        if (animate && was === "running" && row.state !== "running") text.animate([{ opacity: 0.3, filter: "blur(1.5px)" }, { opacity: 1, filter: "none" }], { duration: 380, easing: "ease-out" });
      }
      const thumbSign = image?.src ?? "";
      if (item.thumbSign !== thumbSign) {
        put(item, "thumb", thumbOf(image));
        item.thumbSign = thumbSign;
      }
      const refsSign = JSON.stringify([row.tool?.refs ?? null, full.has(row.key), image?.name ?? null]);
      if (item.refsSign !== refsSign) {
        const refs = refsOf(row, full.has(row.key), () => {
          full.add(row.key);
          if (state) paint(state);
        }, chips);
        if (refs && animate && item.refsSign === void 0) refs.classList.add("is-in");
        put(item, "refs", refs);
        item.refsSign = refsSign;
      }
      if (li.parentNode !== list || li.previousElementSibling !== prev) prev ? prev.after(li) : list.prepend(li);
      prev = li;
      kept.set(row.key, item);
    }
    for (const [key, item] of rows) if (kept.get(key) !== item) {
      if (peek?.shown && item.li.contains(peek.shown)) peek.hide();
      item.li.remove();
    }
    rows = kept;
    node.toggleAttribute("data-empty", !rows.size);
    if (before != null) {
      const after = list.offsetHeight;
      if (after !== before) {
        growing?.cancel();
        growing = body.animate([{ height: before + "px" }, { height: after + "px" }], { duration: 420, easing: EASE });
        growing.finished.then(() => {
          growing = null;
        }, () => {
        });
      }
    }
    painted = true;
  }
  return { node, update(next) {
    const was = state;
    state = { ...next, steps: next.tools.filter((tool) => !quiet(tool)).length + (next.more ?? 0) };
    node.dataset.state = next.live ? "live" : next.tools.some((tool) => tool.stopped) ? "stopped" : "done";
    const shows = (run) => !!run && (run.live || run.turnLive && !run.later);
    if (!owned && shows(next) && !shows(was)) fold(true, !!was);
    const folds = !owned && shows(was) && !shows(next) && isOpen();
    const start = folds && node.isConnected && !body.hidden && !reduced() ? body.offsetHeight : null;
    paint(state, folds);
    tick();
    clearInterval(timer);
    timer = 0;
    if (next.live) timer = setInterval(tick, 1e3);
    if (folds) {
      fold(false, true, { start, settle: true });
      if (folding) onFold?.(FOLD);
    }
  }, destroy() {
    clearInterval(timer);
    timer = 0;
    folding?.cancel();
    growing?.cancel();
    unpeek();
    if (peek?.shown && node.contains(peek.shown)) peek.hide();
  } };
}
