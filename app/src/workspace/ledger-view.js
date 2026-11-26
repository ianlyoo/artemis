import { el } from "../boards/dom.js";
import { ledgerRef } from "../names.js";
const valid = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const minutes = (value) => valid(value) ? Math.max(0, (Date.now() - Date.parse(value)) / 6e4) : null;
const ago = (value) => {
  const m = minutes(value);
  return m == null ? "" : m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const span = (cls, text) => text ? el("span", { class: cls }, text) : null;
const dot = () => el("span", { class: "lb-sep", "aria-hidden": "true" }, "·");
const line = (cls, ...bits) => el("p", { class: cls }, ...bits.filter(Boolean).flatMap((bit, n) => !n ? [bit] : /\blb-(age|tag)\b/.test(bit.className) ? [el("span", { class: "lb-keep" }, dot(), bit)] : [dot(), bit]));
function plain(block) {
  const paragraphs = String(block.text ?? "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).filter((text) => text.trim());
  return el("div", { class: "bv-prose ledger-plain" }, (paragraphs.length ? paragraphs : ["—"]).map((text, n) => el("p", {}, n === 0 && block.label ? block.label + ": " : null, text.split("\n").flatMap((words, i) => i ? [el("br"), words] : [words]))));
}
const refs = (words, ref = ledgerRef()) => words.split(new RegExp(`((?:${ref}:|#\\/${ref}\\/)(?:goal|request|approval)\\/[1-9]\\d{0,14})\\b`)).map((bit, n) => n % 2 ? el("a", { href: bit.startsWith(ref + ":") ? `#/${ref}/` + bit.slice(ref.length + 1) : bit }, bit) : bit).filter((bit) => bit !== "");
function pageAsk(block) {
  const text = String(block.text ?? "").replace(/\r\n?/g, "\n").trim() || "—";
  return el("div", { class: "lb-turn lb-turn-page" }, el("div", { class: "lb-turn-ask" }, line("lb-turn-where", span("lb-where", block.label || "Your turn"), span("lb-age", ago(block.at))), el("p", { class: "lb-turn-text" }, text.split("\n").flatMap((words, i) => i ? [el("br"), ...refs(words)] : refs(words)))));
}
export function ledgerView(block, node, ctx) {
  node.dataset.type = "ledger";
  node.dataset.part = block.part;
  const view = { ask: pageAsk, plain }[block.part];
  node.append(view ? view(block, ctx) : el("p", { class: "lb-calm" }, "—"));
}
