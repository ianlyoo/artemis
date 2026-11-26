import { el } from "./dom.js";
import { userKo } from "../names.js";
const SEP = " · ";
const NEXT = /^(?:—|-|(?:오늘|내일|모레)(?: \d{1,2}:\d{2})?|\d{1,2}\/\d{1,2}(?: \d{1,2}(?::\d{2}|시))?|\d{1,2}:\d{2}|보통 약 \d+(?:\.\d+)?(?:분|시간|일))$/;
const REST = /^(?:나머지|대기) \d+(?: · [^·]+ \d+)+$/;
const tone = (now) => now === userKo() + " 차례" ? "owner" : /(?:^| )작업 중$/.test(now ?? "") ? "go" : "idle";
const flat = (text) => text.replace(/\s+/g, " ").trim();
export function goalLine(text) {
  const parts = flat(text).split(SEP);
  if (![2, 3].includes(parts.length) || !parts.every(Boolean) || !NEXT.test(parts.at(-1))) return null;
  return { name: parts[0], now: parts.length === 3 ? parts[1] : null, next: parts.at(-1) };
}
function rowsOf(texts) {
  const found = texts.map(goalLine);
  if (!found.length || !found.every(Boolean)) return false;
  const two = found.map((line) => line.now === null);
  return two.every(Boolean) ? found.length > 1 : !two.some(Boolean);
}
export const isRest = (text) => REST.test(flat(text));
function lines(nodes) {
  const out = [[]];
  for (const node of nodes) {
    if (node.nodeName === "BR") out.push([]);
    else out.at(-1).push(node);
  }
  return out.map((line) => line.filter((node) => node.nodeType !== 3 || node.nodeValue.trim())).filter((line) => line.length);
}
const textOf = (nodes) => nodes.map((node) => node.textContent).join("");
function cut(nodes) {
  const parts = [[]];
  for (const node of nodes) {
    if (node.nodeType !== 3) {
      if (node.textContent.includes(SEP)) return null;
      parts.at(-1).push(node);
      continue;
    }
    node.nodeValue.split(SEP).forEach((piece, n) => {
      if (n) parts.push([]);
      if (piece) parts.at(-1).push(document.createTextNode(piece));
    });
  }
  return parts.length === (goalLine(textOf(nodes)).now === null ? 2 : 3) ? parts : null;
}
function row(nodes) {
  const line = goalLine(textOf(nodes)), parts = cut(nodes) ?? [[line.name], [line.next]];
  const name = el("span", { class: "gl-name" }, parts[0]);
  const first = name.childNodes[0], last = name.childNodes[name.childNodes.length - 1];
  if (first?.nodeType === 3) first.nodeValue = first.nodeValue.trimStart();
  if (last?.nodeType === 3) last.nodeValue = last.nodeValue.trimEnd();
  const none = /^[—-]$/.test(line.next);
  return el("li", { class: "gl-row", "data-tone": tone(line.now) }, name, ...line.now === null ? [] : [el("span", { class: "gl-now" }, line.now)], el("span", { class: "gl-next", ...none ? { "data-none": "" } : {} }, none ? "" : line.next));
}
const restLine = (text) => el("p", { class: "gl-rest" }, text.replace(/[ \t\r\n]+/g, " ").trim());
const next = (node) => {
  const kids = [...node.parentNode?.children ?? []];
  return kids[kids.indexOf(node) + 1] ?? null;
};
const plain = (node) => [...node.childNodes].filter((kid) => !kid.classList?.contains("bv-ref")).map((kid) => kid.textContent).join("");
const quiet = (node) => {
  if (node?.nodeName === "P" && isRest(plain(node))) node.classList.add("gl-rest");
};
export function goalLines(root) {
  for (const list of [...root.querySelectorAll("ul")]) {
    if (list.closest(".gl-list") || list.querySelector("ul,ol")) continue;
    const items = [...list.children].map((li) => [li, lines(li.children.length === 1 && li.children[0].nodeName === "P" ? li.children[0].childNodes : li.childNodes)]);
    if (!items.length || items.some(([, ls]) => ls.length !== 1)) continue;
    const rest = items.length > 1 && isRest(textOf(items.at(-1)[1][0])) ? items.pop() : null;
    if (!rowsOf(items.map(([, [line]]) => textOf(line)))) continue;
    const drawn = el("ul", { class: "gl-list" }, items.map(([, [line]]) => row(line)));
    list.replaceWith(drawn);
    if (rest) drawn.after(restLine(textOf(rest[1][0])));
    else quiet(next(drawn));
  }
  for (const p of [...root.querySelectorAll("p")]) {
    if (p.closest("li,td,th,blockquote") || p.classList.contains("gl-rest")) continue;
    const found = lines(p.childNodes);
    const rest = found.length > 1 && isRest(textOf(found.at(-1))) ? found.pop() : null;
    if (found.length < (rest ? 1 : 2) || !rowsOf(found.map(textOf))) continue;
    const drawn = el("ul", { class: "gl-list" }, found.map((line) => row(line)));
    p.replaceWith(drawn);
    if (rest) drawn.after(restLine(textOf(rest)));
    else quiet(next(drawn));
  }
  return root;
}
