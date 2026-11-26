import { el } from "../boards/dom.js";
const QUERY = /^\/([^\s/]*)$/, NAMED = /^\/([^\s/]+)\s/;
let serial = 0;
export function matches(commands, query) {
  const q = query.toLowerCase(), starts = (c) => c.name.toLowerCase().startsWith(q);
  return [...commands.filter(starts), ...commands.filter((c) => !starts(c) && c.name.toLowerCase().includes(q))];
}
export function createSlashMenu({ field, store, phone = false }) {
  const id = "slash-" + ++serial;
  const menu = el("div", { class: "pick-menu slash-menu", role: "listbox", id, "aria-label": "Commands", hidden: true });
  const hint = el("p", { class: "slash-hint", hidden: true });
  let commands = [], read = null, reading = null, shown = [], active = 0, dismissed = null;
  field.setAttribute("aria-autocomplete", "list");
  field.setAttribute("aria-controls", id);
  field.setAttribute("aria-expanded", "false");
  async function load() {
    const agentId = store.agent?.id ?? null;
    if (!agentId || agentId === read || agentId === reading) return;
    reading = agentId;
    const list = await store.commands();
    if (reading !== agentId) return;
    reading = null;
    if (store.agent?.id !== agentId) {
      void load();
      return;
    }
    commands = list.filter((c) => typeof c?.name === "string" && c.name);
    read = commands.length ? agentId : null;
    paint();
  }
  const option = (command, n) => {
    const node = el("div", { class: "pick-option slash-option", role: "option", id: `${id}-${n}`, "aria-selected": "false" }, el("span", { class: "slash-name" }, "/" + command.name, command.argumentHint ? el("span", { class: "slash-arg" }, " " + command.argumentHint) : null), command.description ? el("span", { class: "slash-desc" }, command.description) : null);
    node.addEventListener("pointerdown", (event) => event.preventDefault());
    node.addEventListener("mousedown", (event) => event.preventDefault());
    node.addEventListener("click", () => pick(command));
    return node;
  };
  function select(n) {
    active = n;
    [...menu.children].forEach((node2, at) => {
      node2.classList.toggle("is-active", at === n);
      node2.setAttribute("aria-selected", String(at === n));
    });
    const node = menu.children[n];
    if (node) {
      field.setAttribute("aria-activedescendant", `${id}-${n}`);
      node.scrollIntoView?.({ block: "nearest" });
    } else field.removeAttribute("aria-activedescendant");
  }
  function paint() {
    const value = field.value, query = QUERY.exec(value);
    if (query && !commands.length) void load();
    const next = query && value !== dismissed && !field.disabled ? matches(commands, query[1]) : [];
    if (next.length !== shown.length || next.some((c, n) => c !== shown[n])) {
      shown = next;
      menu.replaceChildren(...shown.map(option));
      select(0);
    }
    menu.hidden = !shown.length;
    field.setAttribute("aria-expanded", String(!menu.hidden));
    if (menu.hidden) field.removeAttribute("aria-activedescendant");
    const named = NAMED.exec(value), command = named && commands.find((c) => c.name === named[1]);
    hint.hidden = !command?.argumentHint;
    if (!hint.hidden) hint.replaceChildren(el("span", { class: "slash-name" }, "/" + command.name), " " + command.argumentHint);
  }
  function pick(command) {
    field.value = `/${command.name} `;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  field.addEventListener("input", paint);
  field.addEventListener("keydown", (event) => {
    if (menu.hidden || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") select((active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    else if (event.key === "Escape") {
      dismissed = field.value;
      paint();
    } else if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
      const command = shown[active];
      if (event.key === "Enter" && !phone && field.value === "/" + command.name) return;
      pick(command);
    } else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
  field.addEventListener("blur", () => {
    if (!menu.hidden) {
      dismissed = field.value;
      paint();
    }
  });
  field.addEventListener("focus", () => {
    if (dismissed !== null && dismissed === field.value) {
      dismissed = null;
      paint();
    }
  });
  return { menu, hint, paint, refresh() {
    if ((store.agent?.id ?? null) !== read) {
      if (read !== null) {
        commands = [];
        read = null;
      }
      void load();
    }
    paint();
  }, get open() {
    return !menu.hidden;
  } };
}
