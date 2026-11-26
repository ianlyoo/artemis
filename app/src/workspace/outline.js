import { el } from "../boards/dom.js";
import { reduced } from "../chat/motion.js";
export function createOutline({ pick, empty = "No headings", scroller = null, name = "Outline", phone = false }) {
  const root = el("ol", { class: "ol-tree", role: "tree", "aria-label": name });
  let entries = [], folded = new Set(), lit = null, sign = "", items = new Map();
  const changed = new Set();
  function set(next) {
    const nextSign = JSON.stringify(next.map((entry) => [entry.id, entry.level, entry.text, entry.note ?? ""]));
    if (nextSign === sign) return;
    sign = nextSign;
    entries = next;
    items = new Map();
    folded = new Set([...folded].filter((id) => next.some((entry) => entry.id === id)));
    const stack = [{ level: 0, list: root }];
    root.replaceChildren();
    for (const entry of next) {
      while (stack.length > 1 && stack.at(-1).level >= entry.level) stack.pop();
      const parent = stack.at(-1);
      if (!parent.list) {
        parent.list = el("ol", { class: "ol-sub", role: "group" });
        parent.li.append(parent.list);
      }
      const button = el("button", { type: "button", class: "ol-entry" + (entry.kind ? " is-" + entry.kind : ""), title: entry.title ?? entry.text, "data-id": entry.id }, ...entry.parts ?? [el("span", { class: "ol-text" }, entry.text)]);
      button.addEventListener("click", () => pick(entry.id, entry));
      const row = el("div", { class: "ol-row ide-row" }, el("span", { class: "ol-twist-slot" }), button, entry.note ? el("span", { class: "ol-note" }, entry.note) : null);
      const li = el("li", { class: "ol-item", role: "treeitem", "data-id": entry.id, style: { "--d": String(stack.length - 1) } }, row);
      parent.list.append(li);
      items.set(entry.id, { li, button, row, entry });
      stack.push({ level: entry.level, li, list: null });
    }
    for (const [id, { li, row }] of items) {
      if (!li.querySelector(":scope > .ol-sub")) continue;
      const twist = el("button", { type: "button", class: "ol-twist", "aria-label": "Fold", title: "Fold" });
      twist.addEventListener("click", (event) => {
        event.stopPropagation();
        fold(id, !folded.has(id));
      });
      row.firstChild.replaceWith(twist);
    }
    if (!next.length) root.append(el("li", { class: "ol-empty" }, empty));
    paintFolds();
    const was = lit;
    lit = null;
    if (was) light(was, { follow: false });
  }
  function paintFolds() {
    for (const [id, { li }] of items) {
      const shut = folded.has(id), twist = li.querySelector(":scope > .ol-row > .ol-twist");
      li.classList.toggle("is-shut", shut);
      if (twist) {
        twist.setAttribute("aria-expanded", String(!shut));
        twist.title = shut ? "Unfold" : "Fold";
        twist.setAttribute("aria-label", twist.title);
      }
      if (li.querySelector(":scope > .ol-sub")) li.setAttribute("aria-expanded", String(!shut));
      else li.removeAttribute("aria-expanded");
    }
  }
  function fold(id, on) {
    if (on) folded.add(id);
    else folded.delete(id);
    paintFolds();
    if (lit) light(lit, { follow: false, force: true });
    for (const fn of changed) fn();
  }
  function foldAll(on, depth = 1) {
    folded = on ? new Set([...items].filter(([, { li }]) => li.querySelector(":scope > .ol-sub") && Number(li.style.getPropertyValue("--d")) < depth + 0).map(([id]) => id)) : new Set();
    paintFolds();
    if (lit) light(lit, { follow: false, force: true });
    for (const fn of changed) fn();
  }
  function light(id, { follow = true, force = false } = {}) {
    if (id === lit && !force) return;
    lit = id;
    for (const { button: button2 } of items.values()) {
      button2.removeAttribute("aria-current");
      button2.classList.remove("is-within");
    }
    const item = items.get(id);
    if (!item) return;
    let shown = item.li;
    for (let at = item.li.parentElement?.closest(".ol-item"); at; at = at.parentElement?.closest(".ol-item")) if (at.classList.contains("is-shut")) shown = at;
    const button = shown.querySelector(":scope > .ol-row > .ol-entry");
    button.setAttribute("aria-current", "true");
    if (shown !== item.li) button.classList.add("is-within");
    const frame = scroller ?? root.closest(".ol-scroll");
    if (follow && frame) {
      const box = button.getBoundingClientRect(), view = frame.getBoundingClientRect();
      if (box.top < view.top + 6 || box.bottom > view.bottom - 6) frame.scrollTo({ top: frame.scrollTop + box.top - view.top - view.height / 3, behavior: reduced() || phone ? "auto" : "smooth" });
    }
  }
  return { node: root, set, light, fold, foldAll, get folded() {
    return folded;
  }, get entries() {
    return entries;
  }, get lit() {
    return lit;
  }, isShut: (id) => folded.has(id), onFold(fn) {
    changed.add(fn);
    return () => changed.delete(fn);
  } };
}
