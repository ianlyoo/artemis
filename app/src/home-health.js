import { offerReload } from "./update.js";
export const HEALTH = Object.freeze({ what: 300, every: 10 * 6e4, page: 20, batch: 5e3, gather: 1e3, poll: 5e3, path: "/ide/health" });
const PROBLEM = "#connection, .m-problem";
const HOLD = Object.freeze({ RETRY: 6e4, STALE: 3e4, DATA: 3e4 });
const CONTENT = "pre, code, blockquote, textarea, input, [contenteditable], .msg, .cmd, .doc-page, .doc-sheet, .cm-editor";
const LINE = /^Couldn't (?:load|find)\b.{0,100}$/;
export function cleanPath(target, origin = globalThis.location?.origin ?? "http://home") {
  try {
    const url = new URL(String(target), origin), kept = url.searchParams.getAll("path");
    const path = url.origin === origin ? url.pathname : url.origin + url.pathname;
    return path + (kept.length ? "?" + kept.map((p) => "path=" + encodeURIComponent(p)).join("&") : "");
  } catch {
    return String(target).split("?")[0].slice(0, 200);
  }
}
const fileOf = (src) => cleanPath(src).replace(/^\/static\/[0-9a-f]{12}\//, "");
const one = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
export function textOf(value) {
  if (value instanceof Error || value?.message && value?.name) return one(value.name + ": " + value.message);
  if (typeof value === "string") return one(value);
  try {
    return one(JSON.stringify(value));
  } catch {
    return one(String(value));
  }
}
export const viewOf = (hash) => "#/" + String(hash ?? "").replace(/^#\/?/, "").split(/[/?&]/)[0].replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
export function createHealth({ now = () => Date.now(), later = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), send, view = () => viewOf(globalThis.location?.hash), device = "pc", build = null, old = () => {
} } = {}) {
  const seen = /* @__PURE__ */ new Map(), queue = [];
  let sent = 0, timer = 0, last = -Infinity;
  function report(kind, what) {
    try {
      if (IMPORT_FAILED.test(what)) what = String(what).replace(/https?:\/\/[^\s"'<>]+/g, (url) => new URL(url).pathname);
      what = one(what).slice(0, HEALTH.what);
      if (!what || sent >= HEALTH.page) return false;
      const key = kind + "\0" + what, at = now();
      if (at - (seen.get(key) ?? -Infinity) < HEALTH.every) return false;
      seen.set(key, at);
      sent++;
      queue.push({ view: view(), kind, what, ...build ? { build } : {} });
      if (!timer) timer = later(flush, Math.max(HEALTH.gather, last + HEALTH.batch - at));
      return true;
    } catch {
      return false;
    }
  }
  function flush() {
    timer = 0;
    if (!queue.length) return;
    last = now();
    const reports = queue.splice(0);
    try {
      Promise.resolve(send({ device, reports })).then((answer) => {
        if (answer?.reload === true) old();
      }).catch(() => {
      });
    } catch {
    }
  }
  function answered(verb, path, status, body, expected) {
    if (!status) return report("request", verb + " " + path + " failed: " + textOf(body));
    const error = typeof body?.error === "string" ? body.error : "";
    const refusal = typeof body?.refusal_reason === "string" ? body.refusal_reason : "";
    const code = [body?.error, refusal ? "reason=" + refusal : null, body?.detail].filter((v) => typeof v === "string" && v).map((v) => v.slice(0, 120)).join(": ");
    if (Array.isArray(expected) && (expected.includes(String(status)) || error && expected.includes(status + " " + error))) return false;
    return report("request", verb + " " + (refusal ? path.split("?")[0] : path) + " " + status + (code ? " " + code : ""));
  }
  function watch(method, target, answer, expected) {
    try {
      const path = cleanPath(target);
      if (path === HEALTH.path) return;
      const verb = String(method || "GET").toUpperCase();
      Promise.resolve(answer).then(async (response) => {
        if (!response || response.status < 400) return;
        let body = null;
        try {
          body = await response.clone().json();
        } catch {
        }
        answered(verb, path, response.status, body, expected);
      }, (error) => {
        if (error?.name !== "AbortError") answered(verb, path, 0, error);
      }).catch(() => {
      });
    } catch {
    }
  }
  function note(method, target, { status, body = null, why = "network error" } = {}) {
    try {
      const path = cleanPath(target);
      if (path === HEALTH.path) return false;
      return answered(String(method || "GET").toUpperCase(), path, Number(status) || 0, Number(status) ? body : why);
    } catch {
      return false;
    }
  }
  return { report, watch, note, flush, get pending() {
    return queue.length;
  }, get sent() {
    return sent;
  }, close() {
    cancel(timer);
    timer = 0;
  } };
}
export function watchStates(health, { doc = globalThis.document, now = () => Date.now(), every = (fn, ms) => setInterval(fn, ms) } = {}) {
  const lines = new Set(), shown = (el) => !el.closest?.("[hidden]") && !el.closest?.(CONTENT);
  const look = (node) => {
    if (node.nodeType === 3) {
      const text = one(node.data);
      if (LINE.test(text) && node.parentElement && shown(node.parentElement)) health.report("state", text);
      return;
    }
    if (node.nodeType !== 1 || !node.textContent?.includes("Couldn't")) return;
    const walk = doc.createTreeWalker(node, 4);
    for (let text = walk.nextNode(); text; text = walk.nextNode()) look(text);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") lines.add(record.target);
      else for (const node of record.addedNodes) lines.add(node);
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  const since = new Map();
  const poll = () => {
    try {
      for (const node of lines) {
        if (node.isConnected) look(node);
      }
      lines.clear();
      if (doc.visibilityState === "hidden") {
        since.clear();
        return;
      }
      const shownNow = new Set();
      for (const label of doc.querySelectorAll(PROBLEM)) {
        const text = one(label.textContent);
        if (label.hidden || !text) continue;
        const why = one(label.title).replace(/^Fetched \S+( · )?/, "");
        const held = Object.keys(HOLD).find((name) => text.startsWith(name));
        if (held) {
          shownNow.add(held);
          if (!since.has(held)) since.set(held, now());
          if (now() - since.get(held) >= HOLD[held]) health.report("state", held === "RETRY" ? "event stream connecting for over 60 s" : held === "DATA" ? "masthead DATA stale for over 30 s (no fresh frame)" : "masthead STALE for over 30 s" + (why ? " · " + why : ""));
          continue;
        }
        health.report("state", "masthead " + (text.startsWith("DATA") ? "DATA stale (no fresh frame for 90 s)" : text) + (why ? " · " + why : ""));
      }
      for (const name of since.keys()) if (!shownNow.has(name)) since.delete(name);
    } catch {
    }
  };
  every(poll, HEALTH.poll);
  return () => observer.disconnect();
}
export const BENIGN = /^(Uncaught )?ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
export const RELOAD = Object.freeze({ key: "artemis.module-reload", gap: 6e4, poll: 3e3, give: 30 * 6e4 });
export const IMPORT_FAILED = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
export function createModuleRecovery({ now = () => Date.now(), later = (fn, ms) => setTimeout(fn, ms), storage = null, notify, probe, unsent = () => false } = {}) {
  let since = null;
  const mark = () => {
    try {
      return Number(storage?.getItem(RELOAD.key)) || -Infinity;
    } catch {
      return -Infinity;
    }
  };
  async function look(url) {
    try {
      if (now() - since > RELOAD.give) {
        since = null;
        return;
      }
      if (await probe(url).catch(() => false) && !unsent()) {
        try {
          storage?.setItem(RELOAD.key, String(now()));
        } catch {
        }
        notify();
        return;
      }
    } catch {
    }
    later(() => void look(url), RELOAD.poll);
  }
  return { failed(url) {
    if (since !== null || now() - mark() < RELOAD.gap) return false;
    since = now();
    later(() => void look(url), RELOAD.poll);
    return true;
  }, get waiting() {
    return since !== null;
  } };
}
export async function recovered(url, { head, index, own }) {
  if (await head(url).catch(() => false)) return true;
  const served = String(await index().catch(() => "")).match(/\/static\/([0-9a-f]{12})\//)?.[1] ?? null;
  return Boolean(served && own && served !== own);
}
const FRONT_FILE = /^\/(?:static\/[0-9a-f]{12}\/|fonts\/)/;
export function createFrontLosses({ report, later = (fn, ms) => setTimeout(fn, ms) }) {
  const open = new Map();
  return function lost(path, status) {
    if (!FRONT_FILE.test(path)) return report("request", "GET " + path + " " + status);
    const episode = open.get(status);
    if (episode) {
      episode.more++;
      return true;
    }
    open.set(status, { first: path, more: 0 });
    later(() => {
      const { first, more } = open.get(status);
      open.delete(status);
      report("request", "GET " + first + " " + status + (more ? ` (and ${more} more front file${more === 1 ? "" : "s"})` : ""));
    }, HEALTH.gather);
    return true;
  };
}
export const RESTYLE = Object.freeze([1e3, 5e3]);
export function restyle(link, { origin, later = (fn, ms) => setTimeout(fn, ms) }) {
  if (link?.tagName !== "LINK" || !/(^|\s)stylesheet(\s|$)/i.test(link.rel ?? "")) return false;
  let url;
  try {
    url = new URL(link.href);
  } catch {
    return false;
  }
  const tries = Number(link.dataset?.restyle) || 0;
  if (url.origin !== origin || !url.pathname.endsWith(".css") || tries >= RESTYLE.length) return false;
  link.dataset.restyle = String(tries + 1);
  later(() => {
    url.searchParams.set("retry", String(tries + 1));
    link.href = url.href;
  }, RESTYLE[tries]);
  return true;
}
export function unsentWork(win = globalThis) {
  const doc = win.document;
  if (doc.querySelector('.msg[data-state="sending"], .msg[data-state="failed"], .msg[data-state="unknown"], .msg[data-state="refused"]')) return true;
  if ([...doc.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="search"]')].some((box) => box.value?.trim() && !box.readOnly && !box.disabled)) return true;
  if ([...doc.querySelectorAll('[contenteditable="true"], [contenteditable=""]')].some((box) => !box.closest(".cm-editor") && box.textContent.trim())) return true;
  try {
    return !win.dispatchEvent(new win.Event("beforeunload", { cancelable: true }));
  } catch {
    return false;
  }
}
export function startHealth(win = globalThis) {
  if (win.homeHealth || !win.document || new URL(win.location.href).pathname.startsWith("/drafts/")) return win.homeHealth ?? null;
  const send = (body) => import("/client.js").then((client) => client.api(HEALTH.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })).then((response) => response.ok ? response.json() : null);
  const health = createHealth({ send, device: win.matchMedia?.("(max-width: 767.98px)").matches ? "phone" : "pc", build: String(import.meta.url).match(/\/static\/([0-9a-f]{12})\//)?.[1] ?? null, old: () => offerReload({ view: win, update: true }) });
  win.homeHealth = health;
  const recovery = createModuleRecovery({ storage: (() => {
    try {
      return win.sessionStorage;
    } catch {
      return null;
    }
  })(), notify: () => offerReload({ view: win }), probe: (url) => recovered(url, { head: (file) => win.fetch(file, { method: "HEAD", cache: "no-store", credentials: "same-origin" }).then((response) => response.ok), index: () => win.fetch(new URL("/", win.location.href), { cache: "no-store", credentials: "same-origin" }).then((response) => response.ok ? response.text() : ""), own: String(import.meta.url).match(/\/static\/([0-9a-f]{12})\//)?.[1] ?? null }), unsent: () => unsentWork(win) });
  const lost = (text, url) => {
    if (IMPORT_FAILED.test(text)) recovery.failed(String(text).match(/https?:\/\/\S+?\.(?:js|css)\b/)?.[0] ?? url);
  };
  const ours = (url) => {
    try {
      return new URL(url).origin === win.location.origin;
    } catch {
      return false;
    }
  };
  const original = win.console.error;
  win.console.error = function(...args) {
    try {
      const text = args.map(textOf).join(" ");
      health.report("console", text);
      lost(text, import.meta.url);
    } catch {
    }
    return original.apply(this, args);
  };
  win.addEventListener("error", (event) => {
    const target = event.target;
    if (target && target !== win && target.nodeType === 1) {
      const url = target.src || target.href;
      if (restyle(target, { origin: win.location.origin })) return;
      if (["SCRIPT", "LINK"].includes(target.tagName)) {
        health.report("exception", "failed to load " + new URL(url, win.location.href).pathname);
        if (ours(url) && /\.(js|css)$/.test(new URL(url).pathname)) recovery.failed(url);
      }
      return;
    }
    if (!event.error && BENIGN.test(String(event.message ?? ""))) return;
    const where = event.filename ? " (" + fileOf(event.filename) + ":" + (event.lineno || 0) + ")" : "";
    health.report("exception", textOf(event.error ?? event.message) + where);
  }, true);
  win.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.name !== "AbortError") {
      const text = textOf(event.reason);
      health.report("exception", "unhandled rejection: " + text);
      lost(text, import.meta.url);
    }
  });
  try {
    const lostFile = createFrontLosses({ report: (kind, what) => health.report(kind, what) });
    new win.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.responseStatus >= 400 && ["script", "link", "css"].includes(entry.initiatorType)) lostFile(cleanPath(entry.name), entry.responseStatus);
      }
    }).observe({ type: "resource", buffered: true });
  } catch {
  }
  const watching = () => {
    try {
      watchStates(health, { doc: win.document });
    } catch {
    }
  };
  if (win.document.readyState === "loading") win.document.addEventListener("DOMContentLoaded", watching, { once: true });
  else watching();
  win.addEventListener("pagehide", () => health.flush());
  return health;
}
if (globalThis.document && globalThis.window === globalThis) startHealth();
