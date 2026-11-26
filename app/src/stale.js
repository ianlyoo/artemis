import { offerReload } from "./update.js";
export const STALE = Object.freeze({ hidden: 6e4, every: 10 * 6e4 });
const BUILD = /\/static\/([0-9a-f]{12})\//;
export const buildOf = (text) => String(text ?? "").match(BUILD)?.[1] ?? null;
const holds = new Set();
export function holdReload(hold) {
  holds.add(hold);
  return () => {
    holds.delete(hold);
  };
}
export function held() {
  for (const hold of holds) {
    try {
      if (hold()) return true;
    } catch {
      return true;
    }
  }
  return false;
}
export function watchStale({ view = globalThis, doc = view.document, own = buildOf(import.meta.url), read = readBuild, notify = () => offerReload({ view, update: true }), later = (fn, ms) => view.setTimeout(fn, ms), cancel = (id) => view.clearTimeout(id) } = {}) {
  if (!own || !doc || inDrafts(view)) return () => {
  };
  let timer = 0, done = false;
  async function check() {
    let served = null;
    try {
      served = buildOf(await timed(read(), RESUME.ask, view));
    } catch {
    }
    if (done) return;
    if (served && served !== own) {
      done = true;
      notify();
      return;
    }
    arm();
  }
  function arm(wait = STALE.every) {
    cancel(timer);
    if (!done) timer = later(check, wait);
  }
  const visibility = () => arm(doc.visibilityState === "hidden" ? STALE.hidden : STALE.every);
  doc.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    done = true;
    cancel(timer);
    doc.removeEventListener("visibilitychange", visibility);
  };
}
const readBuild = () => import("/client.js").then(({ api }) => api("/", { headers: { accept: "text/html" } })).then((r) => r.ok ? r.text() : "");
function safeSession(view) {
  try {
    return view.sessionStorage;
  } catch {
    return null;
  }
}
export const RESUME = Object.freeze({ key: "home-resume-reload", gap: 6e4, wait: 2e4, boot: 4e4, again: 3e3, ask: 8e3, quiet: 5e3 });
export const RECOVERED = "home:connected";
export const STARTED = "home:started";
function freeOf(doc) {
  let composing = false;
  const start = () => {
    composing = true;
  }, end = () => {
    composing = false;
  };
  doc?.addEventListener?.("compositionstart", start, true);
  doc?.addEventListener?.("compositionend", end, true);
  return { free: () => !composing && !held() && !doc?.querySelector?.("dialog[open]"), stop: () => {
    doc?.removeEventListener?.("compositionstart", start, true);
    doc?.removeEventListener?.("compositionend", end, true);
  } };
}
const timed = (promise, ms, view = globalThis) => new Promise((resolve, reject) => {
  const timer = view.setTimeout(() => reject(Error("timeout")), ms);
  Promise.resolve(promise).then((value) => {
    view.clearTimeout(timer);
    resolve(value);
  }, (error) => {
    view.clearTimeout(timer);
    reject(error);
  });
});
let pageFree = null;
export async function recoverPage({ view = globalThis, doc = view.document, storage = safeSession(view), now = () => Date.now(), free = () => (pageFree ??= freeOf(doc)).free(), reachable = () => view.fetch("/healthz", { cache: "no-store" }).then((r) => r.ok), notify = () => offerReload({ view }) } = {}) {
  const seen = () => doc?.visibilityState !== "hidden" && view.navigator?.onLine !== false;
  if (!seen() || !free()) return false;
  try {
    if (now() - Number(storage?.getItem(RESUME.key) || 0) < RESUME.gap) return false;
  } catch {
    return false;
  }
  if (!await timed(reachable(), RESUME.ask, view).catch(() => false) || !seen() || !free()) return false;
  try {
    storage?.setItem(RESUME.key, String(now()));
  } catch {
    return false;
  }
  notify();
  return true;
}
const inDrafts = (view) => {
  try {
    return new URL(view.location.href).pathname.startsWith("/drafts/");
  } catch {
    return false;
  }
};
export function watchResume({ view = globalThis, doc = view.document, own = buildOf(import.meta.url), read = readBuild, notify = () => offerReload({ view, update: true }), now = () => Date.now() } = {}) {
  if (!own || !doc || inDrafts(view)) return () => {
  };
  let asking = false, asked = -Infinity, done = false;
  async function check() {
    if (done || asking || doc.visibilityState === "hidden" || now() - asked < RESUME.quiet) return;
    asking = true;
    let served = null;
    try {
      served = buildOf(await timed(read(), RESUME.ask, view));
    } catch {
    } finally {
      asking = false;
    }
    if (done) return;
    if (served) asked = now();
    if (served && served !== own) {
      done = true;
      notify();
    }
  }
  const on = () => {
    void check();
  };
  for (const name of ["visibilitychange", "resume"]) doc.addEventListener(name, on);
  for (const name of ["pageshow", "online", RECOVERED]) view.addEventListener?.(name, on);
  on();
  return () => {
    done = true;
    for (const name of ["visibilitychange", "resume"]) doc.removeEventListener(name, on);
    for (const name of ["pageshow", "online", RECOVERED]) view.removeEventListener?.(name, on);
  };
}
export function watchStartup({ view = globalThis, doc = view.document, wait = RESUME.boot, recover = () => recoverPage({ view, doc }), later = (fn, ms) => view.setTimeout(fn, ms), cancel = (id) => view.clearTimeout(id) } = {}) {
  if (!doc || inDrafts(view)) return () => {
  };
  let timer = 0, over = false;
  const stop = () => {
    over = true;
    cancel(timer);
    for (const name of [STARTED, RECOVERED]) view.removeEventListener?.(name, stop);
    doc.removeEventListener?.("visibilitychange", seen);
  };
  const arm = (ms) => {
    cancel(timer);
    timer = over ? 0 : later(check, ms);
  };
  async function check() {
    timer = 0;
    if (over) return;
    if (doc.visibilityState === "hidden") return;
    if (await recover().catch(() => false)) {
      over = true;
      return;
    }
    arm(RESUME.again);
  }
  function seen() {
    if (doc.visibilityState === "hidden") {
      cancel(timer);
      timer = 0;
    } else arm(wait);
  }
  for (const name of [STARTED, RECOVERED]) view.addEventListener?.(name, stop);
  doc.addEventListener?.("visibilitychange", seen);
  if (doc.visibilityState !== "hidden") arm(wait);
  return stop;
}
