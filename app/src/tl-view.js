import { h, text, cls, css, attr, sync } from "./tl-dom.js";
import { prepareTimeline, timelineView, rangeWindow, RANGES, rangeOf, hhmm, MIN, shortTitle, hot } from "./tl-model.js";
import { offset } from "./zone.js";
import { nowCell, goalCell, createCard } from "./tl-card.js";
import { slide, reduced } from "./tl-motion.js";
import { onOwnerTurn, ownerCount } from "./owner-steps.js";
import { isLead, userKo, myTurn, l10n } from "./names.js";
const SVG = "http://www.w3.org/2000/svg";
const STATES = ["running", "owner", "waiting", "idle", "done"];
const BAR_STATES = ["running", "done", "failed", "owner", "owner-done"];
const pct = (v) => Math.round(v * 1e5) / 1e3 + "%";
export const RANGE_KEY = "artemis-tl-range", NOW_KEY = "artemis-tl-now";
const memory = new Map();
export const saved = { get: (k) => {
  try {
    const v = localStorage.getItem(k);
    if (v != null) return v;
  } catch {
  }
  return memory.get(k) ?? null;
}, set: (k, v) => {
  memory.set(k, v);
  try {
    localStorage.setItem(k, v);
  } catch {
  }
} };
export function axisTicks(win) {
  const minutes = (win.end - win.start) / MIN, step = ([5, 10, 15, 30, 60, 120, 180].find((n) => minutes / n <= 9) || 240) * MIN, out = [];
  const off = offset(win.start);
  for (let t = Math.ceil((win.start + off) / step) * step - off; t <= win.end; t += step) out.push(t);
  return out;
}
export function barWords(r, b, ems, goals) {
  const id = r.kind === "agent" && (isLead(r.agent.role) || r.agent.role === "cto") ? b.goal : r.goalId, g = id != null ? goals.get(id) : null;
  if (id == null) return null;
  const short = shortTitle(g?.title);
  return ems >= 10 && short ? { id: "#" + id, title: short } : ems >= 1.5 + 0.56 * (String(id).length + 1) ? { id: "#" + id, title: "" } : null;
}
export const goalWords = (g) => ({ text: g.kind === "goal" ? g.short || g.title || l10n("제목 없음", "Untitled") : g.title, tip: g.kind === "goal" && g.title ? "#" + g.id + " " + g.title + (g.goal.request != null ? " · R" + g.goal.request : "") : null });
export function createTimeline() {
  const ui = { range: rangeOf(saved.get(RANGE_KEY) || "2h").id, nowOpen: saved.get(NOW_KEY) !== "folded", folded: new Set(), opened: new Set(), idleShown: new Set(), restingShown: false };
  let host = null, E = null, P = null, V = null, card = null, frame = 0, settle = 0, still = 0, folding = 0;
  const read = () => ({ P, V, now: P?.now });
  const keyed = (parent, items, keyOf, make, update2) => sync(parent, items, keyOf, make, update2, { enter: !!E?.ready });
  onOwnerTurn(() => {
    if (E && V) head();
  });
  function mount(next) {
    if (next === host && E?.root.isConnected) return false;
    host = next;
    card?.close();
    card?.card.remove();
    E = skeleton();
    host.replaceChildren(E.root);
    card = createCard(E.root, read);
    return true;
  }
  function skeleton() {
    const e = {};
    e.ranges = RANGES.map((r) => h("button", { type: "button", class: "tl-range", "data-tl-range": r.id, "aria-pressed": String(r.id === ui.range) }, h("span", { text: r.label })));
    e.total = h("b", { class: "tl-total" });
    e.counts = ["running", "owner"].map((k) => h("button", { type: "button", class: "tl-count " + k, "data-tl-jump": k }, h("span")));
    e.sum = h("p", { class: "tl-sum" }, e.total, ...e.counts.flatMap((c) => [h("i", { "aria-hidden": "true", text: "·" }), c]));
    e.ticks = h("div", { class: "tl-ticks" });
    e.nowLabel = h("span", { class: "tl-now-label" });
    e.nowTick = h("i", { class: "tl-now-tick" });
    e.axisTime = h("div", { class: "tl-axis-time" }, e.ticks, e.nowLabel, e.nowTick);
    e.toggle = h("button", { type: "button", class: "tl-now-toggle", "aria-expanded": String(ui.nowOpen), "aria-label": ui.nowOpen ? l10n("지금 열 접기", "Fold the Now column") : l10n("지금 열 펴기", "Open the Now column") }, h("span", { text: l10n("지금", "Now") }), h("i", { class: "tl-chev", "aria-hidden": "true" }));
    e.lines = h("div", { class: "tl-lines" });
    e.nowLine = h("i", { class: "tl-now-line" });
    e.svg = document.createElementNS(SVG, "svg");
    e.svg.setAttribute("class", "tl-links");
    e.svg.setAttribute("aria-hidden", "true");
    e.groups = h("div", { class: "tl-groups" });
    e.body = h("div", { class: "tl-body" }, h("div", { class: "tl-layer tl-cols", "aria-hidden": "true" }, h("i"), h("div", { class: "tl-layer-time" }, e.lines, e.nowLine), h("i")), e.svg, e.groups);
    e.root = h("div", { class: "tl-root", "data-now": ui.nowOpen ? "open" : "folded", "data-range": ui.range }, h("div", { class: "tl-top" }, h("header", { class: "tl-head" }, e.sum, h("nav", { class: "tl-ranges", "aria-label": l10n("시간 범위", "Time range") }, e.ranges)), h("div", { class: "tl-axis tl-cols" }, h("div", { class: "tl-axis-lab" }), e.axisTime, h("div", { class: "tl-axis-now" }, e.toggle))), e.body);
    e.root.addEventListener("click", click);
    e.root.addEventListener("keydown", keydown);
    return e;
  }
  function update({ dashboard, model, history, now = Date.now() }) {
    P = prepareTimeline({ dashboard, history, now, model });
    paint();
  }
  function paint() {
    if (!E || !P) return;
    const width = host.clientWidth + "px";
    if (width !== "0px" && E.root.style.getPropertyValue("--tl-w") !== width) E.root.style.setProperty("--tl-w", width);
    V = timelineView(P, rangeWindow(ui.range, P.now, P.horizon), { folded: ui.folded, opened: ui.opened, idleShown: ui.idleShown, restingShown: ui.restingShown });
    E.root.dataset.window = Math.round(V.win.start) + "/" + Math.round(V.win.end);
    const geo = { em: parseFloat(getComputedStyle(E.root).fontSize) || 15, track: E.axisTime.clientWidth || 600 }, land = slide(E.groups);
    E.size = [host.clientWidth, geo.track];
    head();
    axis(geo);
    groups(geo);
    const fold2 = foldWidth(geo), glide = land();
    if (Math.abs(fold2 - (E.fold || 0)) > 1) {
      E.fold = fold2;
      css(E.root, { "--tl-fold": fold2 + "px" });
    }
    glide();
    card.refresh();
    links();
    E.ready = true;
  }
  function foldWidth(geo) {
    let w = 0;
    for (const n of E.body.querySelectorAll(".tl-w")) if (!n.closest(".tl-out")) w = Math.max(w, n.scrollWidth);
    return Math.ceil(Math.max(w, 4.2 * geo.em) + 0.9 * geo.em);
  }
  const resized = () => !E.size || host.clientWidth !== E.size[0] || E.axisTime.clientWidth !== E.size[1];
  function head() {
    const c = V.counts;
    text(E.total, l10n("에이전트 ", "Agents ") + c.agents);
    [[l10n("실행", "Running"), c.running], [myTurn(), ownerCount()]].forEach(([word, n], i) => {
      text(E.counts[i].firstElementChild, word + " " + n);
      cls(E.counts[i], "zero", !n);
      E.counts[i].disabled = !n;
    });
  }
  function axis(geo) {
    const win = V.win, span = win.end - win.start, f = (t) => (t - win.start) / span, nowX = f(win.now), W = geo.track, ticks = axisTicks(win);
    const labels = ticks.filter((t) => {
      const px = (f(t) - nowX) * W;
      return f(t) * W > 1.6 * geo.em && (px < -7.2 * geo.em || px > 2 * geo.em) && (!win.cut || f(t) * W > 6.4 * geo.em);
    });
    const items = [...win.cut ? [{ key: "cut", t: win.cut, label: l10n(hhmm(win.cut) + "부터", "since " + hhmm(win.cut)), cut: true }] : [], ...labels.map((t) => ({ key: "t" + t, t, label: hhmm(t) }))];
    keyed(E.ticks, items, (i) => i.key, () => h("span", { class: "tl-tick" }), (n, i) => {
      text(n, i.label);
      css(n, { left: pct(i.cut ? 0 : f(i.t)) });
      cls(n, "cut", !!i.cut);
    });
    text(E.nowLabel, l10n("지금 ", "Now ") + hhmm(win.now));
    css(E.nowLabel, { left: pct(nowX) });
    css(E.nowTick, { left: pct(nowX) });
    css(E.nowLine, { left: pct(nowX) });
    keyed(E.lines, ticks.filter((t) => f(t) > 0), (t) => "t" + t, () => h("i"), (n, t) => css(n, { left: pct(f(t)) }));
  }
  function groups(geo) {
    const resting = V.restingShown ? V.restingCount : 0, main = V.groups.slice(0, V.groups.length - resting);
    const items = [...main, ...V.restingCount ? [{ key: "rest", kind: "rest" }] : [], ...V.groups.slice(V.groups.length - resting)];
    let i = 0;
    keyed(E.groups, items, (g) => g.key, (g) => g.kind === "rest" ? makeRest() : makeGroup(), (n, g) => {
      css(n, { "--i": String(i++) });
      if (g.kind === "rest") {
        text(n.querySelector("span"), l10n("조용한 목표 ", "Quiet goals ") + V.restingCount);
        attr(n, "aria-expanded", String(V.restingShown));
        cls(n, "open", V.restingShown);
      } else updateGroup(n, g, geo);
    });
  }
  const makeRest = () => h("button", { type: "button", class: "tl-rest" }, h("i", { class: "tl-caret", "aria-hidden": "true" }), h("span"));
  function makeGroup() {
    const row = h("div", { class: "tl-row tl-goal tl-cols", role: "button", tabindex: "0" }, h("div", { class: "tl-lab" }, h("i", { class: "tl-caret", "aria-hidden": "true" }), h("span", { class: "tl-gname" }, h("span", { class: "tl-gid" }), h("span", { class: "tl-gt" })), h("button", { type: "button", class: "tl-idle" })), h("div", { class: "tl-time" }), h("div", { class: "tl-now" }, h("span", { class: "tl-w" }), h("span", { class: "tl-tx" }), h("span", { class: "tl-who" })));
    return h("section", { class: "tl-grp" }, row, h("div", { class: "tl-kids" }));
  }
  function updateGroup(sec, g, geo) {
    for (const s of STATES) cls(sec, "s-" + s, g.state === s);
    cls(sec, "open", g.open);
    cls(sec, "tl-standing", g.kind === "standing");
    const row = sec.firstElementChild, [lab, time, now] = row.children, gt = lab.querySelector(".tl-gt"), idle = lab.querySelector(".tl-idle");
    row.dataset.key = g.key;
    attr(row, "aria-expanded", String(g.open));
    text(lab.querySelector(".tl-gid"), g.kind === "goal" ? "#" + g.id : "");
    const words = goalWords(g);
    text(gt, words.text);
    attr(gt, "title", words.tip);
    const idleOpen = ui.idleShown.has(g.key);
    text(idle, g.idle ? idleOpen ? l10n("쉼 접기", "Fold idle") : l10n("쉼 ", "Idle ") + g.idle : "");
    idle.hidden = !g.idle || !g.open;
    attr(idle, "aria-expanded", String(idleOpen));
    const win = V.win, items = [];
    if (g.span && g.span.end > g.span.start) items.push({ key: "span", k: "tl-gs", s: g.span.start, e: g.span.end });
    for (const r of g.runs || []) items.push({ key: "run:" + Math.round(r.start / 1e3), k: "tl-gr", s: r.start, e: r.end });
    for (const s of g.owner || []) items.push({ key: "own:" + Math.round(s.start / 1e3), k: "tl-go", s: s.start, e: s.end, live: s.live });
    keyed(time, items, (i) => i.key, (i) => h("i", { class: i.k }, i.k === "tl-go" ? h("b", { class: "tl-tri" }) : null), (n, i) => {
      place(n, i.s, i.e, win);
      cls(n, "live", !!i.live);
    });
    const cell = goalCell(g, P.now, { ownerShown: g.open && g.rows.some((r) => r.kind === "owner") });
    text(now.querySelector(".tl-w"), cell.w);
    text(now.querySelector(".tl-tx"), cell.tx);
    text(now.querySelector(".tl-who"), cell.who);
    cls(now, "said", cell.said);
    keyed(sec.lastElementChild, g.rows, (r) => r.key, makeRow, (n, r) => updateRow(n, r, geo));
  }
  function place(n, s, e, win) {
    const span = win.end - win.start, a = Math.max(s, win.start), b = Math.min(e, win.end);
    css(n, { left: pct((a - win.start) / span), width: pct(Math.max(0, b - a) / span) });
  }
  function makeRow(r) {
    const row = h("div", { class: "tl-row tl-cols " + (r.kind === "owner" ? "tl-owner" : "tl-agent") }, h("div", { class: "tl-lab" }, h("span", { class: "tl-guides" }), h("span", { class: "tl-names" }, h("b", { class: "tl-name" }), h("span", { class: "tl-meta" }))), h("div", { class: "tl-time" }), h("div", { class: "tl-now" }, h("span", { class: "tl-w" }), h("time"), h("span", { class: "tl-by" }), h("span", { class: "tl-tx" })));
    if (r.kind === "agent") {
      row.dataset.node = "agent:" + r.id;
      row.tabIndex = 0;
    }
    return row;
  }
  function updateRow(n, r, geo) {
    for (const s of STATES) cls(n, "s-" + s, r.state === s);
    cls(n, "tl-hotrow", hot(r.state));
    const [lab, time, now] = n.children, guides = lab.firstElementChild, sig = r.guides.join(" ");
    if (guides.dataset.sig !== sig) {
      guides.dataset.sig = sig;
      guides.replaceChildren(...r.guides.map((g) => h("i", { class: "tl-g " + g })));
    }
    text(lab.querySelector(".tl-name"), r.kind === "owner" ? userKo() : r.name);
    text(lab.querySelector(".tl-meta"), r.kind === "owner" ? r.what : r.meta);
    const win = V.win, items = r.bars.map((b) => ({ key: b.key, b }));
    keyed(time, items, (i) => i.key, () => h("div", { class: "tl-bar" }, h("span", { class: "tl-bar-mark" }), h("span", { class: "tl-bar-text" }, h("b"), h("span")), h("span", { class: "tl-strip" })), (node, i) => updateBar(node, r, i.b, win, geo));
    const cell = nowCell(P, r, P.now);
    text(now.querySelector(".tl-w"), cell.w);
    text(now.querySelector("time"), cell.time);
    text(now.querySelector(".tl-by"), cell.by);
    text(now.querySelector(".tl-tx"), cell.tx);
  }
  function updateBar(node, r, b, win, geo) {
    const span = win.end - win.start, s = Math.max(b.start, win.start), e = Math.min(b.end, win.end);
    const width = Math.max(0, e - s) / span, px = width * geo.track, ems = px / geo.em, owner = b.state === "owner";
    css(node, { left: pct((s - win.start) / span), width: pct(width) });
    for (const st of BAR_STATES) cls(node, st, b.state === st);
    cls(node, "live", !!b.live);
    cls(node, "cut", b.start < win.start || !!b.clipped);
    cls(node, "thin", px < 7);
    const [mark, words, strip] = node.children;
    const markText = owner ? ems >= 9 ? "▲ " + myTurn() : ems >= 1.8 ? "▲" : "" : "";
    text(mark, markText);
    const w = owner && ems < 20 ? null : barWords(r, b, ems - (markText.length > 1 ? 8.5 : 0), P.goals);
    text(words.firstElementChild, w ? w.id : "");
    text(words.lastElementChild, w?.title ? " " + w.title : "");
    const segs = b.turns.length > 1 && ems >= 2.6 ? b.turns.map((t) => {
      const ts = Math.max(t.start, s), te = Math.min(t.end, e);
      return te > ts || t.end === t.start ? [(ts - s) / (e - s || 1), Math.max(0, te - ts) / (e - s || 1), !!t.failed] : null;
    }).filter(Boolean) : [];
    const sig = segs.map(([l, w2, f]) => l.toFixed(4) + "," + w2.toFixed(4) + (f ? "f" : "")).join(";");
    if (strip.dataset.sig !== sig) {
      strip.dataset.sig = sig;
      strip.replaceChildren(...segs.map(([l, w2, f]) => css(h("i", { class: f ? "failed" : null }), { left: pct(l), width: pct(w2) })));
    }
  }
  function drawLinks() {
    if (!E || !V) return;
    const body = E.body, svg = E.svg, box = body.getBoundingClientRect(), rows = new Map();
    for (const n of body.querySelectorAll(".tl-row[data-key]")) if (!n.closest(".tl-out")) rows.set(n.dataset.key, n);
    const cell = body.querySelector(".tl-row .tl-time"), byKey = new Map(V.rows.map((r) => [r.key, r])), out = [];
    if (cell) {
      const t0 = cell.getBoundingClientRect(), span = V.win.end - V.win.start, X = (t) => t0.left - box.left + (t - V.win.start) / span * t0.width;
      for (const l of V.links) {
        const from = rows.get(l.from), to = rows.get(l.to), parent = byKey.get(l.from);
        if (!from || !to || !parent) continue;
        const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect(), bar = to.querySelector(".tl-bar"), bh = bar ? bar.offsetHeight : tr.height * 0.66;
        const under = parent.bars.some((b) => l.at >= b.start - 2e4 && l.at <= b.end + 2e4);
        const x1 = X(l.at), y1 = fr.top - box.top + (under ? (fr.height + bh) / 2 : fr.height / 2), x2 = X(l.toAt), y2 = tr.top - box.top + tr.height / 2;
        if (!(y2 > y1 + 2)) continue;
        const bend = Math.max(14, Math.min(48, Math.abs(x2 - x1) * 0.5)), mid = y1 + (y2 - y1) * 0.62;
        out.push({ key: l.key, from: l.from, to: l.to, x1, y1, d: "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "C" + x1.toFixed(1) + " " + mid.toFixed(1) + " " + (x2 - bend).toFixed(1) + " " + y2.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1) });
      }
    }
    svg.setAttribute("width", String(body.scrollWidth));
    svg.setAttribute("height", String(body.scrollHeight));
    keyed(svg, out, (l) => l.key, () => {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "tl-link");
      g.append(document.createElementNS(SVG, "path"), document.createElementNS(SVG, "circle"));
      return g;
    }, (g, l) => {
      g.dataset.from = l.from;
      g.dataset.to = l.to;
      const [path, dot] = g.children;
      if (path.getAttribute("d") !== l.d) {
        path.setAttribute("d", l.d);
        path.style.setProperty("d", 'path("' + l.d + '")');
      }
      dot.setAttribute("r", "2.4");
      dot.setAttribute("cx", l.x1.toFixed(1));
      dot.setAttribute("cy", l.y1.toFixed(1));
      dot.style.setProperty("cx", l.x1.toFixed(1) + "px");
      dot.style.setProperty("cy", l.y1.toFixed(1) + "px");
    });
    if (card?.hot) card.refresh();
  }
  function links() {
    if (Date.now() < still) return;
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    frame = requestAnimationFrame(drawLinks);
    settle = setTimeout(drawLinks, 480);
  }
  function moving(run, ms = 700) {
    card?.close();
    const quiet = reduced() ? 0 : ms;
    still = Date.now() + quiet;
    E.svg.classList.add("tl-off");
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    run();
    settle = setTimeout(() => {
      still = 0;
      if (resized()) paint();
      drawLinks();
      E.svg.classList.remove("tl-off");
    }, quiet);
  }
  function setRange(id) {
    if (id === ui.range || !rangeOf(id) || rangeOf(id).id !== id) return;
    ui.range = id;
    saved.set(RANGE_KEY, id);
    E.root.dataset.range = id;
    for (const b of E.ranges) attr(b, "aria-pressed", String(b.dataset.tlRange === id));
    moving(paint);
  }
  function toggleNow() {
    ui.nowOpen = !ui.nowOpen;
    saved.set(NOW_KEY, ui.nowOpen ? "open" : "folded");
    attr(E.toggle, "aria-expanded", String(ui.nowOpen));
    attr(E.toggle, "aria-label", ui.nowOpen ? l10n("지금 열 접기", "Fold the Now column") : l10n("지금 열 펴기", "Open the Now column"));
    const root = E.root;
    clearTimeout(folding);
    root.classList.add("tl-folding");
    moving(() => {
      root.dataset.now = ui.nowOpen ? "open" : "folded";
    }, 560);
    folding = setTimeout(() => root.classList.remove("tl-folding"), 600);
  }
  function fold(key) {
    const g = V?.groups.find((x) => x.key === key);
    if (!g) return;
    if (g.open) {
      ui.opened.delete(key);
      ui.folded.add(key);
    } else {
      ui.folded.delete(key);
      ui.opened.add(key);
    }
    moving(paint, 520);
  }
  const flip = (set, key) => {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  };
  function click(e) {
    const t = e.target, range = t.closest("[data-tl-range]"), jumpTo = t.closest("[data-tl-jump]");
    if (range) {
      setRange(range.dataset.tlRange);
      return;
    }
    if (jumpTo) {
      jump(jumpTo.dataset.tlJump);
      return;
    }
    if (t.closest(".tl-now-toggle")) {
      toggleNow();
      return;
    }
    const idle = t.closest(".tl-idle");
    if (idle) {
      const key = idle.closest(".tl-grp").dataset.key;
      flip(ui.idleShown, key);
      moving(paint, 520);
      return;
    }
    if (t.closest(".tl-rest")) {
      ui.restingShown = !ui.restingShown;
      moving(paint, 520);
      return;
    }
    const goal = t.closest(".tl-goal");
    if (goal) fold(goal.dataset.key);
  }
  function keydown(e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("tl-goal")) {
      e.preventDefault();
      e.stopPropagation();
      fold(e.target.dataset.key);
    }
  }
  function jump(state) {
    if (!V) return;
    const match = (r) => state === "owner" ? r.kind === "owner" && r.state === "owner" : r.kind === "agent" && r.state === state;
    const g = V.groups.find((x) => (x.all || []).some(match)) || V.groups.find((x) => x.state === state);
    if (!g) return;
    show(g, (g.all || []).find(match)?.key);
  }
  function show(g, rowKey) {
    if (!g.open || rowKey && !g.rows.some((r) => r.key === rowKey)) {
      ui.folded.delete(g.key);
      ui.opened.add(g.key);
      paint();
    }
    requestAnimationFrame(() => {
      const sel = rowKey ? '.tl-row[data-key="' + rowKey + '"]' : '.tl-goal[data-key="' + g.key + '"]';
      const node = [...E.body.querySelectorAll(sel)].find((n) => !n.closest(".tl-out")) || E.body.querySelector('.tl-goal[data-key="' + g.key + '"]');
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      node.classList.remove("tl-flash");
      void node.offsetWidth;
      node.classList.add("tl-flash");
      setTimeout(() => node.classList.remove("tl-flash"), 1700);
    });
  }
  return { mount, update, paint, jump, get range() {
    return ui.range;
  }, get nowOpen() {
    return ui.nowOpen;
  }, get view() {
    return V;
  }, get model() {
    return P;
  } };
}
