import { el, svg } from "../boards/dom.js";
import { l10n } from "../names.js";
export function createSendTrigger({ send, form, busy, canNow, canQueue, now, queue, clock = () => performance.now() }) {
  const original = { label: send.getAttribute("aria-label"), title: send.getAttribute("title") };
  const chevron = svg("svg", { class: "g248-send-chev", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "aria-hidden": "true" }, svg("path", { d: "m7 10 5 5 5-5" }));
  let menu = null, pressed = null, timer = null, suppressClick = false;
  const active = () => busy() && !send.hidden;
  function clearPress(cancelled = false) {
    clearTimeout(timer);
    timer = null;
    pressed = null;
    send.removeAttribute("data-pressing");
    if (cancelled) suppressClick = true;
  }
  function close(back = false) {
    menu?.remove();
    menu = null;
    send.removeAttribute("aria-expanded");
    removeEventListener("pointerdown", outside, true);
    if (back) send.focus({ preventScroll: true });
  }
  function open(focus = false) {
    if (!active() || send.disabled) return;
    if (!menu) {
      menu = el("div", { class: "g248-menu", role: "menu", "aria-label": l10n("전송 시점", "When to send") }, [[l10n("지금 보내기", "Send now"), "now", now], [l10n("끝나고 보내기", "Send when done"), "later", queue]].map(([label, mode, run]) => el("button", { type: "button", role: "menuitem", class: mode === "later" ? "g248-later" : "", "data-send-mode": mode, onclick: () => {
        close();
        run();
      } }, label)));
      form.append(menu);
      addEventListener("pointerdown", outside, true);
    }
    send.setAttribute("aria-expanded", "true");
    paintChoices();
    if (focus) menu.querySelector("button")?.focus({ preventScroll: true });
  }
  function paintChoices() {
    if (!menu) return;
    menu.querySelector("[data-send-mode=now]").disabled = !canNow();
    menu.querySelector("[data-send-mode=later]").disabled = !canQueue();
  }
  function outside(event) {
    if (menu && !menu.contains(event.target) && !send.contains(event.target)) close();
  }
  function down(event) {
    const interrupted = !!pressed;
    clearPress();
    suppressClick = false;
    if (event.button !== 0 || event.isPrimary === false) {
      if (interrupted) suppressClick = true;
      return;
    }
    if (!active() || send.disabled || chevron.contains(event.target)) return;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, at: clock() };
    try {
      send.setPointerCapture?.(event.pointerId);
    } catch {
    }
    send.setAttribute("data-pressing", "");
    timer = setTimeout(() => {
      if (pressed) {
        suppressClick = true;
        open();
      }
    }, 450);
  }
  function move(event) {
    if (pressed?.id === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 8) clearPress(true);
  }
  function up(event) {
    if (pressed && pressed.id !== event.pointerId) return;
    if (pressed && clock() - pressed.at >= 450) {
      suppressClick = true;
      open();
    }
    clearPress();
  }
  const cancel = (event) => {
    if (pressed?.id === event.pointerId) clearPress(true);
  };
  function click(event) {
    if (suppressClick || active() && chevron.contains(event.target)) {
      const show = !suppressClick;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
      if (show) open(true);
    }
  }
  const context = (event) => event.preventDefault();
  function key(event) {
    if (event.key === "Escape" && menu) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" && event.target === send && active()) {
      event.preventDefault();
      open(true);
    } else if (menu?.contains(event.target) && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll("button")].filter((button) => !button.disabled), at = buttons.indexOf(document.activeElement);
      buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }
  const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: cancel, contextmenu: context };
  for (const [type, listener] of Object.entries(listeners)) send.addEventListener(type, listener);
  send.addEventListener("click", click, true);
  form.addEventListener("keydown", key);
  return { close, paint() {
    if (active()) {
      if (chevron.parentNode !== send) send.append(chevron);
      send.setAttribute("aria-haspopup", "menu");
      send.setAttribute("aria-label", l10n("끝나고 보내기 · 길게 눌러 지금 보내기", "Send when done · hold to send now"));
      send.setAttribute("title", l10n("끝나고 보내기(이번 턴이 끝나면 전달) · 길게 누르거나 화살표를 눌러 지금 보내기(지금 단계가 끝나면 전달)", "Send when done (goes when this turn ends) · hold or press the arrow to send now (goes when the current step ends)"));
      if (send.disabled) {
        clearPress(!!pressed);
        close();
      }
      paintChoices();
    } else {
      clearPress(!!pressed);
      close();
      chevron.remove();
      send.removeAttribute("aria-haspopup");
      send.setAttribute("aria-label", original.label);
      send.setAttribute("title", original.title);
    }
  }, destroy() {
    clearPress();
    close();
    chevron.remove();
    for (const [type, listener] of Object.entries(listeners)) send.removeEventListener(type, listener);
    send.removeEventListener("click", click, true);
    form.removeEventListener("keydown", key);
  } };
}
