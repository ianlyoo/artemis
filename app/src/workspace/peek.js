import { el } from "../boards/dom.js";
import { rel, fileName, shortWhen, clip, ledgerLabel, keyOf, parseKey, linkTarget, termName } from "./core.js";
import { getJSON, paths, homeApi } from "./api.js";
import { termStatus } from "./terms.js";
import { FILE_KIND } from "./doc.js";
import { archivePeek } from "./archive.js";
import { lead, isLedger, ledgerName } from "../names.js";
const KEEP = 3e4;
const KIND = { ...FILE_KIND, dir: "Folder", binary: "File", board: "Board", goal: "Goal", request: "Request", approval: "Approval" };
export function createPeek({ store, lists, within, api = homeApi }) {
  const data = store.data;
  const card = el("div", { class: "chat ide-peek", role: "tooltip", hidden: true });
  document.body.append(card);
  const answers = new Map();
  let timer = 0, over = null, asked = null;
  function local(target) {
    if (target.kind === "terminal") {
      const term = data.terminals.find((item) => item.id === target.id);
      if (!term) return [el("p", { class: "ide-peek-note" }, "The terminal closed")];
      const status = termStatus(term);
      return [el("p", { class: "ide-peek-kind" }, "Terminal" + (term.cwd ? " · " + term.cwd : "")), el("p", { class: "ide-peek-title" }, termName(term)), el("p", { class: "ide-peek-meta" }, el("span", { class: status.owner ? "ide-peek-owner" : "" }, status.line), el("span", {}, "Opened by " + lead()))];
    }
    if (isLedger(target.kind) && !target.ref.includes("/")) return [el("p", { class: "ide-peek-kind" }, "Ledger"), el("p", { class: "ide-peek-title" }, ledgerLabel(target.ref))];
    if (target.kind === "archive") {
      const said = archivePeek(target, data.archive?.items);
      return [el("p", { class: "ide-peek-kind" }, said.kind), el("p", { class: "ide-peek-title" }, clip(said.title, 90)), el("p", { class: "ide-peek-meta" }, said.meta.map((text) => el("span", {}, text)))];
    }
    return null;
  }
  function drawn(target, answer) {
    if (!answer.ok) {
      const line = answer.status === 404 ? "Not found" : answer.status === 403 ? "Can't open this" : answer.body?.error === "hq_unavailable" ? ledgerName() + " isn't loaded yet" : "Couldn't load the preview";
      return [el("p", { class: "ide-peek-kind" }, target.kind === "file" ? rel(target.path) : isLedger(target.kind) ? ledgerLabel(target.ref) : "Board"), el("p", { class: "ide-peek-note" }, line)];
    }
    const body = answer.body, key = keyOf(target);
    if (body.mtime) lists.know(key, body.mtime);
    const kind = (KIND[body.kind] ?? "File") + (target.kind === "file" ? " · " + rel(target.path) : "");
    const lines = (body.lines ?? []).slice(0, 8);
    return [el("p", { class: "ide-peek-kind" }, kind), el("p", { class: "ide-peek-title" }, clip(body.title || (target.kind === "file" ? fileName(target.path) : ""), 90)), lines.length ? el("ol", { class: "ide-peek-heads" }, lines.map((text) => el("li", {}, clip(text, 120)))) : null, el("p", { class: "ide-peek-meta" }, body.mtime ? el("span", {}, "Edited " + shortWhen(body.mtime)) : null, lists.changed(key) ? el("span", { class: "ide-peek-changed" }, "Changed") : null)];
  }
  function place(node, parts) {
    if (!node.isConnected || over !== node) return;
    card.replaceChildren(...parts.filter(Boolean));
    card.hidden = false;
    const box = node.getBoundingClientRect(), width = card.offsetWidth, height = card.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - width - 8, box.left));
    const top = box.bottom + 8 + height <= innerHeight - 8 ? box.bottom + 8 : Math.max(8, box.top - height - 8);
    card.style.setProperty("left", left + "px");
    card.style.setProperty("top", top + "px");
  }
  async function show(node, target) {
    const near = local(target);
    if (near) {
      place(node, near);
      return;
    }
    const key = keyOf(target), kept = answers.get(key);
    if (kept && Date.now() - kept.at < KEEP) {
      place(node, drawn(target, kept.answer));
      return;
    }
    const now = new AbortController();
    asked = now;
    let answer;
    try {
      answer = await getJSON(api, paths.preview(key), { signal: now.signal, expected: ["404 not_found"] });
    } catch {
      return;
    }
    if (asked !== now) return;
    asked = null;
    answers.set(key, { at: Date.now(), answer });
    place(node, drawn(target, answer));
  }
  function hide() {
    clearTimeout(timer);
    timer = 0;
    asked?.abort();
    asked = null;
    card.hidden = true;
  }
  const targetOf = (node) => {
    if (node.dataset.peek) return parseKey(node.dataset.peek);
    if (node.dataset.key && node.classList.contains("ex-row")) return parseKey(node.dataset.key);
    const href = node.getAttribute("href");
    return href ? linkTarget(href, location.origin) : null;
  };
  const enter = (event) => {
    const node = event.target.closest?.("a[data-chat-link=pane], a.chat-open, [data-peek], .ex-row[data-key]");
    if (node === over) return;
    hide();
    over = node;
    if (!node || within && !within(node)) return;
    const target = targetOf(node);
    if (!target || target.kind === "block") return;
    timer = setTimeout(() => {
      void show(node, target);
    }, 380);
  };
  const leave = (event) => {
    if (over && !over.contains(event.relatedTarget)) {
      hide();
      over = null;
    }
  };
  const quiet = () => {
    hide();
    over = null;
  };
  const escape = (event) => {
    if (event.key === "Escape") quiet();
  };
  document.addEventListener("pointerover", enter);
  document.addEventListener("pointerout", leave);
  document.addEventListener("scroll", quiet, true);
  document.addEventListener("pointerdown", quiet, true);
  document.addEventListener("keydown", escape);
  return { hide: quiet, destroy() {
    quiet();
    document.removeEventListener("pointerover", enter);
    document.removeEventListener("pointerout", leave);
    document.removeEventListener("scroll", quiet, true);
    document.removeEventListener("pointerdown", quiet, true);
    document.removeEventListener("keydown", escape);
    card.remove();
  } };
}
