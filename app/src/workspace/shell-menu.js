import { menuHTML, createMenu } from "../mobile/menu.js";
import { viewName, hashFor } from "../mobile/views.js";
import { QUIET_MS } from "../quiet.js";
import { ledgerName } from "../names.js";
export const BRAND_HTML = '<button type="button" class="m-brand" aria-haspopup="dialog" aria-expanded="false" aria-controls="m-nav"><span class="m-logo"><b class="brand-mark" aria-hidden="true"></b><i class="m-dot" aria-hidden="true" hidden></i></span><span class="m-title"></span></button>';
const THEME_KEY = "artemis-home-theme";
const THEME_ICONS = { sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>', moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>' };
const themeIcon = (name) => '<svg class="m-ico" data-icon="' + name + '" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + THEME_ICONS[name] + "</svg>";
const themeName = (theme) => theme === "dark" ? "Light mode" : "Dark mode";
function paintTheme(button, theme) {
  const name = themeName(theme);
  if (button.title === name) return;
  button.innerHTML = themeIcon(theme === "dark" ? "sun" : "moon");
  button.title = name;
  button.setAttribute("aria-label", name);
}
const ago = (value) => {
  const n = Math.max(0, Date.now() - (value ? Date.parse(value) : NaN));
  return !Number.isFinite(n) ? "—" : n < 6e4 ? Math.floor(n / 1e3) + "s" : n < 36e5 ? Math.floor(n / 6e4) + "m" : Math.floor(n / 36e5) + "h";
};
export const problemLine = ({ ok = true, stale = false, connected = false, retrying = false, fetched = null }) => !ok ? ledgerName().toUpperCase() + " ERROR" : stale ? "STALE" : !connected && retrying ? "RETRY" : fetched && Date.now() - Date.parse(fetched) > 9e4 ? "DATA −" + ago(fetched) : "";
function mountMenu(page, view) {
  page.insertAdjacentHTML("beforeend", menuHTML());
  return createMenu(page, { current: () => view });
}
async function liveTree(dashboard) {
  const running = (await import("../requests.js")).runningSummary(dashboard);
  if (running) return { live: { length: running.count }, tone: running.tone };
  const [{ buildModel }, { workTree }] = await Promise.all([import("../model.js"), import("../mobile/work.js")]);
  const now = Date.now();
  return workTree(buildModel(dashboard, now), now);
}
export function shellMenu(page, bar, { view = "lead", onOpen = () => {
}, deps = {} } = {}) {
  const doc = deps.doc ?? document, win = deps.win ?? globalThis.window, mount = deps.mount ?? mountMenu, tree = deps.tree ?? liveTree;
  const storage = deps.storage ?? (() => {
    try {
      return win.localStorage;
    } catch {
      return null;
    }
  })();
  const opener = deps.opener ?? (() => {
    const box = doc.createElement("template");
    box.innerHTML = BRAND_HTML;
    return box.content.firstElementChild;
  })();
  opener.querySelector(".m-title").textContent = viewName(view);
  opener.setAttribute("aria-label", "Menu, " + viewName(view));
  bar.prepend(opener);
  const notice = doc.createElement("b");
  notice.className = "m-problem";
  notice.setAttribute("role", "status");
  notice.hidden = true;
  opener.after(notice);
  const feed = { ok: true, error: "", fetched: null, connected: false, retrying: false, stale: false };
  const paintNotice = () => {
    const line = problemLine(feed);
    if (notice.textContent !== line) notice.textContent = line;
    notice.hidden = !line;
    notice.title = "Fetched " + (feed.fetched || "—") + (feed.error ? " · " + feed.error : "");
  };
  const ticking = setInterval(paintNotice, 15e3);
  ticking.unref?.();
  page.classList.add("m-shell");
  page.dataset.nav = "closed";
  const menu = mount(page, view);
  const nav = page.querySelector(".m-nav");
  if (nav?.id) {
    nav.id = "ide-nav";
    opener.setAttribute("aria-controls", "ide-nav");
  }
  const themeItem = page.querySelector(".m-nav-theme");
  themeItem?.classList.add("m-icon", "m-theme");
  const themeColor = doc.querySelector('meta[name="theme-color"]') ?? doc.head?.appendChild(Object.assign(doc.createElement("meta"), { name: "theme-color" }));
  const showTheme = () => {
    if (themeItem) paintTheme(themeItem, doc.documentElement.dataset.theme);
    if (themeColor) themeColor.content = win.getComputedStyle?.(doc.documentElement).getPropertyValue("--paper").trim() || "#f3f3ec";
  };
  function setTheme(theme) {
    doc.documentElement.dataset.theme = theme;
    try {
      storage?.setItem(THEME_KEY, theme);
    } catch {
    }
    const url = new URL(win.location.href);
    url.searchParams.set("theme", theme);
    win.history.replaceState(win.history.state, "", url);
    showTheme();
  }
  showTheme();
  const clicked = (event) => {
    const link = event.target.closest?.(".m-nav-item[data-view]");
    if (link && page.contains(link)) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      menu.close();
      if (link.dataset.view === view) return;
      win.location.replace(hashFor(link.dataset.view));
      return;
    }
    if (event.target.closest?.(".m-nav-theme")) setTheme(doc.documentElement.dataset.theme === "dark" ? "light" : "dark");
  };
  page.addEventListener("click", clicked);
  const opened = () => {
    if (menu.isOpen) onOpen();
  };
  opener.addEventListener("click", opened);
  const badge = page.querySelector(".m-badge"), dots = [...page.querySelectorAll(".m-dot")].filter((dot) => dot.parentElement?.classList.contains("m-logo"));
  let asked = 0, gone = false, quiet = 0;
  function dashboard(payload) {
    if (payload && typeof payload === "object") {
      Object.assign(feed, { ok: payload.ok !== false, error: payload.error ? String(payload.error) : "", fetched: payload.fetched_at || feed.fetched, stale: false });
      paintNotice();
    }
    if (!payload?.dashboard || typeof payload.dashboard !== "object" || !badge) return;
    const mine = ++asked;
    void Promise.resolve().then(() => tree(payload.dashboard)).then((live) => {
      if (gone || mine !== asked || !live) return;
      const count = live.live?.length ?? 0;
      badge.hidden = !count;
      badge.textContent = String(count);
      badge.dataset.state = live.tone;
      for (const dot of dots) {
        dot.hidden = live.tone === "idle";
        dot.dataset.state = live.tone;
      }
      const link = badge.parentElement, spoken = viewName("work") + ", live " + count;
      if (!count) link.removeAttribute("aria-label");
      else if (link.getAttribute("aria-label") !== spoken) link.setAttribute("aria-label", spoken);
    }).catch(() => {
    });
  }
  return { close: () => menu.close(), get isOpen() {
    return menu.isOpen;
  }, dashboard, connection(live) {
    feed.connected = live;
    if (live) {
      clearTimeout(quiet);
      quiet = 0;
      Object.assign(feed, { retrying: false, stale: false });
    } else if (!quiet && !feed.retrying) quiet = setTimeout(() => {
      quiet = 0;
      if (!feed.connected) {
        feed.retrying = true;
        paintNotice();
      }
    }, QUIET_MS);
    paintNotice();
  }, stale() {
    Object.assign(feed, { stale: true, connected: false });
    paintNotice();
  }, destroy() {
    gone = true;
    menu.destroy?.();
    menu.close();
    clearInterval(ticking);
    clearTimeout(quiet);
    notice.remove();
    page.removeEventListener("click", clicked);
    opener.removeEventListener("click", opened);
    page.querySelector(".m-nav")?.remove();
    opener.remove();
    page.classList.remove("m-shell");
    delete page.dataset.nav;
  } };
}
