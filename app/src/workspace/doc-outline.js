import { el } from "../boards/dom.js";
import { createOutline } from "./outline.js";
import { iconButton, setIcon } from "./icons.js";
export function createDocOutline({ pick, onOpen = () => {
} }) {
  const button = iconButton("outline", "Outline", { class: "ide-oltoggle", "aria-expanded": "false", "aria-pressed": "false", "aria-controls": "dol-pop" });
  const tree = createOutline({ name: "Outline", empty: "This document has no headings", pick });
  const name = el("span", { class: "dol-doc" });
  const all = iconButton("foldAll", "Fold the outline to the top headings", { class: "dol-all is-small" });
  const pop = el("div", { class: "dol-pop", id: "dol-pop", hidden: true }, el("div", { class: "dol-head" }, el("span", { class: "dol-title" }, "Outline"), name, all), el("div", { class: "ol-scroll dol-scroll" }, tree.node));
  let shown = false;
  function setShown(on) {
    if (on === shown) return;
    shown = on;
    pop.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    button.setAttribute("aria-pressed", String(on));
    setIcon(button, "outline", on ? "Close the outline" : "Outline");
    if (on) requestAnimationFrame(() => {
      if (shown) onOpen();
    });
  }
  function paintAll() {
    all.hidden = !tree.node.querySelector(".ol-twist");
    if (tree.folded.size) setIcon(all, "unfoldAll", "Unfold the outline");
    else setIcon(all, "foldAll", "Fold the outline to the top headings");
  }
  button.addEventListener("click", () => setShown(!shown));
  all.addEventListener("click", () => {
    tree.foldAll(!tree.folded.size, 1);
    paintAll();
  });
  const offFold = tree.onFold(paintAll);
  const away = (event) => {
    if (shown && !pop.contains(event.target) && !button.contains(event.target)) setShown(false);
  };
  const escape = (event) => {
    if (shown && event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      setShown(false);
      button.focus({ preventScroll: true });
    }
  };
  document.addEventListener("pointerdown", away, true);
  document.addEventListener("keydown", escape);
  return { button, pop, tree, paintAll, name(text) {
    name.textContent = text;
    name.title = text;
  }, open: () => setShown(true), close: () => setShown(false), get shown() {
    return shown;
  }, destroy() {
    offFold();
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("keydown", escape);
    pop.remove();
    button.remove();
  } };
}
