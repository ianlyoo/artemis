import { el, svg } from "../boards/dom.js";
import { agentName, agentState, stateClass, groupedAgents, studioHelper, namePrefix, tutor } from "./agents.js";
import { lead, isLead } from "../names.js";
import { zoned } from "../zone.js";
const STUDIO_FAILED = { invalid_title: "제목은 한 줄, 80자까지예요", not_studio: "작업실만 닫거나 이름을 바꿀 수 있어요", unknown_agent: "이미 닫힌 작업실이에요", version_mismatch: "이 호스트의 Paseo 버전이 아직 확인되지 않았어요" };
const studioFailed = (what, error) => STUDIO_FAILED[error?.message] ?? `작업실 ${what} 못했어요 (${error?.message ?? "offline"}). 다시 눌러 주세요`;
const glyph = (path) => svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, svg("path", { d: path }));
const clock = zoned("en-GB", { hour: "2-digit", minute: "2-digit" });
const time = (at) => {
  const date = new Date(at ?? NaN);
  return Number.isFinite(+date) ? clock.format(date) : "";
};
export function createAgentPicker({ agents, select, phone = false, studio = null }) {
  const name = el("span", { class: "g151-switch-name" }, lead()), state = el("span", { class: "g151-head-state" });
  const button = el("button", { type: "button", class: "g151-switch", "aria-label": "Switch agent", "aria-haspopup": "dialog", "aria-expanded": "false" }, name, el("span", { class: "g151-switch-chevron" }, glyph("m6 9 6 6 6-6")), state);
  const search = el("input", { class: "g151-search", type: "search", placeholder: "Find an agent…", "aria-label": "Find an agent", autocomplete: "off" });
  const close = el("button", { type: "button", class: "g151-icon", "aria-label": "Close picker" }, glyph("m6 6 12 12M6 18 18 6"));
  const list = el("div", { class: "g151-roster", role: "listbox", "aria-label": "Company agents" });
  const pop = el("section", { class: "g151-pop", role: "dialog", "aria-label": "Switch agent", hidden: true }, el("div", { class: "g151-find" }, glyph("M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0"), search, close), phone && studio?.controls, list, !phone && el("div", { class: "g151-picker-foot" }, "↑ ↓  Select · Enter  Open · Esc  Close"));
  const node = el("div", { class: "g151-picker" + (phone ? " g151-phone-picker" : "") }, button, pop);
  let timer = null;
  const nodes = new Map(), groups = new Map(), empty = el("div", { class: "g151-picker-foot" });
  const text = (node2, value) => {
    if (node2.textContent !== value) node2.textContent = value;
  };
  function paint() {
    const current = agents.get(agents.selected)?.agent ?? agents.roster.find((a) => isLead(a.role));
    name.textContent = namePrefix(current) + agentName(current);
    button.title = current?.displayName ?? agentName(current);
    state.textContent = agentState(current);
    state.className = "g151-head-state " + stateClass(current);
    if (pop.hidden) return;
    const rows = groupedAgents(agents.roster, search.value);
    const wanted = rows.flatMap(({ agent, nested, group, miss }) => {
      const label = agentState(agent);
      let record = nodes.get(agent.id);
      if (!record) {
        const name3 = el("span", { class: "g151-agent-name" }), unread2 = el("span", { class: "g151-new" }, "New");
        const status2 = el("span"), clock3 = el("time", { class: "g151-agent-time" });
        const row2 = el("button", { type: "button", role: "option", "data-agent": agent.id, onclick: () => {
          toggle(false);
          void select(agent.id);
        } }, name3, unread2, status2, clock3);
        record = { row: row2, name: name3, unread: unread2, status: status2, clock: clock3, item: agent.role === "studio" ? studioLine(agent.id, row2, studioHelper(agent), tutor(agent)) : row2 };
        nodes.set(agent.id, record);
      }
      const { row, name: name2, unread, status, clock: clock2, item } = record;
      row.className = "g151-agent" + (nested ? " is-worker" : "") + (agent.pinned ? " is-pinned" : "");
      row.toggleAttribute("data-miss", !!miss);
      row.setAttribute("aria-selected", String(agent.id === agents.selected));
      row.title = agent.displayName ?? agentName(agent);
      text(name2, namePrefix(agent) + (agent.displayName ?? agentName(agent)));
      unread.hidden = !(agent.unread > 0 && agent.id !== agents.selected);
      text(status, label);
      status.className = "g151-agent-status " + stateClass(agent);
      status.toggleAttribute("data-long", label.length > 8);
      text(clock2, time(agent.lastActivityAt));
      clock2.setAttribute("datetime", agent.lastActivityAt ?? "");
      if (group && !groups.has(agent.id)) groups.set(agent.id, el("div", { class: "g151-group" }, group));
      if (group) text(groups.get(agent.id), group);
      return [...group ? [groups.get(agent.id)] : [], item];
    });
    if (!rows.some((row) => !row.miss)) {
      text(empty, agents.error ? "Couldn’t load agents" : "No matching agents");
      wanted.push(empty);
    }
    let cursor = list.firstChild;
    for (const child of wanted) {
      if (child === cursor) cursor = cursor.nextSibling;
      else list.insertBefore(child, cursor);
    }
    const keep = new Set(wanted);
    for (const child of [...list.childNodes]) if (!keep.has(child)) child.remove();
    for (const id of nodes.keys()) if (!agents.roster.some((agent) => agent.id === id)) nodes.delete(id);
  }
  function studioLine(id, row, helper = false, teacher = false) {
    const icon = (path, label, name2) => el("button", { type: "button", class: "g151-icon g151-agent-act " + name2, "aria-label": label, title: label }, glyph(path));
    const noun = teacher ? "선생님" : helper ? "보조" : "작업실";
    const rename = icon("M15.5 5.5l3 3L9 18H6v-3z M13.5 7.5l3 3", `${noun} 이름 바꾸기`, "g151-agent-rename"), shut = icon("m6 6 12 12M6 18 18 6", `${noun} 닫기`, "g151-agent-close");
    const field = el("input", { type: "text", class: "g151-rename", "aria-label": "작업실 제목", maxlength: "80", autocomplete: "off", hidden: true });
    const line = el("div", { class: "g151-agent-line" }, ...teacher ? [row, shut] : [row, field, rename, shut]);
    let busy = false, editing = false;
    const hold = (on) => {
      busy = on;
      rename.disabled = shut.disabled = field.disabled = on;
    };
    const current = () => agents.roster.find((a) => a.id === id);
    const stop = () => {
      editing = false;
      field.hidden = true;
      row.hidden = false;
    };
    async function save() {
      if (!editing || busy) return;
      const value = field.value.trim();
      if (!value || value === current()?.displayName) {
        stop();
        return;
      }
      hold(true);
      try {
        await agents.renameStudio(id, value);
        stop();
        row.focus({ preventScroll: true });
      } catch (error) {
        studio?.notice?.(studioFailed("제목을 바꾸지", error));
        stop();
      } finally {
        hold(false);
      }
    }
    rename.addEventListener("click", () => {
      if (busy) return;
      editing = true;
      field.value = current()?.displayName ?? "";
      row.hidden = true;
      field.hidden = false;
      field.focus();
      field.select?.();
    });
    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        void save();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        stop();
        row.focus({ preventScroll: true });
      }
    });
    field.addEventListener("blur", () => {
      void save();
    });
    shut.addEventListener("click", async () => {
      if (busy) return;
      hold(true);
      try {
        await agents.closeStudio(id);
      } catch (error) {
        studio?.notice?.(studioFailed("닫지", error));
      } finally {
        hold(false);
      }
    });
    return line;
  }
  function toggle(open = pop.hidden, restore = true) {
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    clearInterval(timer);
    if (open) {
      search.value = "";
      paint();
      if (!phone) search.focus();
      void agents.refreshRoster();
      timer = setInterval(() => void agents.refreshRoster(), 1e4);
    } else if (restore) button.focus({ preventScroll: true });
  }
  button.addEventListener("click", () => toggle());
  close.addEventListener("click", () => toggle(false));
  search.addEventListener("input", paint);
  const keys = (event) => {
    if (pop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      toggle(false);
      return;
    }
    const rows = [...list.querySelectorAll("[data-agent]")], at = rows.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      rows[at < 0 ? event.key === "ArrowDown" ? 0 : rows.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
    } else if (event.key === "Enter" && document.activeElement === search) {
      event.preventDefault();
      rows.find((row) => !row.hasAttribute("data-miss"))?.click();
    } else if (event.key === "Tab") {
      const fields = [search, close, ...phone && studio ? [...studio.controls.querySelectorAll("button")].filter((button2) => !button2.disabled) : [], ...list.querySelectorAll("button")], index = fields.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        fields.at(-1)?.focus();
      } else if (!event.shiftKey && index === fields.length - 1) {
        event.preventDefault();
        search.focus();
      }
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && document.activeElement !== search && !studio?.controls.contains(document.activeElement)) {
      search.focus();
      search.value += event.key;
      paint();
      event.preventDefault();
    }
  };
  node.addEventListener("keydown", keys);
  const outside = (event) => {
    if (!pop.hidden && !node.contains(event.target) && !studio?.node.contains(event.target)) toggle(false, false);
  };
  document.addEventListener("pointerdown", outside);
  const off = agents.subscribe(paint);
  paint();
  return { node, button, close: () => toggle(false, false), destroy() {
    clearInterval(timer);
    off();
    document.removeEventListener("pointerdown", outside);
    node.remove();
  } };
}
