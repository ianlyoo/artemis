import { el, svg, number } from "./dom.js";
import { ems } from "../chat/chart-kind.js";
import { l10n } from "../names.js";
const palette = ["var(--series-1, var(--teal))", "var(--series-2, var(--gold))", "var(--series-3, var(--red))", "var(--series-4, var(--ink))", "var(--series-5, var(--muted))"];
let sequence = 0;
export function dataTable(columns, rows, { className = "", sortable = true, format = (v) => String(v ?? ""), numeric = (v) => typeof v === "number" } = {}) {
  const table = el("table", { class: "bv-table " + className }), head = el("thead"), body = el("tbody");
  const indices = rows.map((_, i) => i), collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
  let sorted = -1, ascending = true;
  const show = () => body.replaceChildren(...indices.map((i) => el("tr", {}, columns.map((_, c) => el("td", { class: numeric(rows[i]?.[c]) ? "bv-numeric" : "" }, format(rows[i]?.[c]))))));
  const cells = columns.map((name, column) => {
    const th = el("th", { scope: "col" });
    const action = () => {
      ascending = sorted === column ? !ascending : true;
      sorted = column;
      const value = (row) => String(row?.[column]?.t ?? row?.[column] ?? "");
      const asNumber = (text) => {
        const clean = text.trim().replace(/,/g, "").replace(/^−/, "-").replace(/%$/, "");
        return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(clean) ? Number(clean) : NaN;
      };
      indices.sort((a, b) => {
        const left = value(rows[a]), right = value(rows[b]), x = asNumber(left), y = asNumber(right);
        return (Number.isFinite(x) && Number.isFinite(y) ? x - y : collator.compare(left, right)) * (ascending ? 1 : -1) || a - b;
      });
      cells.forEach((cell, index) => {
        if (index === column) cell.setAttribute("aria-sort", ascending ? "ascending" : "descending");
        else cell.removeAttribute("aria-sort");
      });
      show();
    };
    th.append(sortable ? el("button", { type: "button", title: l10n("정렬", "Sort"), onclick: action }, name || "—", el("span", { class: "bv-sort", "aria-hidden": "true" }, "↕")) : document.createTextNode(name || "—"));
    return th;
  });
  head.append(el("tr", {}, cells));
  table.append(head, body);
  show();
  return el("div", { class: "bv-table-scroll", tabindex: "0", role: "region", "aria-label": l10n("표", "Table") }, table);
}
export function chart(block, { compact = false, width: wanted = null, colors = null, titles = true, round = false } = {}) {
  const labels = block.labels || [], series = block.series || [], values = series.flatMap((s) => s.values || []).filter(Number.isFinite);
  if (!labels.length || !values.length) return el("p", { class: "bv-muted" }, l10n("표시할 데이터가 없어요.", "No data to show."));
  let low = Math.min(0, ...values), high = Math.max(0, ...values), steps = 4;
  if (low === high) high = low + 1;
  if (compact || round) {
    const unit = 10 ** Math.floor(Math.log10((high - low) / 4)), step = [1, 2, 2.5, 5, 10].map((m) => m * unit).find((s) => Math.ceil(high / s) - Math.floor(low / s) <= 5);
    [low, high] = [Math.floor(low / step) * step, Math.ceil(high / step) * step];
    steps = Math.round((high - low) / step);
  }
  const ticks = Array.from({ length: steps + 1 }, (_, i) => low + (high - low) * i / steps);
  const left = compact ? Math.min(96, 14 + 8 * Math.max(...ticks.map((value) => number(value).length))) : 65, right = compact ? 10 : 20, top = compact ? 16 : 24;
  let plan = null;
  try {
    if (compact) plan = labelPlan(labels, { left, right });
  } finally {
    putRulerAway();
  }
  const width = compact ? plan.width : wanted ? Math.max(360, Math.round(wanted)) : Math.max(740, Math.min(2400, labels.length * 34)), height = compact ? top + 178 + plan.height : 306, bottom = compact ? plan.height : 54;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const y = (v) => top + (high - v) / (high - low) * plotHeight;
  const x = (i) => left + (compact || block.kind === "bar" ? (i + 0.5) / labels.length : labels.length === 1 ? 0.5 : i / (labels.length - 1)) * plotWidth;
  const graph = svg("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": block.title || (block.kind === "bar" ? l10n("막대 차트", "Bar chart") : l10n("선 차트", "Line chart")), class: compact ? "bv-chart bv-chart-compact" : "bv-chart" });
  if (!wanted || compact) graph.style.setProperty("min-width", compact ? `min(${width}px, 100%)` : width + "px");
  for (const value of ticks) {
    const yy = y(value);
    graph.append(svg("line", { x1: left, x2: width - right, y1: yy, y2: yy, class: "bv-grid" }), svg("text", { x: left - 12, y: yy + 4, "text-anchor": "end", class: "bv-axis bv-numeric" }, number(value)));
  }
  if (compact) graph.append(...xLabels(plan, x, top + plotHeight));
  else {
    const limit = 14, slot = plotWidth / Math.max(1, block.kind === "bar" ? labels.length : labels.length - 1);
    let widest = 0;
    if (wanted) try {
      widest = Math.max(...labels.map((label) => textWidth(String(label).slice(0, limit)) * 12)) + 14;
    } finally {
      putRulerAway();
    }
    const labelStep = Math.max(1, Math.ceil(labels.length / 9), wanted ? Math.ceil(widest / slot) : 1), last = labels.length - 1;
    labels.forEach((label, i) => {
      if (i % labelStep && i !== last) return;
      graph.append(svg("text", { x: x(i), y: height - 19, "text-anchor": i === 0 && block.kind !== "bar" ? "start" : i === last && block.kind !== "bar" ? "end" : "middle", class: "bv-axis" }, String(label).length > limit ? String(label).slice(0, limit - 1) + "…" : label, svg("title", {}, label)));
    });
  }
  series.forEach((item, s) => {
    const color = colors?.[s] ?? palette[s % palette.length], barWidth = plotWidth / labels.length * 0.68 / Math.max(series.length, 1);
    if (block.kind !== "bar") graph.append(svg("path", { d: item.values.map((value, i) => `${i ? "L" : "M"}${x(i)},${y(value)}`).join(" "), fill: "none", stroke: color, "stroke-width": 2.5, "stroke-dasharray": s >= palette.length ? "5 4" : "", "vector-effect": "non-scaling-stroke" }));
    item.values.forEach((value, i) => {
      const attrs = { fill: color, tabindex: "0", role: "img", "aria-label": `${labels[i]} · ${item.name}: ${number(value)}`, "data-index": i };
      const mark = block.kind === "bar" ? svg("rect", { ...attrs, x: x(i) - series.length * barWidth / 2 + s * barWidth, y: Math.min(y(0), y(value)), width: Math.max(1, barWidth - 2), height: Math.max(1, Math.abs(y(value) - y(0))), rx: 1 }) : svg("circle", { ...attrs, cx: x(i), cy: y(value), r: 3.5, stroke: "var(--surface)", "stroke-width": 1.5 });
      if (titles) mark.append(svg("title", {}, `${labels[i]} · ${item.name}: ${number(value)}`));
      graph.append(mark);
    });
  });
  const legend = el("div", { class: "bv-chart-legend" }, series.map((item, i) => el("span", {}, el("i", { style: { background: palette[i % palette.length] } }), item.name)));
  const details = el("details", { class: "bv-data-disclosure" }, el("summary", {}, l10n("데이터 표", "Data table")), dataTable([l10n("항목", "Item"), ...series.map((s) => s.name)], labels.map((label, i) => [label, ...series.map((s) => s.values[i])])));
  return el("figure", { class: "bv-visual" }, legend, el("div", { class: "bv-graphic-scroll" }, graph), details);
}
export const CHART_LIMITS = Object.freeze({ points: 500, series: 8 });
export function interactiveChart(whole, { compact = false, owner = null } = {}) {
  const labels = (whole.labels || []).slice(0, CHART_LIMITS.points);
  const series = (whole.series || []).slice(0, CHART_LIMITS.series).map((item) => ({ ...item, values: Array.isArray(item?.values) ? item.values.slice(0, labels.length) : [] }));
  const block = { ...whole, labels, series }, shown = series.map(() => true);
  if (!labels.length || !series.some((item) => item.values.some(Number.isFinite))) return chart(block, { compact });
  const cut = [whole.labels.length > labels.length && l10n(`항목 ${number(whole.labels.length)}개 중 처음 ${number(labels.length)}개`, `the first ${number(labels.length)} of ${number(whole.labels.length)} items`), whole.series.length > series.length && l10n(`계열 ${number(whole.series.length)}개 중 처음 ${number(series.length)}개`, `the first ${number(series.length)} of ${number(whole.series.length)} series`)].filter(Boolean);
  const many = series.length > 1, legend = el("div", { class: "bv-chart-legend cv-legend", role: many ? "group" : null, "aria-label": many ? l10n("계열 보이기", "Show series") : null });
  const scroll = el("div", { class: "bv-graphic-scroll" }), tip = el("div", { class: "cv-tip", role: "tooltip", hidden: true });
  const details = el("details", { class: "bv-data-disclosure" }, el("summary", {}, l10n("데이터 표 보기", "Show the data table")), dataTable([l10n("항목", "Item"), ...series.map((item) => item.name)], labels.map((label, i) => [label, ...series.map((item) => item.values?.[i])])));
  const figure = el("figure", { class: "bv-visual cv-chart" }, legend, el("div", { class: "cv-plot" }, scroll, tip), cut.length ? el("p", { class: "cv-cut" }, l10n(cut.join(", ") + "만 그렸어요", "Drew " + cut.join(", ") + " only")) : null, details);
  const color = (s) => palette[s % palette.length];
  if (many) series.forEach((item, s) => {
    const toggle = el("button", { type: "button", class: "cv-series", "aria-pressed": "true", title: l10n(item.name + " 보이기·숨기기", "Show or hide " + item.name) }, el("span", { class: "control-label" }, el("i", { style: { "--series": color(s) } }), item.name));
    toggle.addEventListener("click", () => {
      if (shown[s] && shown.filter(Boolean).length === 1) return;
      shown[s] = !shown[s];
      toggle.setAttribute("aria-pressed", String(shown[s]));
      draw(true);
    });
    legend.append(toggle);
  });
  if (block.unit) legend.append(el("span", { class: "cv-unit" }, block.unit));
  if (!legend.childNodes.length) legend.remove();
  let drawn = null, hideTimer = 0;
  function draw(force = false) {
    const box = scroll.clientWidth, axis = box && typeof getComputedStyle === "function" ? parseFloat(getComputedStyle(figure).getPropertyValue("--chart-axis")) : 0;
    const width = !compact && box && axis > 0 ? box * 12 / axis : null, key = width ? Math.round(width) : 0;
    if (!force && drawn !== null && Math.abs(key - drawn) < 6) return;
    drawn = key;
    const keep = series.map((_, s) => s).filter((s) => shown[s]);
    const drawing = chart({ ...block, series: keep.map((s) => series[s]) }, { compact, width, colors: keep.map(color), titles: false, round: true });
    const graph = drawing.querySelector?.("svg");
    if (!graph) {
      scroll.replaceChildren(drawing);
      return;
    }
    scroll.replaceChildren(graph);
    tip.hidden = true;
    hover(graph, keep);
  }
  function hover(graph, keep) {
    const marks = [...graph.querySelectorAll("[role=img][data-index]")], grid = [...graph.querySelectorAll(".bv-grid")].map((line) => Number(line.getAttribute("y1")));
    const top = Math.min(...grid), bottom = Math.max(...grid), bar = block.kind === "bar";
    const index = marks.map((mark) => Number(mark.dataset.index)), at = labels.map(() => []);
    marks.forEach((mark, n) => at[index[n]]?.push(mark));
    const centers = at.map((list) => list.length ? list.reduce((sum, mark) => sum + (mark.tagName.toLowerCase() === "rect" ? Number(mark.getAttribute("x")) + Number(mark.getAttribute("width")) / 2 : Number(mark.getAttribute("cx"))), 0) / list.length : NaN);
    const gaps = centers.slice(1).map((c, i) => c - centers[i]).filter((gap) => gap > 0), step = gaps.length ? Math.min(...gaps) : 40;
    const marker = bar ? svg("rect", { class: "cv-band", y: top, height: bottom - top, width: step * 0.92 }) : svg("line", { class: "cv-cross", y1: top, y2: bottom });
    marker.style.display = "none";
    graph.insertBefore(marker, graph.querySelector("[role=img]"));
    let lit = -1;
    const show = (i, clientY) => {
      clearTimeout(hideTimer);
      const on = i >= 0 && Number.isFinite(centers[i]) ? i : -1;
      if (on !== lit) {
        for (const mark of at[lit] ?? []) mark.classList.remove("is-on");
        for (const mark of at[on] ?? []) mark.classList.add("is-on");
        lit = on;
      }
      if (on < 0) {
        marker.style.display = "none";
        tip.hidden = true;
        graph.classList.remove("is-pointing");
        return;
      }
      const x = centers[i];
      if (bar) marker.setAttribute("x", x - step * 0.46);
      else {
        marker.setAttribute("x1", x);
        marker.setAttribute("x2", x);
      }
      marker.style.display = "";
      graph.classList.add("is-pointing");
      tip.replaceChildren(el("b", { class: "cv-tip-label" }, String(labels[i] ?? "")), ...keep.map((s) => el("span", { class: "cv-tip-row" }, el("i", { style: { background: color(s) } }), el("span", {}, series[s].name), el("b", { class: "bv-numeric" }, Number.isFinite(series[s].values?.[i]) ? number(series[s].values[i]) : "—"))), block.unit ? el("small", { class: "cv-tip-unit" }, block.unit) : "");
      tip.hidden = false;
      const plot = tip.parentNode.getBoundingClientRect(), ctm = graph.getScreenCTM?.();
      if (!ctm) return;
      const px = ctm.a * x + ctm.e - plot.left, y = (clientY ?? ctm.d * top + ctm.f) - plot.top, w = tip.offsetWidth, h = tip.offsetHeight, gap = 14;
      tip.style.left = (px + gap + w <= plot.width ? px + gap : Math.max(0, px - gap - w)) + "px";
      tip.style.top = Math.max(0, Math.min(y - h / 2, plot.height - h)) + "px";
    };
    const nearest = (event) => {
      const ctm = graph.getScreenCTM?.();
      if (!ctm) return -1;
      const x = (event.clientX - ctm.e) / ctm.a;
      let best = -1, distance = Infinity;
      centers.forEach((c, i) => {
        const d = Math.abs(c - x);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return distance <= step * 0.75 ? best : -1;
    };
    graph.addEventListener("pointermove", (event) => show(nearest(event), event.clientY));
    graph.addEventListener("pointerdown", (event) => show(nearest(event), event.clientY));
    graph.addEventListener("pointerleave", (event) => {
      clearTimeout(hideTimer);
      if (event.pointerType === "mouse") show(-1);
      else hideTimer = setTimeout(() => show(-1), 2600);
    });
    marks.forEach((mark, n) => {
      mark.addEventListener("focus", () => show(index[n]));
      mark.addEventListener("blur", () => show(-1));
    });
  }
  draw(true);
  let frame = 0;
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }) : null;
  watch?.observe(scroll);
  owner?.own?.(() => {
    watch?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(hideTimer);
  });
  return figure;
}
const PHONE_WIDTH = 360, LABEL_SIZES = [13, 12.5, 12, 11.5, 11], GAP = 4, LEAD = 1.25, BOX = 1.5, SLANT = Math.SQRT1_2;
export function labelPlan(labels, { width = PHONE_WIDTH, left, right, measure = textWidth }) {
  const texts = labels.map((label) => String(label ?? "").replace(/\s+/g, " ").trim()), n = texts.length;
  const fit = (slot2) => {
    for (const size of LABEL_SIZES) {
      const lines = texts.map((text) => wrap(text, (slot2 - GAP) / size, measure));
      if (lines.every((l) => l && l.length <= 3)) return { turn: 0, size, lines, height: 8 + size * (BOX + LEAD * (Math.max(...lines.map((l) => l.length)) - 1)) + 4 };
    }
    const long = Math.max(...texts.map(measure)), single = texts.map((text) => [text]);
    for (const size of LABEL_SIZES) if (slot2 * SLANT >= BOX * size && texts.every((text, i) => left + (i + 0.5) * slot2 - (measure(text) + BOX / 2) * size * SLANT >= 1)) return { turn: -45, size, lines: single, height: 6 + (long + BOX) * size * SLANT + 6 };
    for (const size of LABEL_SIZES) if (slot2 >= BOX * size + 1) return { turn: -90, size, lines: single, height: 6 + long * size + 6 };
    return null;
  };
  const plan = fit((width - left - right) / n);
  if (plan) return { ...plan, width };
  const slot = BOX * LABEL_SIZES.at(-1) + 1;
  return { ...fit(slot), width: left + right + n * slot };
}
function wrap(text, room, measure) {
  const pieces = text.split(" ").flatMap((word, w) => word.split(/(?=[(（[])/).map((part, p) => (w && !p ? " " : "") + part)), lines = [];
  for (const piece of pieces) {
    if (lines.length && measure(lines.at(-1) + piece) <= room) lines[lines.length - 1] += piece;
    else if (measure(piece.trim()) <= room) lines.push(piece.trim());
    else return null;
  }
  return lines;
}
function xLabels(plan, x, base) {
  return plan.lines.map((lines, i) => {
    const size = plan.size, at = x(i);
    if (!plan.turn) {
      const text = svg("text", { x: at, y: base + 8 + size * BOX / 2, "text-anchor": "middle", "dominant-baseline": "central", "font-size": size, class: "bv-label" });
      lines.forEach((line, j) => text.append(svg("tspan", { x: at, dy: j ? LEAD * size : null, "dominant-baseline": "central" }, line)));
      return text;
    }
    const top = base + 6 + (plan.turn === -45 ? size * BOX / 2 * SLANT : 0);
    return svg("text", { x: at, y: top, "text-anchor": "end", "dominant-baseline": "central", "font-size": size, transform: `rotate(${plan.turn} ${at} ${top})`, class: "bv-label" }, lines[0]);
  });
}
const widths = new Map();
let ruler = null;
export function textWidth(text) {
  if (widths.has(text)) return widths.get(text);
  let width = 0;
  if (typeof document !== "undefined" && document.body) {
    if (!ruler) {
      ruler = svg("text", { "font-size": 100 });
      const box = svg("svg", { width: 0, height: 0, "aria-hidden": "true" }, ruler);
      for (const [name, value] of [["position", "absolute"], ["visibility", "hidden"], ["pointer-events", "none"], ["font-family", "var(--font-sans)"], ["font-weight", "400"], ["font-style", "normal"], ["letter-spacing", "normal"]]) box.style.setProperty(name, value);
    }
    if (!ruler.isConnected) document.body.append(ruler.parentNode);
    ruler.textContent = text;
    width = ruler.getComputedTextLength() / 100;
  }
  widths.set(text, width > 0 || !text ? width : ems(text));
  return widths.get(text);
}
function putRulerAway() {
  ruler?.parentNode?.remove();
}
export function sketch(block) {
  const inks = { gold: "var(--gold)", warm: "var(--ink)", dim: "var(--muted)", cool: "var(--teal)", alert: "var(--red)" }, id = `bv-sketch-${++sequence}`;
  const graph = svg("svg", { viewBox: `0 0 ${block.w} ${block.h}`, role: "img", "aria-label": block.title || l10n("스케치", "Sketch"), class: "bv-sketch" });
  const defs = svg("defs");
  for (const [name, color] of Object.entries(inks)) defs.append(svg("marker", { id: `${id}-${name}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, svg("path", { d: "M0 0L10 5L0 10z", fill: color })));
  graph.append(defs);
  for (const s of block.shapes || []) {
    const color = inks[s.ink] || inks.gold, common = { stroke: color, "stroke-width": s.width || 2, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
    if (s.k === "path" && /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(s.d)) graph.append(svg("path", { ...common, d: s.d }));
    else if (s.k === "rect") graph.append(svg("rect", { ...common, x: s.at[0], y: s.at[1], width: s.size[0], height: s.size[1], rx: s.r || 0, fill: s.fill ? color : "none", "fill-opacity": s.fill ? 0.14 : 1 }));
    else if (s.k === "circle") graph.append(svg("circle", { ...common, cx: s.c[0], cy: s.c[1], r: s.r, fill: s.fill ? color : "none", "fill-opacity": s.fill ? 0.14 : 1 }));
    else if (s.k === "text") graph.append(svg("text", { x: s.at[0], y: s.at[1], fill: color, "font-size": { s: 16, m: 23, l: 34 }[s.size] || 23 }, s.text));
    else if (s.k === "line" || s.k === "arrow") {
      graph.append(svg("line", { ...common, x1: s.from[0], y1: s.from[1], x2: s.to[0], y2: s.to[1], ...s.k === "arrow" ? { "marker-end": `url(#${id}-${s.ink || "gold"})` } : {} }));
      if (s.label) graph.append(svg("text", { x: (s.from[0] + s.to[0]) / 2, y: (s.from[1] + s.to[1]) / 2 - 12, fill: color, "text-anchor": "middle", "font-size": 16 }, s.label));
    }
  }
  return el("figure", { class: "bv-visual" }, graph);
}
