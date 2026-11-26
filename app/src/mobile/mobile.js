import { updateButton } from "../update.js";
import { createHostSwitches } from "../host-switches.js";
import { recoverStyles } from "../recover.js";
import { streamEvents, api } from "/client.js";
import { startStream, createPageStream } from "../stream.js";
import { buildModel, ms } from "../model.js";
import { resourceRows, resourcesHTML, switchButton } from "./resources.js";
import { iconButton } from "./icons.js";
import { createStatusRefresh, refreshRequest, LABEL as REFRESH } from "../status-refresh.js";
import { createJobs } from "../running.js";
import { workTree } from "./work.js";
import { viewName, viewShown, phoneRoute, routeHash, hashFor } from "./views.js";
import { menuHTML, paintTheme, createMenu } from "./menu.js";
import { createLeadSlot } from "./lead.js";
import { stepId, terminalId } from "../step-route.js";
import { itemHash } from "../item-route.js";
import { canonicalHash, boardTarget, routeAnchor } from "../routing.js";
import { watchStale } from "../stale.js";
import { has, onSettings, ledgerName } from "../names.js";
import { esc } from "./format.js";
recoverStyles();
for (const id of ["app", "drawer", "tooltip"]) document.getElementById(id)?.remove();
const PANELS = ["admin", "seats", "lead", "explorer"];
document.body.insertAdjacentHTML("afterbegin", '<div class="m-shell"><header class="m-head"><button type="button" class="m-brand" aria-haspopup="dialog" aria-expanded="false" aria-controls="m-nav"><span class="m-logo"><b class="brand-mark" aria-hidden="true"></b><i class="m-dot" aria-hidden="true" hidden></i></span><span class="m-title"></span></button><b class="m-problem" role="status" hidden></b><div class="m-slot"></div></header><main class="m-main">' + PANELS.map((key) => '<section class="m-panel' + (key === "lead" ? " m-lead" : "") + '" data-panel="' + key + '" aria-label="' + viewName(key) + '">' + (key === "lead" ? '<div class="m-chat"></div>' : key === "admin" ? '<div class="adm-phone" hidden></div>' : '<p class="m-loading">CONNECTING / ' + esc(ledgerName().toUpperCase()) + "</p>") + "</section>").join("") + "</main>" + menuHTML() + "</div>");
const shell = document.querySelector(".m-shell"), $ = (s) => shell.querySelector(s), root = document.documentElement;
document.querySelector(".m-head").append(updateButton());
const panels = Object.fromEntries([...shell.querySelectorAll("[data-panel]")].map((panel) => [panel.dataset.panel, panel]));
function paintPanels() {
  const main = $(".m-main"), want = PANELS.filter(viewShown).map((key) => panels[key]);
  if (want.length !== main.children.length || want.some((panel, i) => main.children[i] !== panel)) main.replaceChildren(...want);
}
paintPanels();
function lazyAdmin(root2, options = {}, load = () => import("../admin/admin.js"), css = () => new URL("../admin/admin.css", import.meta.url).href) {
  let admin2 = null, loading = null, want = null;
  function style() {
    if (document.querySelector("link[data-admin-style]")) return null;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = css();
    link.dataset.adminStyle = "";
    const loaded = new Promise((done) => {
      link.onload = link.onerror = done;
    });
    document.head.append(link);
    return loaded;
  }
  function ensure() {
    return loading ??= Promise.all([load(), style()]).then(([{ createAdmin }]) => {
      admin2 = createAdmin(root2, options);
      if (want) admin2.show(want.id, want.how);
      else admin2.hide();
      return admin2;
    }).catch((err) => {
      loading = null;
      console.error("Home Admin:", String(err?.message || err));
      if (want) root2.textContent = "Couldn't load Admin. Reload the page.";
      return null;
    });
  }
  return { show(id = null, how = {}) {
    want = { id, how };
    if (admin2) return admin2.show(id, how);
    root2.hidden = false;
    void ensure();
  }, hide() {
    want = null;
    if (admin2) admin2.hide();
    else root2.hidden = true;
  }, get data() {
    return admin2?.data ?? null;
  }, get shown() {
    return admin2 ? admin2.shown : want != null;
  }, get loaded() {
    return loading;
  } };
}
const admin = lazyAdmin(panels.admin.querySelector(".adm-phone"), { api });
const slots = {};
function leadSlot() {
  const kind = has("workspace") ? "ide" : "chat";
  for (const [other, slot] of Object.entries(slots)) if (other !== kind) {
    slot.hide?.();
    slot.unmount();
    delete slots[other];
  }
  return slots[kind] ??= kind === "ide" ? createIdeSlot() : createLeadSlot(panels.lead.querySelector(".m-chat"), void 0, (node) => setHead("lead", node));
}
const lead = { show: () => leadSlot().show(), hide: () => leadSlot().hide?.(), unmount: () => leadSlot().unmount(), get pending() {
  return leadSlot().pending ?? null;
}, get covers() {
  return !!leadSlot().covers;
} };
function createIdeSlot() {
  let mounting = null, ide = null, shown = false;
  return { show() {
    shown = true;
    if (ide) {
      ide.show?.(true);
      shell.inert = true;
    }
    mounting ??= import("../workspace/route.js").then((route2) => route2.mountPhoneIDE(document, { stream: pageStream })).then((off) => {
      ide = off;
      ide.show?.(shown);
      shell.inert = shown;
    }, (err) => {
      mounting = null;
      console.error("Home chat:", String(err?.message || err));
    });
    void mounting.then(() => {
      if (!shown) return;
      if (termNext != null) {
        const id = termNext;
        termNext = null;
        void ide?.terminal?.(id);
      }
      if (screenNext) {
        screenNext = false;
        void ide?.screen?.();
      }
      if (learnNext) {
        learnNext = false;
        void ide?.learn?.();
      }
      if (boardNext) {
        const board = boardNext;
        boardNext = null;
        void ide?.board?.(boardTarget(board.id));
      }
    });
    return mounting;
  }, hide() {
    shown = false;
    shell.inert = false;
    ide?.show?.(false);
  }, unmount() {
    const off = ide;
    ide = null;
    mounting = null;
    shown = false;
    shell.inert = false;
    try {
      off?.();
    } catch {
    }
  }, explore() {
    ide?.explore?.();
  }, get pending() {
    return ide ? null : mounting;
  }, get covers() {
    return !!ide && shown;
  } };
}
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ago = (v) => {
  const n = Math.max(0, Date.now() - ms(v));
  return !Number.isFinite(n) ? "—" : n < 6e4 ? Math.floor(n / 1e3) + "s" : n < 36e5 ? Math.floor(n / 6e4) + "m" : Math.floor(n / 36e5) + "h";
};
const hostSwitches = createHostSwitches(api, render, { button: switchButton });
let dashboard = null, fetched = null, ok = true, error = "", connected = false, retrying = false, stale = false, renderError = "";
let tab = null, paintCount = 0, lifecycle = null, place = null;
let template = null;
function patch(target, html) {
  template ??= document.createElement("template");
  template.innerHTML = html;
  merge(target, template.content);
}
function merge(a, b) {
  let seen = new Map();
  const key = (n) => {
    const k = n.nodeType === 1 ? n.nodeName + (n.getAttribute("data-key") ?? "." + (n.getAttribute("class") || "")) : "#" + n.nodeType, i = seen.get(k) || 0;
    seen.set(k, i + 1);
    return k + "#" + i;
  };
  const old = new Map([...a.childNodes].map((n) => [key(n), n]));
  seen = new Map();
  let ref = a.firstChild;
  for (const n of [...b.childNodes]) {
    const k = key(n), el = old.get(k), use = el || n;
    if (el) {
      old.delete(k);
      morph(el, n);
    }
    if (use === ref) ref = ref.nextSibling;
    else a.insertBefore(use, ref);
  }
  for (const n of old.values()) n.remove();
}
function morph(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  const own = (name) => name === "open" && a.nodeName === "DETAILS";
  for (const { name, value } of b.attributes) if (!own(name) && a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!own(name) && !b.hasAttribute(name)) a.removeAttribute(name);
  merge(a, b);
}
let pendingStep = null, termNext = null, boardNext = null, screenNext = false, learnNext = false;
function route(where = location) {
  const moved = canonicalHash(where);
  if (moved) window.history.replaceState(window.history.state, "", moved);
  const term = has("workspace") && has("terminals") ? terminalId(where.hash) : null;
  if (term != null) {
    termNext = term;
    window.history.replaceState(window.history.state, "", "#/workspace");
  }
  routeAnchor(where);
  const step = stepId(where.hash);
  if (step != null) {
    pendingStep = dashboard ? null : step;
    window.history.replaceState(window.history.state, "", dashboard ? itemHash({ kind: "step", id: step }, dashboard) : "#/workspace");
    return route(where);
  }
  const next = phoneRoute(where);
  if (!next.boards && !next.screen && !next.learn) return next;
  if (next.screen) screenNext = true;
  else if (next.learn) learnNext = true;
  else boardNext = { id: next.boardId };
  window.history.replaceState(window.history.state, "", "#/workspace");
  return { ...next, boards: false, boardId: null, screen: false, learn: false };
}
function settle(pattern, state, fallback) {
  if (!pattern.test(location.hash)) return;
  if (window.history.state?.[state]) window.history.back();
  else {
    window.history.replaceState(null, "", fallback());
    applyRoute();
  }
}
const placeKey = () => place?.tab ?? "admin";
let byLogo = false;
const menu = createMenu(shell, { current: placeKey, onOpen: () => {
  paintMenu();
  byLogo = true;
  go("#/menu", "phoneMenu");
  byLogo = false;
}, focus: () => byLogo ? $("#m-nav .m-item-link[aria-current]") : null, onClose: () => settle(/^#\/menu\/?$/, "phoneMenu", () => routeHash(place ?? { tab: "admin" })) });
let explorerView = null, explorerLoad = null, explorerShown = false;
const explorerFrames = new Map();
const explorer = { show() {
  explorerShown = true;
  explorerLoad ??= import("./explorer-tab.js").then(async ({ mountExplorerTab }) => {
    const bar = document.createElement("div");
    bar.className = "m-explorer-controls";
    const view = await mountExplorerTab(panels.explorer, bar);
    explorerView = view;
    setHead("explorer", bar);
    for (const frame of explorerFrames.values()) view.frame(frame);
    view.show(explorerShown);
  }).catch((error2) => {
    explorerLoad = null;
    console.error("Home Explorer:", error2);
    panels.explorer.textContent = "Couldn't load Explorer. Reload the page.";
  });
  explorerView?.show(true);
}, hide() {
  explorerShown = false;
  explorerView?.show(false);
}, frame(frame) {
  if (frame?.kind === "canvas" || frame?.kind === "dashboard") explorerFrames.set(frame.kind, frame);
  explorerView?.frame(frame);
} };
function go(hash, state) {
  if (location.hash !== hash) window.history.pushState({ [state]: true }, "", hash);
  applyRoute();
}
function applyRoute(force = false) {
  const next = route();
  if (next.tab === "admin" && !next.completed && next.card == null && next.goal == null && location.hash !== "#/admin") window.history.replaceState(window.history.state, "", "#/admin");
  if (next.menu) {
    if (!place) {
      place = { ...next, tab: "admin", menu: false };
      show(place, force);
      paintChrome();
    }
    paintMenu();
    menu.open();
    return;
  }
  if (menu.isOpen) menu.close();
  const before = place;
  place = next;
  show(next, force || !before);
  render();
  paintChrome();
}
function show(next, force) {
  if (!force && next.tab === tab) {
    if (tab === "admin") admin.show(next.card ?? null, { goal: next.goal ?? null });
    if (tab === "lead" && (boardNext || screenNext || learnNext || termNext != null)) void lead.show();
    return;
  }
  const before = tab;
  tab = next.tab;
  for (const [name, panel] of Object.entries(panels)) {
    panel.classList.toggle("on", name === tab);
    panel.setAttribute("aria-hidden", String(name !== tab));
  }
  showHead();
  if (tab !== "explorer") explorer.hide();
  if (tab === "lead") void lead.show();
  else lead.hide?.();
  if (tab === "explorer") explorer.show();
  if (tab === "admin") admin.show(next.card ?? null, { goal: next.goal ?? null });
  else admin.hide();
  if (before !== null && tab !== before && !reduced()) panels[tab].animate([{ opacity: 0, transform: "translateY(var(--enter-shift))" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
}
const heads = new Map();
function setHead(name, node) {
  if (node) heads.set(name, node);
  else heads.delete(name);
  showHead();
}
function showHead() {
  const node = heads.get(tab) ?? null, slot = $(".m-slot");
  if (slot.firstChild !== node) slot.replaceChildren(...node ? [node] : []);
}
const refreshHead = Object.assign(document.createElement("div"), { className: "m-refresh" });
const statusRefresh = createStatusRefresh({ post: refreshRequest(api), changed: () => render() });
const jobs = createJobs({ changed: () => {
  if (tab === "seats") render();
} });
const paintRefresh = () => patch(refreshHead, statusRefresh.html((attrs) => iconButton("retry", REFRESH, { klass: "m-refresh-button", attrs })));
paintRefresh();
if (has("seats")) setHead("seats", refreshHead);
function paintChrome() {
  const name = viewName(placeKey()), title = $(".m-title");
  if (title.textContent !== name) {
    const first = !title.textContent;
    title.textContent = name;
    if (!first && !reduced()) title.animate([{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  const label = "Menu, " + name;
  if ($(".m-brand").getAttribute("aria-label") !== label) $(".m-brand").setAttribute("aria-label", label);
}
function paintMenu() {
  menu.paint();
  paintTheme($("#m-nav .m-theme"), root.dataset.theme);
}
function renderFailed(err) {
  const message = String(err?.message || err);
  if (renderError !== message) console.error("Home render:", message);
  renderError = message;
  renderChrome();
  return false;
}
function renderChrome() {
  paintTheme($("#m-nav .m-theme"), root.dataset.theme);
  const age = Date.now() - ms(fetched), problem = renderError ? "RENDER ERROR" : !ok ? ledgerName().toUpperCase() + " ERROR" : stale ? "STALE" : !connected && retrying ? "RETRY" : age > 9e4 ? "DATA −" + ago(fetched) : "";
  const label = $(".m-problem");
  label.textContent = problem;
  label.hidden = !problem;
  label.title = "Fetched " + (fetched || "—") + (error ? " · " + error : "") + (renderError ? " · " + renderError : "");
}
function render() {
  renderChrome();
  paintRefresh();
  if (!dashboard) return true;
  if (lead.covers) return true;
  try {
    const now = Date.now(), model = buildModel(dashboard, now), tree = workTree(model, now);
    if (tab === "seats") {
      if (!document.hidden) jobs.draw(now);
      patch(panels.seats, (has("seats") ? statusRefresh.noteHTML("m-refresh-note") : "") + resourcesHTML(resourceRows(model), hostSwitches, jobs.view(model.goals, now)));
    }
    for (const dot of shell.querySelectorAll(".m-logo>.m-dot")) {
      dot.hidden = tree.tone === "idle";
      dot.dataset.state = tree.tone;
    }
    paintMenu();
    paintCount++;
    root.dataset.rendered = String(paintCount);
    return true;
  } catch (err) {
    return renderFailed(err);
  }
}
function handleFrame(frame) {
  const previous = { dashboard, fetched, ok, error };
  try {
    if (!frame || typeof frame !== "object") return false;
    explorer.frame(frame);
    if (frame.kind !== "dashboard") return true;
    const payload = frame.payload || {};
    ok = payload.ok !== false;
    error = payload.error ? String(payload.error) : "";
    fetched = payload.fetched_at || fetched;
    if (payload.dashboard && typeof payload.dashboard === "object") {
      dashboard = payload.dashboard;
      hostSwitches.observe(dashboard.hosts, dashboard.controller);
      statusRefresh.update(dashboard);
      if (!render()) {
        ({ dashboard, fetched, ok, error } = previous);
        return false;
      }
      renderError = "";
      if (pendingStep != null) {
        const id = pendingStep;
        pendingStep = null;
        if (/^#\/workspace\/?$/.test(location.hash)) {
          window.history.replaceState(null, "", itemHash({ kind: "step", id }, dashboard));
          applyRoute();
        }
      }
    }
    stale = false;
    renderChrome();
    return true;
  } catch (err) {
    ({ dashboard, fetched, ok, error } = previous);
    return renderFailed(err);
  }
}
const themeColor = document.querySelector('meta[name="theme-color"]') || document.head.appendChild(Object.assign(document.createElement("meta"), { name: "theme-color" }));
const paintThemeColor = () => {
  themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#f3f3ec";
};
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("artemis-home-theme", theme);
  } catch {
  }
  const url = new URL(location.href);
  url.searchParams.set("theme", theme);
  window.history.replaceState(window.history.state, "", url);
  paintThemeColor();
  renderChrome();
}
shell.addEventListener("click", (e) => {
  if (hostSwitches.click(e)) return;
  if (e.target.closest("[data-status-refresh]")) {
    statusRefresh.press();
    return;
  }
  const plain = !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  const link = e.target.closest(".m-item-link[data-view]");
  if (link) {
    if (!plain) return;
    e.preventDefault();
    const name = link.dataset.view;
    window.history.replaceState(null, "", hashFor(name));
    applyRoute();
    if (name === "seats") panels[name].scrollTo({ top: 0 });
    return;
  }
  if (e.target.closest(".m-theme")) setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});
window.addEventListener("popstate", () => applyRoute());
window.addEventListener("hashchange", () => applyRoute());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
const pageStream = createPageStream({ start: startStream, read: streamEvents, onFrame: handleFrame, onConnection: (live) => {
  connected = live;
  if (live) stale = false;
  retrying = !live;
  renderChrome();
}, onStale: () => {
  stale = true;
  connected = false;
  renderChrome();
}, onUnauthorized: () => location.assign("/login") });
function startRuntime() {
  if (lifecycle) return;
  lifecycle = new AbortController();
  connected = false;
  retrying = false;
  renderChrome();
  pageStream.start(lifecycle.signal, { wait: lead.pending ?? null });
}
function stopRuntime() {
  lifecycle?.abort();
  lifecycle = null;
  lead.unmount();
}
window.addEventListener("pagehide", stopRuntime);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    startRuntime();
    applyRoute(true);
  }
});
for (const [target, name] of [[document, "visibilitychange"], [document, "resume"], [window, "focus"]]) target.addEventListener(name, () => {
  if (!lifecycle && document.visibilityState !== "hidden") {
    startRuntime();
    applyRoute(true);
  }
});
const initial = route();
window.history.replaceState(null, "", routeHash(initial));
onSettings(() => {
  paintPanels();
  paintMenu();
  applyRoute();
  if (tab === "lead") void lead.show();
});
paintThemeColor();
applyRoute(true);
startRuntime();
watchStale();
