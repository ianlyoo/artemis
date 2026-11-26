import { el } from "../boards/dom.js";
import { iconButton } from "./icons.js";
import { feed } from "../chat/feed.js";
import { SEND_LIMITS } from "../chat/store.js";
import { stateLine } from "../chat/view.js";
import { abs, rel, saved, on, emit, keyOf, sameTarget, looksSecret, offsetOf, rangeOf, locate, highlight, stylesheet } from "./core.js";
import { lead, isLedger, ledgerRef, l10n } from "../names.js";
export const SECRET_LINE = "The quote looks like it holds a secret";
export const COMMENT_SECRET_LINE = "A comment looks like it holds a secret";
const TOO_LONG = "The feedback doesn't fit in one message · 20,000 characters at most. Shorten the comments or send some later";
const QUOTE_MAX = 300, SIDE = 32, WIDTHS = [100, 60, 40, 24, 12], HQ_BYTES = 65536;
const KEEP = 200, KEEP_CHARS = 1e6;
const excerpt = (text, n) => {
  const line = String(text ?? "").replace(/\s+/g, " ").trim(), points = [...line];
  return points.length > n ? points.slice(0, n - 1).join("").trimEnd() + "…" : line;
};
const cut = (text, n) => {
  const points = [...text];
  return points.length > n ? points.slice(0, n - 1).join("") + "…" : text;
};
const side = (text, from, to) => text.slice(Math.max(0, from), Math.max(0, to)).replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g, "");
const wellFormed = (text) => typeof text.toWellFormed === "function" ? text.toWellFormed() : text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
const fits = (text, limit) => [...text].length <= limit && new TextEncoder().encode(text).length <= HQ_BYTES;
export { looksSecret };
const read = () => {
  const list = saved.read("comments", []);
  return Array.isArray(list) ? list.filter((item) => item?.id && (item.target || isElement(item))) : [];
};
const write = (list) => {
  saved.write("comments", list);
  emit("comments", list);
};
export const isElement = (item) => item?.kind === "element" && !!item.element && typeof item.element.path === "string";
const twins = (a, b) => isElement(a) || isElement(b) ? isElement(a) && isElement(b) && groupOf(a) === groupOf(b) && a.element.path === b.element.path && a.element.view === b.element.view && String(a.text ?? "").trim() === String(b.text ?? "").trim() : sameTarget(a.target, b.target) && String(a.text ?? "").trim() === String(b.text ?? "").trim() && (a.anchor ? !!b.anchor && ["exact", "prefix", "suffix"].every((part) => (a.anchor[part] ?? "") === (b.anchor[part] ?? "")) : !b.anchor && (a.blockId ?? null) === (b.blockId ?? null));
export const comments = { all: read, of: (target) => read().filter((item) => item.target && sameTarget(item.target, target)), add(fields) {
  const list = read(), item = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: "", at: (new Date()).toISOString(), ...fields };
  const twin = list.find((other) => twins(other, item));
  if (twin) return twin;
  write([...list, item]);
  return item;
}, update(id, fields, { quiet = false } = {}) {
  const list = read().map((item) => item.id === id ? { ...item, ...fields } : item);
  if (quiet) saved.write("comments", list);
  else write(list);
}, remove(ids) {
  const drop = new Set([].concat(ids));
  write(read().filter((item) => !drop.has(item.id)));
} };
export const plainTarget = (target) => !target ? null : target.kind === "file" ? { kind: "file", path: target.path } : target.kind === "board" ? { kind: "board", id: target.id } : isLedger(target.kind) ? { kind: target.kind, ref: target.ref } : null;
export const canComment = (target) => !!target && (["file", "board"].includes(target.kind) || isLedger(target.kind));
export function anchorFrom(doc, range) {
  const index = doc.index(), text = index.text;
  let start = offsetOf(index, range.startContainer, range.startOffset), end = offsetOf(index, range.endContainer, range.endOffset);
  if (start == null || end == null) return null;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end <= start) return null;
  const node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  return { anchor: { exact: cut(text.slice(start, end), QUOTE_MAX), prefix: side(text, start - SIDE, start), suffix: side(text, end, end + SIDE) }, section: doc.sectionOf(node), blockId: node?.closest?.(".pane-block")?.dataset.blockId ?? null, pos: start };
}
export function sectionFrom(doc, block) {
  const heading = block.querySelector(".bv-section-heading");
  return { anchor: null, section: doc.sectionOf(block), blockId: block.dataset.blockId, pos: heading ? offsetOf(doc.index(), heading, 0) ?? 0 : 0 };
}
export const refOf = (target) => !target ? "Workspace" : target.kind === "file" ? rel(target.path) : isLedger(target.kind) ? target.kind + ":" + target.ref : target.kind === "board" ? "board:" + String(target.id).slice(0, 8) : String(target.kind);
export const refOfItem = (item) => item.target ? refOf(item.target) : String(item.element?.ref || "Workspace");
const groupOf = (item) => item.target ? keyOf(item.target) : "ref:" + refOfItem(item);
export const sectionLabel = (section) => excerpt(String([...section ?? []].reverse().find(Boolean) ?? "").replace(/\s*[(（][^)）]*[)）]\s*$/, ""), 48);
export function targetOfRef(ref, data) {
  ref = String(ref ?? "");
  if (/^(work|system)\/./.test(ref)) return ref.split("/").includes("..") ? null : { kind: "file", path: abs(ref) };
  const ledger = ref.startsWith(ledgerRef() + ":") ? ref.slice(ledgerRef().length + 1) : "";
  if (/^[a-z]+(?:\/\d+)?$/.test(ledger)) return { kind: ledgerRef(), ref: ledger };
  const board = ref.match(/^board:([0-9a-f-]{4,})$/i);
  if (!board) return null;
  const found = data?.boards?.find((item) => String(item.id).startsWith(board[1]));
  return found ? { kind: "board", id: found.id } : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(board[1]) ? { kind: "board", id: board[1] } : null;
}
function ordered(list) {
  const docs = [];
  for (const item of list) {
    const key = groupOf(item);
    if (!docs.includes(key)) docs.push(key);
  }
  return [...list].sort((a, b) => docs.indexOf(groupOf(a)) - docs.indexOf(groupOf(b)) || (a.pos ?? 0) - (b.pos ?? 0));
}
function written(order, width) {
  const lines = [];
  let group = null;
  order.forEach((item, n) => {
    const ref = refOfItem(item), section = sectionLabel(item.section), sign = ref + "\n" + JSON.stringify(item.section ?? []);
    if (sign !== group) {
      if (lines.length) lines.push("");
      lines.push(l10n("피드백 · ", "Feedback · ") + ref + (section ? " › " + section : ""));
      group = sign;
    }
    const said = String(item.text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (isElement(item)) {
      lines.push(`${n + 1}. ${elementLine(item.element)}`);
      const place = elementPlace(item.element);
      if (place) lines.push("   " + place);
    } else if (item.anchor) lines.push(`${n + 1}. > "${excerpt(item.anchor.exact, width)}"`);
    else lines.push(`${n + 1}. ${said[0] && !said[0].startsWith('> "') ? said.shift() : l10n("이 절 전체", "The whole section")}`);
    for (const line of said) lines.push("   " + line);
  });
  return wellFormed(lines.join("\n"));
}
export const elementLine = (element) => l10n("요소 · ", "Element · ") + [excerpt(element.view, 24) || "Workspace", excerpt(element.role, 24) || "element"].join(" · ") + (excerpt(element.text, 120) ? ` "${excerpt(element.text, 120)}"` : "");
export function elementPlace(element) {
  const box = element.box, n = (value) => Math.round(Number(value) || 0);
  const size = box && typeof box === "object" ? `${n(box.x)},${n(box.y)} ${n(box.width)}×${n(box.height)}` : "";
  return [excerpt(element.path, 160), size].filter(Boolean).join(" · ");
}
export function compose(list, { limit = SEND_LIMITS.text } = {}) {
  const order = ordered(list);
  let text = "";
  for (const width of WIDTHS) {
    text = written(order, width);
    if (fits(text, limit)) return { text, order, fits: true, line: null };
  }
  return { text, order, fits: false, line: TOO_LONG };
}
export function readFeedback(text) {
  const lines = String(text ?? "").split("\n");
  if (!/^(?:피드백|Feedback) · /.test(lines[0])) return null;
  return lines.map((line) => {
    const head = line.match(/^(?:피드백|Feedback) · (.+?)(?: › (.+))?$/);
    if (head) return { kind: "ref", ref: head[1], section: head[2] ?? null };
    const quote = line.match(/^(\d+)\. > "(.*)"$/);
    if (quote) return { kind: "quote", n: Number(quote[1]), quote: quote[2] };
    const element = line.match(/^(\d+)\. ((?:요소|Element) · .*)$/);
    if (element) return { kind: "element", n: Number(element[1]), text: element[2] };
    const whole = line.match(/^(\d+)\. (.*)$/);
    if (whole) return { kind: "whole", n: Number(whole[1]), text: whole[2] };
    return line.trim() ? { kind: "comment", text: line.replace(/^ {3}/, "") } : { kind: "gap" };
  });
}
const book = () => {
  const value = saved.read("anchors", {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
export const anchorsOf = (messageId) => book()[messageId]?.items ?? null;
function keepAnchors(messageId, order) {
  const all = book();
  delete all[messageId];
  all[messageId] = { at: (new Date()).toISOString(), items: order.map((item, n) => ({ n: n + 1, target: item.target ? plainTarget(item.target) : null, anchor: item.anchor ? { exact: item.anchor.exact, prefix: item.anchor.prefix ?? "", suffix: item.anchor.suffix ?? "" } : null, section: [...item.section ?? []], blockId: item.blockId ?? null })) };
  let entries = Object.entries(all).slice(-KEEP);
  const sizes = entries.map((entry) => JSON.stringify(entry).length);
  for (let total = sizes.reduce((sum, size) => sum + size, 0); entries.length > 1 && total > KEEP_CHARS; entries = entries.slice(1)) total -= sizes.shift();
  for (; ; ) {
    saved.write("anchors", Object.fromEntries(entries));
    if (book()[messageId] || entries.length <= 1) return;
    entries = entries.slice(Math.ceil(entries.length / 2));
  }
}
const forgetAnchors = (messageId) => {
  const all = book();
  if (messageId in all) {
    delete all[messageId];
    saved.write("anchors", all);
  }
};
let flight = null;
const held = new Map(), watched = new WeakSet();
export function sendFeedback(list = comments.all(), { store = feed.store } = {}) {
  flight ??= attempt(list, store).catch((error) => {
    console.error("피드백:", error);
    return { ok: false, error: "failed", line: "Couldn't send" };
  }).finally(() => {
    flight = null;
  });
  return flight;
}
async function attempt(list, store) {
  list = (Array.isArray(list) ? list : []).filter((item) => item?.target || isElement(item));
  if (!list.length) return { ok: false, error: "empty", line: "No comments to send" };
  const quoted = list.filter((item) => item.anchor && looksSecret(item.anchor.exact) || isElement(item) && looksSecret(elementLine(item.element) + "\n" + elementPlace(item.element))), said = list.filter((item) => looksSecret(item.text));
  if (quoted.length || said.length) return { ok: false, error: "secret", line: quoted.length ? SECRET_LINE : COMMENT_SECRET_LINE, ids: [...quoted, ...said].map((item) => item.id) };
  const { text, order, fits: fits2, line } = compose(list);
  if (!fits2) return { ok: false, error: "too_long", line };
  if (looksSecret(text)) return { ok: false, error: "secret", line: "The feedback looks like it holds a secret" };
  const blocked = stateLine(store);
  if (blocked) return { ok: false, error: "not_ready", line: blocked };
  watch(store);
  const echoed = (id2) => store.items.some((item) => item.messageId === "home-" + id2 && !item.key.startsWith("local:"));
  let again = null;
  for (const [id2, kept] of held) {
    if (kept.store !== store) continue;
    const local2 = store.item("local:" + id2)?.local;
    if (!local2) {
      if (echoed(id2)) settle(id2);
      else held.delete(id2);
      continue;
    }
    if (local2.status === "sending") return { ok: false, error: "sending", line: "The last feedback is still sending" };
    if (local2.status === "sent") settle(id2);
    else if (!again && kept.text === text && local2.retry) again = id2;
    else store.discard(id2);
  }
  let id = again, ok;
  if (again) ok = await store.retry(again);
  else {
    const sent = await store.send({ text });
    if (!sent.id) return { ok: false, error: sent.error ?? "refused", line: sent.line ?? "Couldn't send" };
    id = sent.id;
    ok = sent.ok;
    keepAnchors("home-" + id, order);
    held.set(id, { store, text, went: order.map((item) => [item.id, String(item.text ?? "")]) });
  }
  const local = store.item("local:" + id)?.local;
  if (ok || !local && echoed(id)) {
    settle(id);
    return { ok: true, id, key: "local:" + id };
  }
  return { ok: false, error: local?.error ?? "failed", line: local?.line ?? "Couldn't send" };
}
function settle(id) {
  const kept = held.get(id);
  if (!kept) return;
  held.delete(id);
  const now = new Map(comments.all().map((item) => [item.id, String(item.text ?? "")]));
  const gone = kept.went.filter(([item, text]) => now.get(item) === text).map(([item]) => item);
  if (gone.length) comments.remove(gone);
}
function watch(store) {
  if (watched.has(store)) return;
  watched.add(store);
  const echo = (item) => item?.role === "user" && typeof item.messageId === "string" && item.messageId.startsWith("home-") && held.has(item.messageId.slice(5)) ? item.messageId.slice(5) : null;
  store.subscribe((event) => {
    if (!held.size) return;
    if (event.type === "local") {
      const id = event.key?.slice("local:".length);
      if (!held.has(id)) return;
      if (event.item?.local?.status === "sent") settle(id);
      else if (!event.item) {
        if (store.items.some((item) => item.messageId === "home-" + id)) settle(id);
        else {
          held.delete(id);
          forgetAnchors("home-" + id);
        }
      }
      return;
    }
    for (const item of event.type === "item" ? [event.item] : ["snapshot", "older"].includes(event.type) ? event.items ?? [] : []) {
      const id = echo(item);
      if (id) settle(id);
    }
  });
}
export function decorate(root, { data, openAt, store = null }) {
  void stylesheet("feedback.css");
  let frame = 0;
  const paint = () => {
    frame = 0;
    for (const plain of root.querySelectorAll(".msg-owner .msg-plain:not([data-fb])")) {
      const lines = readFeedback(plain.textContent);
      if (!lines) {
        plain.dataset.fb = "no";
        continue;
      }
      plain.dataset.fb = "ref";
      plain.replaceChildren(drawn(lines, plain));
    }
  };
  function kept(plain) {
    const key = plain.closest("[data-entry]")?.dataset.entry ?? "";
    const id = (store ?? feed.store).item(key)?.messageId ?? (key.startsWith("local:") ? "home-" + key.slice(6) : null);
    return id && anchorsOf(id) || [];
  }
  function link(node, ref, where) {
    if (!/^(?:work\/|system\/|board:)/.test(ref) && !ref.startsWith(ledgerRef() + ":")) return node;
    const shown = targetOfRef(ref, data);
    node.setAttribute("role", "link");
    node.tabIndex = 0;
    node.title = "Open this place in the document";
    if (shown) node.dataset.peek = keyOf(shown);
    const go = () => {
      const { target, anchor } = where();
      if (target) openAt(target, anchor);
    };
    node.addEventListener("click", go);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });
    return node;
  }
  function drawn(lines, plain) {
    const nodes = [];
    let group = null;
    const place = (here, n, quote) => {
      const item = n == null ? null : kept(plain).find((entry) => entry.n === n), target = item?.target ?? targetOfRef(here.ref, data);
      return { target, anchor: item ? item.anchor ?? { blockId: item.blockId, heading: here.section } : quote != null ? { exact: quote } : { heading: here.section } };
    };
    for (const line of lines) {
      if (line.kind === "ref") {
        const here = group = { ref: line.ref, section: line.section, first: null };
        nodes.push(link(el("span", { class: "fb-line fb-ref" }, el("span", { class: "fb-kind" }, l10n("피드백 · ", "Feedback · ")), el("span", { class: "fb-path" }, line.ref), line.section ? el("span", { class: "fb-section" }, " › " + line.section) : null), line.ref, () => place(here, here.first?.n, here.first?.quote)));
      } else if (line.kind === "quote" && group) {
        const here = group;
        here.first ??= line;
        nodes.push(link(el("span", { class: "fb-line fb-quote" }, el("span", { class: "fb-n" }, line.n + "."), el("span", { class: "fb-q" }, "“" + line.quote + "”")), here.ref, () => place(here, line.n, line.quote)));
      } else if ((line.kind === "whole" || line.kind === "element") && group) {
        const here = group;
        here.first ??= { n: line.n };
        nodes.push(link(el("span", { class: "fb-line fb-comment " + (line.kind === "element" ? "fb-element" : "fb-whole") }, el("span", { class: "fb-n" }, line.n + "."), el("span", {}, line.text)), here.ref, () => place(here, line.n)));
      } else if (line.kind === "gap") nodes.push(el("span", { class: "fb-gap", "aria-hidden": "true" }));
      else nodes.push(el("span", { class: "fb-line fb-comment" }, line.text ?? line.quote ?? ""));
    }
    return el("div", { class: "fb" }, nodes);
  }
  const watcher = typeof MutationObserver === "function" ? new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(paint);
  }) : null;
  watcher?.observe(root, { subtree: true, childList: true });
  paint();
  return () => {
    watcher?.disconnect();
    cancelAnimationFrame(frame);
  };
}
export function createReview({ active, onMode = () => {
}, onSent = () => {
} }) {
  void stylesheet("feedback.css");
  let shown = false, focusId = null, frame = 0, floatRange = null, told = 0, busy = false, flagged = new Set();
  const count = el("span", { class: "rv-count" }), line = el("span", { class: "rv-line", role: "status" });
  const send = iconButton("send", `Send the comments to ${lead()}, as one message`, { class: "rv-send" });
  const discard = iconButton("trash", "Discard every comment", { class: "rv-discard" });
  const end = iconButton("close", "End the review (the comments stay)", { class: "rv-end" });
  const bar = el("div", { class: "ide-reviewbar", hidden: true, role: "region", "aria-label": "Review" }, el("span", { class: "rv-title" }, "Review"), count, line, el("span", { class: "rv-actions" }, discard, end, send));
  const float = iconButton("comment", "Comment on the selected text", { class: "fb-float" });
  const floatBox = el("div", { class: "chat fb-float-box", hidden: true }, float);
  document.body.append(floatBox);
  function say(text, problem = false) {
    line.textContent = text;
    line.classList.toggle("is-problem", problem);
    clearTimeout(told);
    told = setTimeout(() => {
      line.textContent = "";
    }, 5200);
  }
  function paintBar() {
    const all = comments.all(), docs = new Set(all.map(groupOf)).size;
    count.textContent = all.length ? (all.length === 1 ? "1 comment" : `${all.length} comments`) + (docs > 1 ? ` · ${docs} documents` : "") : "Select text, or the margin by a heading, to comment";
    send.disabled = busy || !all.length;
    discard.hidden = !all.length;
    discard.disabled = busy;
  }
  function setOn(next) {
    next = !!next;
    if (shown === next) return;
    shown = next;
    bar.hidden = !shown;
    onMode(shown);
    if (!shown) focusId = null;
    paint();
  }
  function card(item) {
    const field = el("textarea", { class: "fb-field", rows: "2", placeholder: "Write a comment", "aria-label": "Comment" });
    field.value = item.text ?? "";
    field.readOnly = busy;
    const grow = () => {
      field.style.setProperty("height", "auto");
      field.style.setProperty("height", Math.min(field.scrollHeight + 2, 320) + "px");
    };
    field.addEventListener("input", () => {
      comments.update(item.id, { text: field.value }, { quiet: true });
      grow();
      schedule();
      if (flagged.has(item.id) && !looksSecret(field.value)) {
        flagged.delete(item.id);
        node.classList.remove("is-problem");
      }
    });
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        field.blur();
      }
    });
    const drop = iconButton("trash", "Delete this comment", { class: "fb-drop is-small" });
    drop.addEventListener("click", () => {
      if (!busy) comments.remove(item.id);
    });
    const quote = isElement(item) ? el("p", { class: "fb-card-quote is-element" }, "Element · " + (item.element.role || "element") + (item.element.text ? " “" + excerpt(item.element.text, 80) + "”" : "")) : item.anchor ? el("p", { class: "fb-card-quote" }, "“" + excerpt(item.anchor.exact, 160) + "”") : el("p", { class: "fb-card-quote is-section" }, "The whole section");
    const node = el("div", { class: "fb-card" + (flagged.has(item.id) ? " is-problem" : ""), "data-id": item.id }, quote, field, el("div", { class: "fb-card-foot" }, el("span", { class: "fb-card-where" }, sectionLabel(item.section) || "Top"), drop));
    node.addEventListener("focusin", () => {
      if (focusId !== item.id) {
        focusId = item.id;
        paintFocus();
      }
    });
    node.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("textarea,button")) requestAnimationFrame(() => field.focus({ preventScroll: true }));
    });
    requestAnimationFrame(grow);
    return node;
  }
  function paintFocus() {
    const doc = active()?.doc;
    for (const node of doc?.gutter.querySelectorAll(".fb-card") ?? []) node.classList.toggle("is-now", node.dataset.id === focusId);
    paintMarks();
  }
  function paintMarks() {
    const now = active(), doc = now?.doc;
    if (!doc || !shown) {
      highlight("ide-comment", []);
      highlight("ide-comment-now", []);
      return;
    }
    const index = doc.index(), rest = [], focus = [];
    for (const item of comments.of(now.target)) {
      if (!item.anchor) continue;
      const found = locate(index, item.anchor);
      if (!found) continue;
      (item.id === focusId ? focus : rest).push(rangeOf(index, found.start, found.end));
    }
    highlight("ide-comment", rest);
    highlight("ide-comment-now", focus);
  }
  function headings(doc) {
    for (const block of doc.article.querySelectorAll(".pane-block[data-hlevel]")) {
      if (block.querySelector(":scope > .fb-head")) continue;
      const add2 = iconButton("comment", "Comment on this whole section", { class: "fb-head is-small" });
      add2.addEventListener("click", () => addSection(block));
      block.append(add2);
    }
  }
  function paint() {
    paintBar();
    const now = active(), doc = now?.doc;
    if (!doc) {
      paintMarks();
      return;
    }
    if (shown && canComment(now.target)) headings(doc);
    const mine = shown ? comments.of(now.target) : [], gutter = doc.gutter;
    const have = new Map([...gutter.querySelectorAll(".fb-card")].map((node) => [node.dataset.id, node]));
    for (const item of mine) {
      if (have.has(item.id)) have.delete(item.id);
      else gutter.append(card(item));
    }
    for (const node of have.values()) node.remove();
    paintFocus();
    layout();
  }
  function layout() {
    const now = active(), doc = now?.doc;
    if (!doc || !shown) return;
    const gutter = doc.gutter, top = gutter.getBoundingClientRect().top, index = doc.index(), list = comments.all(), placed = [];
    for (const node of gutter.querySelectorAll(".fb-card")) {
      const item = list.find((entry) => entry.id === node.dataset.id);
      if (!item) continue;
      let y = null;
      if (item.anchor) {
        const found = locate(index, item.anchor), box = found ? rangeOf(index, found.start, found.end)?.getClientRects()[0] : null;
        if (box && box.height) y = box.top;
      }
      if (y == null && item.blockId) {
        let block = doc.article.querySelector(`[data-block-id="${CSS.escape(item.blockId)}"]`);
        while (block?.classList.contains("is-folded-away")) block = block.previousElementSibling;
        if (block) y = block.getBoundingClientRect().top;
      }
      placed.push({ node, y: (y ?? top) - top });
    }
    placed.sort((a, b) => a.y - b.y);
    let floor = 0;
    for (const { node, y } of placed) {
      const at = Math.max(Math.round(y - 6), floor);
      node.style.setProperty("top", at + "px");
      floor = at + node.offsetHeight + 12;
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      paintBar();
      layout();
    });
  };
  function add(fields) {
    const now = active();
    if (!now?.doc || !canComment(now.target)) return null;
    const item = comments.add({ target: plainTarget(now.target), ...fields });
    focusId = item.id;
    if (shown) paint();
    else setOn(true);
    requestAnimationFrame(() => requestAnimationFrame(() => now.doc.gutter.querySelector(`.fb-card[data-id="${item.id}"] textarea`)?.focus({ preventScroll: true })));
    return item;
  }
  function addFrom(range) {
    const doc = active()?.doc;
    if (!doc) return null;
    const found = anchorFrom(doc, range);
    if (!found) return null;
    if (looksSecret(found.anchor.exact)) {
      setOn(true);
      say(SECRET_LINE + " · it wasn't added", true);
      return null;
    }
    getSelection()?.removeAllRanges();
    hideFloat();
    return add(found);
  }
  function addSection(block) {
    const doc = active()?.doc;
    return doc ? add(sectionFrom(doc, block)) : null;
  }
  function hideFloat() {
    floatBox.hidden = true;
    floatRange = null;
  }
  function placeFloat() {
    const now = active(), selection = getSelection();
    if (!now?.doc || !canComment(now.target) || !selection?.rangeCount || selection.isCollapsed) return hideFloat();
    const range = selection.getRangeAt(0), start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    if (!now.doc.article.contains(range.commonAncestorContainer) || start?.closest?.("button,textarea,input") || !range.toString().trim()) return hideFloat();
    const boxes = [...range.getClientRects()].filter((box) => box.width || box.height), last = boxes.at(-1);
    if (!last) return hideFloat();
    floatRange = range.cloneRange();
    floatBox.hidden = false;
    const width = floatBox.offsetWidth, height = floatBox.offsetHeight;
    floatBox.style.setProperty("left", Math.max(8, Math.min(innerWidth - width - 8, last.right + 8)) + "px");
    floatBox.style.setProperty("top", Math.max(8, Math.min(innerHeight - height - 8, last.bottom + 6)) + "px");
  }
  float.addEventListener("pointerdown", (event) => event.preventDefault());
  float.addEventListener("click", () => {
    if (floatRange) addFrom(floatRange);
  });
  const up = () => setTimeout(placeFloat, 0);
  const keyed = (event) => {
    if (event.shiftKey || event.key === "Shift") placeFloat();
  };
  const changed = () => {
    if (getSelection()?.isCollapsed) hideFloat();
  };
  const scrolled = (event) => {
    if (!floatBox.hidden && event.target?.classList?.contains("doc-scroll")) hideFloat();
  };
  document.addEventListener("pointerup", up);
  document.addEventListener("keyup", keyed);
  document.addEventListener("selectionchange", changed);
  document.addEventListener("scroll", scrolled, true);
  function hold(on2) {
    busy = on2;
    for (const field of active()?.doc?.gutter.querySelectorAll(".fb-field") ?? []) field.readOnly = on2;
    paintBar();
  }
  send.addEventListener("click", async () => {
    if (busy) return;
    hold(true);
    line.textContent = "Sending…";
    line.classList.remove("is-problem");
    const result = await sendFeedback(comments.all());
    hold(false);
    if (!result.ok) {
      flagged = new Set(result.ids ?? []);
      for (const node of active()?.doc?.gutter.querySelectorAll(".fb-card") ?? []) node.classList.toggle("is-problem", flagged.has(node.dataset.id));
      say(result.line ?? "Couldn't send", true);
      return;
    }
    flagged = new Set();
    line.textContent = "";
    setOn(false);
    onSent(result);
  });
  discard.addEventListener("click", () => {
    if (busy) return;
    comments.remove(comments.all().map((item) => item.id));
    say("Comments discarded");
  });
  end.addEventListener("click", () => setOn(false));
  const offs = [on("comments", () => paint()), on("active", () => {
    hideFloat();
    paint();
  })];
  const resized = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  paintBar();
  return { bar, get on() {
    return shown;
  }, setOn, toggle: () => setOn(!shown), paint, refresh: schedule, addFrom, addSection, hideFloat, watch(doc) {
    resized?.observe(doc.article);
    const off = doc.onChange((what) => {
      if (what === "loaded") paint();
      else schedule();
    });
    return () => {
      off();
      resized?.unobserve(doc.article);
    };
  }, destroy() {
    for (const off of offs) off();
    resized?.disconnect();
    clearTimeout(told);
    cancelAnimationFrame(frame);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("keyup", keyed);
    document.removeEventListener("selectionchange", changed);
    document.removeEventListener("scroll", scrolled, true);
    floatBox.remove();
  } };
}
