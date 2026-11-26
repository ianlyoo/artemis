import { el } from "../boards/dom.js";
import { wall, dayOf } from "../zone.js";
import { has } from "../names.js";
export function tabOrder({ pinned = false, own = [], internal = null } = {}) {
  return [...pinned ? [["pinned", "Pinned"]] : [], ["recent", "Recent"], ["boards", "Boards"], ["reports", "Reports"], ...own, ...has("archive") ? [["internal", "Internal", ...internal != null ? [internal] : []]] : []];
}
export function shownTab(tabs, picked, filled = () => true) {
  if (tabs.some(([id]) => id === picked)) return [picked, true];
  const first = tabs.find(([id]) => filled(id));
  return first ? [first[0], true] : [tabs[0][0], false];
}
export const opensOn = ({ pinned = 0, recent = 0, boards = 0 }) => (id) => ({ pinned, recent, boards })[id] > 0;
export const BOARDS_SHOWN = 8;
export const hhmm = (at) => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(wall(t)).toISOString().slice(11, 16) : "";
};
const zoneDay = (at) => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? dayOf(t) : "";
};
export function boardDays(boards, now = Date.now()) {
  const today = zoneDay(new Date(now).toISOString()), sorted = [...boards].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return { today: sorted.filter((board) => zoneDay(board.updatedAt) === today), earlier: sorted.filter((board) => zoneDay(board.updatedAt) !== today) };
}
export function posted({ boards = [], reports = [] } = {}) {
  const files = new Set(boards.map((board) => board.report === true && board.file).filter(Boolean));
  return [...boards.map((board) => ({ at: board.updatedAt, target: { kind: "board", id: board.id } })), ...reports.filter((report) => !files.has(report.path)).map((report) => ({ at: report.mtime, target: { kind: "file", path: report.path } }))].sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))).map((item) => item.target);
}
export function reportItems({ boards = [], reports = [] } = {}) {
  const marked = boards.filter((board) => board.report === true), files = new Set(marked.map((board) => board.file).filter(Boolean));
  return [...marked.map((board) => ({ title: board.title || board.id.slice(0, 8), updatedAt: board.updatedAt, target: { kind: "board", id: board.id } })), ...reports.filter((report) => !files.has(report.path)).map((report) => ({ title: report.title, path: report.path, updatedAt: report.mtime, target: { kind: "file", path: report.path } }))];
}
export function createTabRow({ cls, label, pick }) {
  const node = el("div", { class: cls, role: "tablist", "aria-label": label });
  let drawn = "", picked = null;
  node.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const tabs = [...node.querySelectorAll("[role=tab]")], at = tabs.findIndex((tab) => tab.dataset.tab === picked), next = tabs[at + (event.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    pick(next.dataset.tab);
    node.querySelector(`[data-tab="${next.dataset.tab}"]`)?.focus?.();
  });
  node.addEventListener("wheel", (event) => {
    if (node.scrollWidth <= node.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    event.preventDefault();
    node.scrollLeft += event.deltaY;
  }, { passive: false });
  const keep = () => {
    const tab = node.querySelector("[aria-selected=true]");
    if (!tab || !(node.clientWidth > 0)) return;
    const pad = 24, left = tab.offsetLeft, right = left + tab.offsetWidth;
    if (left - pad < node.scrollLeft) node.scrollLeft = Math.max(0, left - pad);
    else if (right + pad > node.scrollLeft + node.clientWidth) node.scrollLeft = right + pad - node.clientWidth;
  };
  function set(tabs, id) {
    const key = JSON.stringify(tabs), changed = key !== drawn || id !== picked;
    if (key !== drawn) {
      drawn = key;
      node.replaceChildren(...tabs.map(([tab, name, count = null]) => el("button", { type: "button", class: cls + "-tab", role: "tab", "data-tab": tab, "aria-selected": "false", tabindex: "-1", onclick: () => pick(tab) }, name, count != null ? el("span", { class: cls + "-n" }, String(count)) : null)));
    }
    picked = id;
    for (const tab of node.querySelectorAll("[role=tab]")) {
      const on = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", String(on));
      tab.setAttribute("tabindex", on ? "0" : "-1");
    }
    if (changed) keep();
  }
  return { node, set, keep };
}
