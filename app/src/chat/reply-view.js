import { el, svg } from "../boards/dom.js";
import { makeReply, REPLY_GLYPH, replySwipe, replyPreview } from "./reply.js";
export const replyGlyph = () => svg("svg", { viewBox: "0 0 24 24", class: "reply-glyph", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: REPLY_GLYPH }));
export function sentReply(reply, jump) {
  return el("button", { type: "button", class: "msg-reply-quote", "aria-label": `Jump to ${reply.who} · ${reply.time}`, title: reply.text, onclick: () => jump(reply) }, el("span", { class: "reply-meta" }, `${reply.who} · ${reply.time}`), el("span", { class: "reply-preview" }, replyPreview(reply)));
}
export function wireReply({ node, item, identity, phone, onReply }) {
  const take = () => {
    const reply = makeReply(item(), identity);
    if (reply) onReply(reply);
  };
  const button = el("button", { type: "button", class: "msg-reply", "aria-label": "Reply", onclick: take }, replyGlyph(), el("span", { class: "msg-reply-label" }, "Reply"));
  node.append(button);
  if (!phone) return () => button.remove();
  const glyph = el("span", { class: "msg-swipe-reply", "aria-hidden": "true" }, replyGlyph());
  node.append(glyph);
  let start = null, timer = 0;
  const reset = () => {
    start = null;
    node.classList.remove("is-reply-swiping");
    node.style.removeProperty("--reply-shift");
  };
  const down = (event) => {
    if (event.pointerType !== "touch" || event.isPrimary === false || event.target.closest?.("button,a,input,textarea,summary,[contenteditable],pre")) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
  };
  const move = (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dy) >= 24 || dx < -8) {
      reset();
      return;
    }
    start.dx = dx;
    start.dy = dy;
    if (dx > 10 && dx > Math.abs(dy) * 1.5) {
      node.classList.add("is-reply-swiping");
      node.style.setProperty("--reply-shift", Math.min(64, dx) + "px");
      node.setPointerCapture?.(event.pointerId);
    }
  };
  const up = (event) => {
    if (!start || start.id !== event.pointerId) return;
    const send = replySwipe(event.clientX - start.x, event.clientY - start.y);
    reset();
    if (send) {
      take();
      node.classList.add("is-reply-picked");
      clearTimeout(timer);
      timer = setTimeout(() => node.classList.remove("is-reply-picked"), 650);
    }
  };
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", reset);
  return () => {
    clearTimeout(timer);
    reset();
    button.remove();
    glyph.remove();
    node.removeEventListener("pointerdown", down);
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerup", up);
    node.removeEventListener("pointercancel", reset);
  };
}
export function wireQuote({ column, scroller, item, identity, onReply }) {
  let picked = null;
  const action = el("button", { type: "button", class: "msg-selection-quote", hidden: true, "aria-label": "Quote selected text" }, "Quote");
  const hide = () => {
    action.hidden = true;
    action.remove();
    picked = null;
  };
  const element = (node) => node?.nodeType === 1 ? node : node?.parentElement;
  const select = () => {
    const selection = globalThis.getSelection?.();
    if (!selection?.rangeCount || selection.isCollapsed) {
      hide();
      return;
    }
    const range = selection.getRangeAt(0), from = element(range.startContainer), to = element(range.endContainer);
    const row = from?.closest?.(".msg[data-key]");
    if (!row || !column.contains(row) || to?.closest?.(".msg[data-key]") !== row || !from.closest(".msg-body,.msg-plain,.msg-system-text") || !to.closest(".msg-body,.msg-plain,.msg-system-text")) {
      hide();
      return;
    }
    const original = item(row.dataset.key);
    if (!original) {
      hide();
      return;
    }
    picked = makeReply(original, identity, selection.toString());
    if (!picked) {
      hide();
      return;
    }
    const box = range.getBoundingClientRect(), view = scroller.getBoundingClientRect();
    if (box.bottom < view.top || box.top > view.bottom) {
      hide();
      return;
    }
    if (!action.parentNode) column.append(action);
    action.hidden = false;
    const width = action.offsetWidth || 60, height = action.offsetHeight || 30;
    action.style.left = Math.max(view.left + 8, Math.min(box.right + 6, view.right - width - 8)) + "px";
    action.style.top = Math.max(view.top + 4, Math.min(box.bottom + 5, view.bottom - height - 4)) + "px";
  };
  action.addEventListener("pointerdown", (event) => event.preventDefault());
  action.addEventListener("click", () => {
    if (picked) onReply(picked);
    globalThis.getSelection?.()?.removeAllRanges();
    hide();
  });
  const escape = (event) => {
    if (event.key === "Escape") hide();
  };
  document.addEventListener?.("selectionchange", select);
  column.addEventListener("keyup", select);
  scroller.addEventListener("scroll", hide, { passive: true });
  document.addEventListener?.("keydown", escape);
  return () => {
    action.remove();
    document.removeEventListener?.("selectionchange", select);
    column.removeEventListener("keyup", select);
    scroller.removeEventListener("scroll", hide);
    document.removeEventListener?.("keydown", escape);
  };
}
