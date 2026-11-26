import { NOTE_REF, NOTE_OPEN, NOTE_CLOSE, NOTE_MARK, splitNotes, outsideCode } from "../md.js";
export { splitNotes };
export function boardNotes(blocks) {
  const defs = new Map(), texts = [];
  for (const block of blocks || []) {
    if (block?.type === "text") {
      const { text, defs: found } = splitNotes(block.text, "\n");
      for (const [id, def] of found) defs.set(id, def);
      texts.push(outsideCode(text, (words) => words, () => ""));
    } else if (block?.type === "table") for (const row of block.rows || []) for (const cell of Array.isArray(row) ? row : Object.values(row || {})) texts.push(String(cell ?? ""));
  }
  if (!defs.size) return null;
  const order = [];
  for (const text of texts) for (const [, id] of text.matchAll(NOTE_REF)) if (defs.has(id) && !order.includes(id)) order.push(id);
  for (const id of defs.keys()) if (!order.includes(id)) order.push(id);
  return { n: new Map(order.map((id, i) => [id, i + 1])), items: order.map((id, i) => ({ n: i + 1, text: defs.get(id) })) };
}
export function markRefs(text, notes, inline = false) {
  const source = String(text ?? "");
  if (!notes) return source;
  return outsideCode(inline ? source : splitNotes(source).text, (words) => words.replace(NOTE_REF, (whole, id) => notes.n.has(id) ? NOTE_OPEN + notes.n.get(id) + NOTE_CLOSE : whole));
}
const quote = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function refsHTML(html, notes) {
  if (!notes) return html;
  return html.replace(NOTE_MARK, (_, n) => '<sup class="bv-ref" title="' + quote((notes.items[n - 1]?.text ?? "").replace(NOTE_REF, "").replace(/\s*\n\s*/g, " ")) + '">' + n + "</sup>");
}
