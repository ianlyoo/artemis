import { el } from "../boards/dom.js";
export const CONTEXT = 3;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;
export const NO_EOL = "\\ No newline at end of file";
export function parsePatch(patch) {
  const hunks = [], lines = String(patch ?? "").replace(/\r?\n$/, "").split("\n");
  let hunk = null, oldLeft = 0, newLeft = 0, oldAt = 0, newAt = 0;
  for (const line of lines) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const sign = line[0], text = line.slice(1);
      if (sign === " " || line === "" && oldLeft > 0 && newLeft > 0) {
        hunk.lines.push({ type: " ", text, old: oldAt++, new: newAt++ });
        oldLeft--;
        newLeft--;
        continue;
      }
      if (sign === "-") {
        hunk.lines.push({ type: "-", text, old: oldAt++, new: null });
        oldLeft--;
        continue;
      }
      if (sign === "+") {
        hunk.lines.push({ type: "+", text, old: null, new: newAt++ });
        newLeft--;
        continue;
      }
      if (sign === "\\") {
        hunk.lines.push({ type: "\\", text: line, old: null, new: null });
        continue;
      }
      hunk = null;
    }
    if (hunk && line[0] === "\\") {
      hunk.lines.push({ type: "\\", text: line, old: null, new: null });
      continue;
    }
    const head = line.match(HUNK);
    if (!head) {
      hunk = null;
      continue;
    }
    const oldLines = head[2] == null ? 1 : Number(head[2]), newLines = head[4] == null ? 1 : Number(head[4]);
    hunk = { header: line, oldStart: Number(head[1]), oldLines, newStart: Number(head[3]), newLines, section: head[5] ?? "", lines: [] };
    hunks.push(hunk);
    oldLeft = oldLines;
    newLeft = newLines;
    oldAt = hunk.oldStart || 1;
    newAt = hunk.newStart || 1;
    if (!oldLines) oldAt = hunk.oldStart + 1;
    if (!newLines) newAt = hunk.newStart + 1;
  }
  return hunks;
}
export const countLines = (hunks) => hunks.reduce((sum, hunk) => {
  for (const line of hunk.lines) {
    if (line.type === "+") sum.additions++;
    else if (line.type === "-") sum.deletions++;
  }
  return sum;
}, { additions: 0, deletions: 0 });
export function pairRows(hunk) {
  const rows = [];
  let dels = [], adds = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
      const left = dels[i] ?? null, right = adds[i] ?? null;
      rows.push({ kind: left && right ? "change" : left ? "del" : "add", left, right });
    }
    dels = [];
    adds = [];
  };
  let last = null;
  for (const line of hunk.lines) {
    if (line.type === "-") {
      if (adds.length) flush();
      dels.push(cell(line));
      last = dels.at(-1);
      continue;
    }
    if (line.type === "+") {
      adds.push(cell(line));
      last = adds.at(-1);
      continue;
    }
    if (line.type === "\\") {
      if (last) last.noEol = true;
      continue;
    }
    flush();
    const left = cell(line), right = { ...cell(line), n: line.new };
    left.n = line.old;
    rows.push({ kind: "same", left, right });
    last = right;
  }
  flush();
  return rows;
}
const cell = (line) => ({ n: line.type === "+" ? line.new : line.old, text: line.text, type: line.type, noEol: false });
export function lineDiff(a, b, { max = 25e5 } = {}) {
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: " ", a: i, b: i });
  const n = endA - start, m = endB - start;
  if (n && m && (n + 1) * (m + 1) <= max) {
    const width = m + 1, table = new Uint32Array((n + 1) * width);
    for (let i2 = n - 1; i2 >= 0; i2--) for (let j2 = m - 1; j2 >= 0; j2--) {
      table[i2 * width + j2] = a[start + i2] === b[start + j2] ? table[(i2 + 1) * width + j2 + 1] + 1 : Math.max(table[(i2 + 1) * width + j2], table[i2 * width + j2 + 1]);
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        ops.push({ type: " ", a: start + i, b: start + j });
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) ops.push({ type: "-", a: start + i++ });
      else ops.push({ type: "+", b: start + j++ });
    }
    while (i < n) ops.push({ type: "-", a: start + i++ });
    while (j < m) ops.push({ type: "+", b: start + j++ });
  } else {
    for (let i = 0; i < n; i++) ops.push({ type: "-", a: start + i });
    for (let j = 0; j < m; j++) ops.push({ type: "+", b: start + j });
  }
  for (let k = 0; k < a.length - endA; k++) ops.push({ type: " ", a: endA + k, b: endB + k });
  return ops;
}
export function splitLines(text) {
  const value = String(text ?? "");
  if (!value) return { lines: [], eol: true };
  const lines = value.split("\n"), eol = value.endsWith("\n");
  if (eol) lines.pop();
  return { lines, eol };
}
export function applyEdits(text, edits) {
  const { lines, eol } = splitLines(text);
  const crlf = lines.length > 0 && lines.filter((line) => line.endsWith("\r")).length * 2 > lines.length;
  const regions = [...edits].map((edit) => ({ from: edit.from, to: edit.to, lines: edit.text === "" ? [] : String(edit.text).replace(/\r\n?/g, "\n").split("\n").map((line) => crlf ? line + "\r" : line) })).sort((a, b) => a.from - b.from);
  let at = 1;
  for (const region of regions) {
    if (!(Number.isInteger(region.from) && Number.isInteger(region.to)) || region.from < at || region.to < region.from - 1 || region.to > lines.length) throw new Error("edits overlap or fall outside the text");
    at = region.to + 1;
  }
  const out = [];
  let next = 1;
  for (const region of regions) {
    out.push(...lines.slice(next - 1, region.from - 1), ...region.lines);
    next = region.to + 1;
  }
  out.push(...lines.slice(next - 1));
  if (crlf && !eol && out.length) out[out.length - 1] = out.at(-1).replace(/\r$/, "");
  return { lines: out, eol, regions };
}
export function editsDiff(text, edits, { path, context = CONTEXT } = {}) {
  const { lines: oldLines, eol } = splitLines(text), { lines: newLines, regions: given } = applyEdits(text, edits);
  const regions = given.reduce((all, region) => {
    const last = all.at(-1);
    if (last && region.from === last.to + 1) {
      last.to = region.to;
      last.lines = [...last.lines, ...region.lines];
    } else all.push({ ...region, lines: [...region.lines] });
    return all;
  }, []);
  if (!eol) {
    const end = regions.at(-1);
    if (end && end.to === oldLines.length && end.from > 1 && !(regions.at(-2)?.to === end.from - 1)) {
      end.from--;
      end.lines.unshift(oldLines[end.from - 1]);
    }
  }
  const keyed = (list, n) => !eol && n === list.length - 1 ? list[n] + "\0" : list[n];
  const ops = [];
  let a = 0, b = 0;
  for (const region of regions) {
    while (a < region.from - 1) ops.push({ type: " ", a: a++, b: b++ });
    const olds = oldLines.slice(region.from - 1, region.to).map((_, i) => keyed(oldLines, region.from - 1 + i));
    const news = region.lines.map((_, i) => keyed(newLines, b + i));
    for (const op of lineDiff(olds, news)) ops.push(op.type === " " ? { type: " ", a: a + op.a, b: b + op.b } : op.type === "-" ? { type: "-", a: a + op.a } : { type: "+", b: b + op.b });
    a += olds.length;
    b += news.length;
  }
  while (a < oldLines.length) ops.push({ type: " ", a: a++, b: b++ });
  const hunks = hunksOf(ops, context);
  if (!hunks.length) return "";
  const out = ["--- a/" + path, "+++ b/" + path];
  for (const { from, to } of hunks) {
    const part = ops.slice(from, to);
    const olds = part.filter((op) => op.type !== "+"), news = part.filter((op) => op.type !== "-");
    const oldBefore = ops.slice(0, from).filter((op) => op.type !== "+").length, newBefore = ops.slice(0, from).filter((op) => op.type !== "-").length;
    const range = (start, count, before) => count ? count === 1 ? String(start) : start + "," + count : before + ",0";
    out.push(`@@ -${range(olds[0] ? olds[0].a + 1 : 0, olds.length, oldBefore)} +${range(news[0] ? news[0].b + 1 : 0, news.length, newBefore)} @@`);
    for (const op of part) {
      const text2 = op.type === "+" ? newLines[op.b] : oldLines[op.a];
      out.push(op.type + text2);
      const lastOld = op.type !== "+" && op.a === oldLines.length - 1, lastNew = op.type !== "-" && op.b === newLines.length - 1;
      if (!eol && (lastOld || lastNew)) out.push(NO_EOL);
    }
  }
  return out.join("\n") + "\n";
}
function hunksOf(ops, context) {
  const spans = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === " ") continue;
    let end = i;
    for (; ; ) {
      while (end < ops.length && ops[end].type !== " ") end++;
      let next = end;
      while (next < ops.length && ops[next].type === " ") next++;
      if (next < ops.length && next - end <= 2 * context) {
        end = next;
        continue;
      }
      break;
    }
    spans.push({ from: Math.max(0, i - context), to: Math.min(ops.length, end + context) });
    i = end - 1;
  }
  return spans.reduce((all, span) => {
    const last = all.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else all.push({ ...span });
    return all;
  }, []);
}
export function counts({ additions = 0, deletions = 0 } = {}) {
  return el("span", { class: "p2-counts" }, el("span", { class: "p2-add-n" }, "+" + additions), el("span", { class: "p2-del-n" }, "−" + deletions));
}
const num = (n) => el("span", { class: "p2-dn", "aria-hidden": "true" }, n == null ? "" : String(n));
const code = (text) => el("span", { class: "p2-dt" }, text === "" ? "​" : text);
const ROW = { " ": "p2-dl", "+": "p2-dl is-add", "-": "p2-dl is-del", "\\": "p2-dl is-note" };
const SIGN = { " ": " ", "+": "+", "-": "−", "\\": "" };
export function unifiedView(hunks) {
  const rows = [];
  for (const hunk of hunks) {
    rows.push(el("div", { class: "p2-dh" }, el("span", { class: "p2-dh-at" }, hunk.header.replace(/ @@.*$/, " @@")), hunk.section ? el("span", { class: "p2-dh-sec" }, hunk.section) : null));
    for (const line of hunk.lines) {
      if (line.type === "\\") {
        rows.push(el("div", { class: ROW["\\"] }, num(null), num(null), el("span", { class: "p2-ds" }), el("span", { class: "p2-dt" }, "No newline at end of file")));
        continue;
      }
      rows.push(el("div", { class: ROW[line.type] }, num(line.old), num(line.new), el("span", { class: "p2-ds", "aria-hidden": "true" }, SIGN[line.type]), code(line.text)));
    }
  }
  return el("div", { class: "p2-diff is-unified", role: "table" }, rows);
}
export function splitView(hunks) {
  const rows = [];
  const side = (item, which) => item ? [num(item.n), el("span", { class: "p2-dt p2-side " + (item.type === "-" ? "is-del" : item.type === "+" ? "is-add" : "is-same") + (item.noEol ? " is-noeol" : ""), title: item.noEol ? "No newline at end of file" : null }, item.text === "" ? "​" : item.text)] : [num(null), el("span", { class: "p2-dt p2-side is-blank", "data-side": which })];
  for (const hunk of hunks) {
    rows.push(el("div", { class: "p2-dh p2-dh-split" }, el("span", { class: "p2-dh-at" }, hunk.header.replace(/ @@.*$/, " @@")), hunk.section ? el("span", { class: "p2-dh-sec" }, hunk.section) : null));
    for (const row of pairRows(hunk)) rows.push(el("div", { class: "p2-sl is-" + row.kind }, ...side(row.left, "old"), ...side(row.right, "new")));
  }
  return el("div", { class: "p2-diff is-split", role: "table" }, rows);
}
