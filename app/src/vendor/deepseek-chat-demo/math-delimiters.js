const escape = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const padded = (text) => /^\s/.test(text) && /\s$/.test(text) && /\S/.test(text) ? text.slice(1, -1) : text;
function inlineToken(src) {
  const open = src.match(/^(\$+|\\[([])/)?.[0];
  if (!open) return;
  const close = open[0] === "$" ? open : open === "\\(" ? "\\)" : "\\]";
  let at = open.length;
  while ((at = src.indexOf(close, at)) >= 0) {
    if (open[0] === "$" && (src[at - 1] === "$" || src[at + close.length] === "$")) {
      at += close.length;
      continue;
    }
    const value = src.slice(open.length, at);
    if (!value) return;
    if (open === "$" && (/^\s|\s$/.test(value) || /\d/.test(src[at + 1] ?? "") || /[가-힣]/.test(value) && !value.includes("\\text"))) return;
    return { type: "deepseekInlineMath", raw: src.slice(0, at + close.length), text: padded(value.replace(/\r?\n/g, " ")), display: open === "\\[" || open.length > 1 && open[0] === "$" };
  }
}
export const mathDelimiters = { extensions: [{ name: "deepseekBlockMath", level: "block", start(src) {
  return src.search(/^(?: {0,3})(?:\${2,}|\\\[)/m);
}, tokenizer(src) {
  const open = src.match(/^ {0,3}(\${2,}|\\\[)[ \t]*([^\n$]*)\r?\n/);
  if (!open) return;
  const dollar = open[1][0] === "$";
  const close = dollar ? new RegExp("^ {0,3}\\${" + open[1].length + ",}[ \\t]*(?:\\r?\\n|$)", "m") : /^ {0,3}\\\][ \t]*(?:\r?\n|$)/m;
  const rest = src.slice(open[0].length), end = close.exec(rest);
  if (!end) return;
  return { type: "deepseekBlockMath", raw: src.slice(0, open[0].length + end.index + end[0].length), text: rest.slice(0, end.index).replace(/\r?\n$/, ""), display: true };
}, renderer(token) {
  return `<div class="ds-math-display">${escape(token.text)}</div>`;
} }, { name: "deepseekInlineMath", level: "inline", start(src) {
  return src.search(/\$|\\[([]/);
}, tokenizer: inlineToken, renderer(token) {
  return `<span class="ds-math-${token.display ? "display" : "inline"}">${escape(token.text)}</span>`;
} }] };
