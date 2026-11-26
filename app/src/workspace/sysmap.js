import { el } from "../boards/dom.js";
import { registerKind } from "./extensions.js";
import { stylesheet } from "./core.js";
import { homeApi, getJSON } from "./api.js";
import { readEvents } from "./live.js";
import { startStream, currentPageStream } from "../stream.js";
import { mountIsland } from "../islands/island.js";
import { parseMap, liveOverlay } from "./sysmap-data.js";
import { mapHash } from "../routing.js";
export const TARGET = Object.freeze({ kind: "sysmap", id: "system" });
function pageDashboard(fn) {
  const off = currentPageStream?.observe(fn);
  if (off) return off;
  const life = new AbortController();
  void startStream({ streamEvents: readEvents(homeApi, "/events"), signal: life.signal, onFrame: (frame) => {
    if (frame?.kind === "dashboard") fn(frame.payload);
  }, onConnection: (connected) => {
    if (!connected) fn(null);
  }, onStale: () => fn(null), onUnauthorized: () => location.assign("/login") });
  return () => life.abort();
}
const STALE_MS = 9e4;
export function mountSystemMap({ api = homeApi, subscribe = pageDashboard, chrome = "sheet", onTheme = null, route = null, onRoute = null } = {}) {
  void stylesheet("sysmap.css");
  const life = new AbortController();
  const host = el("div", { class: "sysmap-island" });
  const controls = chrome === "ide" ? el("div", { class: "sysmap-tools" }) : null;
  const node = el("section", { class: "sysmap", "aria-label": "Artemis System map" }, host, controls);
  let island = null, disposed = false, documentText = null;
  const loadDocument = () => documentText ??= api("/system-map?format=md", { signal: life.signal, cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw Error("Could not load the document. Try again.");
    return response.text();
  }).catch((error) => {
    documentText = null;
    throw error;
  });
  const theme = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const props = { chrome, state: "loading", map: null, live: null, loadDocument, onRetry: () => void load(), theme: theme(), onTheme: onTheme && (() => set({ theme: onTheme() })), route, onRoute, hashOf: mapHash };
  const set = (next) => {
    Object.assign(props, next);
    island?.update(next);
  };
  const room = controls && new ResizeObserver(() => node.style.setProperty("--sm-tools", controls.offsetWidth + "px"));
  room?.observe(controls);
  const staleTimer = setInterval(() => {
    if (props.live?.ok && (!props.live.at || Date.now() - Date.parse(props.live.at) > STALE_MS)) set({ live: { ...props.live, ok: false } });
  }, 1e4);
  const off = subscribe((payload) => set({ live: liveOverlay(payload) }));
  async function load() {
    set({ state: "loading" });
    try {
      const answer = await getJSON(api, "/system-map", { signal: life.signal, cache: "no-store" });
      if (disposed) return;
      if (!answer.ok) throw Error(answer.status === 404 ? "No map generated yet. The next ship builds it." : "Could not load the map. Try again.");
      set({ state: "ready", map: parseMap(answer.body), error: null });
    } catch (error) {
      if (!disposed) set({ state: "error", error: error.message });
    }
  }
  void load();
  mountIsland("sysmap", host, props).then((made) => {
    if (disposed) made.unmount();
    else island = made;
  }, () => {
    if (!disposed) host.replaceChildren(el("p", { class: "sysmap-failed" }, "The map could not load. Reload the page."));
  });
  return { node, controls, focus: () => host.querySelector('.sm-search input, [data-id][tabindex="0"]')?.focus(), route: (next) => set({ route: next }), dispose() {
    disposed = true;
    life.abort();
    clearInterval(staleTimer);
    off();
    room?.disconnect();
    island?.unmount();
  } };
}
export const showSystemMap = (open) => open({ ...TARGET });
registerKind("sysmap", { key: () => "sysmap:system", toTarget: (raw) => raw?.kind === "sysmap" ? { ...TARGET } : null, label: () => "Map", title: () => "Artemis System map", kept: true, render: ({ api }) => {
  const view = mountSystemMap({ api, chrome: "ide" });
  return { node: view.node, head: false, controls: view.controls, dispose: () => view.dispose() };
} });
