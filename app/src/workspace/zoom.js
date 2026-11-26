import { el } from "../boards/dom.js";
export const ZOOM = { min: 0.8, max: 1.6, step: 0.1, base: 1 };
export const ZOOM_LABELS = { out: "Zoom out", in: "Zoom in", reset: "Back to 100 %", group: "Zoom the documents" };
export const ZOOM_KEYS = { out: "⌥⌘−", in: "⌥⌘=", reset: "⌥⌘0" };
export const FRAMED_NOTE = "A draft stays at 100 % · it is framed from its own origin";
export function clampZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return ZOOM.base;
  return Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(n * 10) / 10));
}
export const stepZoom = (value, by) => clampZoom(clampZoom(value) + by * ZOOM.step);
export const zoomText = (value) => Math.round(clampZoom(value) * 100) + " %";
export function zoomKey(event) {
  if (event?.getModifierState?.("AltGraph")) return null;
  if (!event?.altKey || !(event.metaKey || event.ctrlKey) || event.isComposing) return null;
  const code = String(event.code ?? ""), key = String(event.key ?? "");
  if (code === "Equal" || code === "NumpadAdd" || !code && (key === "=" || key === "+")) return "in";
  if (event.shiftKey) return null;
  if (code === "Minus" || code === "NumpadSubtract" || !code && (key === "-" || key === "−")) return "out";
  if (code === "Digit0" || code === "Numpad0" || !code && key === "0") return "reset";
  return null;
}
const LINE = 33, PAGE = 400;
export function wheelSteps({ notch = 50, pinch = 30, wait = 300 } = {}) {
  let sum = 0, last = -Infinity;
  return (event, now = Date.now()) => {
    const delta = Number(event.deltaY) * (event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? PAGE : 1);
    if (!Number.isFinite(delta) || !delta) return 0;
    if (now - last > wait) sum = 0;
    last = now;
    if (Math.abs(delta) >= notch) {
      sum = 0;
      return delta < 0 ? 1 : -1;
    }
    sum += delta;
    if (Math.abs(sum) < pinch) return 0;
    const step = sum < 0 ? 1 : -1;
    sum = 0;
    return step;
  };
}
export const paneKeys = (column, doc = document) => (target) => !target || target === doc || target === doc.body || target === doc.documentElement || !!column.contains(target) && !target.closest?.(".ide-term");
export function bindZoom({ pane, doc = document, keys, get, set, active = () => true, steps = wheelSteps() }) {
  const wheel = (event) => {
    if (!(event.ctrlKey || event.metaKey) || !active()) return;
    event.preventDefault();
    const by = steps(event, event.timeStamp || Date.now());
    if (by) set(stepZoom(get(), by));
  };
  let from = null;
  const gesture = (event) => {
    if (!active()) return;
    event.preventDefault();
    if (event.type === "gesturestart") from = get();
    else if (event.type === "gesturechange" && from != null) set(clampZoom(from * Number(event.scale || 1)));
    else if (event.type === "gestureend") from = null;
  };
  const key = (event) => {
    const what = zoomKey(event);
    if (!what || !active() || !keys(event.target)) return;
    event.preventDefault();
    set(what === "reset" ? ZOOM.base : stepZoom(get(), what === "in" ? 1 : -1));
  };
  pane.addEventListener("wheel", wheel, { passive: false });
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) pane.addEventListener(type, gesture, { passive: false });
  doc.addEventListener("keydown", key);
  return () => {
    pane.removeEventListener("wheel", wheel, { passive: false });
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) pane.removeEventListener(type, gesture, { passive: false });
    doc.removeEventListener("keydown", key);
  };
}
export function zoomControl({ set, get }) {
  const button = (cls, text, label, key) => el("button", { type: "button", class: "ide-zoom-" + cls, "aria-label": label, title: label + " · " + key }, text);
  const out = button("out", "−", ZOOM_LABELS.out, ZOOM_KEYS.out), now = button("now", zoomText(1), ZOOM_LABELS.reset, ZOOM_KEYS.reset), into = button("in", "+", ZOOM_LABELS.in, ZOOM_KEYS.in);
  const node = el("span", { class: "ide-zoom", role: "group", "aria-label": ZOOM_LABELS.group }, out, now, into);
  out.addEventListener("click", () => set(stepZoom(get(), -1)));
  into.addEventListener("click", () => set(stepZoom(get(), 1)));
  now.addEventListener("click", () => set(ZOOM.base));
  function paint(zoom, { framed = false } = {}) {
    const value = framed ? ZOOM.base : clampZoom(zoom);
    now.textContent = zoomText(value);
    out.disabled = framed || value <= ZOOM.min;
    into.disabled = framed || value >= ZOOM.max;
    now.disabled = framed;
    if (framed) node.setAttribute("title", FRAMED_NOTE);
    else node.removeAttribute("title");
    node.classList.toggle("is-framed", framed);
  }
  return { node, paint };
}
