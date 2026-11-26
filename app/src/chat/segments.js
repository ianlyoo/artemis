import { TYPED, fenceId } from "./card-fences.js";
import { mountFence as mountCode } from "./rendering.js";
import { mountRich } from "./rich/renderer.js";
import { canonical, sourceKey, pageSource, pageRevision, ledgerSrc } from "./source-contract.js";
export { canonical } from "./source-contract.js";
import { feed } from "./feed.js";
import { el, scope, shortId } from "../boards/dom.js";
import { chatHref, classifyLink, markLinks, paneHref, wireLinks } from "./links.js";
import { provenanceLine } from "./visual-labels.js";
import { problem, wholeCells, refusedVisual } from "./visuals.js";
import { reduced } from "./motion.js";
import { markRefNodes, notesEnv, notesFold, replyNotes, runText } from "./notes.js";
import { mountChoices } from "./choices.js";
import { mountSecret } from "./secret-card.js";
import { signReply } from "./sign-reply.js";
import { mountInterview } from "./interview-card.js";
import { mountPreviewCard } from "./preview-card.js";
import { knownBoardTitle, onBoardTitles } from "../board-titles.js";
import { has, l10n } from "../names.js";
export const BURST = 140, WEIGHT = 60, REVEAL = 1e3;
export const revealTime = (chars) => Math.min(REVEAL, Math.max(180, chars * 2.2));
export const SRC_SPEC_BYTES = 4096;
export const NO_DATA = "Couldn't find the data";
const QUIET = ["secret", "sign", "interview", "preview"];
export function segmentsOf(item) {
  if (!Array.isArray(item?.segments)) return item?.text ? [{ type: "md", text: item.text }] : [];
  if (item.ledger) return placeChoices(item.segments, item.key);
  return placeRichState(placeSigns(placeSecrets(placeChoices(placeCards(item.segments), item.key), item.key), item.key), item.key);
}
const richStates = new WeakMap();
export function placeRichState(segments, messageId) {
  if (typeof messageId !== "string" || !messageId || !segments.some((segment) => segment?.lang === "cindy-ui")) return segments;
  const was = richStates.get(segments);
  if (was?.messageId === messageId) return was.out;
  const out = segments.map((segment, index) => segment?.lang === "cindy-ui" ? { ...segment, richStateKey: JSON.stringify(["chat", messageId, index]) } : segment);
  richStates.set(segments, { messageId, out });
  return out;
}
const sealed = new WeakMap();
export function placeSecrets(segments, key) {
  if (!segments.some((segment) => segment?.type === "block" && segment.block?.type === "secret")) return segments;
  const was = sealed.get(segments);
  if (was && was.key === key) return was.out;
  const out = segments.map((segment) => segment?.type === "block" && segment.block?.type === "secret" ? { ...segment, reply: typeof key === "string" ? key : null } : segment);
  sealed.set(segments, { key, out });
  return out;
}
const signing = new WeakMap();
export function placeSigns(segments, key) {
  if (!segments.some((segment) => segment?.type === "sign")) return segments;
  const was = signing.get(segments);
  if (was && was.key === key) return was.out;
  const out = segments.map((segment) => segment?.type === "sign" ? { ...segment, reply: typeof key === "string" ? key : null } : segment);
  signing.set(segments, { key, out });
  return out;
}
const chosen = new WeakMap();
export function placeChoices(segments, key) {
  if (!segments.some((segment) => segment?.lang === "choices")) return segments;
  const was = chosen.get(segments);
  if (was && was.key === key) return was.out;
  let fence = 0;
  const out = segments.map((segment) => segment?.lang === "choices" && (segment.type === "code" || segment.type === "pending") ? { type: "choices", text: String(segment.text ?? ""), key: key ?? null, fence: fence++, ...segment.type === "pending" ? { pending: true } : {} } : segment);
  chosen.set(segments, { key, out });
  return out;
}
const placed = new WeakMap();
export function placeCards(segments) {
  if (!segments.some((segment) => ["secret", "step"].includes(segment?.lang))) return segments;
  const was = placed.get(segments);
  if (was) return was;
  const out = segments.map((segment) => {
    if (!["code", "pending"].includes(segment?.type) || segment.reason || !["secret", "step"].includes(segment.lang)) return segment;
    const id = fenceId(segment.lang, segment.info ?? segment.lang, segment.type === "code" ? segment.text : "");
    return id ? { type: segment.lang, id } : segment;
  });
  placed.set(segments, out);
  return out;
}
async function ask(api, spec) {
  if (new TextEncoder().encode(spec).length > SRC_SPEC_BYTES) return { ok: false, error: "too_large" };
  try {
    const response = await api("/chat/src?spec=" + encodeURIComponent(spec));
    let body = null;
    try {
      body = await response.json();
    } catch {
    }
    if (response.ok && body?.ok && body.block && typeof body.block === "object") return { ok: true, block: body.block };
    if ([400, 403, 404, 413].includes(response.status)) return { ok: false, error: typeof body?.error === "string" ? body.error : "not_found" };
    return { ok: false, error: "unavailable", transient: true };
  } catch {
    return { ok: false, error: "unavailable", transient: true };
  }
}
const sourceCaches = new WeakMap();
export function srcResolver(api, { limit = 64, page = feed } = {}) {
  const current = () => {
    const owner = page;
    let shared = sourceCaches.get(owner);
    if (!shared) sourceCaches.set(owner, shared = { revision: null, kept: new Map(), files: new Map() });
    const revision = pageRevision(page);
    if (shared.revision !== revision) {
      shared.revision = revision;
      shared.kept.clear();
    }
    return shared;
  };
  const resolve = (block) => {
    let spec;
    if (new TextEncoder().encode(canonical(block)).length > SRC_SPEC_BYTES) return Promise.resolve({ ok: false, error: "too_large" });
    try {
      spec = sourceKey(block);
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.error ?? "bad_spec" });
    }
    const shared = current(), fromLedger = ledgerSrc(block.src), revision = shared.revision, key = spec, kept = fromLedger ? shared.kept : shared.files;
    let answer = kept.get(key);
    const present = (result) => fromLedger && (current() !== shared || shared.revision !== revision) ? resolve(block) : result.ok ? { ...result, block: { ...structuredClone(result.block), id: block.id ?? "src1" } } : result;
    if (answer) {
      kept.delete(key);
      kept.set(key, answer);
      return answer.then(present);
    }
    answer = Promise.resolve().then(() => {
      try {
        const local = pageSource(JSON.parse(spec), page.dashboard);
        if (local) return local;
      } catch (e) {
        if (e.error) return { ok: false, error: e.error, detail: e.detail };
      }
      return ask(api, spec);
    }).then((result) => {
      if (result.transient && kept.get(key) === answer) kept.delete(key);
      return result;
    });
    kept.set(key, answer);
    if (!fromLedger) while (kept.size > limit) kept.delete(kept.keys().next().value);
    return answer.then(present);
  };
  resolve.refresh = (block) => {
    if (!ledgerSrc(block.src)) current().files.delete(sourceKey(block));
    return resolve(block);
  };
  return resolve;
}
const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|CAPTION|DD|DETAILS|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL)$/i;
const VERBATIM = /^(PRE|CODE|TEXTAREA|SVG)$/i;
export function softBreaks(root) {
  const nodes = [...root.childNodes];
  const content = (at, way) => {
    for (let n = at; n >= 0 && n < nodes.length; n += way) {
      if (nodes[n].tagName) return !BLOCK.test(nodes[n].tagName);
      if (/\S/.test(nodes[n].textContent)) return true;
    }
    return false;
  };
  nodes.forEach((node, n) => {
    if (node.tagName) {
      if (!VERBATIM.test(node.tagName)) softBreaks(node);
      return;
    }
    const lines = node.textContent.split("\n");
    if (lines.length < 2) return;
    const shows = lines.map((line) => /\S/.test(line)), first = shows.indexOf(true), last = shows.lastIndexOf(true);
    const before = content(n - 1, -1), after = content(n + 1, 1), parts = [];
    let text = lines[0];
    for (let i = 1; i < lines.length; i++) {
      if ((before || first >= 0 && first < i) && (after || last >= i)) {
        parts.push(document.createTextNode(text), el("br"));
        text = lines[i];
      } else text += "\n" + lines[i];
    }
    if (!parts.length) return;
    for (const part of [...parts, document.createTextNode(text)]) if (part.tagName || part.textContent) root.insertBefore(part, node);
    node.remove();
  });
  return root;
}
const validTarget = (target) => target?.kind === "board" && typeof target.id === "string" && !!target.id;
const plainClick = (event) => !(event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
export function createSegments({ api, prose, renderBlock, blockEnv, origin, open, phone = false, resolve = srcResolver(api), text = null, pending = null, card = null, choices = null, secrets = false, sign = null }) {
  const envFor = (owner) => {
    const env = blockEnv({ api, open: (id) => open({ kind: "board", id }, { from: "link" }), phone }, owner);
    env.link = (raw) => chatHref(raw, origin);
    return env;
  };
  const section = (segment, attrs = {}, ...children) => el("section", { class: "bv-block", "data-segment": segment, ...attrs }, ...children);
  let drawn = null;
  const fill = (node, block, owner, env) => {
    drawn = null;
    try {
      drawn = renderBlock(block, node, owner, env) ?? null;
    } catch {
      node.replaceChildren(problem("Couldn't show this block."));
    }
    markLinks(node, origin);
    return node;
  };
  const sources = new Set();
  const run = (source, env) => {
    const node = wholeCells(markRefNodes(softBreaks(prose(source, env))));
    node.setAttribute("data-segment", "md");
    markLinks(node, origin);
    for (const link of node.querySelectorAll("a[href]")) {
      const target = classifyLink(link.getAttribute("href"), origin);
      if (target.kind !== "file") continue;
      const href = paneHref(target), name = target.path.split("/").pop();
      const size = el("span", { class: "chat-file-size" }, "…");
      const card2 = el("span", { class: "chat-file" });
      link.replaceWith(card2);
      link.classList.add("chat-file-name");
      link.textContent = name;
      card2.append(link, size, el("a", { href, download: "", class: "chat-file-download" }, l10n("다운로드", "Download")));
      fetch(href, { method: "HEAD" }).then((response) => {
        if (!response.ok) throw new Error();
        const bytes = Number(response.headers.get("content-length"));
        size.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
      }).catch(() => {
        size.textContent = l10n("크기 확인 불가", "Size unknown");
      });
    }
    return node;
  };
  function sourced(block, owner, env) {
    const node = section("block", { "data-block-id": block.id });
    const asked = (result) => ({ ...result.block, src: block.src });
    const stamp = (line, raw, glow) => {
      const text2 = provenanceLine(raw, block.src);
      if (line.textContent === text2) return;
      line.textContent = text2;
      line.title = raw;
      if (glow) {
        line.classList.remove("is-changed");
        void line.offsetWidth;
        line.classList.add("is-changed");
      }
    };
    let record = null;
    const settle = async () => {
      if (record) sources.delete(record);
      node.replaceChildren();
      node.setAttribute("aria-busy", "true");
      node.setAttribute("data-src", "loading");
      node.removeAttribute("data-error");
      const result = await resolve(block);
      if (owner.signal.aborted) return;
      node.removeAttribute("aria-busy");
      node.setAttribute("data-src", result.ok ? "ok" : "error");
      if (result.ok) {
        fill(node, asked(result), owner, env);
        const line = el("p", { class: "chat-provenance" });
        if (typeof result.block.provenance === "string") {
          stamp(line, result.block.provenance, false);
          node.append(line);
        }
        if (ledgerSrc(block.src)) {
          let asking = null, more = false;
          const once = async () => {
            const fresh = await resolve.refresh(block);
            if (owner.signal.aborted) return true;
            if (!fresh.ok) {
              if (!fresh.transient) {
                sources.delete(record);
                await settle();
              }
              return true;
            }
            const sign2 = canonical(fresh.block.rows ?? fresh.block.series ?? fresh.block.items ?? fresh.block);
            if (sign2 !== record.sign) {
              record.sign = sign2;
              if (record.updater) record.updater.update(asked(fresh));
              else {
                sources.delete(record);
                settle();
                return true;
              }
            }
            if (typeof fresh.block.provenance === "string") stamp(line, fresh.block.provenance, true);
            return false;
          };
          record = { node, updater: drawn, sign: canonical(result.block.rows ?? result.block.series ?? result.block.items ?? result.block), again() {
            if (asking) {
              more = true;
              return asking;
            }
            asking = (async () => {
              let done = false;
              do {
                more = false;
                done = await once();
              } while (more && !done);
            })().finally(() => {
              asking = null;
            });
            return asking;
          } };
          sources.add(record);
          owner.own(() => sources.delete(record));
        }
      } else {
        node.setAttribute("data-error", result.error);
        if (typeof block.title === "string" && block.title) node.append(el("div", { class: "cv-head" }, el("span", { class: "cv-title" }, block.title)));
        node.append(problem(NO_DATA, result.transient ? settle : void 0));
        if (ledgerSrc(block.src)) {
          record = { node, again() {
            sources.delete(record);
            return settle();
          } };
          sources.add(record);
          owner.own(() => sources.delete(record));
        }
      }
    };
    settle();
    return node;
  }
  function draw(segment, owner, notes = null) {
    const env = { ...envFor(owner), notes };
    switch (segment?.type) {
      case "md":
        return run(segment.text, { ...env, notes: notesEnv(notes) });
      case "block":
        if (!segment.block || typeof segment.block !== "object") return null;
        if (segment.block.type === "secret") return fill(section("block", { "data-block-id": segment.block.id }), segment.block, owner, { ...env, secretReply: secrets && typeof segment.reply === "string" ? segment.reply : null });
        return segment.block.src !== void 0 ? sourced(segment.block, owner, env) : fill(section("block", { "data-block-id": segment.block.id }), segment.block, owner, env);
      case "card": {
        const node = section("card", { "data-approval": segment.approval });
        if (card) card(segment.approval, node, owner);
        else node.append(el("p", {}, el("a", { href: "#/approvals/" + segment.approval }, "Approval #" + segment.approval)));
        return node;
      }
      case "choices":
        return segment.pending ? section("choices", { "aria-busy": "true" }) : mountChoices(section("choices"), { ...choices, text: segment.text, key: segment.key, fence: segment.fence }, owner);
      case "step": {
        const node = section("step", { "data-step": segment.id });
        let step;
        import("../boards/step-card.js").then(({ mountStep }) => {
          if (!owner.signal.aborted) step = mountStep(node, segment.id, { api });
        });
        owner.own(() => step?.destroy());
        return node;
      }
      case "secret": {
        const node = section("secret", { "data-secret": segment.id }), drawn2 = mountSecret(node, { api, id: segment.id });
        owner.own(() => drawn2.destroy());
        return node;
      }
      case "sign":
        return !has("sign") ? null : signReply(sign ? segment : { ...segment, reply: null }, section("sign", { "data-sign": segment.slot }), owner, { api, agentId: sign?.agentId ?? null });
      case "interview": {
        if (!has("interview")) return null;
        const node = section("interview", { "data-interview": String(segment.order) });
        mountInterview(node, { api, order: segment.order }, owner);
        return node;
      }
      case "preview": {
        const node = section("preview", { "data-preview": segment.id });
        mountPreviewCard(node, { api, id: segment.id, open, phone }, owner);
        return node;
      }
      case "code":
        if (segment.reason && TYPED.includes(segment.lang) && segment.lang !== "open") return section("refused", {}, refusedVisual(segment));
        return segment.lang === "answer" ? section("board-only", { class: "choices-unreadable" }, l10n("이 블록은 보드에서만 보여요", "This block shows on a board only")) : null;
      case "pending":
        return segment.lang === "answer" ? section("board-only", { class: "choices-unreadable" }, l10n("이 블록은 보드에서만 보여요", "This block shows on a board only")) : QUIET.includes(segment.lang) ? section("pending", { "data-pending": segment.lang, "aria-busy": "true" }) : TYPED.includes(segment.lang) ? pending?.(segment.lang) ?? section("pending", { "data-pending": segment.lang, "aria-busy": "true" }) : null;
      case "open": {
        const { target, title } = segment;
        if (!validTarget(target)) return null;
        const name = el("span", { class: "chat-open-title" });
        const node = el("a", { class: "chat-open", href: paneHref(target), "data-segment": "open", "data-open-kind": target.kind }, el("span", { class: "chat-open-kind" }, l10n("보드", "Board")), name, el("span", { class: "chat-open-action" }, "Open"));
        const paint = () => {
          const label = title || knownBoardTitle(target.id) || shortId(target.id);
          if (name.textContent !== label) name.textContent = label;
          node.title = label;
        };
        paint();
        owner.own(onBoardTitles(paint));
        node.addEventListener("click", (event) => {
          if (!plainClick(event)) return;
          event.preventDefault();
          open(target, { from: "chip" });
        });
        return node;
      }
      default:
        return null;
    }
  }
  const written = (owner, current) => {
    const env = envFor(owner);
    return text((source) => run(source, { ...env, notes: notesEnv(current()) }));
  };
  mount.refresh = () => {
    for (const record of [...sources]) if (record.node.isConnected) record.again();
  };
  return mount;
  function mount(container, parentSignal) {
    let records = new Map(), clock = null, frame = 0, notes = null, finished = false;
    const unwire = wireLinks(container, { origin, open });
    const notesScope = scope(parentSignal), noteEnv = envFor(notesScope);
    const fold = notesFold({ reduced, drawNote: (note) => {
      const node = prose(note, { ...noteEnv, notes }, true);
      markLinks(node, origin);
      return node;
    } }), unfold = fold.wire(container);
    const showNotes = () => fold.set(notes?.items, { shown: finished && [...records.values()].every(whole) });
    const paceable = (record) => typeof record.writer?.show === "function";
    const lengthOf = (record) => record.writer ? paceable(record) ? record.held ? String(record.text ?? "").length : record.writer.length : 0 : WEIGHT;
    const whole = (record) => !record.held && (!paceable(record) || record.writer.shown >= record.writer.length);
    const shownOf = (record) => record.held ? 0 : paceable(record) ? record.writer.shown : lengthOf(record);
    function release(record) {
      record.held = false;
      record.node.hidden = false;
      if (record.writer) record.writer.set(record.text, { ...record.state, paced: !!clock });
    }
    function tick() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      const now = performance.now();
      const at = clock ? clock.from + (clock.to - clock.from) * Math.min(1, (now - clock.at) / Math.max(1, clock.until - clock.at)) : Infinity;
      let offset = 0, open2 = true, waits = false;
      for (const record of records.values()) {
        const length = lengthOf(record);
        if (open2 && at >= offset) {
          if (record.held) release(record);
          if (clock && paceable(record)) record.writer.show(at >= clock.to ? Infinity : at - offset);
        }
        if (!whole(record)) {
          open2 = false;
          waits = true;
        }
        offset += length;
      }
      if (clock && at >= clock.to) clock = null;
      showNotes();
      if (waits || clock) frame = requestAnimationFrame(tick);
    }
    return { update(segments = [], { live = false, done = true } = {}) {
      const next = new Map();
      const paces = live && !!text && !reduced();
      notes = replyNotes(segments, { open: !done });
      finished = done;
      const notesKey = notes ? JSON.stringify(notes.items) : "";
      segments.forEach((segment, index) => {
        const isRich = segment?.lang === "cindy-ui" && ["code", "pending"].includes(segment.type) && !segment.reason;
        const isCode = ["code", "pending"].includes(segment?.type) && !isRich && !(segment.reason && TYPED.includes(segment.lang) && segment.lang !== "open") && !["answer", "secret"].includes(segment.lang) && !(segment.type === "pending" && QUIET.includes(segment.lang)) && (segment.type === "code" || !TYPED.includes(segment.lang));
        const key = index + ":" + (isRich ? "cindy-ui" : isCode ? "source-code" : segment?.type), old = records.get(key);
        if (isCode) {
          const props = { code: segment.text ?? "", infostring: segment.lang ?? "", loading: segment.type === "pending" };
          if (old?.rendering && old.language === props.infostring) {
            old.rendering.update(props);
            next.set(key, old);
            return;
          }
          const owner2 = scope(parentSignal), node2 = section("code", { "data-reason": segment.reason });
          const rendering = mountCode(node2, { text: props.code, lang: props.infostring, loading: props.loading }, (fn) => owner2.own(fn));
          const record2 = { node: node2, scope: owner2, rendering, language: props.infostring, held: false };
          if (paces && [...next.values()].some((before) => !whole(before))) {
            record2.held = true;
            node2.hidden = true;
          }
          next.set(key, record2);
          return;
        }
        if (isRich) {
          if (old?.rich) {
            old.rich.update(segment.text, { complete: segment.type === "code" });
            next.set(key, old);
            return;
          }
          const owner2 = scope(parentSignal), node2 = section("cindy-ui");
          const rich = mountRich(node2, { source: segment.text, complete: segment.type === "code", stateKey: segment.richStateKey, prose: (source) => prose(source, envFor(owner2)) });
          owner2.own(() => rich.destroy());
          next.set(key, { node: node2, scope: owner2, rich, held: false });
          return;
        }
        const shown2 = segment?.type === "md" ? runText(segment.text, notes, { open: !(done || index < segments.length - 1) }) : null;
        if (text && segment?.type === "md") {
          const state = { done: done || index < segments.length - 1, live };
          if (old?.writer) {
            old.text = shown2;
            old.state = state;
            if (!old.held) old.writer.set(shown2, { ...state, paced: !!clock && paces });
            next.set(key, old);
            return;
          }
          const owner2 = scope(parentSignal);
          try {
            const writer = written(owner2, () => notes), record2 = { writer, node: writer.node, scope: owner2, text: shown2, state, held: false };
            if (paces && paceable(record2) && [...next.values()].some((before) => !whole(before))) {
              record2.held = true;
              writer.node.hidden = true;
            } else writer.set(shown2, { ...state, paced: !!clock && paces });
            next.set(key, record2);
          } catch {
            next.set(key, { signature: null, node: problem("Couldn't show this content."), scope: owner2 });
          }
          return;
        }
        const drawn2 = shown2 === null ? segment : { ...segment, text: shown2 }, refers = shown2 !== null || JSON.stringify(segment ?? null).includes("[^");
        const signature = segment?.type === "pending" && (TYPED.includes(segment.lang) || QUIET.includes(segment.lang)) ? "pending:" + segment.lang : JSON.stringify(drawn2) + (refers ? notesKey : "");
        if (old?.signature === signature) {
          next.set(key, old);
          return;
        }
        const owner = scope(parentSignal);
        let node;
        try {
          node = draw(drawn2, owner, refers ? notes : null);
        } catch {
          node = problem("Couldn't show this content.");
        }
        if (node && live) node.classList.add("is-new");
        if (!node) {
          owner.destroy();
          return;
        }
        const record = { signature, node, scope: owner, held: false };
        if (paces && [...next.values()].some((before) => !whole(before))) {
          record.held = true;
          node.hidden = true;
        }
        next.set(key, record);
      });
      for (const [key, record] of records) if (next.get(key) !== record) {
        record.writer?.destroy();
        record.scope.destroy();
        record.node.remove();
      }
      let cursor = container.firstChild;
      for (const record of next.values()) {
        if (record.node !== cursor) container.insertBefore(record.node, cursor);
        cursor = record.node.nextSibling;
      }
      if (!notes) fold.node.remove();
      else if (fold.node !== cursor) container.insertBefore(fold.node, cursor);
      records = next;
      if (!paces) {
        clock = null;
        for (const record of records.values()) if (record.held) {
          record.held = false;
          record.node.hidden = false;
          record.writer?.set(record.text, record.state);
        }
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        showNotes();
        return;
      }
      let total = 0, shown = 0;
      for (const record of records.values()) {
        total += lengthOf(record);
        shown += shownOf(record);
      }
      if (clock || total - shown >= BURST) {
        const now = performance.now(), first = clock?.first ?? now, until = Math.max(clock?.until ?? 0, Math.min(now + revealTime(total - shown), first + REVEAL));
        const was = !!clock;
        clock = { first, from: shown, to: total, at: now, until: Math.max(until, now + 120) };
        if (!was) {
          for (const record of records.values()) if (!record.held && paceable(record)) record.writer.set(record.text, { ...record.state, paced: true });
        }
      }
      tick();
    }, destroy() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      unwire();
      unfold();
      notesScope.destroy();
      fold.node.remove();
      for (const record of records.values()) {
        record.writer?.destroy();
        record.scope.destroy();
        record.node.remove();
      }
      records = new Map();
    } };
  }
}
