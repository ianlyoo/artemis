import { el, svg } from "../boards/dom.js";
import { cardOf } from "./company-labels.js";
const ICON = { chev: "M5.2 6.6L8 9.4l2.8-2.8", wake: "M2.7 8.9h3.2l.9 1.6h2.4l.9-1.6h3.2 M4.5 3.4h7l1.8 5.5v3.7H2.7V8.9z", ask: "M3 4.3c0-.8.6-1.3 1.3-1.3h7.4c.7 0 1.3.5 1.3 1.3v5c0 .8-.6 1.3-1.3 1.3H7.4L4.6 13v-2.4h-.3c-.7 0-1.3-.5-1.3-1.3z" };
const glyph = (d) => svg("svg", { viewBox: "0 0 16 16", class: "ca-glyph", "aria-hidden": "true" }, svg("path", { d }));
let serial = 0;
export function companyCard(parsed, { time, open = false, onToggle = () => {
}, phone = false, into = null }) {
  const card = cardOf(parsed, { phone }), fold = "ca-fold-" + ++serial;
  const words = el("span", { class: "control-label ca-words" }, el("b", { class: "ca-who" }, card.who), el("span", { class: "ca-sep" }, "·"), card.one ? [card.one.id ? el("span", { class: "ca-one-id" }, card.one.id) : null, el("span", { class: "ca-one" }, card.one.title)] : el("span", { class: "ca-count" }, card.count));
  const button = el("button", { type: "button", class: "ca-line text-control", "aria-expanded": String(open), "aria-controls": fold, title: card.one ? [card.one.id, card.one.title].filter(Boolean).join(" · ") : "Company message" }, el("i", { class: "ca-icon", "aria-hidden": "true" }, glyph(ICON[card.glyph])), words, time, el("i", { class: "ca-chev", "aria-hidden": "true" }, glyph(ICON.chev)));
  const list = el("ul", { class: "ca-list" }, card.rows.map(line), card.more ? el("li", { class: "ca-item ca-rest" }, el("span", { class: "ca-id" }), el("div", { class: "ca-what" }, card.more)) : null);
  const body = el("div", { class: "ca-fold", id: fold }, el("div", {}, list));
  const node = into ?? el("article", { class: "msg msg-company ca" });
  node.classList.add("msg", "msg-company", "ca");
  node.replaceChildren(button, body);
  const set = (next) => {
    node.toggleAttribute("data-open", next);
    button.setAttribute("aria-expanded", String(next));
    body.toggleAttribute("inert", !next);
  };
  set(open);
  button.addEventListener("click", () => {
    const next = !node.hasAttribute("data-open");
    set(next);
    onToggle(next);
  });
  list.addEventListener("click", (event) => {
    const text = event.target?.closest?.(".ca-text");
    if (text && (text.scrollHeight > text.clientHeight + 2 || text.classList.contains("is-full"))) text.classList.toggle("is-full");
  });
  return node;
}
function line(row) {
  return el("li", { class: "ca-item", "data-kind": row.kind }, row.id ? el("span", { class: "ca-id" }, row.id) : null, el("div", { class: "ca-what" }, el("span", { class: "ca-title", title: row.full }, row.title), row.state ? el("span", { class: "ca-state", "data-tone": row.tone }, row.state) : null, row.by ? el("span", { class: "ca-by" }, row.by) : null, row.text ? el("span", { class: "ca-text" }, row.text) : null));
}
