import { el } from "../boards/dom.js";
import { boardNotes, markRefs, splitNotes } from "../boards/notes.js";
import { outsideCode } from "../md.js";
import { l10n } from "../names.js";
const REF = /\[\^([^\]\s]+)\](?!:)/g;
const TAIL_REF = /\[(\^[^\]\s]*)?$/, TAIL_DEF = /(^|\n)\[\^[^\]\s]*(\](:.*)?)?$/;
const prose = (text) => outsideCode(text, (words) => words, () => "");
export function replyNotes(segments, { open = false } = {}) {
  const blocks = [];
  for (const segment of segments || []) {
    if (segment?.type === "md") blocks.push({ type: "text", text: prose(segment.text) });
    else if (segment?.type === "block" && segment.block?.type === "table") blocks.push(segment.block);
  }
  if (open) {
    const ids = new Set();
    for (const block of blocks) for (const [, id] of (block.type === "text" ? block.text : JSON.stringify(block.rows ?? [])).matchAll(REF)) ids.add(id);
    if (ids.size) blocks.unshift({ type: "text", text: [...ids].map((id) => "[^" + id + "]: ").join("\n") });
  }
  return boardNotes(blocks);
}
export function runText(text, notes, { open = false } = {}) {
  let source = String(text ?? "");
  if (open) source = source.replace(TAIL_DEF, "$1").replace(TAIL_REF, "");
  if (!notes) return source;
  return outsideCode(splitNotes(source).text, (words) => markRefs(words, notes, true)).replace(/\n+$/, "");
}
export const notesEnv = (notes) => notes ? { n: new Map(), items: notes.items } : null;
export function markRefNodes(root) {
  for (const sup of root.querySelectorAll?.("sup.bv-ref") ?? []) {
    sup.setAttribute("role", "button");
    sup.setAttribute("tabindex", "0");
    sup.setAttribute("data-note", sup.textContent);
  }
  return root;
}
export function notesFold({ drawNote, reduced = () => false }) {
  const list = el("ol", { class: "chat-notes-list" });
  const fold = el("button", { type: "button", class: "chat-notes-fold", "aria-expanded": "false" });
  const body = el("div", { class: "chat-notes-body", inert: "" }, list);
  const node = el("div", { class: "chat-notes", "data-segment": "notes", hidden: "" }, fold, body);
  let sign = "", wait = 0;
  const isOpen = () => node.hasAttribute("data-open");
  function toggle(open) {
    node.toggleAttribute("data-open", open);
    fold.setAttribute("aria-expanded", String(open));
    if (open) body.removeAttribute("inert");
    else body.setAttribute("inert", "");
    if (!open) for (const item of list.querySelectorAll("li")) item.classList.remove("is-target");
  }
  function reach(item, opening) {
    clearTimeout(wait);
    const go = () => {
      body.removeEventListener("transitionend", go);
      clearTimeout(wait);
      if (item.isConnected) item.scrollIntoView?.({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    };
    if (!opening || reduced()) {
      go();
      return;
    }
    body.addEventListener("transitionend", go);
    wait = setTimeout(go, 420);
  }
  fold.addEventListener("click", () => toggle(!isOpen()));
  return { node, set(items, { shown = true } = {}) {
    const notes = (items || []).filter((item) => item.text);
    const next = JSON.stringify(notes);
    if (next !== sign) {
      sign = next;
      list.replaceChildren(...notes.map((item) => el("li", { value: String(item.n), "data-note": String(item.n) }, el("span", { class: "chat-note-n" }, String(item.n)), el("span", { class: "chat-note-t" }, drawNote(item.text), " ", el("button", { type: "button", class: "chat-note-back", "data-note": String(item.n), "aria-label": "Back to the text", title: "Back to the text" }, "↩")))));
      fold.textContent = l10n("각주 ", "Notes ") + notes.length;
    }
    node.hidden = !(shown && notes.length);
  }, open(n) {
    const item = list.querySelector('li[data-note="' + n + '"]');
    if (!item) return;
    const opening = !isOpen();
    toggle(true);
    for (const other of list.querySelectorAll("li")) other.classList.toggle("is-target", other === item);
    reach(item, opening);
  }, wire(container) {
    const at = (event) => {
      const ref = event.target?.closest?.("sup.bv-ref");
      return ref && container.contains(ref) ? ref : null;
    };
    const back = (event) => {
      const button = event.target?.closest?.(".chat-note-back");
      if (!button || !node.contains(button)) return false;
      const ref = [...container.querySelectorAll("sup.bv-ref")].find((sup) => sup.textContent.trim() === button.dataset.note);
      if (!ref) return false;
      event.preventDefault();
      ref.scrollIntoView?.({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      ref.focus?.({ preventScroll: true });
      return true;
    };
    const click = (event) => {
      if (back(event)) return;
      const ref = at(event);
      if (!ref) return;
      event.preventDefault();
      this.open(ref.textContent.trim());
    };
    const key = (event) => {
      if ((event.key === "Enter" || event.key === " ") && at(event)) click(event);
    };
    container.addEventListener("click", click);
    container.addEventListener("keydown", key);
    return () => {
      clearTimeout(wait);
      container.removeEventListener("click", click);
      container.removeEventListener("keydown", key);
    };
  } };
}
