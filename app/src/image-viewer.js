import { servedName } from "./chat/file-download.js";
import { l10n } from "./names.js";
const SCOPES = ["bv-block", "bv-prose", "bv-image", "pane-doc", "msg-images", "msg-body"];
const OWN = ["iv", "viewer-stage", "composer-image"];
const GROUPS = ["msg", "pane-doc", "bv-blocks"];
const ICONS = { close: "M6.5 6.5l11 11 M17.5 6.5l-11 11", prev: "m15 5-7 7 7 7", next: "m9 5 7 7-7 7", zoomOut: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z M15.3 15.3 20 20 M7.75 10.5h5.5", zoomIn: "M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z M15.3 15.3 20 20 M7.75 10.5h5.5 M10.5 7.75v5.5", fit: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5", download: "M12 4v11 M7 10.5l5 5 5-5 M5 20h14" };
export const ZOOM_MAX = 8;
const EPS = 1e-3, TAP = 6, DOUBLE_TAP_MS = 320, STEP = 1.25;
export const clampZoom = (value, fit) => Math.max(fit, Math.min(Math.max(ZOOM_MAX, fit), Number(value) || fit));
export function fitZoom(natural, frame, pad = { x: 0, y: 0 }) {
  const zoom = Math.min(1, (frame.w - 2 * pad.x) / natural.w, (frame.h - 2 * pad.y) / natural.h);
  if (zoom > 0) return zoom;
  const bare = Math.min(1, frame.w / natural.w, frame.h / natural.h);
  return bare > 0 ? bare : 1;
}
const win = globalThis;
const reduced = () => !!win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const isPhone = () => win.document?.documentElement?.dataset?.layout === "phone" || !!win.matchMedia?.("(max-width: 767.98px)").matches;
const now = () => win.performance?.now?.() ?? Date.now();
const up = (node) => {
  const parent = node?.parentNode ?? null;
  return parent && parent.nodeType === 11 ? parent.host ?? null : parent;
};
function lineage(node) {
  const out = [];
  for (let at = node; at && at.nodeType !== 9; at = up(at)) out.push(at);
  return out;
}
const hasClass = (node, names) => !!node?.classList && names.some((name) => node.classList.contains(name));
const sourceOf = (img) => img.currentSrc || img.src || img.getAttribute?.("src") || "";
export function viewable(img) {
  if (img?.tagName !== "IMG" || !sourceOf(img)) return false;
  if (img.complete && img.naturalWidth > 0 && img.naturalWidth < 24 && img.naturalHeight < 24) return false;
  let scoped = false;
  for (const node of lineage(up(img))) {
    if (node.tagName === "A" && node.hasAttribute?.("href") || node.tagName === "BUTTON" || hasClass(node, OWN) || node.hasAttribute?.("data-no-viewer")) return false;
    if (hasClass(node, SCOPES) || node.hasAttribute?.("data-image-viewer")) scoped = true;
  }
  return scoped;
}
function groupOf(img) {
  let outer = null;
  for (const node of lineage(up(img))) {
    if (hasClass(node, GROUPS) || node.tagName === "ARTICLE" || node.hasAttribute?.("data-image-group")) return node;
    if (hasClass(node, SCOPES)) outer = node;
  }
  return outer;
}
function imagesIn(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (child.tagName === "IMG") {
        if (viewable(child)) out.push(child);
      } else walk(child);
      if (child.shadowRoot) walk(child.shadowRoot);
    }
  };
  walk(root);
  return out;
}
function captionOf(img) {
  for (const node of lineage(up(img)).slice(0, 4)) if (node.tagName === "FIGURE") {
    const text = node.querySelector?.("figcaption")?.textContent?.trim();
    if (text) return text;
    break;
  }
  return (img.getAttribute?.("alt") || img.getAttribute?.("title") || "").trim();
}
const fromImg = (img) => ({ src: sourceOf(img), alt: img.getAttribute?.("alt") || "", caption: captionOf(img), name: "", el: img });
function toItem(value) {
  if (typeof value === "string") return value ? { src: value, alt: "", caption: "", name: "", el: null } : null;
  if (value?.tagName === "IMG") return sourceOf(value) ? fromImg(value) : null;
  const src = value?.src || value?.url;
  if (typeof src !== "string" || !src) return null;
  const item = { src, alt: value.alt || "", caption: String(value.caption ?? value.alt ?? "").trim(), name: String(value.name ?? ""), el: value.el ?? null };
  return value.kind === "video" ? { ...item, kind: "video", poster: String(value.poster ?? "") } : item;
}
export function collect(img) {
  const group = groupOf(img), list = group ? imagesIn(group) : [];
  const shown2 = list.includes(img) ? list : [img];
  return { images: shown2.map(fromImg), index: shown2.indexOf(img) };
}
const NS = "http://www.w3.org/2000/svg";
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) if (value != null && value !== false) node.setAttribute(name, value === true ? "" : String(value));
  node.append(...children.filter((child) => child != null));
  return node;
}
function icon(name) {
  const svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) svg.setAttribute(key, value);
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}
const button = (name, label, cls, title = label) => h("button", { type: "button", class: "iv-control " + cls, "aria-label": label, title }, icon(name));
export function savedName(disposition, item, type = "") {
  const served = servedName(disposition);
  if (served) return served;
  if (item?.name) return item.name;
  let last = "";
  try {
    const url = new URL(item?.src ?? "", "http://x");
    if (/^https?:$/.test(url.protocol)) last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    last = "";
  }
  return /\.[a-z0-9]{2,5}$/i.test(last) ? last : "image." + (/^image\/([a-z0-9]+)/i.exec(type)?.[1]?.replace("jpeg", "jpg") ?? "png");
}
let shown = null, pops = 0, popWired = false;
const embeds = new WeakMap();
function onPop() {
  if (pops > 0) {
    pops--;
    return;
  }
  shown?.popped();
}
export function openViewer(images, index = 0, options = {}) {
  if (typeof document === "undefined") return null;
  const values = Array.isArray(images) ? images : images != null && typeof images !== "string" && typeof images[Symbol.iterator] === "function" ? [...images] : [images];
  const list = values.map(toItem).filter(Boolean);
  if (!list.length) return null;
  const at = Math.min(list.length - 1, Math.max(0, Math.trunc(Number(index)) || 0));
  const { from = null, host = null, onShow = null, controls = true, download, phone, focus = true } = options ?? {};
  const mode = options?.mode ?? (host ? "embed" : "overlay");
  const wanted = { onShow: typeof onShow === "function" ? onShow : null, controls: controls !== false, download };
  if (mode === "embed") {
    if (typeof host?.append !== "function") return null;
    embeds.get(host)?.handle.destroy();
    const view = mount({ ...wanted, embed: true, host, phone: phone ?? isPhone(), focus: focus !== false });
    embeds.set(host, view);
    view.load(list, at, null);
    return view.handle;
  }
  if (shown && !shown.handle.open) shown.finish();
  if (shown) shown.configure(wanted);
  else shown = mount({ ...wanted, embed: false, phone: phone ?? isPhone(), focus: focus !== false });
  shown.load(list, at, from ?? list[at].el ?? null);
  return shown.handle;
}
function mount({ embed, host = null, phone, focus, ...settings }) {
  const returnFocus = embed ? null : document.activeElement ?? null;
  const back = embed ? null : h("div", { class: "iv-back" }), frame = h("div", { class: "iv-frame" }), stage = h("div", { class: "iv-stage", tabindex: embed ? "0" : "-1" }, frame);
  const problem = h("p", { class: "iv-problem", role: "status", hidden: true }, l10n("이미지를 불러오지 못했어요.", "Couldn't load the image."));
  const count = h("span", { class: "iv-count", "aria-live": "polite" }), level = h("span", { class: "iv-level" });
  const zoomOut = button("zoomOut", "Zoom out", "iv-zoom-out"), zoomIn = button("zoomIn", "Zoom in", "iv-zoom-in"), fitter = button("fit", "Fit", "iv-fit");
  const saver = button("download", "Download", "iv-download"), saving = h("span", { class: "iv-note", role: "status" });
  const closer = embed ? null : button("close", "Close", "iv-close");
  const bar = h("div", { class: "iv-bar" }, count, h("span", { class: "iv-space" }), saving, h("span", { class: "iv-zooms" }, level, zoomOut, zoomIn, fitter), saver, closer);
  const prev = button("prev", "Previous image", "iv-nav iv-prev", "Previous"), next = button("next", "Next image", "iv-nav iv-next", "Next");
  const caption = h("p", { class: "iv-caption" }), foot = h("div", { class: "iv-foot" }, caption);
  const cls = "iv" + (embed ? " is-embed" : "") + (phone ? " is-phone" : "");
  const node = embed ? h("div", { class: cls, role: "group", "aria-label": "Image viewer" }, stage, problem, bar, prev, next, foot) : h(typeof win.HTMLDialogElement === "function" ? "dialog" : "div", { class: cls, role: "dialog", "aria-modal": "true", "aria-label": "Image viewer" }, back, stage, problem, bar, prev, next, foot);
  let list = [], at = 0, from = null, img = null, natural = null, z = 1, fitZ = 1, x = 0, y = 0, closing = false, gone = false, pushed = false;
  let onShow = null, watch = null, dropImage = null;
  const lifetime = new AbortController(), held = new Set(), timers = new Set();
  const on = (target, type, fn, options = {}) => {
    if (typeof target?.addEventListener !== "function") return () => {
    };
    const opts = { ...options, signal: lifetime.signal };
    target.addEventListener(type, fn, opts);
    const off = () => {
      held.delete(off);
      target.removeEventListener?.(type, fn, opts);
    };
    held.add(off);
    return off;
  };
  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!gone) fn();
    }, ms);
    timers.add(timer);
    return timer;
  };
  const raf = (fn) => win.requestAnimationFrame ? win.requestAnimationFrame(() => {
    if (!gone) fn();
  }) : later(fn, 16);
  const size = () => embed ? { w: stage.clientWidth ?? host.clientWidth ?? win.innerWidth ?? 0, h: stage.clientHeight ?? host.clientHeight ?? win.innerHeight ?? 0 } : { w: stage.clientWidth || win.innerWidth || 0, h: stage.clientHeight || win.innerHeight || 0 };
  function pads() {
    const { h: height } = size(), box = stage.getBoundingClientRect?.() ?? {}, left = box.width ? box.left : 0, top = box.width ? box.top : 0;
    const head = bar.getBoundingClientRect?.() ?? {}, under = foot.getBoundingClientRect?.() ?? {}, side = prev.getBoundingClientRect?.() ?? {};
    const above = head.height ? head.bottom - top : 0, below = !foot.hidden && under.height ? top + height - under.top : 0;
    const x2 = phone ? 0 : list.length > 1 && side.width ? side.right - left + 8 : 32;
    return { x: x2, y: Math.max(above, below, 16) + (phone ? 4 : 12) };
  }
  const measure = () => {
    const frameSize = size();
    if (!(frameSize.w > 0 && frameSize.h > 0)) return false;
    fitZ = fitZoom(natural, frameSize, pads());
    return true;
  };
  const zoomed = () => z > fitZ + EPS;
  const setOff = (control, off) => {
    control.classList.toggle("is-off", off);
    if (off) control.setAttribute("aria-disabled", "true");
    else control.removeAttribute("aria-disabled");
  };
  function states() {
    setOff(zoomOut, !natural || !zoomed());
    setOff(fitter, !natural || !zoomed());
    setOff(zoomIn, !natural || z >= Math.max(ZOOM_MAX, fitZ) - EPS);
  }
  function paint(smooth = false) {
    if (!img) return;
    img.classList.toggle("is-gliding", smooth && !reduced());
    img.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    node.classList.toggle("is-zoomed", zoomed());
    level.textContent = zoomed() ? Math.round(z * 100) + "%" : "";
    states();
  }
  function bound() {
    const { w, h: height } = size(), mx = Math.max(0, (natural.w * z - w) / 2), my = Math.max(0, (natural.h * z - height) / 2);
    x = Math.max(-mx, Math.min(mx, x));
    y = Math.max(-my, Math.min(my, y));
  }
  function zoomTo(value, cx = 0, cy = 0, smooth = true) {
    if (!natural || gone) return;
    const to = clampZoom(value, fitZ), k = to / z;
    x = cx - (cx - x) * k;
    y = cy - (cy - y) * k;
    z = to;
    bound();
    paint(smooth);
  }
  function fit(smooth = true) {
    if (!natural || gone) return;
    measure();
    z = fitZ;
    x = 0;
    y = 0;
    paint(smooth);
  }
  const local = (event) => {
    const { w, h: height } = size(), box = stage.getBoundingClientRect?.() ?? {};
    return [event.clientX - (box.width ? box.left : 0) - w / 2, event.clientY - (box.width ? box.top : 0) - height / 2];
  };
  const onImage = (event) => {
    if (!natural) return false;
    const [cx, cy] = local(event);
    return Math.abs(cx - x) <= natural.w * z / 2 && Math.abs(cy - y) <= natural.h * z / 2;
  };
  function toggle(event) {
    if (zoomed()) fit(true);
    else zoomTo(Math.max(1, fitZ * 2), ...local(event), true);
  }
  const replay = (name) => {
    frame.classList.remove("is-from-next", "is-from-prev", "is-arriving");
    if (name && !reduced()) {
      void frame.offsetWidth;
      frame.classList.add(name);
    }
  };
  function show(n, dir = 0, opening = false) {
    at = n;
    natural = null;
    const item = list[at], video = item.kind === "video";
    const incoming = video ? h("video", { class: "iv-img iv-video", muted: true, loop: true, playsinline: true, autoplay: !reduced(), preload: "auto", poster: item.poster || null, "aria-label": item.alt || null }) : h("img", { class: "iv-img", alt: item.alt || "", draggable: "false", decoding: "async" });
    if (video) incoming.muted = true;
    dropImage?.();
    const loaded = on(incoming, video ? "loadedmetadata" : "load", () => {
      if (img === incoming) arrive(dir, opening);
    }, { once: true });
    const failed = on(incoming, "error", () => {
      if (img !== incoming) return;
      natural = null;
      incoming.remove();
      problem.hidden = false;
      states();
    }, { once: true });
    dropImage = () => {
      loaded();
      failed();
    };
    problem.hidden = true;
    img?.remove();
    img = incoming;
    frame.append(incoming);
    incoming.src = item.src;
    count.textContent = list.length > 1 ? `${at + 1} / ${list.length}` : "";
    caption.textContent = item.caption || "";
    foot.hidden = !item.caption;
    prev.hidden = next.hidden = list.length < 2 || phone;
    for (const [arrow, off] of [[prev, at === 0], [next, at === list.length - 1]]) {
      arrow.classList.toggle("is-off", off);
      if (off) {
        arrow.setAttribute("aria-disabled", "true");
        arrow.setAttribute("tabindex", "-1");
      } else {
        arrow.removeAttribute("aria-disabled");
        arrow.removeAttribute("tabindex");
      }
    }
    saving.textContent = "";
    node.classList.remove("is-zoomed");
    level.textContent = "";
    states();
    for (const near of [list[at - 1], list[at + 1]]) if (near && near.kind !== "video" && typeof win.Image === "function") {
      const ahead = new win.Image();
      ahead.decoding = "async";
      ahead.src = near.src;
    }
    onShow?.(at, { ...item }, handle);
  }
  function arrive(dir, opening) {
    natural = img.tagName === "VIDEO" ? { w: img.videoWidth, h: img.videoHeight } : { w: img.naturalWidth, h: img.naturalHeight };
    if (!(natural.w > 0 && natural.h > 0)) {
      const { w, h: height } = size();
      natural = { w: Math.max(1, w * 0.8), h: Math.max(1, height * 0.8) };
    }
    Object.assign(img.style, { width: natural.w + "px", height: natural.h + "px", marginLeft: -natural.w / 2 + "px", marginTop: -natural.h / 2 + "px" });
    if (!measure()) fitZ = 1;
    z = fitZ;
    x = 0;
    y = 0;
    const box = !embed && opening && !reduced() && from?.isConnected ? from.getBoundingClientRect?.() : null;
    if (box?.width > 0) {
      const { w, h: height } = size();
      img.style.transform = `translate(${box.left + box.width / 2 - w / 2}px, ${box.top + box.height / 2 - height / 2}px) scale(${box.width / natural.w})`;
      void img.offsetWidth;
      paint(true);
    } else {
      paint(false);
      replay(dir > 0 ? "is-from-next" : dir < 0 ? "is-from-prev" : opening ? "is-arriving" : null);
    }
    img.classList.add("is-ready");
  }
  function go(step) {
    const n = at + step;
    if (closing || n < 0 || n >= list.length) return false;
    from = list[n].el;
    show(n, step);
    return true;
  }
  function close({ popped = false } = {}) {
    if (embed) {
      finish();
      return;
    }
    if (closing) return;
    closing = true;
    if (pushed && !popped && win.history?.state?.imageViewer) {
      pops++;
      win.history.back();
    }
    pushed = false;
    node.classList.remove("is-open");
    node.classList.add("is-closing");
    const shift = /translate(?:X|Y)?\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(frame.style.transform || "");
    if (shift && natural) {
      if (/translateY/.test(frame.style.transform)) y += Number(shift[1]);
      else x += Number(shift[1]);
      frame.style.transform = "";
      paint(false);
    }
    const target = list[at]?.el, box = !reduced() && natural && target?.isConnected ? target.getBoundingClientRect?.() : null, { w, h: height } = size();
    if (box?.width > 0 && box.bottom > 0 && box.top < height && box.right > 0 && box.left < w) {
      img.classList.add("is-gliding");
      img.style.transform = `translate(${box.left + box.width / 2 - w / 2}px, ${box.top + box.height / 2 - height / 2}px) scale(${box.width / natural.w})`;
    } else if (img && !reduced()) img.classList.add("is-leaving");
    if (reduced()) {
      finish();
      return;
    }
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      finish();
    };
    on(back, "transitionend", done, { once: true });
    timer = later(done, 450);
  }
  function destroy() {
    if (gone) return;
    if (!embed && pushed && win.history?.state?.imageViewer) {
      pops++;
      win.history.back();
    }
    pushed = false;
    finish();
  }
  function finish() {
    if (gone) return;
    gone = closing = true;
    for (const off of [...held]) off();
    lifetime.abort();
    watch?.disconnect();
    watch = null;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    dropImage = null;
    onShow = null;
    if (!embed) {
      try {
        if (node.open) node.close?.();
      } catch {
      }
    }
    node.remove();
    if (embed) {
      if (embeds.get(host) === view) embeds.delete(host);
    } else if (shown === view) shown = null;
    if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
  }
  const pointers = new Map();
  let gesture = null, lastTap = null, lastType = "mouse";
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 } };
  };
  function settle() {
    if (!reduced()) {
      frame.classList.add("is-settling");
      later(() => frame.classList.remove("is-settling"), 320);
    }
    frame.style.transform = "";
    if (back) back.style.opacity = "";
  }
  on(stage, "pointerdown", (event) => {
    if (closing || event.button > 0) return;
    lastType = event.pointerType || "mouse";
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture?.(event.pointerId);
    if (pointers.size === 2 && natural) {
      const { d, mid } = pair();
      gesture = { kind: "pinch", d, mid, z, x, y };
      settle();
    } else if (pointers.size === 1) gesture = { kind: "press", sx: event.clientX, sy: event.clientY, t: now(), x0: x, y0: y, type: lastType };
  });
  on(stage, "pointermove", (event) => {
    const point = pointers.get(event.pointerId);
    if (!point || !gesture || closing) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (gesture.kind === "pinch") {
      if (pointers.size < 2) return;
      const { d, mid } = pair(), [cx, cy] = local(mid), [sx, sy] = local(gesture.mid), to = clampZoom(gesture.z * d / gesture.d, fitZ), k = to / gesture.z;
      x = cx - (sx - gesture.x) * k;
      y = cy - (sy - gesture.y) * k;
      z = to;
      bound();
      paint(false);
      return;
    }
    const dx = event.clientX - gesture.sx, dy = event.clientY - gesture.sy;
    if (gesture.kind === "press") {
      if (Math.hypot(dx, dy) < TAP) return;
      gesture.kind = zoomed() && natural ? "pan" : gesture.type === "mouse" || !natural ? "idle" : Math.abs(dx) > Math.abs(dy) ? "swipe-x" : dy > 0 && !embed ? "swipe-y" : "idle";
      if (gesture.kind !== "idle") node.classList.add("is-dragging");
    }
    if (gesture.kind === "pan") {
      x = gesture.x0 + dx;
      y = gesture.y0 + dy;
      bound();
      paint(false);
    } else if (gesture.kind === "swipe-x") {
      const end = dx > 0 && at === 0 || dx < 0 && at === list.length - 1;
      frame.style.transform = `translateX(${end ? dx * 0.3 : dx}px)`;
    } else if (gesture.kind === "swipe-y") {
      frame.style.transform = `translateY(${Math.max(0, dy)}px)`;
      back.style.opacity = String(Math.max(0.3, 1 - Math.max(0, dy) / 520));
    }
  });
  const lift = (event) => {
    if (!pointers.delete(event.pointerId) || !gesture) return;
    const was = gesture;
    node.classList.remove("is-dragging");
    if (was.kind === "pinch") {
      const rest = [...pointers.values()][0];
      gesture = rest ? { kind: "pan", sx: rest.x, sy: rest.y, t: now(), x0: x, y0: y, type: lastType } : null;
      return;
    }
    gesture = null;
    if (event.type === "pointercancel") {
      settle();
      return;
    }
    const dx = event.clientX - was.sx, dy = event.clientY - was.sy, dt = Math.max(1, now() - was.t), { w } = size();
    if (was.kind === "press") {
      if (!onImage(event)) {
        if (!embed) close();
        return;
      }
      if (was.type !== "mouse") {
        const t = now();
        if (lastTap && t - lastTap.t < DOUBLE_TAP_MS && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40) {
          lastTap = null;
          toggle(event);
        } else lastTap = { t, x: event.clientX, y: event.clientY };
      }
    } else if (was.kind === "swipe-x") {
      const step = dx < 0 ? 1 : -1, far = Math.abs(dx) > w * 0.18 || Math.abs(dx / dt) > 0.45;
      if (far && at + step >= 0 && at + step < list.length) {
        if (reduced()) {
          frame.style.transform = "";
          go(step);
          return;
        }
        frame.classList.add("is-settling");
        frame.style.transform = `translateX(${-step * w * 0.6}px)`;
        frame.style.opacity = "0";
        later(() => {
          frame.classList.remove("is-settling");
          frame.style.transform = "";
          frame.style.opacity = "";
          go(step);
        }, 160);
      } else settle();
    } else if (was.kind === "swipe-y") {
      if (dy > 110 || dy / dt > 0.55) close();
      else settle();
    }
  };
  on(stage, "pointerup", lift);
  on(stage, "pointercancel", lift);
  on(stage, "dblclick", (event) => {
    if (lastType === "mouse" && onImage(event)) {
      event.preventDefault();
      toggle(event);
    }
  });
  on(node, "wheel", (event) => {
    if (embed && (!natural || gone)) return;
    event.preventDefault();
    if (!natural || closing) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? size().h : 1);
    zoomTo(z * Math.exp(-delta * (event.ctrlKey ? 0.01 : 16e-4)), ...local(event), !event.ctrlKey && Math.abs(delta) >= 50);
  }, { passive: false });
  on(node, "keydown", (event) => {
    if (!embed) event.stopPropagation();
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const keys = { Escape: () => close(), ArrowLeft: () => go(-1), ArrowRight: () => go(1), "+": () => zoomTo(z * STEP), "=": () => zoomTo(z * STEP), "-": () => zoomTo(z / STEP), _: () => zoomTo(z / STEP), 0: () => fit(true), 1: () => zoomTo(1) };
    if (embed) delete keys.Escape;
    const act = keys[event.key];
    if (act) {
      event.preventDefault();
      if (embed) event.stopPropagation?.();
      act();
    }
  });
  if (!embed) {
    on(node, "cancel", (event) => {
      event.preventDefault();
      close();
    });
    on(node, "close", () => {
      if (!gone) {
        closing = true;
        if (pushed && win.history?.state?.imageViewer) {
          pops++;
          win.history.back();
        }
        pushed = false;
        finish();
      }
    });
  }
  on(closer, "click", () => close());
  on(prev, "click", () => go(-1));
  on(next, "click", () => go(1));
  on(zoomOut, "click", () => zoomTo(z / STEP));
  on(zoomIn, "click", () => zoomTo(z * STEP));
  on(fitter, "click", () => fit(true));
  on(saver, "click", async () => {
    const item = list[at];
    if (!item || saver.getAttribute("aria-busy") === "true") return;
    saver.setAttribute("aria-busy", "true");
    saving.textContent = "";
    try {
      const answer = await win.fetch(item.src, { credentials: "same-origin" });
      if (!answer.ok) throw Error("download_failed");
      const blob = await answer.blob(), url = URL.createObjectURL(blob);
      const link = h("a", { href: url, download: savedName(answer.headers?.get("content-disposition"), item, blob.type), hidden: true });
      node.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
    } catch {
      if (!gone) saving.textContent = l10n("다운로드하지 못했어요.", "Couldn't download it.");
    } finally {
      saver.removeAttribute("aria-busy");
    }
  });
  const refit = () => {
    if (!natural || gone) return;
    const fitted = !zoomed();
    if (!measure()) return;
    if (fitted) {
      z = fitZ;
      x = 0;
      y = 0;
    } else z = Math.max(z, fitZ);
    bound();
    paint(false);
  };
  if (embed && typeof win.ResizeObserver === "function") {
    watch = new win.ResizeObserver(refit);
    watch.observe(node);
  } else on(win, "resize", refit);
  function configure({ onShow: told = null, controls = true, download }) {
    onShow = told;
    for (const control of [zoomOut, zoomIn, fitter]) control.hidden = !controls;
    saver.hidden = !(download ?? !embed);
  }
  configure(settings);
  if (embed) host.append(node);
  else {
    document.body.append(node);
    if (typeof node.showModal === "function") {
      try {
        node.showModal();
      } catch {
        node.setAttribute("open", "");
      }
    } else node.setAttribute("open", "");
    if (phone && typeof win.history?.pushState === "function") {
      if (!popWired) {
        win.addEventListener?.("popstate", onPop);
        popWired = true;
      }
      win.history.pushState({ imageViewer: true }, "");
      pushed = true;
    }
    if (focus) stage.focus?.({ preventScroll: true });
  }
  if (embed && focus) raf(() => stage.focus?.({ preventScroll: true }));
  raf(() => {
    if (!closing) node.classList.add("is-open");
  });
  const handle = { node, mode: embed ? "embed" : "overlay", get index() {
    return at;
  }, get count() {
    return list.length;
  }, get zoom() {
    return z;
  }, get fit() {
    return fitZ;
  }, get open() {
    return !closing;
  }, show: (n) => Number.isInteger(n) && n !== at ? go(n - at) : false, next: () => go(1), prev: () => go(-1), zoomTo: (value, cx = 0, cy = 0) => zoomTo(value, cx, cy, true), fitView: () => fit(true), close: () => close(), destroy: () => destroy() };
  const view = { handle, load(items, n, source) {
    if (closing) return;
    list = items;
    from = source;
    show(n, 0, true);
  }, configure, popped() {
    if (pushed) close({ popped: true });
  }, finish };
  return view;
}
export function installImageViewer(root = document) {
  const click = (event) => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const img = event.composedPath?.()[0] ?? event.target;
    if (!viewable(img)) return;
    event.preventDefault();
    const { images, index } = collect(img);
    openViewer(images, index, { from: img });
  };
  root.addEventListener("click", click);
  return () => root.removeEventListener("click", click);
}
if (typeof document === "object" && document?.documentElement) installImageViewer(document);
