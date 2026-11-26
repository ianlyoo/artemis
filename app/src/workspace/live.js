import { startStream } from "../stream.js";
import { homeApi, postJSON, paths } from "./api.js";
import { dashboardFrame } from "./extensions.js";
export const WATCH_MAX = 20;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const streamId = (random = (n) => crypto.getRandomValues(new Uint8Array(n))) => Array.from(random(24), (byte) => ALPHABET[byte & 63]).join("");
export function readEvents(api, path, seed = () => null) {
  return async function streamEvents(onEvent, signal, { patch = false, ownerReset = false, ownerSeed = () => {
  }, progress = () => {
  } } = {}) {
    const response = await api(patch ? path + (path.includes("?") ? "&" : "?") + "patch=1&chat=append&owner_patch=1" + (ownerReset ? "&owner_reset=1" : "") : path, { signal });
    if (!response.ok) throw Error(`ARTEMIS stream HTTP ${response.status}`);
    ownerSeed(ownerReset ? null : seed());
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        progress();
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 8 * 1024 * 1024) throw Error("Oversized ARTEMIS event");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
          if (data) onEvent(JSON.parse(data));
        }
      }
    } finally {
      await reader.cancel().catch(() => {
      });
    }
  };
}
export const TABS_MAX = 60;
export const pageFocused = (doc = globalThis.document) => !!doc && doc.visibilityState !== "hidden" && doc.hasFocus?.() === true;
export function watchSight(report, { doc = globalThis.document, win = globalThis.window, signal } = {}) {
  const changed = () => setTimeout(report, 0);
  doc?.addEventListener?.("visibilitychange", changed, { signal });
  for (const name of ["focus", "blur"]) win?.addEventListener?.(name, changed, { signal });
}
const WATCHED = /^(?:(?:file|board):.|draft:[a-z0-9-]{1,80}$|preview:[0-9a-f]{8}$)/s;
export function createWatch({ id = streamId(), api = homeApi, post = postJSON, onChanged = () => {
}, onRefused = () => {
}, device = null, tabs = null, onTab = () => {
} } = {}) {
  let want = [], sentKey = null, up = false, sending = null, again = false;
  const report = () => {
    if (!device || !tabs) return {};
    const now = tabs(), open = (now.tabs ?? []).filter((tab) => typeof tab.target === "string" && tab.target.length <= 4200).slice(0, TABS_MAX);
    return { device, visible: !!now.visible, focused: now.focused === true, shown: open.some((tab) => tab.target === now.shown) ? now.shown : null, tabs: open.map((tab) => ({ target: tab.target, title: [...String(tab.title ?? "")].slice(0, 120).join("") })) };
  };
  function flush() {
    if (!up) return Promise.resolve();
    if (sending) {
      again = true;
      return sending;
    }
    const list = want, body = { stream: id, targets: list, ...report() }, key = JSON.stringify(body);
    if (key === sentKey) return Promise.resolve();
    sending = post(api, paths.watch(), body, { expected: ["404 not_found"] }).then((answer) => {
      if (!answer.ok) {
        sentKey = null;
        return;
      }
      sentKey = key;
      for (const item of answer.body.refused ?? []) onRefused(item);
    }, () => {
      sentKey = null;
    }).finally(() => {
      sending = null;
      if (again) {
        again = false;
        void flush();
      }
    });
    return sending;
  }
  return { id, get targets() {
    return want;
  }, get live() {
    return up;
  }, set(keys) {
    want = [...new Set(keys.filter((key) => typeof key === "string" && WATCHED.test(key)))].slice(0, WATCH_MAX);
    return flush();
  }, report: () => flush(), connection(live) {
    if (live === up) return Promise.resolve();
    up = live;
    sentKey = live && !want.length && !device ? JSON.stringify({ stream: id, targets: [] }) : null;
    return live ? flush() : Promise.resolve();
  }, frame(frame) {
    if (frame?.kind === "ide.tab") {
      const { do: act, target: target2 } = frame.payload ?? {};
      if ((act === "show" || act === "close") && typeof target2 === "string") onTab({ do: act, target: target2 });
      return true;
    }
    if (frame?.kind !== "ide.changed") return false;
    const target = frame.payload?.target;
    if (typeof target === "string" && want.includes(target)) onChanged({ target, mtime: typeof frame.payload.mtime === "string" ? frame.payload.mtime : null });
    return true;
  } };
}
export function changedAction(key, { shown, open }) {
  if (shown === key) return "reload";
  return open.includes(key) ? "mark" : "none";
}
function liveFrame(frame, { watch, store }) {
  if (watch.frame(frame)) return true;
  if (frame?.kind === "canvas") store.canvas(frame.payload);
  else if (frame?.kind === "dashboard") store.dashboard(frame.payload);
  return true;
}
const quietChat = { frame: () => false, connection() {
} };
export function startLive({ api = homeApi, watch, store, chat = quietChat, signal, start = startStream, onUnauthorized = () => {
}, dashboard = () => {
}, connection = () => {
}, stale = () => {
} }) {
  return start({ streamEvents: readEvents(api, "/events?ide=" + encodeURIComponent(watch.id), () => store.ownerView()), signal, chat, onFrame: (frame) => {
    if (frame?.kind === "dashboard") dashboard(frame.payload);
    return liveFrame(frame, { watch, store });
  }, onConnection: (live) => {
    void watch.connection(live);
    connection(live);
  }, onStale: stale, onUnauthorized });
}
export function ridePhone({ stream, api = homeApi, watch, store, dashboard = () => {
}, connection = () => {
}, stale = () => {
} }) {
  return stream.ride({ read: readEvents(api, "/events?ide=" + encodeURIComponent(watch.id), () => store.ownerView()), frame: (frame) => {
    if (frame?.kind === "dashboard") dashboard(frame.payload);
    return liveFrame(frame, { watch, store });
  }, connection: (live) => {
    void watch.connection(live);
    connection(live);
  }, stale });
}
export function rideLive({ stream, api = homeApi, watch, store }) {
  let held = null;
  const take = (frame) => {
    const done = liveFrame(frame, { watch, store });
    if (frame?.kind === "dashboard") dashboardFrame(frame.payload);
    return done;
  };
  const letGo = stream.ride({ read: readEvents(api, "/events?ide=" + encodeURIComponent(watch.id), () => store.ownerView()), frame: (frame) => {
    if (!held) return take(frame);
    if (!watch.frame(frame) && (frame?.kind === "canvas" || frame?.kind === "dashboard")) held[frame.kind] = frame;
    return true;
  }, connection: (live) => {
    void watch.connection(live);
  } });
  letGo.away = (on) => {
    if (on) {
      held ??= {};
      return;
    }
    const kept = held;
    held = null;
    for (const frame of [kept?.canvas, kept?.dashboard]) if (frame) take(frame);
  };
  return letGo;
}
