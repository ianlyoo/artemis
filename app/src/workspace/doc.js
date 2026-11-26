import { cardInlineHTML, cardLabel } from "../card-md.js";
import { catalogBody } from "../boards/reports.js";
import { renderBlock, blockEnv } from "../boards/boards.js";
import { answerFor, keptSlots, answerComposing, afterComposing, ownEcho } from "../boards/answer.js";
import { boardCards, cardKey } from "../boards/cards.js";
import { prose } from "../boards/rich-text.js";
import { boardNotes } from "../boards/notes.js";
import { el, problem, scope } from "../boards/dom.js";
import { chatBlocks } from "../chat/visuals.js";
import { markLinks, wireLinks, chatHref } from "../chat/links.js";
import { reduced } from "../chat/motion.js";
import { KIND } from "../chat/kinds.js";
import { ledgerDoc, ledgerNeeds } from "./ledger.js";
import { approvalView } from "./approval-view.js";
import { ledgerTable } from "./ledger-table.js";
import { ledgerView } from "./ledger-view.js";
import { paths, textOf, getJSON } from "./api.js";
import { kindName, restorable, archiveError } from "./archive.js";
import { rel, fileName, keyOf, textIndex, rangeOf, locate, highlight, open as defaultOpenTarget, toTarget, ledgerLabel, shortWhen as when, boardMeta } from "./core.js";
import { imageView, ownImages } from "./image.js";
import { isExtKind, extCrumbs, extTitle, mountKind, docRendered } from "./extensions.js";
import { isCode, showCode, withCode, bindSource } from "./code.js";
import { docTrail } from "../mobile/trail.js";
import { placeDocBlocks } from "./doc-blocks.js";
import { fileDownload } from "../chat/file-download.js";
import { lead, isLedger, ledgerName } from "../names.js";
const FILE_ERRORS = { forbidden: "Home can't open this file", not_found: "Couldn't find the file", too_large: "Too large to preview", unsupported: "This format can't be previewed" };
export const FILE_KIND = { md: "Document", html: "Document", sheet: "Sheet", pdf: "PDF", docx: "Document", xlsx: "Sheet", pptx: "Slides", image: "Image", text: "File" };
function renderHere(block, node, owner, env) {
  const drawn = renderBlock(block, node, owner, env);
  const old = block?.type === "code" ? node.querySelector(":scope > .bv-code-head")?.querySelector(":scope > .bv-button") : null;
  if (!old) return drawn;
  const copy = el("button", { class: "bv-button", type: "button" }, "Copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(block.text || "");
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Select the text to copy";
    }
  });
  old.replaceWith(copy);
}
const draw = chatBlocks({ renderBlock: renderHere, prose });
const plain = (value) => String(value ?? "").replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
export function crumbs(target, data, item) {
  if (target.kind === "file") return rel(target.path).split("/");
  if (target.kind === "board") return ["Boards", item?.title || data?.boards?.find((board) => board.id === target.id)?.title || target.id.slice(0, 8)];
  if (isLedger(target.kind)) {
    const [kind, id] = target.ref.split("/");
    return id ? ["Ledger", ledgerLabel(kind + "s"), "#" + id] : ["Ledger", ledgerLabel(kind)];
  }
  if (target.kind === "image") return [target.from || "From the chat", item?.title || "Image"];
  if (target.kind === "archive") return ["Archive", item?.month || target.month || "", item?.title || target.title || "Archived"].filter(Boolean);
  if (isExtKind(target.kind)) return extCrumbs(target, data);
  return [`From ${lead()}'s reply`, target.block?.title || KIND[target.block?.type] || "Visual"];
}
export function createDoc({ target, api, store, phone = false, origin = location.origin, open: openTarget = defaultOpenTarget }) {
  const data = store.data;
  const titleNode = el("h1", { class: "doc-title" }), metaNode = el("p", { class: "doc-meta" }), notice = el("p", { class: "doc-notice", role: "status", hidden: true });
  const article = el("article", { class: "pane-doc doc-body" });
  const docHead = el("header", { class: "doc-head" }, titleNode, metaNode, notice);
  const download = el("div", { class: "pane-download-slot" });
  const page = el("div", { class: "doc-page" }, docHead, article, download);
  const gutter = el("aside", { class: "doc-gutter", "aria-label": "Comments" });
  const sheet = el("div", { class: "doc-sheet" }, page, gutter);
  const scroller = el("div", { class: "doc-scroll", tabindex: "-1", role: "region", "aria-label": "Document" }, sheet);
  const trail = phone ? docTrail({ scroller, headings: () => headings, go: (i) => goTo(headings[i]?.id) }) : null;
  if (trail) scroller.prepend(trail.node);
  const under = () => scroller.getBoundingClientRect().top + (trail?.height() ?? 0);
  const listeners = /* @__PURE__ */ new Set();
  let ownerFrame = 0, ownerRevision = null, ledgerLoad = 0;
  const slots = keptSlots();
  if (!phone) slots.place = placeDocBlocks;
  let answer = null, read = null, echo = false;
  let card = null, owner = null, item = null, headings = [], folded = /* @__PURE__ */ new Set(), index = null, finding = { query: "", hits: [], now: -1 }, quote = null, destroyed = false, kind = null, rawBom = false;
  const changed = (what) => {
    for (const fn of listeners) fn(what);
  };
  let textFrame = 0;
  const drawn = typeof MutationObserver === "function" ? new MutationObserver(() => {
    index = null;
    if (!textFrame) textFrame = requestAnimationFrame(() => {
      textFrame = 0;
      if (!destroyed) changed("text");
    });
  }) : null;
  drawn?.observe(article, { childList: true, subtree: true, characterData: true });
  const unwire = wireLinks(article, { origin, open: (next) => toTarget(next) ? openTarget(next, { from: "link" }) : false });
  const cards = ["board", "file", "archive"].includes(target.kind) ? boardCards({ api }) : null;
  let board = null;
  let notes = null;
  function env(scoped) {
    const base = blockEnv({ api, open: (id) => openTarget({ kind: "board", id }, { from: "link" }), phone }, scoped);
    base.link = (raw) => chatHref(raw, origin);
    base.cards = cards;
    base.notes = notes;
    base.boardId = target.kind === "board" ? target.id : null;
    base.board = board;
    return base;
  }
  function paint(blocks, heading, { path = null, questions = null, quiet = false } = {}) {
    owner?.destroy();
    owner = scope();
    board = { path, blocks, questions };
    cards?.read(board);
    if (quote) {
      quote = null;
      highlight("ide-quote", []);
    }
    notes = isLedger(target.kind) ? null : boardNotes(blocks);
    const drawEnv = env(owner), first = blocks[0], lead2 = first?.type === "heading" && Number(first.level) === 1;
    titleNode.textContent = plain(heading || (lead2 ? first.text : "") || fileName(target.path ?? "")) || "Untitled";
    const list = blocks.filter((block, n) => !(n === 0 && lead2)), carried = /* @__PURE__ */ new Map();
    if (notes) list.push({ id: "doc-notes", type: "notes", title: "Notes", items: notes.items });
    slots.place(article, list.map((block, n) => {
      if (!phone && (block.type === "video" || block.type === "audio")) {
        const key2 = "media:" + JSON.stringify(block), nth = (carried.get(key2) ?? 0) + 1;
        carried.set(key2, nth);
        return slots.node(key2 + "\n" + nth, block, (own) => {
          const node2 = el("section", { class: "bv-block pane-block", "data-block-id": block.id ?? "b" + n });
          try {
            draw(block, node2, own, env(own));
          } catch {
            node2.replaceChildren(problem("Couldn't show this block."));
          }
          return { node: node2, refresh: () => {
          } };
        });
      }
      if ((block.type === "answer" || block.type === "sign") && answer) return slots.node((block.type === "sign" ? "sign\n" : "") + block.slot, block, (own) => {
        const node2 = el("section", { class: "bv-block pane-block", "data-block-id": block.id ?? "b" + n });
        let refresh = null;
        try {
          refresh = renderHere(block, node2, own, { ...env(own), answer });
        } catch {
          node2.replaceChildren(problem("Couldn't show this block."));
        }
        return { node: node2, refresh };
      });
      const key = cards && cardKey(block, blocks);
      if (key != null) {
        const nth = (carried.get(key) ?? 0) + 1;
        carried.set(key, nth);
        return slots.node(key + "\n" + nth, block, (own) => {
          const node2 = el("section", { class: "bv-block pane-block", "data-block-id": block.id ?? "b" + n });
          try {
            draw(block, node2, own, env(own));
          } catch {
            node2.replaceChildren(problem("Couldn't show this block."));
          }
          markLinks(node2, origin);
          return { node: node2, refresh: () => {
          } };
        });
      }
      const node = el("section", { class: "bv-block pane-block", "data-block-id": block.id ?? "b" + n });
      try {
        if (isLedger(target.kind) && block.type === "ledger") ledgerView(block, node, { open: openTarget, mark: (root) => markLinks(root, origin), fresh: !quiet && !reduced() });
        else if (isLedger(target.kind) && block.type === "table") ledgerTable(block, node, { prose, env: drawEnv, owner, mark: (root) => markLinks(root, origin) });
        else draw(block, node, owner, drawEnv);
      } catch {
        node.replaceChildren(problem("Couldn't show this block."));
      }
      if (block.type === "heading") {
        node.dataset.hlevel = String(Math.max(1, Number(block.level) || 2));
        const words = node.querySelector(".bv-section-heading");
        if (words?.textContent.includes("`")) words.replaceChildren(...words.textContent.split(/`([^`]+)`/).map((part, n2) => n2 % 2 ? el("code", {}, part) : part));
        const fold = el("button", { type: "button", class: "ide-fold", "aria-expanded": "true", title: "Fold this section", "aria-label": "Fold this section" });
        fold.addEventListener("click", () => toggle(node.dataset.blockId));
        node.prepend(fold);
      }
      markLinks(node, origin);
      return node;
    }));
    slots.sweep();
    if (!list.length) article.append(el("p", { class: "pane-muted" }, "Nothing to show"));
    headings = [...article.querySelectorAll(".pane-block[data-hlevel]")].map((node) => ({ id: node.dataset.blockId, level: Number(node.dataset.hlevel), text: node.querySelector(".bv-section-heading")?.textContent ?? "", node }));
    folded = new Set([...folded].filter((id) => headings.some((h) => h.id === id)));
    applyFolds();
    index = null;
    drawn?.takeRecords();
    article.classList.remove("is-in");
    if (!quiet && !reduced()) {
      void article.offsetWidth;
      article.classList.add("is-in");
    }
  }
  function meta(parts) {
    metaNode.replaceChildren(...parts.filter(Boolean).map((part) => el("span", {}, part)));
  }
  function facts() {
    const text = target.kind === "file" && ["md", "text", "html"].includes(item?.type) && !item.masked && item.download ? item.download : null;
    return { target, root: article, head: docHead, scroller, item, get text() {
      return textNow().text;
    }, get blocks() {
      return [...article.querySelectorAll(":scope > .pane-block")].map((node) => ({ id: node.dataset.blockId, level: Number(node.dataset.hlevel || 0), node, text: textIndex(node).text }));
    }, get rawBom() {
      return rawBom;
    }, ...text ? { raw: () => rawText(text) } : {} };
  }
  function rendered() {
    if (!phone && !destroyed) docRendered(facts());
  }
  async function rawText(path) {
    try {
      const result = await api(path);
      if (result.status !== 200) return null;
      const read2 = await textOf(result);
      rawBom = read2.bom;
      return read2.text;
    } catch {
      return null;
    }
  }
  let code = null, source = false;
  bindSource(article, { get on() {
    return source;
  }, set: (on) => {
    source = !!on;
    scroller.scrollTop = 0;
    return load();
  } });
  async function load({ quiet = false } = {}) {
    notice.hidden = true;
    echo = false;
    const top = scroller.scrollTop;
    const one = isLedger(target.kind) && /^approval\/[1-9]\d*$/.test(target.ref) ? target.ref.slice(9) : null;
    if (one) {
      if (card) {
        await card.reload();
        return;
      }
      article.replaceChildren();
      article.classList.add("ide-approval");
      card = approvalView(article, one, { api, changed: (state) => {
        const title = card?.title() ?? "Approval #" + one;
        titleNode.innerHTML = cardInlineHTML(title);
        titleNode.title = cardLabel(title);
        titleNode.classList.add("cmd-title");
        item = { title: titleNode.textContent, kind: "Approval" };
        meta([]);
        if (!state.loading) {
          index = null;
          changed("loaded");
        }
      } });
      await card.ready;
      if (!destroyed) rendered();
      return;
    }
    if (isLedger(target.kind)) {
      const loading = ++ledgerLoad;
      if (!quiet) article.replaceChildren(el("p", { class: "pane-loading" }, "Loading…"));
      const views = ledgerNeeds(target.ref);
      await store.ownerViews();
      if (destroyed || loading !== ledgerLoad) return;
      const rows = Object.fromEntries(views.map((view) => [view, store.cached(view)]));
      const turn = target.ref === "goals" ? data.turn : [];
      ownerRevision = data.owner.epoch + ":" + data.owner.revision;
      const doc = views.every((view) => rows[view]) ? ledgerDoc(target.ref, rows, { turn, fetchedAt: views.map((view) => data.fetched[view]).filter(Boolean).sort().at(-1) ?? null }) : null;
      if (!doc) {
        titleNode.textContent = ledgerLabel(target.ref);
        const line = data.state.ledger === "hq_unavailable" ? ledgerName() + "'s ledger isn't loaded yet" : views.every((view) => rows[view]) ? "Not in the ledger" : "Couldn't load the ledger";
        article.replaceChildren(problem(line, line === "Not in the ledger" ? void 0 : () => load()));
        meta(["Ledger"]);
        changed("failed");
        return;
      }
      item = { title: doc.title, updatedAt: doc.updatedAt, kind: "Ledger" };
      meta(["Ledger", doc.updatedAt ? ledgerName() + " as of " + when(doc.updatedAt) : ""]);
      paint(doc.blocks, doc.title, { quiet });
      ownerFreshness();
      if (quiet) scroller.scrollTop = top;
      changed("loaded");
      rendered();
      return;
    }
    if (target.kind === "block") {
      item = { title: target.block?.title || KIND[target.block?.type] || "Visual", kind: KIND[target.block?.type] ?? "Visual" };
      meta([item.kind, `From ${lead()}'s reply`]);
      paint([{ ...target.block, id: target.block?.id ?? "pane" }], item.title);
      changed("loaded");
      rendered();
      return;
    }
    if (isExtKind(target.kind)) {
      let shown;
      if (!kind) {
        scroller.classList.add("is-kind");
        scroller.dataset.kind = target.kind;
        article.replaceChildren(el("p", { class: "pane-loading" }, "Loading…"));
        kind = mountKind(target, { host: article, api, store, open: openTarget, onChange: () => {
          if (!destroyed) {
            kindHeadings();
            changed("changed");
          }
        } });
        shown = await kind.ready;
      } else shown = await kind.refresh();
      if (destroyed) return;
      titleNode.textContent = extTitle(target, data);
      docHead.hidden = !kind.head;
      item = shown ? { title: titleNode.textContent, kind: "View" } : null;
      kindHeadings();
      if (quiet) scroller.scrollTop = top;
      changed(shown ? "loaded" : "failed");
      if (shown) rendered();
      return;
    }
    if (target.kind === "image") {
      if (owner) return;
      const held = owner = scope();
      scroller.classList.add("is-image");
      const out = phone ? null : el("a", { class: "text-control doc-out", href: "#", title: "Download the image" }, el("span", { class: "control-label" }, "Download"));
      titleNode.textContent = "Image";
      meta([target.from || "From the chat", out]);
      const images = await ownImages(target.images, held);
      if (destroyed) return;
      page.append(imageView({ ...target, images }, held, { phone, onShow: (shown) => {
        item = { title: shown.title, kind: "Image" };
        titleNode.textContent = shown.title;
        if (out) {
          out.href = shown.url;
          out.setAttribute("download", shown.name);
        }
        changed("loaded");
      } }));
      return;
    }
    if (target.kind === "archive") {
      await loadArchive(quiet);
      return;
    }
    if (!quiet) {
      titleNode.textContent = target.kind === "file" ? fileName(target.path) : data.boards.find((board2) => board2.id === target.id)?.title ?? "Board";
      article.replaceChildren(el("p", { class: "pane-loading" }, "Loading…"));
    }
    let status = 0, body = null;
    try {
      const result = await catalogBody(api, target.kind === "file" ? paths.doc(target.path) : paths.board(target.id), target.kind === "file" ? "report" : "board", target.kind === "file" ? target.path : target.id);
      status = result.status;
      try {
        body = await result.json();
      } catch {
      }
    } catch {
    }
    if (destroyed) return;
    if (status !== 200 || !body || body.ok === false || !Array.isArray(body.blocks)) {
      if (quiet && code && !code.dead && code.keeps) {
        if (status === 404 || body?.error === "not_found") code.gone();
        return;
      }
      const line = target.kind === "file" ? FILE_ERRORS[body?.error] ?? "Couldn't load it" : status === 404 ? "Couldn't find the board" : "Couldn't load the board";
      item = null;
      download.replaceChildren();
      article.replaceChildren(problem(line, status === 0 || status >= 500 ? () => load() : void 0));
      meta([target.kind === "file" ? rel(target.path) : "Board"]);
      changed("failed");
      return;
    }
    item = target.kind === "file" ? { title: body.title, updatedAt: body.mtime, kind: FILE_KIND[body.kind] ?? "File", type: body.kind, download: body.download, masked: Number(body.masked) || 0 } : { title: body.title, updatedAt: body.updatedAt, kind: "Board", source: body.source?.path };
    if (target.kind === "file") download.replaceChildren(...body.download ? [fileDownload(api, body.download, fileName(target.path))] : []);
    if (target.kind === "file" && body.title) data.titles.set(keyOf(target), body.title);
    meta(target.kind === "file" ? [item.kind, "Edited " + when(item.updatedAt), item.masked ? `${item.masked} masked` : ""] : boardMeta(item, { phone }));
    if (target.kind === "file" && (isCode(body) || source)) {
      code = await showCode(code, { target, body, host: article, scroller, notice, phone, changed, base: facts, api, source, reload: () => load({ quiet: true }) });
      if (destroyed) {
        code?.destroy();
        return;
      }
      if (!code) source = false;
    } else if (code) {
      code.destroy();
      code = null;
    }
    if (code) {
      if (quiet) scroller.scrollTop = top;
      changed("loaded");
      const made = code;
      made.whenBlocks(() => {
        if (!phone && !destroyed && code === made) docRendered(made.facts());
      });
      return;
    }
    if (target.kind === "board") {
      answer = answerFor({ ...body, id: target.id });
      echo = quiet && !!answer && ownEcho(read, body, target.id);
      read = body;
      if (answerComposing()) {
        await new Promise((done) => afterComposing(done));
        if (destroyed) return;
      }
    }
    paint(body.blocks, target.kind === "board" ? body.title : null, { path: (target.kind === "file" ? body.path : body.source?.path) ?? null, questions: body.questions, quiet });
    if (quiet) scroller.scrollTop = top;
    changed("loaded");
    rendered();
  }
  function kindHeadings() {
    headings = kind ? kind.outline().map((entry, n) => ({ id: "k" + n, level: entry.level, text: entry.text, node: entry.el })) : [];
  }
  async function loadArchive(quiet) {
    if (!quiet) {
      titleNode.textContent = target.title || "Archived";
      article.replaceChildren(el("p", { class: "pane-loading" }, "Loading from Drive…"));
    }
    const answer2 = await getJSON(api, paths.archiveItem(target.id));
    if (destroyed) return;
    if (!answer2.ok || !Array.isArray(answer2.body.blocks)) {
      item = null;
      article.replaceChildren(problem(archiveError(answer2), answer2.status === 0 || answer2.status >= 500 ? () => load() : void 0));
      meta(["Archive" + (target.month ? " · " + target.month : "")]);
      changed("failed");
      return;
    }
    const body = answer2.body;
    item = { title: body.title, kind: kindName(body), month: body.month, archive: body };
    archiveMeta(body);
    paint(body.blocks, body.title, { quiet });
    changed("loaded");
    rendered();
  }
  function archiveMeta(body, line = "") {
    const key = body.id.slice(body.id.indexOf(":") + 1);
    const live = body.kind === "board" ? { kind: "board", id: key } : body.kind === "report" ? { kind: "file", path: key } : null;
    const control = (text, title, onClick) => {
      const button = el("button", { type: "button", class: "text-control doc-archive-act", title }, el("span", { class: "control-label" }, text));
      button.addEventListener("click", onClick);
      return button;
    };
    const restore = restorable(body) ? control("Restore", body.kind === "report" ? "Back on the Reports list" : "Back into the live store", async () => {
      restore.disabled = true;
      restore.firstChild.textContent = "Restoring…";
      const answer2 = await store.restore(body.id);
      if (destroyed) return;
      if (!answer2.ok) {
        restore.disabled = false;
        restore.firstChild.textContent = "Restore";
        notice.textContent = archiveError(answer2);
        notice.hidden = false;
        return;
      }
      archiveMeta({ ...body, live: true, restored_at: answer2.body.at }, answer2.body.done === "live" ? "Already live" : "Restored");
    }) : null;
    const opener = live && (body.live || !restore) ? control("Open", body.kind === "board" ? "Open the live board" : "Open the file", () => openTarget(live, { from: "link" })) : null;
    meta(["Archive · " + body.month, "Read-only", body.date ? kindName(body) + " · " + body.date : kindName(body), line, restore, opener]);
  }
  function applyFolds() {
    const stack = [];
    for (const node of article.children) {
      const level = Number(node.dataset.hlevel || 0);
      if (level) {
        while (stack.length && stack.at(-1).level >= level) stack.pop();
      }
      const hidden = stack.some((entry) => entry.folded);
      node.classList.toggle("is-folded-away", hidden);
      if (level) {
        const isFolded = folded.has(node.dataset.blockId);
        stack.push({ level, folded: isFolded });
        const button = node.querySelector(":scope > .ide-fold");
        button?.setAttribute("aria-expanded", String(!isFolded));
        if (button) {
          button.title = isFolded ? "Unfold this section" : "Fold this section";
          button.setAttribute("aria-label", button.title);
        }
        node.classList.toggle("is-folded", isFolded);
        let note = node.querySelector(":scope > .fold-note");
        if (isFolded) {
          let count = 0;
          for (let next = node.nextElementSibling; next && !(Number(next.dataset.hlevel || 0) && Number(next.dataset.hlevel) <= level); next = next.nextElementSibling) count++;
          if (!note) {
            note = el("button", { type: "button", class: "fold-note" });
            note.addEventListener("click", () => toggle(node.dataset.blockId, false));
            node.append(note);
          }
          note.textContent = count ? `${count} folded` : "Folded";
        } else note?.remove();
      }
    }
    trail?.sync();
  }
  function toggle(id, on = !folded.has(id)) {
    if (on) folded.add(id);
    else folded.delete(id);
    applyFolds();
    changed("folds");
  }
  function foldAll(on) {
    folded = on ? new Set(headings.map((h) => h.id)) : new Set();
    applyFolds();
    changed("folds");
  }
  function unfoldTo(node) {
    const block = node?.closest?.(".pane-block") ?? node?.parentElement?.closest(".pane-block");
    if (!block) return;
    let level = Number(block.dataset.hlevel || 99), touched = false;
    for (let prev = block.previousElementSibling; prev; prev = prev.previousElementSibling) {
      const at = Number(prev.dataset.hlevel || 0);
      if (at && at < level) {
        if (folded.delete(prev.dataset.blockId)) touched = true;
        level = at;
      }
    }
    if (touched) {
      applyFolds();
      changed("folds");
    }
  }
  function sectionOf(node) {
    const block = node?.closest?.(".pane-block") ?? node?.parentElement?.closest(".pane-block");
    if (!block) return [];
    const path = [];
    let level = 99;
    for (let at = block; at; at = at.previousElementSibling) {
      const own = Number(at.dataset.hlevel || 0);
      if (own && own < level) {
        path.unshift(at.querySelector(".bv-section-heading")?.textContent ?? "");
        level = own;
      }
    }
    return path;
  }
  function goTo(id, { smooth = !reduced() } = {}) {
    const heading = headings.find((h) => h.id === id);
    if (!heading) return;
    unfoldTo(heading.node);
    const top = heading.node.getBoundingClientRect().top - under() + scroller.scrollTop - (trail ? 8 : 18);
    scroller.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }
  function currentHeading() {
    const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.2;
    let now = null;
    for (const h of headings) {
      if (h.node.classList.contains("is-folded-away")) continue;
      if (h.node.getBoundingClientRect().top <= line) now = h.id;
      else break;
    }
    return now ?? headings.find((h) => !h.node.classList.contains("is-folded-away"))?.id ?? null;
  }
  const textNow = () => index ??= textIndex(article);
  function find(query, { keep = false } = {}) {
    const needle = String(query ?? "").trim().toLocaleLowerCase(), was = keep && finding.query === needle ? finding.now : -1;
    finding = { query: needle, hits: [], now: -1 };
    if (needle) {
      const hay = textNow().text.toLocaleLowerCase();
      for (let at = hay.indexOf(needle); at >= 0 && finding.hits.length < 500; at = hay.indexOf(needle, at + needle.length)) finding.hits.push({ start: at, end: at + needle.length });
      const top = under();
      if (finding.hits.length) finding.now = was >= 0 ? Math.min(was, finding.hits.length - 1) : Math.max(0, finding.hits.findIndex((hit) => {
        const box = rangeOf(textNow(), hit.start, hit.end)?.getBoundingClientRect();
        return !!box && box.height > 0 && box.top >= top;
      }));
    }
    paintFind(was < 0);
    return { count: finding.hits.length, now: finding.now };
  }
  function step(dir) {
    if (!finding.hits.length) return { count: 0, now: -1 };
    finding.now = (finding.now + dir + finding.hits.length) % finding.hits.length;
    paintFind(true);
    return { count: finding.hits.length, now: finding.now };
  }
  function paintFind(bring) {
    const all = finding.hits.map((hit) => rangeOf(textNow(), hit.start, hit.end));
    highlight("ide-find", all.filter((range, n) => n !== finding.now));
    highlight("ide-find-now", finding.now >= 0 ? [all[finding.now]] : []);
    if (bring && finding.now >= 0) bringIntoView(all[finding.now]);
  }
  function bringIntoView(range, where = 0.38) {
    if (!range) return;
    unfoldTo(range.startContainer.parentElement);
    const box = range.getBoundingClientRect(), frame = scroller.getBoundingClientRect();
    if (box.top < under() + 40 || box.bottom > frame.bottom - 40) scroller.scrollTo({ top: scroller.scrollTop + box.top - frame.top - frame.height * where, behavior: reduced() ? "auto" : "smooth" });
  }
  function reveal(anchor) {
    const found = locate(textNow(), anchor);
    if (!found) {
      quote = null;
      highlight("ide-quote", []);
      notice.textContent = "The text changed · the quote isn't in this document anymore";
      notice.hidden = false;
      return false;
    }
    notice.hidden = true;
    quote = found;
    const range = rangeOf(textNow(), found.start, found.end);
    highlight("ide-quote", [range]);
    bringIntoView(range, 0.3);
    return true;
  }
  function show(on) {
    if (!on) {
      for (const name of ["ide-find", "ide-find-now", "ide-quote"]) highlight(name, []);
      return;
    }
    paintFind(false);
    highlight("ide-quote", quote ? [rangeOf(textNow(), quote.start, quote.end)] : []);
  }
  function ownerFreshness() {
    if (!isLedger(target.kind) || destroyed) return;
    const stale = data.owner.state !== "ready" && !!item;
    notice.textContent = stale ? ledgerName() + " is unavailable · showing the last received ledger" : "";
    notice.hidden = !stale;
  }
  const stopOwnerViews = isLedger(target.kind) ? store.subscribe((change) => {
    if (change === "freshness") {
      ownerFreshness();
      return;
    }
    if (!ownerFrame) ownerFrame = requestAnimationFrame(() => {
      ownerFrame = 0;
      if (!destroyed && ownerRevision !== data.owner.epoch + ":" + data.owner.revision) void load({ quiet: true });
    });
  }) : () => {
  };
  const ready = load();
  return withCode({ node: scroller, scroller, article, gutter, sheet, page, target, ready, facts, get item() {
    return item;
  }, get echo() {
    return echo;
  }, get headings() {
    return headings;
  }, get folded() {
    return folded;
  }, meta: () => ({ crumbs: crumbs(target, data, item), item }), get controls() {
    return kind?.controls ?? null;
  }, get tools() {
    return kind?.tools !== false;
  }, index: textNow, sectionOf, toggle, foldAll, goTo, currentHeading, unfoldTo, find, step, reveal, show, clearQuote() {
    quote = null;
    highlight("ide-quote", []);
  }, get finding() {
    return { count: finding.hits.length, now: finding.now, query: finding.query };
  }, reload: ({ quiet = false } = {}) => load({ quiet }), retarget() {
    if (destroyed || target.kind !== "file") return Promise.resolve();
    if (code && !code.dead && !code.dirty) {
      code.destroy();
      code = null;
    }
    titleNode.textContent = fileName(target.path);
    return load({ quiet: true });
  }, onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, destroy() {
    destroyed = true;
    stopOwnerViews();
    cancelAnimationFrame(ownerFrame);
    trail?.stop();
    drawn?.disconnect();
    cancelAnimationFrame(textFrame);
    unwire();
    card?.destroy();
    owner?.destroy();
    slots.destroy();
    cards?.destroy();
    kind?.dispose();
    show(false);
    scroller.remove();
    listeners.clear();
  } }, () => code);
}
