export function createSplit(handle, { host, prop, key, share, width, unit = "%", changed = () => {
} }) {
  if (!handle || !host) return null;
  const STEP = 16, root = document.documentElement;
  const set = (px) => host.style.setProperty(prop, (Math.max(0, px) / share() * 100).toFixed(2) + unit);
  const sync = () => {
    const w = width(), s = share();
    if (w && s) handle.setAttribute("aria-valuenow", String(Math.round(w / s * 100)));
  };
  const keep = () => {
    set(width());
    try {
      localStorage.setItem(key, host.style.getPropertyValue(prop));
    } catch {
    }
    sync();
    changed();
  };
  const reset = () => {
    host.style.removeProperty(prop);
    try {
      localStorage.removeItem(key);
    } catch {
    }
    sync();
    changed();
  };
  try {
    const saved = localStorage.getItem(key) || "";
    if (/^\d+(\.\d+)?(%|vw)$/.test(saved) && saved.endsWith(unit)) host.style.setProperty(prop, saved);
  } catch {
  }
  const swallow = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  let drag = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, w: width(), moved: false };
    handle.setPointerCapture?.(e.pointerId);
    handle.classList.add("is-dragging");
    root.dataset.resizing = "";
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.moved ||= Math.abs(e.clientX - drag.x) > 2;
    set(drag.w - (e.clientX - drag.x));
  });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    handle.classList.remove("is-dragging");
    delete root.dataset.resizing;
    keep();
    if (moved) {
      addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
    }
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, end);
  handle.addEventListener("dblclick", reset);
  handle.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: STEP, ArrowRight: -STEP }[e.key];
    if (step) {
      e.preventDefault();
      set(width() + step * (e.shiftKey ? 4 : 1));
      keep();
      return;
    }
    if (e.key === "Enter" || e.key === "Home") {
      e.preventDefault();
      reset();
    }
  });
  handle.addEventListener("focus", sync);
  handle.addEventListener("pointerenter", sync);
  addEventListener("resize", sync);
  sync();
  return { reset, sync };
}
