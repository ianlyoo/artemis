import { el, svg } from "../boards/dom.js";
import { isWaitingMessage } from "./queue.js";
import { agentName, deliveryLine, receiptLine } from "./agents.js";
import { clock, dayLabel, reduced } from "./motion.js";
import { fileSize } from "./attach.js";
import { saveDownload } from "./file-download.js";
import { segmentsOf } from "./segments.js";
import { visualKind } from "./kinds.js";
import { whoOf, rows, createWindow, around, place, entryId, withImageSteps, withKeepWarm, withWakeNotes, withoutNoReply, providerImages } from "./view.js";
import { canRewind, ASKS } from "./controls.js";
import { control } from "./visuals.js";
import { turnPlaces, inTurn, sameTurn, isPost } from "./turns.js";
import { createThinking, runTools, refChip } from "./thinking.js";
import { parseCompany } from "./company-message.js";
import { companyCard } from "./company-card.js";
import { sentOf, repliedOf, columns, COLUMNS, tipOf } from "./thumbs.js";
import { openViewer } from "../image-viewer.js";
import { parseReply, findReply } from "./reply.js";
import { sentReply, wireReply, wireQuote } from "./reply-view.js";
import { isNotice, interleaveNotices } from "./notices.js";
import { mountOwnSecret } from "./secret-card.js";
import { mountIsland } from "../islands/island.js";
import { leadKo, leadPortrait, isLead, lead, l10n } from "../names.js";
const TURN_END = { failed: "The answer stopped partway", canceled: "The answer was canceled" };
const REWIND = "Rewind to this message", PRESS = 500, RESET_WAIT = 4e3;
const portrait = ({ sizes }) => el("img", { src: sizes[0], srcset: sizes.map((url, i) => `${url} ${i + 1}x`).join(", "), alt: "", width: 36, height: 36, decoding: "async", draggable: "false" });
const showPortrait = () => {
  const full = leadPortrait()?.full;
  if (full) openViewer([{ src: full, alt: leadKo(), caption: leadKo() }]);
};
const SHOT_SHAPES = new Map();
const rewindGlyph = () => svg("svg", { viewBox: "0 0 24 24", class: "msg-glyph", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11" }));
const hasText = (item) => segmentsOf(item).some((segment) => segment.type !== "md" || String(segment.text ?? "").trim());
const SAVE_LINES = { get not_found() {
  return l10n("파일을 찾지 못했어요", "Couldn't find the file");
}, get path_rejected() {
  return l10n("보낼 수 없는 파일이에요", "This file can't be sent");
}, get files_unsupported() {
  return l10n("이 에이전트의 파일은 아직 받을 수 없어요", "This agent's files can't be fetched yet");
}, get download_failed() {
  return l10n("다운로드하지 못했어요", "Couldn't download it");
}, get board_failed() {
  return l10n("보드로 열지 못했어요", "Couldn't open it as a board");
} };
export function createThread({ store, mountSegments, scroller, follow, signal, onRestore = () => {
}, onReply = () => {
}, onChange = () => {
}, onImage = null, peek = null, openRef = null, opens = () => true, phone = false, identity = null, name = () => identity ? agentName(identity) : lead(), cards = null, homeApi = null, island = mountIsland }) {
  const top = el("div", { class: "chat-top", role: "status" });
  const noticeRow = el("p", { class: "chat-notice", role: "status" });
  const above = el("div", { class: "chat-spacer", "aria-hidden": "true" }), below = el("div", { class: "chat-spacer", "aria-hidden": "true" });
  const column = el("div", { class: "chat-col" }, top, above, below);
  const range = createWindow(), limits = range.limits;
  let records = new Map(), frame = 0, live = new Set(), work = null, note = null, paused = false, filled = 0;
  const heights = new Map();
  let measured = 0, leap = null, looking = 0, moved = false, hushed = 0, hushEnd = 0;
  let resetting = 0;
  const average = () => heights.size ? measured / heights.size : 120;
  const FIRST = 20, FILL = 10, WAITS = 30;
  let filling = 0, waits = 0;
  const idle = (fn) => typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 16);
  const unidle = (id) => {
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
    else clearTimeout(id);
  };
  const stopFill = () => {
    if (filling) unidle(filling);
    filling = 0;
  };
  function fill() {
    filling = 0;
    if (!follow.pinned) return;
    if (paused || frame || hushed || resetting) {
      if (++waits < WAITS) filling = idle(fill);
      return;
    }
    const keys = itemsNow().map((item) => item.key), span = range.span(keys), floor = Math.max(0, keys.length - limits.initial);
    if (span.end < keys.length || span.start <= floor) return;
    range.set(keys, { start: Math.max(floor, span.start - FILL), end: keys.length });
    sync(true);
    if (range.span(keys).start > floor) filling = idle(fill);
  }
  const heightOf = (key) => heights.get(key) ?? average();
  const split = new WeakMap(), warm = new WeakMap(), noted = new WeakMap();
  const itemsNow = () => {
    const items = store.items.filter((item) => !isWaitingMessage(item));
    return interleaveNotices(withoutNoReply(withKeepWarm(withWakeNotes(withImageSteps(items.filter((item) => !isNotice(item)), split), noted), warm)), items.filter(isNotice));
  };
  function pictures(thumbs, bubble) {
    const grid = el("div", { class: "msg-images" }), fit = () => grid.style.setProperty("--cols", columns(grid.children.length, phone ? COLUMNS.phone : COLUMNS.pc));
    grid.append(...thumbs.map((thumb) => {
      const tip = thumb.file ? tipOf(thumb.file.name, thumb.file.size) : "";
      const img = el("img", { src: thumb.url, alt: thumb.alt, decoding: "async", draggable: "false", tabindex: "0", role: "button", title: tip ? tip + " · View larger" : "View larger" });
      if (thumb.src && thumb.src !== thumb.url) img.dataset.src = thumb.src;
      img.addEventListener("error", () => {
        if (!thumb.file) {
          img.replaceWith(el("span", { class: "msg-image-gone" }, "Image expired"));
          return;
        }
        img.remove();
        fit();
        const list = bubble.querySelector(".msg-files") ?? files([]);
        if (!list.parentNode) grid.after(list);
        list.append(fileItem(thumb.file));
        if (!grid.children.length) grid.remove();
      }, { once: true });
      return img;
    }));
    fit();
    return grid;
  }
  const fileItem = (file) => {
    const status = el("span", { class: "msg-file-status", role: "status" });
    const name2 = file.url ? el("a", { class: "msg-file-name", href: file.url, download: file.name, title: "Download" }, file.name) : el("span", { class: "msg-file-name" }, file.name);
    if (file.url && homeApi) name2.addEventListener("click", (event) => {
      event.preventDefault();
      void saveFile(file, name2, status);
    });
    return el("li", { class: "msg-file" }, name2, file.size != null ? el("span", { class: "msg-file-size" }, fileSize(file.size)) : "", status);
  };
  const files = (list) => el("ul", { class: "msg-files", "aria-label": "Attached files" }, list.map(fileItem));
  const docItem = (file) => {
    const status = el("span", { class: "msg-file-status", role: "status" });
    const link = el("a", { class: "chat-open", href: file.url, "data-open-kind": "board", title: file.title ? `${file.title} · ${file.name}` : file.name }, el("span", { class: "chat-open-kind" }, l10n("보드", "Board")), el("span", { class: "chat-open-title" }, file.title || file.name), el("span", { class: "chat-open-action" }, "Open"));
    const save = el("a", { class: "msg-doc-download", href: file.url, download: file.name, title: "Download " + file.name }, l10n("다운로드", "Download"));
    link.addEventListener("click", (event) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void openDocument(file, link, status);
    });
    save.addEventListener("click", (event) => {
      event.preventDefault();
      void saveFile(file, save, status);
    });
    return el("div", { class: "msg-doc" }, link, save, status);
  };
  async function openDocument(file, link, status) {
    if (link.getAttribute("aria-busy") === "true") return;
    link.setAttribute("aria-busy", "true");
    status.textContent = l10n("여는 중…", "Opening…");
    status.classList.remove("is-problem");
    try {
      const result = await homeApi(file.url.replace("?", "/board?"), { method: "POST", expected: ["403", "404", "413", "422", "501", "502", "503", "504"] });
      const body = await result.json?.().catch(() => null);
      if (!result.ok || typeof body?.board !== "string") throw new Error(body?.error ?? "board_failed");
      status.textContent = "";
      openRef({ kind: "board", id: body.board });
    } catch (error) {
      status.textContent = SAVE_LINES[error?.message] ?? SAVE_LINES.board_failed;
      status.classList.add("is-problem");
    } finally {
      link.removeAttribute("aria-busy");
    }
  }
  function replied(list) {
    const { pictures: pictures2, sounds, videos, files: sent } = repliedOf(list), node = el("div", { class: "msg-sent" }), players = [];
    const board = (file) => file.open === "board" && file.url && homeApi && openRef, docs = sent.filter(board), rest = sent.filter((file) => !board(file));
    if (pictures2.length) {
      const shots = el("div", { class: "msg-shots", "data-no-viewer": "" }), shown = () => [...shots.querySelectorAll("img")];
      shots.append(...pictures2.map((file) => {
        const img = el("img", { src: file.url, alt: file.name, loading: "lazy", decoding: "async", draggable: "false", tabindex: "0", role: "button", title: file.name + " · View larger" });
        const frame2 = el("div", { class: "msg-shot", style: SHOT_SHAPES.has(file.url) ? { "--shape": SHOT_SHAPES.get(file.url) } : null }, img);
        img.addEventListener("load", () => {
          const shape = img.naturalWidth / img.naturalHeight;
          if (shape > 0 && Number.isFinite(shape)) {
            SHOT_SHAPES.set(file.url, shape);
            frame2.style.setProperty("--shape", String(shape));
          }
          frame2.classList.add("is-ready");
        }, { once: true });
        img.addEventListener("error", () => {
          frame2.remove();
          (node.querySelector(".msg-files") ?? node.appendChild(files([]))).append(fileItem(file));
          if (!shots.children.length) shots.remove();
        }, { once: true });
        return frame2;
      }));
      const [first, ...later] = shown(), together = () => {
        for (const img of later) img.setAttribute("loading", "eager");
      };
      for (const type of ["load", "error"]) first.addEventListener(type, together, { once: true });
      const open = (img) => {
        const all = shown();
        openViewer(all.map((one) => ({ src: one.getAttribute("src"), alt: one.getAttribute("alt"), caption: one.getAttribute("alt") })), all.indexOf(img), { from: img });
      };
      shots.addEventListener("click", (event) => {
        const img = event.target.closest?.("img");
        if (img) {
          event.preventDefault();
          open(img);
        }
      });
      shots.addEventListener("keydown", (event) => {
        if (event.target.tagName === "IMG" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          open(event.target);
        }
      });
      node.append(shots);
    }
    if (sounds.length) node.append(el("ul", { class: "msg-sounds", "aria-label": "Attached sounds" }, sounds.map((file) => {
      const host = el("li", { class: "msg-sound" }), asFile = () => {
        if (host.parentNode) host.replaceWith(fileItem(file));
      };
      players.push(island("audio-player", host, { src: file.url, name: file.name, onError: asFile }).catch((error) => {
        console.error("chat: the sound player did not load", error);
        asFile();
        return null;
      }));
      return host;
    })));
    if (videos.length) node.append(el("ul", { class: "msg-videos", "aria-label": "Attached videos" }, videos.map((file) => {
      const host = el("li", { class: "msg-video" }), asFile = () => {
        if (host.parentNode) host.replaceWith(fileItem(file));
      };
      players.push(island("video-player", host, { src: file.url.replace("?", "/play?"), poster: file.url.replace("?", "/poster?"), name: file.name, onDownload: homeApi ? (progress) => saved(file, progress) : null, onError: asFile }).catch((error) => {
        console.error("chat: the video player did not load", error);
        asFile();
        return null;
      }));
      return host;
    })));
    if (docs.length) node.append(...docs.map(docItem));
    if (rest.length) node.append(files(rest));
    return { node, destroy() {
      for (const player of players) void player.then((mounted) => mounted?.unmount());
    } };
  }
  async function saved(file, progress) {
    try {
      await saveDownload(homeApi, file.url, file.name, ["403", "404", "413", "501", "502", "503", "504"], progress);
      return null;
    } catch (error) {
      return SAVE_LINES[error?.message] ?? SAVE_LINES.download_failed;
    }
  }
  async function saveFile(file, link, status) {
    if (link.getAttribute("aria-busy") === "true") return;
    link.setAttribute("aria-busy", "true");
    status.textContent = l10n("받는 중…", "Downloading…");
    status.classList.remove("is-problem");
    const line = await saved(file, (part) => {
      status.textContent = `${l10n("받는 중…", "Downloading…")} ${Math.round(part * 100)}%`;
    });
    status.textContent = line ?? "";
    status.classList.toggle("is-problem", !!line);
    link.removeAttribute("aria-busy");
  }
  function owner(item) {
    const time = el("time", { class: "msg-time" }), bubble = el("div", { class: "msg-bubble" }), state = el("div", { class: "msg-state" });
    const node = el("article", { class: "msg msg-owner", "data-entry": item.key }, el("div", { class: "msg-line" }, time, bubble), state);
    let shown = null;
    const rewind = rewinder(node, bubble, () => record.item);
    const record = { node, item: null, offer: rewind.offer, update(next, { echo = false } = {}) {
      const local = next.local ?? null, sign = JSON.stringify([next.text, next.images?.map((image) => image.url), next.attachments]);
      if (sign !== shown) {
        const { thumbs, files: rest } = sentOf(next), before = record.item ? sentOf(record.item).thumbs : [];
        const held = echo && thumbs.length && thumbs.length === before.length && thumbs.every((thumb) => thumb.src) ? bubble.querySelector(".msg-images") : null;
        const drawn = held ? [...held.querySelectorAll("img")] : [];
        const keep = held && drawn.length === thumbs.length && drawn.every((img) => img.complete && img.naturalWidth > 0) ? held : null;
        if (keep) drawn.forEach((img, n) => {
          img.dataset.src = thumbs[n].src;
        });
        const reply = parseReply(next.text);
        bubble.replaceChildren(...[reply ? sentReply(reply, jumpReply) : null, thumbs.length ? keep || pictures(thumbs, bubble) : null, rest.length ? files(rest) : null, (reply ? reply.body : next.text) ? el("div", { class: "msg-plain" }, reply ? reply.body : next.text) : null].filter(Boolean));
        shown = sign;
      }
      time.textContent = local && local.status !== "held" ? "" : clock(next.at);
      time.dateTime = next.at ?? "";
      drawState(local, next);
      record.item = next;
      rewind.offer();
    }, destroy() {
      rewind.destroy();
    } };
    function drawState(local, next) {
      if (local?.status === "held") {
        const id2 = next.key.slice("local:".length);
        node.dataset.state = "held";
        state.replaceChildren(el("span", { class: "msg-state-line is-problem" }, `Not sent · written ${dayLabel(next.at)} ${clock(next.at)} · ${local.line}`), control("Send", { class: "msg-act", onclick: () => store.retry(id2) }), control("Discard", { class: "msg-act", onclick: () => store.discard(id2) }));
        return;
      }
      const delivery = next.delivery;
      if (delivery) {
        node.dataset.state = delivery.state;
        const line2 = el("span", { class: "g151-delivery" }, deliveryLine(delivery));
        const actions = [];
        if (store.canRetryMessage?.(next.messageId)) actions.push(el("button", { type: "button", class: "g151-message-action", "aria-label": "Retry message", title: "Retry message", onclick: () => store.retryMessage(next.messageId) }, "↻"));
        const receipt = receiptLine(identity, delivery);
        state.replaceChildren(line2, ...actions, ...receipt ? [el("div", { class: "g151-receipt" }, receipt)] : []);
        return;
      }
      node.dataset.state = local?.status ?? "";
      if (!local) {
        state.replaceChildren();
        return;
      }
      const id = next.key.slice("local:".length);
      if (local.status === "sending" || local.status === "sent") {
        state.replaceChildren(el("span", { class: "msg-state-line" }, local.status === "sending" ? "Sending…" : "Sent"));
        return;
      }
      const line = el("span", { class: "msg-state-line is-problem" }, local.line ?? "Not sent");
      if (local.status === "refused") state.replaceChildren(line, control("Edit and resend", { class: "msg-act", onclick: () => {
        const draft = store.takeBack(id);
        if (!draft) return;
        if (local.error === "unknown_upload") draft.attachments = [];
        onRestore(draft, local.error === "unknown_upload" ? local.line : null);
      } }));
      else state.replaceChildren(line, control("Resend", { class: "msg-act", onclick: () => store.retry(id) }), control("Delete", { class: "msg-act", onclick: () => store.discard(id) }));
    }
    return record;
  }
  function rewinder(node, bubble, itemOf) {
    let acts = null, menu = null, ask = null, press = 0, from = null, pressed = 0, busy = false;
    const unanswered = () => !store.items.slice(store.items.findIndex((i) => i.key === itemOf()?.key) + 1).some((i) => i.role === "assistant" && i.text.trim());
    const offered = () => canRewind(store.controls, itemOf()) && (!store.turn.running || unanswered());
    function offer() {
      const can = offered();
      node.toggleAttribute("data-rewind", can);
      if (can && !phone && !acts) {
        const button = el("button", { type: "button", class: "msg-rewind", onclick: () => open() }, rewindGlyph(), el("span", { class: "msg-rewind-text" }, REWIND));
        acts = el("div", { class: "msg-acts" }, button);
        node.append(acts);
      }
      if (acts) {
        acts.hidden = !can;
        acts.querySelector(".msg-rewind-text").textContent = unanswered() ? l10n("보낸 메시지 취소", "Take back the message") : REWIND;
      }
      if (!can) {
        closeMenu();
        if (!busy) close();
      }
    }
    function open() {
      closeMenu();
      peek?.hide();
      if (!offered() || busy) return;
      if (unanswered()) {
        void confirm();
        return;
      }
      if (!ask) {
        const line = el("p", { class: "msg-ask-line", role: "status" });
        const no = control("Cancel", { class: "msg-act msg-ask-no", onclick: () => close(true) }), yes = control("Rewind", { class: "msg-act msg-ask-yes", onclick: () => confirm() });
        ask = Object.assign(el("div", { class: "msg-ask", role: "alertdialog", "aria-label": ASKS.rewind }, el("p", { class: "msg-ask-q" }, ASKS.rewind), el("p", { class: "msg-ask-detail" }, ASKS.rewindDetail), el("div", { class: "msg-ask-answer" }, no, yes), line), { line, no, yes });
        ask.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
        });
      }
      ask.line.textContent = "";
      ask.line.classList.remove("is-problem");
      node.append(ask);
      node.toggleAttribute("data-asking", true);
      ask.no.focus({ preventScroll: true });
      follow.follow();
    }
    function close(back = false) {
      if (!ask?.isConnected || busy) return;
      ask.remove();
      node.removeAttribute("data-asking");
      if (back) (acts?.querySelector("button") ?? bubble).focus?.({ preventScroll: true });
    }
    async function confirm() {
      const item = itemOf();
      if (busy || !item) return;
      busy = true;
      if (ask) ask.no.disabled = ask.yes.disabled = true;
      if (ask) ask.line.textContent = l10n("되돌리는 중이에요", "Rewinding");
      ask?.line.classList.remove("is-problem");
      const result = await store.rewind(item.messageId);
      busy = false;
      if (ask) ask.no.disabled = ask.yes.disabled = false;
      if (result.ok) {
        onRestore({ text: result.text ?? item.text, images: [], attachments: [] }, result.line ?? null);
        close();
        return;
      }
      if (!ask) {
        onRestore({ text: "", images: [], attachments: [] }, result.line);
        return;
      }
      ask.line.textContent = result.line ?? "";
      ask.line.classList.add("is-problem");
      if (!offered()) ask.yes.disabled = true;
    }
    function openMenu() {
      if (!offered()) return;
      if (!menu) {
        const copy = el("button", { type: "button", class: "msg-menu-item", role: "menuitem", onclick: () => {
          closeMenu();
          navigator.clipboard?.writeText?.(itemOf()?.text ?? "").catch?.(() => {
          });
        } }, "Copy");
        const back = el("button", { type: "button", class: "msg-menu-item", role: "menuitem", onclick: () => open() }, rewindGlyph(), unanswered() ? l10n("보낸 메시지 취소", "Take back the message") : REWIND);
        menu = el("div", { class: "msg-menu", role: "menu", "aria-label": "Message" }, copy, back);
        menu.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
          }
        });
      }
      menu.querySelector(".msg-menu-item").hidden = !itemOf()?.text;
      node.append(menu);
      node.toggleAttribute("data-menu", true);
      document.addEventListener("pointerdown", outside, true);
      scroller.addEventListener("touchmove", moved2, { passive: true });
      scroller.addEventListener("wheel", closeMenu, { passive: true });
      follow.follow();
    }
    function closeMenu() {
      if (!menu?.isConnected) return;
      menu.remove();
      node.removeAttribute("data-menu");
      document.removeEventListener("pointerdown", outside, true);
      scroller.removeEventListener("touchmove", moved2);
      scroller.removeEventListener("wheel", closeMenu);
    }
    const outside = (event) => {
      if (!menu?.contains(event.target)) closeMenu();
    };
    const moved2 = (event) => {
      const at = event.touches?.[0];
      if (!at || !from || Math.hypot(at.clientX - from[0], at.clientY - from[1]) > 8) closeMenu();
    };
    if (phone) {
      bubble.addEventListener("pointerdown", (event) => {
        if (!offered() || event.target.closest?.("a, button, img")) return;
        from = [event.clientX, event.clientY];
        clearTimeout(press);
        press = setTimeout(() => {
          press = 0;
          pressed = Date.now();
          openMenu();
        }, PRESS);
      });
      bubble.addEventListener("pointermove", (event) => {
        if (press && from && Math.hypot(event.clientX - from[0], event.clientY - from[1]) > 8) {
          clearTimeout(press);
          press = 0;
        }
      });
      for (const type of ["pointerup", "pointercancel"]) bubble.addEventListener(type, () => {
        clearTimeout(press);
        press = 0;
      });
      bubble.addEventListener("contextmenu", (event) => {
        if (offered() && (press || Date.now() - pressed < 800)) event.preventDefault();
      });
      bubble.addEventListener("click", (event) => {
        if (Date.now() - pressed < 800) {
          event.preventDefault();
          event.stopPropagation();
          pressed = 0;
        }
      }, true);
    }
    return { offer, destroy() {
      clearTimeout(press);
      closeMenu();
    } };
  }
  let named = name();
  const mark = () => {
    const leads = !identity || isLead(identity.role), painted = leads ? leadPortrait() : null;
    if (!painted) return el("span", { class: "turn-mark", "aria-hidden": "true", "data-no-viewer": "" }, el("span", { class: "g151-agent-mark" }, (leads ? named : identity.role).slice(0, 1).toUpperCase()));
    const button = el("button", { type: "button", class: "turn-mark", "aria-label": l10n(`${leadKo()} 프로필 사진 보기`, `${lead()}'s portrait`), "data-no-viewer": "" }, portrait(painted));
    button.addEventListener("click", showPortrait);
    return button;
  };
  const turnHead = (time) => el("header", { class: "turn-head" }, mark(), el("span", { class: "turn-name" }, named), time);
  function leadTurn(item) {
    const body = el("div", { class: "msg-body" }), time = el("time", { class: "msg-time turn-time" });
    const node = el("article", { class: "msg msg-lead" }, turnHead(time), body);
    const mount = mountSegments(body, signal);
    let sent = null, sentSign = "[]";
    return { node, item: null, update(next, { live: live2 = false } = {}) {
      const segments = segmentsOf(next);
      mount.update(segments, { live: live2, done: !next.streaming });
      const sign = JSON.stringify(next.attachments ?? []);
      if (sign !== sentSign) {
        sent?.destroy();
        sent?.node.remove();
        sent = next.attachments?.length ? replied(next.attachments) : null;
        if (sent) body.after(sent.node);
        sentSign = sign;
      }
      const blocks = segments.map((segment, index) => segment?.type === "block" && segment.block && typeof segment.block === "object" ? index : -1).filter((index) => index >= 0);
      body.querySelectorAll(":scope > [data-segment=block]").forEach((section, n) => {
        const index = blocks[n];
        if (index !== void 0 && visualKind(segments[index].block)) section.dataset.entry = entryId({ key: next.key, kind: "visual", segment: index });
      });
      node.toggleAttribute("data-streaming", !!next.streaming);
      if (!next.streaming) cards?.attach(node, segments.filter((segment) => segment?.type === "md").map((segment) => segment.text ?? "").join("\n"), next.key);
      time.textContent = clock(next.at);
      time.dateTime = next.at ?? "";
      this.item = next;
    }, destroy() {
      mount.destroy();
      cards?.detach(node);
      sent?.destroy();
    } };
  }
  function activity(item, { fresh = false, start = null } = {}) {
    const time = el("time", { class: "msg-time turn-time" }), view = createThinking({ fresh, peek, openRef, opens, onImage, onFold: (ms) => follow.wait?.(ms) });
    const node = el("article", { class: "msg msg-tools" }, turnHead(time), view.node);
    let joined = [], drawn = "", where = null;
    function paint() {
      const item2 = record.item, parts = [item2, ...joined];
      const tools = runTools(parts, { later: !!where?.later });
      const more = parts.reduce((n, part) => n + (Number(part.more) > 0 ? Number(part.more) : 0), 0);
      const sign = JSON.stringify([tools, more, where]);
      if (sign === drawn) return;
      drawn = sign;
      view.update({ tools, more, ...where });
      time.textContent = clock(item2.at);
      time.dateTime = item2.at ?? "";
    }
    const record = { node, item: null, update(next) {
      record.item = next;
      if (where) paint();
    }, join(items) {
      if (items.length || joined.length) {
        joined = items;
        if (where) paint();
      }
    }, place(next) {
      where = { ...next, start: where?.start ?? start ?? next.start, end: next.end ?? (where?.live && !next.live ? Date.now() : where?.end ?? null) };
      paint();
    }, destroy() {
      view.destroy();
    } };
    return record;
  }
  const opened = new Set();
  function company() {
    const node = el("article", { class: "msg msg-company ca" }), time = el("time", { class: "msg-time" }), notes = wakeNotes();
    let shown = null;
    return { node, item: null, update(next) {
      if (next.text !== shown) {
        shown = next.text;
        const parsed = parseCompany(next.text), key = next.key;
        if (parsed) companyCard(parsed, { into: node, time, open: opened.has(key), onToggle: (open) => {
          if (open) opened.add(key);
          else opened.delete(key);
        }, phone });
        else node.replaceChildren(el("div", { class: "msg-system-text" }, next.text ?? ""), time);
        cards?.attach(node, next.text, next.key);
      }
      notes.update(next.key, next.notes ?? []);
      if (next.notes?.length && notes.node.parentNode !== node) node.append(notes.node);
      else if (!next.notes?.length && notes.node.parentNode === node) notes.node.remove();
      time.textContent = clock(next.at);
      time.dateTime = next.at ?? "";
      this.item = next;
    }, destroy() {
      notes.destroy();
      cards?.detach(node);
    } };
  }
  function wakeNotes() {
    const line = el("button", { type: "button", class: "ca-notes-line text-control", "aria-expanded": "false" }), list = el("div", { class: "ca-notes-list" });
    const node = el("div", { class: "ca-notes" }, line, list);
    let key = null, runs = new Map();
    const set = (open) => {
      node.toggleAttribute("data-open", open);
      line.setAttribute("aria-expanded", String(open));
      list.toggleAttribute("inert", !open);
    };
    line.addEventListener("click", () => {
      const open = !node.hasAttribute("data-open");
      set(open);
      if (open) opened.add(key);
      else opened.delete(key);
    });
    const run = (note2) => {
      const view = runs.get(note2.key) ?? createThinking({ peek, openRef, opens, onImage });
      view.update({ tools: runTools([note2]), more: Number(note2.more) || 0, live: false, turnLive: false, start: null, end: null });
      return [note2.key, view];
    };
    return { node, update(wake, notes) {
      key = wake + ":notes";
      const memo = notes.findLast((note2) => note2.memo)?.memo, said = notes.filter((note2) => note2.role === "note" && !note2.memo);
      const texts = said.length, steps = notes.reduce((n, note2) => n + (note2.tools?.length ?? 0) + (Number(note2.more) || 0), 0);
      const counts = [texts ? l10n(`메모 ${texts}개`, `${texts} notes`) : "", steps ? l10n(`${steps}단계`, `${steps} steps`) : ""].filter(Boolean);
      if (memo) line.replaceChildren(el("span", { class: "ca-notes-memo" }, memo), ...counts.length ? [el("span", { class: "ca-notes-count" }, " · " + counts.join(" · "))] : []);
      else line.textContent = [l10n(leadKo() + " 메모" + (texts ? ` ${texts}개` : ""), `${lead()}'s notes` + (texts ? ` (${texts})` : "")), steps ? l10n(`${steps}단계`, `${steps} steps`) : ""].filter(Boolean).join(" · ");
      const next = new Map(notes.filter((note2) => note2.role === "activity").map(run));
      for (const [at, view] of runs) if (next.get(at) !== view) view.destroy();
      runs = next;
      list.replaceChildren(...notes.filter((note2) => !note2.memo).map((note2) => note2.role === "activity" ? runs.get(note2.key).node : el("div", { class: "ca-note" }, noteText(note2.text))));
      set(opened.has(key));
    }, destroy() {
      for (const view of runs.values()) view.destroy();
      runs = new Map();
    } };
  }
  function noteText(text) {
    const found = providerImages(text);
    return found ? [l10n(`이미지 ${found.count}장`, `${found.count} image${found.count > 1 ? "s" : ""}`), found.rest].filter(Boolean).join("\n") : text ?? "";
  }
  function keepWarm() {
    const text = el("div", { class: "msg-system-text", role: "button", tabindex: "0" }, "keep-warm · ok"), time = el("time", { class: "msg-time" });
    const raw = el("div", { class: "msg-keepwarm-raw" }), node = el("article", { class: "msg msg-system msg-keepwarm" }, text, time, raw);
    let shown = null;
    const toggle = () => {
      const open = node.classList.toggle("is-open");
      text.setAttribute("aria-expanded", String(open));
      if (open) opened.add(record.item.key);
      else opened.delete(record.item.key);
    };
    text.addEventListener("click", toggle);
    text.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault?.();
        toggle();
      }
    });
    const record = { node, item: null, update(next) {
      const sign = JSON.stringify([next.wake.text, next.reply.text, segmentsOf(next.reply)]);
      if (sign !== shown) {
        shown = sign;
        raw.replaceChildren(el("div", { class: "msg-keepwarm-said" }, next.wake.text ?? ""), el("div", { class: "msg-keepwarm-said" }, segmentsOf(next.reply).map((segment) => segment.text ?? "").join("")));
      }
      const open = opened.has(next.key);
      node.classList.toggle("is-open", open);
      text.setAttribute("aria-expanded", String(open));
      time.textContent = clock(next.at);
      time.dateTime = next.at ?? "";
      record.item = next;
    }, destroy() {
    } };
    return record;
  }
  function systemNotice() {
    const text = el("span", { class: "chat-notice-text" }), goal = el("span", { class: "chat-notice-goal" }), time = el("time");
    const node = el("div", { class: "chat-system-notice", role: "note" }, text, goal, time);
    const unpeek = peek?.wire(goal) ?? (() => {
    });
    let named2 = null;
    return { node, item: null, update(next) {
      text.textContent = next.text;
      text.title = next.text;
      time.textContent = clock(next.at);
      time.dateTime = next.at;
      this.item = next;
      const goals = next.goals ?? [], sign = goals.map((g) => g.id + " " + g.name).join("\n");
      if (sign === named2) return;
      named2 = sign;
      goal.replaceChildren(...goals.map((g) => refChip({ kind: "goal", id: g.id, title: g.name }, { open: openRef, can: opens, peek })));
    }, destroy() {
      unpeek();
      if (peek?.shown && node.contains(peek.shown)) peek.hide();
    } };
  }
  function ownSecret() {
    const node = el("div", { class: "msg msg-secret", "data-segment": "secret" });
    let card = null;
    return { node, item: null, update(next) {
      card ??= mountOwnSecret(node, next);
      this.item = next;
    }, destroy() {
      card?.destroy();
    } };
  }
  function system(item) {
    const text = el("div", { class: "msg-system-text" }), time = el("time", { class: "msg-time" });
    const node = el("article", { class: "msg msg-system" }, text, time);
    text.addEventListener("click", () => {
      if (text.scrollHeight > text.clientHeight + 2 || node.classList.contains("is-open")) node.classList.toggle("is-open");
    });
    return { node, item: null, update(next) {
      if (text.textContent !== next.text) text.textContent = next.text ?? "";
      time.textContent = clock(next.at);
      this.item = next;
    }, destroy() {
    } };
  }
  function ledgerTurn(item) {
    const owner2 = item.role === "user", time = el("time", { class: owner2 ? "msg-time" : "msg-time turn-time" });
    const body = el("div", { class: owner2 ? "msg-bubble msg-body" : "msg-body" });
    const node = el("article", { class: "msg " + (owner2 ? "msg-owner" : "msg-lead"), "data-entry": item.key, "data-ledger": "" }, ...owner2 ? [el("div", { class: "msg-line" }, time, body)] : [turnHead(time), body]);
    const mount = mountSegments(body, signal);
    return { node, item: null, update(next) {
      mount.update(segmentsOf(next), { live: false, done: true });
      time.textContent = clock(next.at);
      time.dateTime = next.at;
      this.item = next;
    }, destroy() {
      mount.destroy();
    } };
  }
  function create(row, fresh, handover = null) {
    let record;
    const takes = handover?.key === row.key;
    if (row.day) record = { node: el("div", { class: "msg-day", role: "separator" }, el("span", {}, row.day)), item: null, update() {
    }, destroy() {
    } };
    else if (row.seam) record = { node: el("div", { class: "chat-older chat-seam", role: "separator" }, row.seam), item: null, update() {
    }, destroy() {
    } };
    else {
      const who = whoOf(row.item);
      record = isNotice(row.item) ? row.item.savedPin ? ownSecret() : systemNotice() : row.item.ledger ? ledgerTurn(row.item) : who === "owner" ? owner(row.item) : who === "lead" ? leadTurn(row.item) : who === "activity" ? activity(row.item, { fresh, start: takes ? handover.start : null }) : who === "company" ? company() : who === "keep-warm" ? keepWarm() : system(row.item);
      record.who = who;
      record.update(row.item, { live: fresh });
      if (row.item.role !== "activity" && !row.item.ledger && !isNotice(row.item)) {
        const unwire = wireReply({ node: record.node, item: () => record.item, identity, phone, onReply });
        const destroy = record.destroy.bind(record);
        record.destroy = () => {
          unwire();
          destroy();
        };
      }
    }
    record.key = row.key;
    record.node.dataset.key = row.key;
    if (fresh && !takes && !reduced()) record.node.classList.add("is-new");
    return record;
  }
  function busyNow(items) {
    const turn = store.turn, last = items.at(-1);
    if (!turn.running) return null;
    const ours = !!last && inTurn(last) && (turn.turnKey == null || last.turnKey == null || last.turnKey === turn.turnKey);
    if (ours && (last.role === "activity" || last.streaming && hasText(last))) return null;
    return { joined: ours };
  }
  function waiting(start) {
    const view = createThinking({ fresh: true }), time = el("time", { class: "msg-time turn-time" }, clock(new Date(start).toISOString()));
    view.update({ tools: [], live: true, turnLive: true, start });
    const row = el("div", { class: "msg msg-work msg-tools" }, turnHead(time), view.node);
    return { row, start, destroy() {
      view.destroy();
    } };
  }
  function tail(busy, handover, after) {
    const turn = store.turn;
    if (busy) {
      if (!work) {
        work = waiting(busy.joined ? Date.now() : Date.parse(turn.at) || Date.now());
        if (!reduced()) work.row.classList.add("is-new");
      }
      work.row.dataset.turn = busy.joined ? "last" : "only";
      work.row.toggleAttribute("data-live", true);
      const before = records.get(after)?.node ?? (noticeRow.parentNode === column ? noticeRow : null);
      if (work.row.parentNode !== column || work.row.nextSibling !== before) column.insertBefore(work.row, before);
    } else if (work) {
      const gone = work, row = gone.row, done = () => {
        gone.destroy();
        row.remove();
      };
      work = null;
      if (handover || reduced() || !row.isConnected) done();
      else row.animate([{ opacity: 1, height: row.offsetHeight + "px" }, { opacity: 0, height: "0px", marginTop: "0px" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).finished.then(done, done);
    }
    const end = !turn.running && TURN_END[turn.phase];
    if (end) {
      note ??= el("p", { class: "msg-note" });
      note.textContent = end;
      if (note.parentNode !== column || (note.nextSibling ?? noticeRow) !== noticeRow) column.append(note);
    } else {
      note?.remove();
      note = null;
    }
    const notice = store.notice?.line;
    if (!notice) noticeRow.remove();
    else {
      if (noticeRow.textContent !== notice) noticeRow.textContent = notice;
      if (noticeRow.parentNode !== column || noticeRow.nextSibling) column.append(noticeRow);
    }
  }
  let topShown = null;
  function drawTop() {
    const history = store.history, sign = JSON.stringify([history.loading, history.line]);
    if (sign === topShown) return;
    topShown = sign;
    const parts = [];
    if (history.loading) parts.push(el("p", { class: "chat-older is-busy" }, "Loading earlier messages…"));
    else if (history.line) parts.push(el("p", { class: "chat-older" }, el("span", {}, history.line), control("Load again", { class: "msg-act", onclick: () => store.loadOlder() })));
    top.replaceChildren(...parts);
  }
  function anchor(fromEnd = false) {
    const box = scroller.getBoundingClientRect(), bottom = box.top + scroller.clientHeight;
    const list = [...records.values()].filter((record) => record.index !== void 0);
    if (fromEnd) list.reverse();
    for (const record of list) {
      const rect = record.node.getBoundingClientRect();
      if (fromEnd ? rect.top < bottom : rect.bottom > box.top) return { key: record.key, top: rect.top };
    }
    return null;
  }
  function inView(keys, box, h) {
    let first = null, last = null;
    for (const record of records.values()) {
      if (record.index === void 0) continue;
      const rect = record.node.getBoundingClientRect();
      if (rect.bottom <= box.top) continue;
      if (rect.top >= box.top + h) break;
      first ??= record;
      last = record;
    }
    const from = first ? keys.indexOf(first.key) : -1, to = last ? keys.indexOf(last.key) : -1;
    return from >= 0 && to >= from ? { first: from, last: to } : null;
  }
  function spot(keys, span, box, h) {
    const n = keys.length, up = above.getBoundingClientRect().bottom > box.top;
    if (!n) return null;
    const to = up ? span.start : n, y = box.top - (up ? above : below).getBoundingClientRect().top;
    let first = up ? 0 : span.end, at = 0;
    while (first < to - 1 && at + heightOf(keys[first]) <= y) at += heightOf(keys[first++]);
    let last = first, edge = at - y + heightOf(keys[first]);
    while (last < n - 1 && edge < h) edge += heightOf(keys[++last]);
    leap = { key: keys[first], top: box.top + at - y };
    return { first, last };
  }
  function decide(keys) {
    const h = scroller.clientHeight, span = range.span(keys), scrolled2 = moved;
    moved = false;
    if (!h) return null;
    if (!records.size) {
      if (!keys.length) older(scrolled2);
      return null;
    }
    const box = scroller.getBoundingClientRect(), margin = h * 0.75;
    const head = above.getBoundingClientRect().bottom - box.top, end = below.getBoundingClientRect().top - box.top;
    const view = { pinned: follow.pinned, first: span.start, last: span.end - 1, above: head > -margin, below: end - h < margin, reach: Math.ceil(margin / average()) };
    if (view.above && span.start === 0 && records.has(keys[0])) older(scrolled2);
    if (!view.pinned) {
      const shown = inView(keys, box, h) ?? (head >= h || end <= 0 ? spot(keys, span, box, h) : null);
      if (shown) Object.assign(view, shown);
      else view.above = view.below = false;
    }
    return place(span, keys.length, view, limits);
  }
  function older(scrolled2) {
    const history = store.history;
    if (!history.hasOlder || history.loading || history.error || !scrolled2 && filled >= 4) return;
    if (!scrolled2) filled++;
    store.loadOlder();
  }
  function spacer(node, keys, from, to) {
    let px = 0;
    for (let i = from; i < to; i++) px += heightOf(keys[i]);
    const value = Math.round(px) + "px";
    if (node.style.height !== value) node.style.height = value;
  }
  function measure(start) {
    const keep = (record, height) => {
      if (!(height > 0) || record.index === start && start > 0) return;
      measured += height - (heights.get(record.key) ?? 0);
      heights.set(record.key, height);
    };
    let opens2 = null, prev = null, prevTop = 0;
    for (const record of records.values()) {
      const at = record.node.offsetTop;
      if (record.index === void 0) {
        opens2 ??= at;
        continue;
      }
      const blockTop = opens2 ?? at;
      opens2 = null;
      if (prev) keep(prev, blockTop - prevTop);
      prev = record;
      prevTop = blockTop;
    }
    if (prev) keep(prev, below.offsetTop - prevTop);
  }
  function sync(placed = false) {
    frame = 0;
    if (paused || resetting) return;
    const items = itemsNow(), keys = items.map((item) => item.key);
    if (!placed && !hushed) {
      const next2 = decide(keys);
      if (next2) range.set(keys, next2);
    }
    if (!records.size && !placed && keys.length > FIRST && (range.first === null || !keys.includes(range.first)) && range.last === null) {
      range.set(keys, { start: keys.length - FIRST, end: keys.length });
      stopFill();
      waits = 0;
      filling = idle(fill);
    }
    const { start, end } = range.span(keys), wanted = rows(items, start, end);
    const held = leap ?? anchor(follow.pinned);
    leap = null;
    const conversation = items.filter((item) => !isPost(item) && !isNotice(item)), newest = conversation.at(-1);
    const handover = work && inTurn(newest) && (newest.role === "activity" || newest.role === "assistant" && hasText(newest)) && !records.has(newest.key) ? { key: newest.key, start: work.start } : null;
    const next = new Map();
    for (const row of wanted) {
      let record = records.get(row.key);
      if (record && row.item && record.who !== whoOf(row.item)) record = null;
      if (!record && row.item?.role === "user" && row.item.messageId && whoOf(row.item) === "owner") {
        for (const [key, mine] of records) if (key.startsWith("local:") && mine.item?.messageId === row.item.messageId && !keys.includes(key)) {
          records.delete(key);
          record = mine;
          record.key = row.key;
          record.node.dataset.key = row.key;
          record.node.dataset.entry = row.key;
          record.update(row.item, { echo: true });
          break;
        }
      }
      if (!record) record = create(row, live.has(row.key) || row.key.startsWith("local:"), handover);
      else if (row.item && record.item !== row.item) record.update(row.item, { live: live.has(row.key) });
      record.index = row.index;
      next.set(row.key, record);
    }
    for (const [key, record] of records) if (next.get(key) !== record) {
      record.destroy();
      record.node.remove();
    }
    let cursor = above.nextSibling;
    for (const record of next.values()) {
      if (cursor === work?.row) cursor = cursor.nextSibling;
      if (record.node !== cursor) column.insertBefore(record.node, cursor);
      cursor = record.node.nextSibling;
    }
    if (cursor !== below) column.insertBefore(below, cursor);
    records = next;
    live = new Set();
    if (!hushed) {
      spacer(above, keys, 0, start);
      spacer(below, keys, end, keys.length);
    }
    const busy = busyNow(conversation), last = conversation.at(-1), { into, extra } = toolRuns(items), shown = into.size ? items.filter((item) => !into.has(item.key)) : items;
    let workAt = last ? shown.findIndex((item) => item.key === (into.get(last.key) ?? last.key)) + 1 : 0;
    while (isPost(shown[workAt]) && Date.parse(shown[workAt].at) < Date.parse(store.turn.at)) workAt++;
    const places = turnPlaces(busy?.joined ? [...shown.slice(0, workAt), { key: ":work", role: "assistant", turnKey: last.turnKey ?? null }, ...shown.slice(workAt)] : shown);
    const runs = turnRuns(items, into);
    const running = store.turn.running && last && inTurn(last) ? last : null, runningEnd = items.indexOf(last), runningStart = runningEnd - trailing(conversation), liveRun = running?.role === "activity" ? into.get(running.key) ?? running.key : null;
    for (const record of records.values()) {
      if (!record.item) continue;
      record.node.classList.toggle("is-joined", into.has(record.key));
      record.join?.(extra.get(record.key) ?? []);
      const at = places.get(record.key) ?? "";
      if ((record.node.dataset.turn ?? "") !== at) {
        if (at) record.node.dataset.turn = at;
        else delete record.node.dataset.turn;
      }
      const lit = !!running && inTurn(record.item) && (record.item.turnKey ?? null) === (running.turnKey ?? null) && record.index >= runningStart && record.index <= runningEnd;
      record.node.toggleAttribute("data-live", lit);
      record.place?.({ live: record.key === liveRun, turnLive: lit, ...runSpan(items, record.index, into, lit), ...runs.get(record.key) });
      record.offer?.();
    }
    tail(busy, handover, shown[workAt]?.key);
    drawTop();
    const node = held && records.get(held.key)?.node;
    if (node) {
      const delta = node.getBoundingClientRect().top - held.top;
      if (Math.abs(delta) >= 1) follow.shift(delta);
    }
    measure(start);
    follow.follow();
    onChange();
    if (!looking) looking = requestAnimationFrame(look);
  }
  function toolRuns(items) {
    const into = new Map(), extra = new Map();
    let head = null;
    items.forEach((item, n) => {
      const prev = items[n - 1];
      if (item.role === "activity" && prev?.role === "activity" && sameTurn(prev, item) && head) {
        into.set(item.key, head.key);
        extra.set(head.key, [...extra.get(head.key) ?? [], item]);
      } else head = item.role === "activity" ? item : null;
    });
    return { into, extra };
  }
  function turnRuns(items, into) {
    const runs = new Map();
    let turn = [], prev = null;
    const close = () => {
      const whole = turn.flatMap((item) => Array.isArray(item.tools) ? item.tools : []), heads = turn.filter((item) => !into.has(item.key));
      heads.forEach((item, n) => runs.set(item.key, { last: n === heads.length - 1, whole }));
      turn = [];
    };
    for (const item of items) {
      if (isNotice(item) || isPost(item)) continue;
      if (!sameTurn(prev, item)) close();
      prev = item;
      if (item.role === "activity") turn.push(item);
    }
    close();
    return runs;
  }
  function runSpan(items, n, into, lit) {
    const item = items[n], prev = items[n - 1], ms = (value) => {
      const time = Date.parse(value);
      return Number.isFinite(time) ? time : null;
    };
    let k = n + 1;
    while (k < items.length && into.get(items[k].key) === item.key) k++;
    const opens2 = !sameTurn(prev, item), from = opens2 && lit ? store.turn.at : opens2 && prev?.role === "user" ? prev.at : null, later = sameTurn(item, items[k]);
    return { start: ms(from) ?? ms(item.at), end: later ? ms(items[k].at) : null, later };
  }
  function trailing(items) {
    let n = 0;
    for (let i = items.length - 1; i > 0 && inTurn(items[i - 1]) && (items[i - 1].turnKey ?? null) === (items[i].turnKey ?? null); i--) n++;
    return n;
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => sync());
  };
  function look() {
    looking = 0;
    if (paused || frame || hushed || resetting) return;
    const keys = itemsNow().map((item) => item.key), next = decide(keys);
    if (next) {
      range.set(keys, next);
      sync(true);
    } else leap = null;
  }
  const scrolled = () => {
    moved = true;
    if (hushed) hush(hushEnd);
    else if (!looking) looking = requestAnimationFrame(look);
  };
  scroller.addEventListener("scroll", scrolled, { passive: true });
  const IMAGES = ".msg-images img, .msg-body .bv-prose img";
  const enlarge = (img) => {
    const group = [...img.closest(".msg-images, .msg-body").querySelectorAll(IMAGES)].filter((one) => one.complete && one.naturalWidth > 0 || one === img);
    onImage?.(group.map((one) => ({ url: one.dataset.src || one.currentSrc || one.src, alt: one.alt || "" })), Math.max(0, group.indexOf(img)), img);
  };
  const imageAt = (event) => {
    const img = event.target.closest?.(IMAGES);
    return img && onImage && !img.closest("a") ? img : null;
  };
  column.addEventListener("click", (event) => {
    const img = imageAt(event);
    if (img) {
      event.preventDefault();
      enlarge(img);
    }
  });
  column.addEventListener("keydown", (event) => {
    const img = imageAt(event);
    if (img && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      enlarge(img);
    }
  });
  function hush(end = Date.now() + 1500) {
    clearTimeout(hushed);
    hushEnd = end;
    hushed = setTimeout(() => {
      hushed = 0;
      moved = true;
      schedule();
    }, Math.max(0, Math.min(160, end - Date.now())));
  }
  let highlightTimer = 0, highlighted = null;
  function jumpReply(reply) {
    const original = findReply(store.items, reply, identity);
    if (!original || !api.reveal({ key: original.key })) return;
    highlighted?.classList.remove("is-reply-target");
    clearTimeout(highlightTimer);
    highlighted = records.get(original.key)?.node;
    if (!highlighted) return;
    void highlighted.offsetWidth;
    highlighted.classList.add("is-reply-target");
    highlightTimer = setTimeout(() => {
      highlighted?.classList.remove("is-reply-target");
      highlighted = null;
    }, 1800);
  }
  const unquote = phone ? () => {
  } : wireQuote({ column, scroller, identity, onReply, item: (key) => {
    const item = records.get(key)?.item;
    return item?.ledger || isNotice(item) ? null : item;
  } });
  const api = { node: column, handle(event) {
    if (event.type === "item") live.add(event.item.key);
    else if (event.type === "local" && event.item) live.add(event.key);
    else if (event.type === "snapshot") {
      filled = 0;
      clearTimeout(resetting);
      resetting = 0;
    } else if (event.type === "state" && name() !== named) {
      named = name();
      for (const head of column.querySelectorAll(".turn-name")) head.textContent = named;
    } else if (event.type === "reset") {
      filled = 0;
      heights.clear();
      measured = 0;
      clearTimeout(resetting);
      resetting = setTimeout(() => {
        resetting = 0;
        schedule();
      }, RESET_WAIT);
    }
    schedule();
  }, pause(value) {
    paused = !!value;
    if (!paused) {
      live = new Set();
      schedule();
    }
  }, redraw: schedule, reveal(entry) {
    const keys = itemsNow().map((item) => item.key), at = keys.indexOf(entry.key);
    if (at < 0) return false;
    follow.release();
    stopFill();
    const span = range.span(keys), drawn = at >= span.start && at < span.end;
    if (drawn) range.set(keys, span);
    else {
      clearTimeout(hushed);
      hushed = 0;
      range.set(keys, around(keys.length, at, at, Math.ceil(scroller.clientHeight * 0.75 / average()), limits));
      cancelAnimationFrame(frame);
      sync(true);
    }
    const node = entry.find?.() ?? column.querySelector(`[data-entry="${CSS.escape(entryId(entry))}"]`) ?? column.querySelector(`[data-key="${CSS.escape(entry.key)}"]`);
    if (!node) return false;
    const box = node.getBoundingClientRect(), edge = scroller.getBoundingClientRect().top, glide = drawn && !reduced();
    if (glide) hush();
    const offset = entry.center ? (scroller.clientHeight - box.height) / 2 : scroller.clientHeight * 0.12;
    scroller.scrollTo({ top: scroller.scrollTop + box.top - edge - offset, behavior: glide ? "smooth" : "auto" });
    return true;
  }, hold() {
    const held = follow.pinned ? null : anchor();
    return () => {
      const node = held && records.get(held.key)?.node;
      if (node?.isConnected) follow.shift(node.getBoundingClientRect().top - held.top);
      else follow.follow();
    };
  }, current() {
    const end = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4, frame2 = scroller.getBoundingClientRect();
    const line = end ? frame2.bottom : frame2.top + scroller.clientHeight * 0.28, nodes = column.querySelectorAll("[data-entry]");
    let low = 0, high = nodes.length;
    while (low < high) {
      const mid = low + high >> 1;
      if (nodes[mid].getBoundingClientRect().top > line) high = mid;
      else low = mid + 1;
    }
    return low ? nodes[low - 1].dataset.entry : null;
  }, destroy() {
    cancelAnimationFrame(frame);
    frame = 0;
    cancelAnimationFrame(looking);
    looking = 0;
    clearTimeout(hushed);
    hushed = 0;
    clearTimeout(resetting);
    resetting = 0;
    stopFill();
    clearTimeout(highlightTimer);
    unquote();
    scroller.removeEventListener("scroll", scrolled);
    for (const record of records.values()) record.destroy();
    records = new Map();
    work?.destroy();
    work?.row.remove();
    work = null;
  } };
  return api;
}
