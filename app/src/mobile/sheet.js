export const swipeCloses = (dy, msec, height) => dy >= height / 3 || dy >= 24 && dy / Math.max(msec, 1) > 0.4;
export function wrapFocus(stops, active, back) {
  if (!stops.length) return null;
  const at = stops.indexOf(active), n = stops.length;
  return at < 0 ? stops[back ? n - 1 : 0] : stops[(at + (back ? n - 1 : 1)) % n];
}
const seconds = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(v).trim().endsWith("ms") ? n : n * 1e3 : 0;
};
export function createSheet(dialog, { onClose = () => {
}, from = "bottom", focus = () => null } = {}) {
  const sheet = dialog.querySelector(".m-sheet"), grab = dialog.querySelectorAll("[data-grab]"), root = document.documentElement;
  const control = () => document.querySelector('[aria-controls="' + dialog.id + '"]'), horizontal = from === "left", dir = from === "top" || horizontal ? -1 : 1;
  const point = (e) => horizontal ? e.clientX : e.clientY;
  const extent = () => horizontal ? sheet.offsetWidth : sheet.offsetHeight;
  sheet.tabIndex = -1;
  const stops = () => [...sheet.querySelectorAll('a[href],button:not(:disabled),summary,[tabindex="0"]')].filter((el) => el.offsetParent !== null);
  let opener = null, drag = null, dragged = false, timer = 0;
  function open() {
    clearTimeout(timer);
    delete dialog.dataset.closing;
    if (!dialog.open) {
      const was = document.activeElement;
      opener = was && was !== document.body ? was : control();
      dialog.showModal();
      root.classList.add("m-locked");
      control()?.setAttribute("aria-expanded", "true");
    }
    sheet.getBoundingClientRect();
    (focus() || sheet).focus({ preventScroll: true });
  }
  function close() {
    if (!dialog.open || dialog.dataset.closing != null) return;
    dialog.dataset.closing = "";
    timer = setTimeout(() => {
      delete dialog.dataset.closing;
      dialog.close();
      root.classList.remove("m-locked");
      sheet.style.removeProperty("--drag");
      control()?.setAttribute("aria-expanded", "false");
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
      onClose();
    }, seconds(getComputedStyle(root).getPropertyValue("--dur-float")));
  }
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("click", (e) => {
    const was = dragged;
    dragged = false;
    if (was && e.detail > 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  dialog.addEventListener("click", (e) => {
    if (e.target.closest(".m-scrim,[data-close]")) close();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const next = wrapFocus(stops(), document.activeElement, e.shiftKey);
    if (next) {
      e.preventDefault();
      next.focus({ preventScroll: true });
    }
  });
  for (const el of grab) {
    el.addEventListener("pointerdown", (e) => {
      dragged = false;
      if (e.isPrimary && e.button <= 0 && (dir < 0 || !e.target.closest("button,a,summary"))) drag = { id: e.pointerId, y: point(e), cross: horizontal ? e.clientY : e.clientX, at: e.timeStamp, dy: 0, on: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = (point(e) - drag.y) * dir;
      if (horizontal && !drag.on && Math.abs(e.clientY - drag.cross) >= Math.max(8, Math.abs(dy))) {
        drag = null;
        return;
      }
      if (!drag.on) {
        if (dy < 8) return;
        drag.on = dragged = true;
        dialog.dataset.dragging = "";
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
        }
      }
      drag.dy = Math.max(0, dy);
      sheet.style.setProperty("--drag", dir * drag.dy + "px");
      dialog.style.setProperty("--dim", String(Math.max(0, 1 - drag.dy / extent())));
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag;
      drag = null;
      if (!was.on) return;
      delete dialog.dataset.dragging;
      dialog.style.removeProperty("--dim");
      if (e.type === "pointerup" && swipeCloses(was.dy, e.timeStamp - was.at, extent())) close();
      else sheet.style.removeProperty("--drag");
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  return { open, close, get isOpen() {
    return dialog.open && dialog.dataset.closing == null;
  } };
}
