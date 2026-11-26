import { el, number } from "../boards/dom.js";
import { tableColumns, nextSort, sortedOrder, TONE_ORDER } from "../chat/table-model.js";
import { statusWord } from "../chat/visual-labels.js";
import { ems } from "../chat/chart-kind.js";
import { STATUS, REQUEST, DECISION } from "./ledger.js";
import { ledgerRef } from "../names.js";
import { zoned } from "../zone.js";
const REF = () => new RegExp(`^\\[(#\\d+)\\]\\(${ledgerRef()}:(?:goal|request|approval)\\/\\d+\\)$`);
export const plainCell = (value) => {
  const text = String(value ?? ""), ref = REF().exec(text);
  return ref ? ref[1] : text.replace(/\\([\\`*_[\]<>|~#])/g, "$1");
};
const RAW = new Map([...Object.entries(DECISION), ...Object.entries(REQUEST), ...Object.entries(STATUS)].map(([raw, word]) => [word, raw]));
const toneOf = (word) => statusWord(RAW.get(word) ?? word).tone;
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const glued = (text) => String(text ?? "").replace(/(?<=\S)·/g, "⁠·");
const LONG_WORD = 8;
const whole = (text) => text.split(/(\s+)/).map((part) => ems(part.replace(/\u2060/g, "")) > LONG_WORD ? el("span", { class: "cv-long" }, part) : part);
const TIMES = /* @__PURE__ */ new Set(["Updated", "Received", "Done", "Decided", "Opened", "Created", "Checked"]);
const monthDay = zoned("en-US", { month: "numeric", day: "numeric" });
const zoneToday = () => {
  const part = Object.fromEntries(monthDay.formatToParts(/* @__PURE__ */ new Date()).map((one) => [one.type, one.value]));
  return Number(part.month) * 100 + Number(part.day);
};
const stamp = (word, today) => {
  const at = /^(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2})$/.exec(String(word));
  if (!at) return null;
  const day = Number(at[1]) * 100 + Number(at[2]);
  return (day > today ? 0 : 1e8) + day * 1e4 + Number(at[3]) * 100 + Number(at[4]);
};
function order(rows, columns, sort) {
  const column = sort && columns.find((one) => one.index === sort.index);
  if (column?.kind !== "status" && column?.kind !== "time") return sortedOrder(rows, columns, sort);
  const today = zoneToday(), key = column.kind === "status" ? (word) => word == null || word === "" ? null : [TONE_ORDER.indexOf(toneOf(word)), word] : (word) => {
    const at = stamp(word, today);
    return at == null ? null : [at, ""];
  };
  const sign = sort.dir === "desc" ? -1 : 1, keys = rows.map((row) => key(row[column.index]));
  return rows.map((_, n) => n).sort((a, b) => {
    const x = keys[a], y = keys[b];
    if (!x || !y) return !x && !y ? a - b : !x ? 1 : -1;
    return sign * (x[0] - y[0] || collator.compare(x[1], y[1])) || a - b;
  });
}
export function ledgerTable(block, node, { prose, env, owner = null, mark = () => {
} }) {
  const rows = (block?.rows ?? []).filter(Array.isArray), plain = rows.map((row) => row.map(plainCell));
  const keys = (block?.columns ?? []).map(String);
  const columns = tableColumns({ columns: keys.map((key) => TIMES.has(key) ? "at" : key), rows: plain }).map((column) => ({ ...column, key: keys[column.index], label: keys[column.index] }));
  const clamped = columns.some((column) => column.clamp), open = /* @__PURE__ */ new Set();
  let sort = null;
  const headRow = el("tr"), body = el("tbody");
  const grid = el("table", { class: "cv-table" }, el("colgroup", {}, columns.map((column) => el("col", { class: "is-" + column.kind }))), el("thead", {}, headRow), body);
  const box = el("div", { class: "cv-table-box", tabindex: "0", role: "region", "aria-label": block?.title || "Table" }, grid);
  function cell(column, n) {
    const value = rows[n][column.index], td = el("td", { class: "is-" + column.kind });
    if (value == null || value === "") td.textContent = "—";
    else if (column.kind === "status") {
      const word = plain[n][column.index], tone = toneOf(word);
      td.append(el("span", { class: "st", "data-tone": tone }, el("i", { class: "st-dot", "data-tone": tone, "aria-hidden": "true" }), el("span", { class: "st-word" }, word)));
    } else if (REF().test(String(value))) td.append(prose(String(value), env, true));
    else if (column.kind !== "text") td.textContent = plain[n][column.index];
    else td.append(...column.clamp ? [el("span", { class: "cv-clamp" }, whole(glued(plain[n][column.index])))] : whole(glued(plain[n][column.index])));
    return td;
  }
  function line(n) {
    const tr = el("tr", { tabindex: "0", class: open.has(n) ? "is-open" : null, title: clamped ? "Click to show the row whole" : null }, columns.map((column) => cell(column, n)));
    const pick = () => {
      if (open.has(n)) open.delete(n);
      else open.add(n);
      tr.classList.toggle("is-open", open.has(n));
    };
    tr.addEventListener("click", (event) => {
      if (!event.target.closest?.("a") && !event.target.closest?.("button")) pick();
    });
    tr.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.isComposing && event.target === tr) {
        event.preventDefault();
        pick();
      }
    });
    return tr;
  }
  function head() {
    headRow.replaceChildren(...columns.map((column) => {
      const on = sort?.index === column.index;
      return el("th", { class: "is-" + column.kind, scope: "col", "aria-sort": on ? sort.dir === "asc" ? "ascending" : "descending" : null }, el("button", { type: "button", class: "cv-sort", title: "Sort by " + column.label, onclick: () => {
        sort = nextSort(sort, column);
        head();
        draw();
      } }, el("span", { class: "control-label" }, column.label), el("i", { class: "cv-sort-mark", "aria-hidden": "true" }, on ? sort.dir === "asc" ? "↑" : "↓" : "")));
    }));
  }
  function draw() {
    body.replaceChildren(...order(plain, columns, sort).map(line));
    mark(body);
  }
  head();
  draw();
  const edge = () => box.classList.toggle("is-more", box.scrollHeight - box.scrollTop - box.clientHeight > 1);
  const fit = () => {
    grid.classList.remove("is-tight");
    if (box.isConnected && grid.getBoundingClientRect().width > box.clientWidth + 0.5) grid.classList.add("is-tight");
    edge();
  };
  if (typeof ResizeObserver === "function") {
    let frame = 0;
    const watch = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        fit();
      });
    });
    watch.observe(box);
    watch.observe(grid);
    box.addEventListener("scroll", edge, { passive: true });
    owner?.signal?.addEventListener("abort", () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
      box.removeEventListener("scroll", edge);
    }, { once: true });
  }
  node.dataset.type = "table";
  node.classList.add("cv", "cv-table");
  node.append(el("div", { class: "cv-head" }, el("span", { class: "cv-title" }, block?.title || "Table"), el("span", { class: "cv-count" }, number(rows.length) + (rows.length === 1 ? " row" : " rows"))), box);
  return null;
}
