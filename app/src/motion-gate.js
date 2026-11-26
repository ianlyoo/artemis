export const SETTLE = 600;
const doc = () => globalThis.document;
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const watched = () => {
  const d = doc();
  return !d || d.visibilityState !== "hidden" && (typeof d.hasFocus !== "function" || d.hasFocus());
};
let away = false, until = 0, timer = 0, watcher = null, queued = false;
const clock = () => typeof performance === "object" ? performance.now() : Date.now();
export function settle() {
  const d = doc();
  if (typeof d?.getAnimations !== "function") return;
  for (const animation of d.getAnimations()) {
    try {
      if (animation.playState === "paused" || animation.playState === "finished" || animation.playbackRate === 0) continue;
      if (animation.timeline && animation.timeline !== d.timeline) continue;
      if (!Number.isFinite(animation.effect?.getComputedTiming?.().endTime)) continue;
      animation.finish();
    } catch {
    }
  }
}
function sweep() {
  queued = false;
  if (!still()) {
    watch(false);
    return;
  }
  if (doc()?.visibilityState !== "hidden") settle();
}
function watch(on) {
  if (!on) {
    watcher?.disconnect();
    watcher = null;
    return;
  }
  if (watcher || typeof MutationObserver !== "function" || !doc()?.documentElement) return;
  watcher = new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(sweep);
    }
  });
  watcher.observe(doc().documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
}
export function hold(ms = SETTLE) {
  const end = clock() + ms;
  if (end <= until) return;
  until = end;
  watch(true);
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    if (!still()) watch(false);
  }, ms + 20);
}
function close() {
  away = true;
  watch(true);
}
function open() {
  away = false;
  hold(SETTLE);
  settle();
}
const check = () => {
  if (!watched()) {
    if (!away) close();
  } else if (away) open();
};
export const settling = () => {
  check();
  return away || clock() < until;
};
export const still = () => reducedMotion() || settling();
const w = globalThis.window;
if (w && typeof w.addEventListener === "function" && typeof doc()?.addEventListener === "function") {
  w.addEventListener("visibilitychange", check, true);
  w.addEventListener("focus", check, true);
  w.addEventListener("blur", () => setTimeout(check), true);
  w.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      away = true;
      check();
    }
  }, true);
  w.addEventListener("pagehide", close, true);
  doc().addEventListener("resume", check, true);
  doc().addEventListener("freeze", close, true);
  if (!watched()) close();
}
