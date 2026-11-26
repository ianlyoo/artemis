import { el, svg, number } from "../boards/dom.js";
import { interactiveChart } from "../boards/graphics.js";
import { visualKind } from "./kinds.js";
import { INLINE_MARKS } from "../md.js";
import { sourceView, statusWord, isStatusValue, cellText, seriesName, unitOf, rowQuestion, shortTime, provenanceLine, whenDay, dayLine } from "./visual-labels.js";
import { chartKind, isShare, levelOf, scaleTop, columnLabels, labelStep, ems as labelEms, WARN_AT, STOP_AT } from "./chart-kind.js";
import { tableColumns, keyColumn, rowKey, nextSort, sortedOrder, changes } from "./table-model.js";
import { lead, l10n, lang } from "../names.js";
const PENDING = { chart: "Drawing the chart…", table: "Building the table…", timeline: "Building the timeline…", diagram: "Drawing the diagram…", sketch: "Drawing…", open: "Opening…" };
const ITEMS = 5;
const glued = (text) => String(text ?? "").replace(/(?<=\S)·/g, "⁠·");
const LONG_WORD = 8;
const long = (text) => labelEms(text.replace(/\u2060/g, "")) > LONG_WORD;
const whole = (text) => text.split(/(\s+)/).map((part) => long(part) ? el("span", { class: "cv-long" }, part) : part);
function breakLong(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) {
      if (child.data.split(/\s+/).some(long)) child.replaceWith(...whole(child.data));
    } else if (child.nodeType === 1 && !child.classList.contains("cv-long")) breakLong(child);
  }
  return node;
}
export const wholeCells = (root) => {
  for (const cell of root.querySelectorAll(".bv-table td, .bv-table th")) breakLong(cell);
  return root;
};
export function control(label, { type = "button", class: name = "", ...attrs } = {}) {
  return el("button", { type, class: ("text-control " + name).trim(), ...attrs }, el("span", { class: "control-label" }, label));
}
export const problem = (message, retry) => el("div", { class: "bv-problem", role: "status" }, el("span", {}, message), retry && el("button", { type: "button", class: "bv-button", onclick: retry }, "Retry"));
export function refusedVisual(segment) {
  const copy = control(l10n("원문 복사", "Copy the source"), { class: "cv-copy", onclick: async () => {
    try {
      await navigator.clipboard.writeText("```" + segment.lang + "\n" + segment.text + "\n```");
      copy.querySelector("span").textContent = l10n("복사됨", "Copied");
    } catch {
      copy.querySelector("span").textContent = l10n("복사하지 못했어요", "Couldn't copy");
    }
  } });
  return el("div", { class: "cv-refused", role: "status" }, el("span", {}, segment.lang === "diagram" ? l10n("그림을 표시하지 못했어요 · mermaid로 작성해 주세요", "Couldn't draw this · write it in mermaid") : l10n("그림을 표시하지 못했어요", "Couldn't draw this")), copy);
}
const dot = (tone) => el("i", { class: "st-dot", "data-tone": tone, "aria-hidden": "true" });
const status = (value, view) => {
  const { word, tone } = statusWord(value, view);
  return el("span", { class: "st", "data-tone": tone }, dot(tone), el("span", { class: "st-word" }, word));
};
function setText(node, text, glow) {
  if (node.textContent === text) return;
  node.textContent = text;
  if (glow) {
    node.classList.remove("is-changed");
    void node.offsetWidth;
    node.classList.add("is-changed");
  }
}
function table(block, ctx) {
  const view = sourceView(block.src)?.view ?? null;
  let columns = tableColumns(block, view), rows = (block.rows ?? []).filter(Array.isArray), sort = null;
  let by = keyColumn(rows, columns), glow = changes(null, rows, columns, by);
  const open = new Set();
  const colgroup = el("colgroup"), headRow = el("tr"), body = el("tbody");
  const grid = el("table", { class: "cv-table" }, colgroup, el("thead", {}, headRow), body);
  const node = el("div", { class: "cv-table-box", role: "region", "aria-label": block.title || "Table" }, grid);
  let fitting = false;
  const fit = () => {
    fitting = false;
    if (!node.isConnected) return;
    const wide = () => grid.getBoundingClientRect().width > node.clientWidth + 0.5;
    grid.classList.remove("is-tight", "is-stacked");
    if (wide()) grid.classList.add("is-tight");
    if (wide()) grid.classList.add("is-stacked");
  };
  const refit = () => {
    if (!fitting) {
      fitting = true;
      requestAnimationFrame(fit);
    }
  };
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(refit) : null;
  watch?.observe(node);
  watch?.observe(grid);
  function cell(column, row, key) {
    const value = row[column.index], td = el("td", { class: "is-" + column.kind, "data-label": column.label });
    if (column.kind === "status" && isStatusValue(value)) td.append(status(value, view));
    else if (ctx.link && INLINE_MARKS.test(String(value ?? ""))) td.append(breakLong(ctx.link(String(value))));
    else if (column.kind === "id") td.textContent = value == null || value === "" ? "—" : String(value);
    else if (column.kind === "text") td.append(...whole(glued(cellText(column.key, value, view))));
    else td.textContent = cellText(column.key, value, view);
    if (column.kind === "time" && value) td.title = String(value);
    if (glow.cells.has(key + "\0" + column.index)) td.classList.add("is-changed");
    return td;
  }
  function head() {
    colgroup.replaceChildren(...columns.map((column) => el("col", { class: "is-" + column.kind })));
    headRow.replaceChildren(...columns.map((column) => {
      const on = sort?.index === column.index;
      return el("th", { class: "is-" + column.kind, scope: "col", "aria-sort": on ? sort.dir === "asc" ? "ascending" : "descending" : null }, el("button", { type: "button", class: "cv-sort", title: "Sort by " + column.label, onclick: () => {
        sort = nextSort(sort, column);
        head();
        draw();
      } }, el("span", { class: "control-label" }, column.label), el("i", { class: "cv-sort-mark", "aria-hidden": "true" }, on ? sort.dir === "asc" ? "↑" : "↓" : "")));
    }));
  }
  function line(row, n) {
    const key = rowKey(row, n, by), cells = Object.fromEntries(columns.map((column) => [column.key, row[column.index]]));
    const tr = el("tr", { tabindex: "0", "data-key": key, class: [open.has(key) ? "is-open" : "", glow.added.has(key) ? "is-added" : ""].filter(Boolean).join(" ") || null, title: `Click to put a question for ${lead()} in the field` }, columns.map((column) => cell(column, row, key)));
    const pick = () => {
      if (open.has(key)) open.delete(key);
      else open.add(key);
      tr.classList.toggle("is-open", open.has(key));
      const question = open.has(key) && rowQuestion(view, cells);
      if (question) ctx.prefill?.(question);
    };
    tr.addEventListener("click", (event) => {
      if (!event.target.closest?.("a") && !event.target.closest?.("button")) pick();
    });
    tr.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.isComposing) {
        event.preventDefault();
        pick();
      }
    });
    return tr;
  }
  function draw() {
    body.replaceChildren(...sortedOrder(rows, columns, sort, view).map((n) => line(rows[n], n)));
  }
  head();
  draw();
  return { node, update(next) {
    const fresh = tableColumns(next, view), nextRows = (next.rows ?? []).filter(Array.isArray);
    const same = fresh.length === columns.length && fresh.every((column, n) => column.key === columns[n].key);
    const was = by, before = same ? rows : null;
    by = keyColumn(nextRows, fresh, before);
    glow = changes(before, nextRows, fresh, by);
    if (by?.key !== was?.key) open.clear();
    if (!same) sort = null;
    columns = fresh;
    rows = nextRows;
    if (!same) head();
    draw();
    if (watch) refit();
  } };
}
function columnsChart(block, ctx) {
  const share = isShare(block), unit = unitOf(block);
  const plot = el("div", { class: "cv-bars", role: "img" }), key = el("div", { class: "cv-key" });
  const node = el("div", { class: "cv-bars-box" }, plot, key);
  let last = null;
  function draw(next, glow) {
    const labels = (next.labels ?? []).map(String), first = (next.series ?? [])[0], values = (first?.values ?? []).map((value) => Number.isFinite(value) ? value : NaN);
    const written = columnLabels(labels), step = labelStep(written);
    const top = scaleTop(values, share), ticks = [0, top / 2, top];
    plot.style.setProperty("--tick-ch", Math.max(...ticks.map((tick) => number(tick).length)));
    const before = glow && last ? new Map(last.labels.map((label, n) => [label, last.values[n]])) : null;
    const shown = (value) => Number.isFinite(value) ? number(value) : "—";
    const cols = labels.map((label, n) => {
      const value = values[n], ok = Number.isFinite(value), old = before?.get(label), moved = before && Number.isFinite(old) && ok && old !== value;
      return el("div", { class: "cv-col" + (moved ? " is-changed" : ""), "data-tone": ok ? levelOf(value, share) : "none", style: { "--v": ok ? Math.max(0, Math.min(1, value / top)).toFixed(4) : "0", "--x": step === 1 ? +labelEms(written[n]).toFixed(2) : 0 }, title: `${label} ${shown(value)}${share && ok ? "%" : unit && ok ? " " + unit : ""}` }, el("span", { class: "cv-val" }, el("b", {}, shown(value))), el("i", { class: "cv-bar", "aria-hidden": "true" }), el("span", { class: "cv-x", hidden: n % step ? true : null }, written[n]));
    });
    plot.replaceChildren(el("div", { class: "cv-grid", "aria-hidden": "true" }, ticks.map((tick) => el("span", { class: "cv-tick", style: { "--at": String(tick / top) } }, el("b", {}, number(tick))))), el("div", { class: "cv-cols" }, cols));
    plot.setAttribute("aria-label", `${next.title || "Bar chart"}: ` + labels.map((label, n) => `${label} ${shown(values[n])}`).join(", "));
    const note = !share && unit && !String(next.title ?? "").includes(unit) ? el("span", { class: "cv-key-unit" }, `Unit: ${unit}`) : null;
    key.replaceChildren(...[note, ...share ? [["go", `Under ${WARN_AT}%`], ["wait", `Over ${WARN_AT}%`], ["stop", `Over ${STOP_AT}%`]].map(([tone, words]) => el("span", { class: "cv-key-item", "data-tone": tone }, el("i", { class: "cv-key-dot" }), words)) : []].filter(Boolean));
    key.hidden = !key.childNodes.length;
    last = { labels, values };
  }
  draw(block, false);
  return { node, update(next) {
    draw(next, true);
  } };
}
const PALETTE = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const withUnit = (value, unit) => unit === "%" ? number(value) + "%" : unit ? number(value) + " " + unit : number(value);
function bars(block, ctx) {
  const view = sourceView(block.src)?.view ?? null, share = isShare(block), unit = share ? "%" : unitOf(block), node = el("div", { class: "bl-wrap" });
  let current = block;
  function draw(next, glow) {
    const labels = next.labels ?? [], series = next.series ?? [], many = series.length > 1;
    const top = scaleTop(series.flatMap((item) => item.values ?? []), share);
    const old = node.querySelector(".bl");
    const list = old ?? el("div", { class: "bl", role: "list" });
    const legend = many ? el("p", { class: "bl-legend" }, series.map((item, s) => el("span", {}, el("i", { style: { "--series": PALETTE[s % PALETTE.length] } }), seriesName(item.name, view)))) : null;
    const rows = labels.map((label, i) => {
      let row = old?.querySelector(`[data-label="${CSS.escape(String(label))}"]`);
      if (!row) {
        row = el("div", { class: "bl-row", role: "listitem", tabindex: "0", "data-label": String(label) }, el("span", { class: "bl-label" }, String(label)), el("span", { class: "bl-track" }, series.map(() => el("i", { class: "bl-bar" }))), el("span", { class: "bl-value" }));
        const ask = () => {
          const question = rowQuestion(view, { [block.x ?? "label"]: label, seat: label, label });
          if (question) ctx.prefill?.(question);
        };
        row.addEventListener("click", ask);
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            ask();
          }
        });
      }
      const bars2 = row.querySelectorAll(".bl-bar");
      series.forEach((item, s) => {
        const value = item.values?.[i], bar = bars2[s];
        if (!bar) return;
        bar.style.setProperty("--v", Number.isFinite(value) ? Math.max(0, Math.min(1, value / top)).toFixed(4) : 0);
        bar.dataset.tone = many ? "" : levelOf(value, share);
        if (many) bar.style.setProperty("--series", PALETTE[s % PALETTE.length]);
      });
      const text = series.map((item) => Number.isFinite(item.values?.[i]) ? withUnit(item.values[i], unit) : "—").join(" · ");
      setText(row.querySelector(".bl-value"), text, glow);
      row.setAttribute("aria-label", `${label}: ${text}`);
      return row;
    });
    list.replaceChildren(...rows);
    const scale = el("p", { class: "bl-scale", "aria-hidden": "true" }, el("span"), el("span", { class: "bl-ends" }, el("span", {}, "0"), el("span", {}, withUnit(top, unit))), el("span"));
    node.replaceChildren(...[legend, list, scale].filter(Boolean));
  }
  draw(block, false);
  return { node, update(next) {
    current = next;
    draw(next, true);
  }, get block() {
    return current;
  } };
}
function sparkline(values, { width = 132, height = 34 } = {}) {
  const finite = values.filter(Number.isFinite), low = Math.min(...finite), high = Math.max(...finite), span = high - low || 1, pad = 3;
  const x = (i) => pad + i / Math.max(1, values.length - 1) * (width - pad * 2), y = (v) => pad + (high - v) / span * (height - pad * 2);
  const points = values.map((v, i) => Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null).filter(Boolean);
  const lastAt = values.length - 1 - [...values].reverse().findIndex(Number.isFinite);
  return svg("svg", { class: "sp", viewBox: `0 0 ${width} ${height}`, width, height, "aria-hidden": "true" }, svg("path", { class: "sp-area", d: `M${points[0]} L${points.join(" L")} L${x(lastAt).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z` }), svg("path", { class: "sp-line", d: "M" + points.join(" L") }), svg("circle", { class: "sp-end", cx: x(lastAt).toFixed(1), cy: y(values[lastAt]).toFixed(1), r: 2.6 }));
}
function lines(block, ctx, env, owner) {
  const view = sourceView(block.src)?.view ?? null, unit = unitOf(block), node = el("div", { class: "sp-wrap" });
  let expanded = false, chartNode = null, current = block;
  const toggle = control("Expand", { class: "sp-more", "aria-expanded": "false", onclick: () => {
    expanded = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.firstChild.textContent = expanded ? "Collapse" : "Expand";
    node.closest(".cv")?.classList.toggle("is-wide", expanded);
    if (expanded) {
      chartNode = full(current, env, owner, view);
      node.append(chartNode);
    } else {
      chartNode?.remove();
      chartNode = null;
    }
  } });
  function draw(next) {
    const labels = next.labels ?? [];
    const rows = (next.series ?? []).map((item, s) => {
      const values = item.values ?? [], at = values.length - 1, latest = values[at], before = values[at - 1];
      const change = Number.isFinite(latest) && Number.isFinite(before) ? latest - before : null;
      const line = sparkline(values);
      line.style.setProperty("--series", PALETTE[s % PALETTE.length]);
      return el("div", { class: "sp-row" }, el("span", { class: "sp-name" }, seriesName(item.name, view)), line, el("span", { class: "sp-now" }, el("b", {}, Number.isFinite(latest) ? withUnit(latest, unit) : "—"), labels[at] ? el("span", { class: "sp-at" }, labels[at]) : null), change === null ? el("span") : el("span", { class: "sp-change", "data-way": change > 0 ? "up" : change < 0 ? "down" : "flat", title: `vs ${labels[at - 1] ?? "the one before"}` }, (change > 0 ? "▲ " : change < 0 ? "▼ " : "") + (change === 0 ? "Flat" : withUnit(Math.abs(change), unit))));
    });
    const range = labels.length > 1 ? el("p", { class: "sp-range" }, `${labels[0]} – ${labels.at(-1)} · ${number(labels.length)} points`) : null;
    node.replaceChildren(el("div", { class: "sp-list" }, rows), el("div", { class: "sp-foot" }, range, toggle), ...chartNode ? [chartNode] : []);
    if (chartNode) {
      const again = full(next, env, owner, view);
      chartNode.replaceWith(again);
      chartNode = again;
    }
  }
  draw(block);
  return { node, update(next) {
    current = next;
    draw(next);
  } };
}
function full(block, env, owner, view) {
  const named = { ...block, series: (block.series ?? []).map((item) => ({ ...item, name: seriesName(item.name, view) })) };
  const unit = unitOf(block);
  if (unit) named.unit = unit;
  return el("div", { class: "cv-full" }, interactiveChart(named, { compact: env.phone, owner }));
}
function timeline(block, ctx) {
  const view = sourceView(block.src)?.view ?? null, node = el("div", { class: "tl-wrap" + (ctx.phone ? " is-phone" : "") });
  let items = block.items ?? [], all = ctx.whole;
  const earlier = control("", { class: "tl-more", onclick: () => {
    all = !all;
    draw();
  } });
  function draw(glow = false) {
    const now = Date.now(), days = items.map((item) => whenDay(item.when, now)), dated = items.length > 0 && days.every(Boolean);
    const ahead = dated && days.some((day) => day.at > now), byDay = ctx.phone && dated;
    const from = all || ahead ? 0 : Math.max(0, items.length - ITEMS), list = el("ol", { class: "tl" });
    const states = new Set(items.map((item) => String(item.detail ?? ""))), shared = states.size === 1 && items[0]?.detail ? statusWord(items[0].detail, view) : null;
    const sharedKnown = shared && shared.word !== String(items[0].detail).trim();
    let last = null;
    items.slice(from).forEach((item, n) => {
      const key = from + n, state = item.detail && !sharedKnown ? statusWord(item.detail, view) : null, known = state && state.word !== String(item.detail).trim();
      if (byDay && days[key].day !== last) {
        last = days[key].day;
        list.append(el("li", { class: "tl-day" }, dayLine(last, now)));
      }
      list.append(el("li", { class: "tl-item" }, el("time", { class: "tl-when", title: item.when }, byDay ? days[key].time : shortTime(item.when)), el("span", { class: "tl-mark" }, dot(known ? state.tone : sharedKnown ? shared.tone : "idle")), el("span", { class: "tl-what" }, el("span", { class: "tl-label" }, item.label), item.detail && !known && !sharedKnown ? el("span", { class: "tl-detail" }, item.detail) : null), known ? el("span", { class: "tl-state st", "data-tone": state.tone }, el("span", { class: "st-word" }, state.word)) : el("span")));
    });
    earlier.hidden = items.length <= ITEMS || ctx.whole || ahead;
    earlier.firstChild.textContent = ctx.phone && lang() !== "en" ? all ? `최근 ${ITEMS}개만 보기` : `이전 ${number(items.length - ITEMS)}개 더 보기` : all ? "Show recent only" : `Show ${number(items.length - ITEMS)} earlier`;
    const summary = sharedKnown ? el("p", { class: "lt-summary" }, el("span", { class: "st", "data-tone": shared.tone }, dot(shared.tone), el("span", { class: "st-word" }, (ctx.phone ? l10n("모두 ", "All ") : "All ") + shared.word), el("b", { class: "st-n" }, number(items.length)))) : null;
    node.replaceChildren(...[summary, earlier, list].filter(Boolean));
    if (glow) list.classList.add("is-changed");
  }
  draw();
  return { node, update(next) {
    const changed = JSON.stringify(next.items) !== JSON.stringify(items);
    items = next.items ?? [];
    draw(changed);
  } };
}
export function chatBlocks({ renderBlock, prose, openBlock = null, prefill = null, mode = "chat" }) {
  return function render(block, node, owner, env) {
    if (block?.src !== void 0 && !block.as_of) return renderBlock(block, node, owner, env);
    if (!visualKind(block)) {
      renderBlock(block, node, owner, env);
      return null;
    }
    let current = block;
    const whole2 = mode === "pane", ctx = { phone: !!env.phone, whole: whole2, prefill, link: (text) => prose(text, env, true) };
    node.dataset.type = block.type;
    node.classList.add("cv", "cv-" + block.type);
    if (block.title) node.append(el("div", { class: "cv-head" }, el("span", { class: "cv-title" }, block.title)));
    const actions = openBlock && !env.phone ? el("div", { class: "cv-actions" }, control("Open as board", { class: "cv-open", title: "Open it large in the side pane", onclick: () => openBlock(current) })) : null;
    let drawn = null;
    if (block.type === "table") drawn = table(block, ctx);
    else if (block.type === "chart") {
      const kind = chartKind(block), drawnKind = kind === "line" && whole2 ? "full" : kind;
      node.dataset.chart = drawnKind;
      if (drawnKind === "column") drawn = columnsChart(block, ctx);
      else if (drawnKind === "bar") drawn = bars(block, ctx);
      else if (drawnKind === "line") drawn = lines(block, ctx, env, owner);
      else drawn = { node: full(block, env, owner, sourceView(block.src)?.view ?? null) };
    } else if (block.type === "timeline") drawn = timeline(block, ctx);
    else {
      const plain = { ...block };
      delete plain.title;
      drawn = renderBlock(plain, node, owner, env) ?? {};
      node.dataset.type = block.type;
    }
    if (drawn.node) node.append(drawn.node);
    if (actions) {
      const existing = node.querySelector(".cv-actions");
      if (existing) existing.append(...actions.childNodes);
      else node.append(actions);
    }
    let line = null;
    if (whole2 && typeof block.provenance === "string") {
      line = el("p", { class: "chat-provenance", title: block.provenance }, provenanceLine(block.provenance, block.src));
      node.append(line);
    }
    return drawn.update ? { update: (next) => {
      current = next;
      drawn.update(next);
      if (line && typeof next.provenance === "string") line.textContent = provenanceLine(next.provenance, next.src);
    } } : null;
  };
}
export function pendingVisual(kind) {
  const busy = el("section", { class: "bv-block cv cv-pending", "data-segment": "pending", "data-pending": kind, "aria-busy": "true" }, el("div", { class: "cv-head" }, el("span", { class: "cv-title cv-shimmer" }, PENDING[kind] ?? "Drawing…")));
  if (kind !== "open") busy.append(el("div", { class: "cv-pending-plot", "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i"), el("i")));
  return busy;
}
