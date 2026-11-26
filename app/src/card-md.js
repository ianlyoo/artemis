import { Marked, Renderer } from "./boards/vendor/marked.js";
import { ownHref } from "./chat/links.js";
import { MD_OPTIONS, MD_TOKENIZER, NOTE_DEF, NOTE_REF, NOTE_OPEN as REF_OPEN, NOTE_CLOSE as REF_CLOSE, NOTE_MARK as REF_MARK, splitNotes, outsideCode } from "./md.js";
import { knownBoardTitle, rememberBoardTitles } from "./board-titles.js";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const base = new Renderer();
const MARKS = /^ {0,3}#{1,6}\s|^\s*\|.*\|\s*$|^\s*\d{1,3}[.)]\s+\S|\[\^[^\]\s]+\]|\*\*[^*\n]+\*\*|__[^_\n]+__|^\s*[-*+]\s+\S|^\s*>\s|^\s*(?:```|~~~)|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/m;
export const isMarkdown = (text) => MARKS.test(String(text ?? ""));
const REC = /^\s*(?:\*\*|__)?\s*추천\s*(?:\*\*|__)?\s*[:：]/;
const REF_ATTRS = (n) => ' data-note="' + n + '" role="button" tabindex="0"';
const BACK = (n) => ' <button class="cmd-fn-back" type="button" data-note="' + n + '" aria-label="Back to the text" title="Back to the text">↩</button>';
let listening = false;
function listen() {
  if (listening || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  listening = true;
  const go = (event) => {
    if (event.defaultPrevented || event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    const control = event.target?.closest?.(".cmd sup.cmd-ref[data-note], .cmd .cmd-fn-back"), body = control?.closest(".cmd");
    if (!body) return;
    const n = control.dataset.note, back = control.classList.contains("cmd-fn-back");
    const target = back ? body.querySelector('sup.cmd-ref[data-note="' + n + '"]') : body.querySelector('.cmd-fn > li[value="' + n + '"]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (!back) {
      const notes = target.closest("details");
      if (notes) notes.open = true;
    }
    target.scrollIntoView?.({ block: "nearest" });
    target.classList.add("is-target");
    setTimeout(() => target.classList.remove("is-target"), 1600);
    if (back) target.focus?.({ preventScroll: true });
  };
  document.addEventListener("click", go, true);
  document.addEventListener("keydown", go, true);
}
export function safeHref(value) {
  const href = String(value ?? "").trim();
  if (/^#\/[\w\-./%~?=&:]*$/.test(href)) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}
const URL_PARTS = /https?:\/\/[^\s<>()[\]{}"'`\u0080-\uffff]+|(?<![\w/.:#-])(?:\/canvas\/boards\/|\/home\/boards\/|\/ide\/|#\/boards\/)[^\s<>()[\]{}"'`\u0080-\uffff]+/g;
export function cardHomeHref(raw) {
  const origin = globalThis.location?.origin || "https://home.invalid";
  if (!/^(?:https?:\/\/|\/canvas\/boards\/|\/home\/boards\/|\/ide\/|#\/boards\/)/i.test(raw)) return null;
  return ownHref(raw, origin);
}
export const rememberCardBoardTitles = rememberBoardTitles;
function boardLabel(href) {
  const match = href.match(/^#\/boards\/([^/?#]+)/);
  if (match) {
    try {
      return knownBoardTitle(decodeURIComponent(match[1])) || "보드 열기";
    } catch {
    }
  }
  return "보드 열기";
}
export function cardLinkParts(value) {
  const text = String(value ?? ""), parts = [];
  let at = 0;
  for (const match of text.matchAll(URL_PARTS)) {
    const raw = match[0].replace(/[.,;!?]+$/, ""), href = cardHomeHref(raw);
    if (!href) continue;
    parts.push({ text: text.slice(at, match.index) }, { text: boardLabel(href), href });
    at = match.index + raw.length;
  }
  parts.push({ text: text.slice(at) });
  return parts;
}
export const cardLabel = (value) => cardLinkParts(value).map((p) => p.text).join("");
export const cardInlineHTML = (value) => cardLinkParts(value).map((p) => p.href ? '<a class="cmd-link" href="' + esc(p.href) + '">' + esc(p.text) + "</a>" : esc(p.text)).join("");
export const titleLine = (line) => plainLine(String(line ?? "").replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (all, label, href) => cardHomeHref(href) ? href : all));
export function plainLine(line) {
  return String(line ?? "").replace(/^ {0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").replace(NOTE_REF, "").replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, "$1").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2").replace(/`([^`\n]+)`/g, "$1").replace(/\s+/g, " ").trim();
}
export function cardPlain(text) {
  const source = String(text ?? "");
  if (!isMarkdown(source)) return source;
  return source.split(/\r?\n/).filter((line) => !NOTE_DEF.test(line) && !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)).map((line) => /^\s*\|.*\|\s*$/.test(line) ? line.trim().slice(1, -1).split("|").map(titleLine).filter(Boolean).join(" · ") : titleLine(line.replace(/^\s*(?:[-*+]|>)\s+/, ""))).filter(Boolean).join("\n");
}
const cellsText = (cells) => cells.map((cell) => plainLine(cell.text));
const renderer = { html: ({ text }) => esc(text), text(token) {
  return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : token.escaped ? esc(token.text) : cardInlineHTML(token.text);
}, link({ href, title, tokens }) {
  const own = ownHref(href, globalThis.location?.origin || "https://home.invalid"), to = own ?? safeHref(href);
  const inner = own && tokens.length === 1 && tokens[0].text === href ? esc(boardLabel(own)) : this.parser.parseInline(tokens);
  if (!to) return inner;
  return '<a class="cmd-link" href="' + esc(to) + '"' + (title ? ' title="' + esc(title) + '"' : "") + (own ? "" : ' target="_blank" rel="noopener noreferrer"') + ">" + inner + "</a>";
}, image: ({ text }) => esc(text), checkbox: ({ checked }) => checked ? "☑ " : "☐ ", heading({ tokens }) {
  return '<p class="cmd-h">' + this.parser.parseInline(tokens) + "</p>\n";
}, paragraph({ tokens, text }) {
  return "<p" + (REC.test(text) ? ' class="cmd-rec"' : "") + ">" + this.parser.parseInline(tokens) + "</p>\n";
}, hr: () => "", table(token) {
  const heads = cellsText(token.header), rec = heads.findIndex((h) => /^추천$/.test(h));
  const cell = (c, i, tag) => "<" + tag + (i === 0 ? ' class="cmd-c0"' : i === rec ? ' class="cmd-rc"' : "") + ">" + this.parser.parseInline(c.tokens) + "</" + tag + ">";
  return '<div class="cmd-table-wrap"><table class="cmd-table"><thead><tr>' + token.header.map((c, i) => cell(c, i, "th")).join("") + "</tr></thead><tbody>" + token.rows.map((row) => "<tr>" + row.map((c, i) => cell(c, i, "td")).join("") + "</tr>").join("") + "</tbody></table></div>\n";
} };
const markdown = new Marked({ ...MD_OPTIONS, renderer }).use(MD_TOKENIZER);
function footnotes(source) {
  const { text: kept, defs } = splitNotes(source, "\n");
  const order = [];
  const text = outsideCode(kept, (words) => words.replace(NOTE_REF, (whole, id) => {
    if (!defs.has(id)) return whole;
    if (!order.includes(id)) order.push(id);
    return REF_OPEN + (order.indexOf(id) + 1) + REF_CLOSE;
  }));
  for (const id of defs.keys()) if (!order.includes(id)) order.push(id);
  return { text, notes: order.map((id, i) => ({ n: i + 1, text: defs.get(id) })) };
}
const recApart = (text) => text.split("\n").map((line) => REC.test(line) ? "\n" + line + "\n" : line).join("\n");
export function cardBodyHTML(text, { cls = "" } = {}) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  const klass = (c) => ' class="' + [cls, c].filter(Boolean).join(" ") + '"';
  if (!isMarkdown(source)) {
    return '<p class="' + (cls || "cmd-plain") + '">' + source.split("\n").map((line) => REC.test(line) ? '<strong class="cmd-rec">' + cardInlineHTML(line) + "</strong>" : cardInlineHTML(line)).join("\n") + "</p>";
  }
  const { text: body, notes } = footnotes(source);
  if (notes.length) listen();
  const noteText = (n) => plainLine(notes[n - 1]?.text ?? "");
  let html = markdown.parse(recApart(body)).replace(REF_MARK, (_, n) => '<sup class="cmd-ref" title="' + esc(noteText(Number(n))) + '"' + REF_ATTRS(n) + ">" + n + "</sup>");
  if (notes.length) {
    html += '<details class="cmd-notes"><summary>Details</summary><ol class="cmd-fn">' + notes.map((note) => '<li value="' + note.n + '">' + markdown.parseInline(note.text).replace(REF_MARK, (_, n) => '<sup class="cmd-ref">' + n + "</sup>") + BACK(note.n) + "</li>").join("") + "</ol></details>";
  }
  return "<div" + klass("cmd") + ">" + html + "</div>";
}
