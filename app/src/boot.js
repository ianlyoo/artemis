import { standalonePage, PAGE_EVENT } from "./routing.js";
import { currentLayout, isTouchIPad, watchLayout } from "./layout.js";
import { held, watchResume, watchStartup } from "./stale.js";
import { createPreloader } from "./preload-queue.js";
import { has, leadRole } from "./names.js";
const phone = { matches: currentLayout() === "phone" };
for (const watch of [watchResume, ...phone.matches ? [watchStartup] : []]) try {
  watch();
} catch (err) {
  console.warn("Home:", err);
}
if (isTouchIPad(navigator)) document.documentElement.dataset.device = "ipad";
const mobileStyle = document.querySelector('link[href*="mobile/mobile.css"]');
if (mobileStyle) mobileStyle.media = phone.matches ? "all" : "not all";
if (phone.matches) {
  document.documentElement.dataset.layout = "phone";
  document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=device-width,initial-scale=1,viewport-fit=cover");
}
const PRELOAD = {};
const preloader = createPreloader();
function preload(entry) {
  const paths = PRELOAD[entry] ?? [], at = paths.length && import.meta.url;
  if (!at) return;
  for (const path of paths) preloader.add(new URL(path, at).href);
}
globalThis.homePreload = preload;
preload(phone.matches ? "mobile/mobile.js" : "app.js");
if (has("workspace") && RegExp("^#\\/(?:" + leadRole() + "|ide|workspace|learn)\\/?$").test(location.hash)) {
  if (!phone.matches) preload("workspace/ide.js");
  const at = phone.matches && import.meta.url;
  if (at) for (const name of ["ide.css", "phone.css"]) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "style";
    link.href = new URL("workspace/" + name, at).href;
    document.head.append(link);
  }
}
const PAGES = { map: () => import("./workspace/sysmap-route.js").then((m) => m.mountSystemMapRoute), dictation: () => import("./dictation/route.js").then((m) => m.mountDictationRoute), settings: () => import("./setup/route.js").then((m) => m.mountSettingsRoute) };
const PAGE_NEEDS = { map: "sysmap", dictation: "dictation", settings: "settings" };
let shell = null, page = null, pageOff = null, pageTurn = 0;
function routeSurface(event) {
  const turn = ++pageTurn, found = standalonePage(location.hash), name = found && has(PAGE_NEEDS[found]) ? found : null;
  if (name !== page) {
    pageOff?.();
    pageOff = null;
    page = name;
    if (name) dispatchEvent(new CustomEvent(PAGE_EVENT, { detail: name }));
  }
  if (name) {
    event?.stopImmediatePropagation();
    if (pageOff) pageOff.route?.(location.hash);
    else PAGES[name]().then((mount) => {
      if (turn === pageTurn && page === name && !pageOff) pageOff = mount();
    }).catch((err) => console.error("Home page:", err));
  } else {
    shell ??= (phone.matches ? import("./mobile/mobile.js") : import("./app.js")).catch((err) => console.error("Home:", err));
  }
}
function start() {
  addEventListener("popstate", routeSurface);
  addEventListener("hashchange", routeSurface);
  routeSurface();
}
if (has("setup")) import("./setup/gate.js").then((m) => m.openGate(), (err) => console.error("Home setup:", err)).then(start);
else start();
watchLayout({ initial: phone.matches ? "phone" : "pc", blocked: () => isTouchIPad(navigator) && held() });
