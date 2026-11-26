import { el, problem } from "../boards/dom.js";
import { control } from "../chat/visuals.js";
import { reduced } from "../chat/motion.js";
import { servedImage } from "./core.js";
export const imageView = (target, scoped, { phone = false, onShow = () => {
} } = {}) => viewer(target, scoped, { phone, onShow });
export async function ownImages(images, scoped, { copy = drawn } = {}) {
  return Promise.all(images.map(async (image) => {
    if (!image.url.startsWith("blob:")) return image;
    try {
      const blob = await copy(image.url);
      if (!blob) return image;
      const url = URL.createObjectURL(blob);
      scoped.own(() => URL.revokeObjectURL(url));
      return { ...image, url };
    } catch {
      return image;
    }
  }));
}
function drawn(url) {
  const img = [...document.querySelectorAll("img")].find((node) => (node.currentSrc || node.src) === url && node.complete && node.naturalWidth > 0);
  if (!img) return Promise.resolve(null);
  const canvas = el("canvas", { width: img.naturalWidth, height: img.naturalHeight });
  canvas.getContext("2d").drawImage(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
export async function served(target, { api, wait = 3e3 } = {}) {
  if (!servedImage(target)) return false;
  const ask = new AbortController(), timer = setTimeout(() => ask.abort(), wait);
  try {
    const result = await api(target.images[target.index].url, { signal: ask.signal });
    result.body?.cancel?.()?.catch?.(() => {
    });
    return result.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
export async function stillServed(targets, { api, wait } = {}) {
  const keep = await Promise.all(targets.map((target) => target?.kind === "image" ? served(target, { api, wait }) : true));
  return targets.filter((target, n) => keep[n]);
}
function viewer(target, scoped, { phone, onShow }) {
  const list = target.images, img = el("img", { class: "viewer-img", alt: "", draggable: "false" });
  const stage = el("div", { class: "viewer-stage", tabindex: "0", "aria-label": "Image · zoom with the wheel or two fingers, drag to move" }, img);
  const count = el("span", { class: "viewer-count" }), level = el("span", { class: "viewer-level", "aria-live": "polite" });
  const prev = control("‹", { class: "viewer-prev", "aria-label": "Previous image", title: "Previous image · ←", onclick: () => show(at - 1) });
  const next = control("›", { class: "viewer-next", "aria-label": "Next image", title: "Next image · →", onclick: () => show(at + 1) });
  const less = control("−", { class: "viewer-zoom", "aria-label": "Zoom out", title: "Zoom out · -", onclick: () => zoomTo(z / 1.25) });
  const more = control("+", { class: "viewer-zoom", "aria-label": "Zoom in", title: "Zoom in · +", onclick: () => zoomTo(z * 1.25) });
  const whole = control("Fit", { class: "viewer-fit", title: "Fit to the pane · 0", onclick: () => fit(true) });
  const real = control("Actual size", { class: "viewer-real", title: "View at actual size · 1", onclick: () => zoomTo(1) });
  const bar = el("div", { class: "viewer-bar" }, list.length > 1 ? el("span", { class: "viewer-pages" }, prev, count, next) : null, el("span", { class: "viewer-gap" }), el("span", { class: "viewer-zooms" }, less, level, more), whole, phone ? null : real);
  let at = 0, z = 1, fitZ = 1, x = 0, y = 0, natural = null;
  const box = () => stage.getBoundingClientRect();
  const paint = (smooth = false) => {
    img.classList.toggle("is-gliding", smooth && !reduced());
    img.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    level.textContent = Math.round(z * 100) + "%";
    stage.classList.toggle("is-zoomed", z > fitZ + 1e-3);
    whole.disabled = Math.abs(z - fitZ) < 1e-3 && !x && !y;
    real.disabled = Math.abs(z - 1) < 1e-3;
    less.disabled = z <= fitZ + 1e-3;
    more.disabled = z >= 8 - 1e-3;
  };
  const clamp = () => {
    const frame = box(), mx = Math.max(0, (natural.w * z - frame.width) / 2 + 24), my = Math.max(0, (natural.h * z - frame.height) / 2 + 24);
    x = Math.max(-mx, Math.min(mx, x));
    y = Math.max(-my, Math.min(my, y));
  };
  const measure = () => {
    const frame = box();
    fitZ = Math.min(1, (frame.width - 48) / natural.w, (frame.height - 48) / natural.h);
    if (!(fitZ > 0)) fitZ = 1;
  };
  function fit(smooth = false) {
    if (!natural) return;
    measure();
    z = fitZ;
    x = 0;
    y = 0;
    paint(smooth);
  }
  function zoomTo(value, cx = 0, cy = 0, smooth = true) {
    if (!natural) return;
    const to = Math.max(fitZ, Math.min(8, value)), k = to / z;
    x = cx - (cx - x) * k;
    y = cy - (cy - y) * k;
    z = to;
    clamp();
    paint(smooth);
  }
  function show(n) {
    at = (n + list.length) % list.length;
    natural = null;
    img.classList.remove("is-ready");
    img.src = list[at].url;
    count.textContent = `${at + 1} / ${list.length}`;
    onShow({ at, title: list.length > 1 ? `Image ${at + 1} / ${list.length}` : target.title || "Image", url: list[at].url, name: list[at].name || `image-${at + 1}` });
  }
  img.addEventListener("load", () => {
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    img.style.width = natural.w + "px";
    img.style.height = natural.h + "px";
    img.style.marginLeft = -natural.w / 2 + "px";
    img.style.marginTop = -natural.h / 2 + "px";
    fit();
    img.classList.add("is-ready");
  });
  img.addEventListener("error", () => {
    natural = null;
    stage.replaceChildren(problem("Image expired"));
  });
  const local = (event) => {
    const frame = box();
    return [event.clientX - frame.left - frame.width / 2, event.clientY - frame.top - frame.height / 2];
  };
  stage.addEventListener("wheel", (event) => {
    if (!natural) return;
    event.preventDefault();
    zoomTo(z * Math.exp(-event.deltaY * 16e-4), ...local(event), false);
  }, { passive: false });
  stage.addEventListener("dblclick", (event) => {
    if (z > fitZ + 1e-3) fit(true);
    else zoomTo(Math.max(1, fitZ * 2), ...local(event));
  });
  const pointers = new Map();
  let pinch = null;
  stage.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    stage.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z };
    }
  });
  stage.addEventListener("pointermove", (event) => {
    const was = pointers.get(event.pointerId);
    if (!was || !natural) return;
    const now = [event.clientX, event.clientY];
    pointers.set(event.pointerId, now);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomTo(pinch.z * d / (pinch.d || 1), ...local({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }), false);
    } else if (pointers.size === 1 && z > fitZ + 1e-3) {
      x += now[0] - was[0];
      y += now[1] - was[1];
      clamp();
      paint();
    }
  });
  const lift = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  stage.addEventListener("pointerup", lift);
  stage.addEventListener("pointercancel", lift);
  stage.addEventListener("keydown", (event) => {
    const keys = { ArrowLeft: () => list.length > 1 && show(at - 1), ArrowRight: () => list.length > 1 && show(at + 1), "+": () => zoomTo(z * 1.25), "=": () => zoomTo(z * 1.25), "-": () => zoomTo(z / 1.25), "0": () => fit(true), "1": () => zoomTo(1) };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    }
  });
  if (typeof ResizeObserver === "function") {
    const watch = new ResizeObserver(() => {
      if (!natural) return;
      const fitted = Math.abs(z - fitZ) < 1e-3;
      measure();
      if (fitted) {
        z = fitZ;
        x = 0;
        y = 0;
      } else z = Math.max(z, fitZ);
      clamp();
      paint();
    });
    watch.observe(stage);
    scoped.own(() => watch.disconnect());
  }
  show(target.index ?? 0);
  requestAnimationFrame(() => stage.focus({ preventScroll: true }));
  return el("div", { class: "viewer" }, stage, bar);
}
