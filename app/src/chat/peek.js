import { el } from "../boards/dom.js";
import { reduced } from "./motion.js";
const GAP = 8, ROOM = 280, WIDEST = 640, WAIT = 260, PRESS = 450;
export function placeTip(anchor, size, bounds, { phone = false } = {}) {
  const span = Math.max(0, bounds.right - bounds.left - 2 * GAP), room = bounds.right - GAP - (anchor.right + GAP);
  if (!phone && room >= ROOM) {
    const width2 = Math.min(size.width, room, WIDEST), top = anchor.top + (anchor.bottom - anchor.top - size.height) / 2;
    return { left: anchor.right + GAP, top: Math.round(Math.max(bounds.top + GAP, top)), width: width2, side: "right" };
  }
  const width = phone ? span : Math.min(size.width, span, WIDEST);
  const left = phone ? bounds.left + GAP : Math.max(bounds.left + GAP, Math.min(anchor.left, bounds.right - GAP - width));
  const under = anchor.bottom + 4, over = anchor.top - 4 - size.height;
  const below = under + size.height <= bounds.bottom - GAP || over < bounds.top + GAP;
  return { left: Math.round(left), top: Math.round(below ? under : over), width, side: below ? "below" : "above" };
}
export function peekOf(anchor) {
  const line = anchor?.getAttribute?.("data-peek-line")?.trim();
  return line ? { word: anchor.getAttribute("data-peek-word")?.trim() || "", line } : null;
}
let serial = 0;
export function createPeek({ host, scroller, phone = false }) {
  const id = "chat-peek-" + ++serial;
  const word = el("span", { class: "peek-word" }), line = el("span", { class: "peek-line" });
  const tip = el("div", { class: "peek", id, role: "tooltip" }, word, line);
  let anchor = null, timer = 0, press = 0, pressed = 0, from = null;
  const wired = new Set();
  function show(next) {
    clearTimeout(timer);
    timer = 0;
    const said = peekOf(next);
    if (!said) {
      hide();
      return;
    }
    if (anchor && anchor !== next) anchor.removeAttribute("aria-describedby");
    anchor = next;
    word.textContent = said.word;
    word.hidden = !said.word;
    line.textContent = said.line;
    tip.dataset.layout = phone ? "phone" : "pc";
    tip.classList.toggle("is-plain", next.hasAttribute("data-peek-plain"));
    tip.classList.toggle("is-in", !reduced());
    Object.assign(tip.style, { left: "0px", top: "0px", width: phone ? Math.max(0, bounds().right - bounds().left - 2 * GAP) + "px" : "" });
    if (tip.parentNode !== host) host.append(tip);
    const origin = tip.getBoundingClientRect(), size = { width: Math.min(tip.offsetWidth - line.clientWidth + line.scrollWidth + 2, WIDEST), height: tip.offsetHeight };
    const spot = placeTip(next.getBoundingClientRect(), size, bounds(), { phone });
    Object.assign(tip.style, { left: spot.left - origin.left + "px", top: spot.top - origin.top + "px", width: spot.width + "px" });
    tip.dataset.side = spot.side;
    next.setAttribute("aria-describedby", id);
    next.querySelector?.(".peek-toggle")?.setAttribute("aria-expanded", "true");
  }
  function hide() {
    clearTimeout(timer);
    timer = 0;
    if (!anchor) return;
    anchor.removeAttribute("aria-describedby");
    anchor.querySelector?.(".peek-toggle")?.setAttribute("aria-expanded", "false");
    anchor = null;
    tip.remove();
  }
  function bounds() {
    const box = scroller.getBoundingClientRect(), w = globalThis.innerWidth || box.right, h = globalThis.innerHeight || box.bottom;
    return { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(w, box.right), bottom: Math.min(h, box.bottom) };
  }
  const anchorOf = (event) => event.target?.closest?.("[data-peek-line]") ?? null;
  const later = (next) => {
    clearTimeout(timer);
    timer = setTimeout(() => show(next), anchor ? 0 : WAIT);
  };
  function wire(root) {
    const over = (event) => {
      if (phone || event.pointerType === "touch") return;
      const next = anchorOf(event);
      if (next && next !== anchor) later(next);
    };
    const out = (event) => {
      if (phone || event.pointerType === "touch") return;
      const was = anchorOf(event);
      if (was && !was.contains(event.relatedTarget)) {
        if (was === anchor) hide();
        else {
          clearTimeout(timer);
          timer = 0;
        }
      }
    };
    const focus = (event) => {
      const next = anchorOf(event);
      if (next && !phone && next.matches?.(":focus-visible")) show(next);
    };
    const blur = (event) => {
      if (anchor && anchorOf(event) === anchor && !anchor.contains(event.relatedTarget)) hide();
    };
    const down = (event) => {
      if (!phone && event.pointerType !== "touch") return;
      const next = anchorOf(event);
      if (!next) return;
      from = [event.clientX, event.clientY];
      clearTimeout(press);
      press = setTimeout(() => {
        press = 0;
        pressed = Date.now();
        if (anchor === next) hide();
        else show(next);
      }, PRESS);
    };
    const move = (event) => {
      if (press && from && Math.hypot(event.clientX - from[0], event.clientY - from[1]) > 8) {
        clearTimeout(press);
        press = 0;
      }
    };
    const up = () => {
      clearTimeout(press);
      press = 0;
    };
    const click = (event) => {
      if (Date.now() - pressed < 700) {
        event.preventDefault();
        event.stopPropagation();
        pressed = 0;
        return;
      }
      const toggle = event.target?.closest?.(".peek-toggle");
      if (!toggle) return;
      event.preventDefault();
      event.stopPropagation();
      const next = toggle.closest("[data-peek-line]");
      if (next && next === anchor) hide();
      else if (next) show(next);
    };
    const menu = (event) => {
      if (Date.now() - pressed < 700 || press) event.preventDefault();
    };
    const pairs = [["pointerover", over], ["pointerout", out], ["focusin", focus], ["focusout", blur], ["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up], ["click", click, true], ["contextmenu", menu]];
    for (const [type, fn, capture] of pairs) root.addEventListener(type, fn, capture ? { capture: true } : void 0);
    const off = () => {
      for (const [type, fn, capture] of pairs) root.removeEventListener(type, fn, capture ? { capture: true } : void 0);
      wired.delete(off);
    };
    wired.add(off);
    return off;
  }
  const scrolled = () => hide();
  const key = (event) => {
    if (event.key === "Escape" && anchor) hide();
  };
  const elsewhere = (event) => {
    if (anchor && !anchor.contains(event.target) && !tip.contains(event.target)) hide();
  };
  scroller.addEventListener("scroll", scrolled, { passive: true });
  addEventListener("resize", scrolled);
  document.addEventListener("keydown", key);
  document.addEventListener("pointerdown", elsewhere, true);
  return { node: tip, phone, wire, show, hide, get shown() {
    return anchor;
  }, destroy() {
    hide();
    clearTimeout(press);
    for (const off of [...wired]) off();
    scroller.removeEventListener("scroll", scrolled);
    removeEventListener("resize", scrolled);
    document.removeEventListener("keydown", key);
    document.removeEventListener("pointerdown", elsewhere, true);
  } };
}
