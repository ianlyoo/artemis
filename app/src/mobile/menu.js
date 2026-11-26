import { esc } from "./format.js";
import { VIEWS, hashFor, viewShown } from "./views.js";
import { icon } from "./icons.js";
import { createSheet } from "./sheet.js";
import { mountPush } from "../push/client.js";
import { patch } from "../dom-patch.js";
import { onOwnerTurn, ownerCount } from "../owner-steps.js";
import { has } from "../names.js";
import { PAGE_EVENT } from "../routing.js";
export { wrapFocus, swipeCloses } from "./sheet.js";
export function menuHTML() {
  return '<dialog id="m-nav" class="m-dialog m-drop" aria-label="Menu"><div class="m-scrim" aria-hidden="true"></div><div class="m-sheet m-menu-sheet" data-grab><button type="button" class="m-menu-brand" data-close aria-label="Close menu"><span class="m-logo" aria-hidden="true"><b class="brand-mark"></b><i class="m-dot" hidden></i></span><span class="m-menu-name">ARTEMIS</span></button><nav class="m-items" aria-label="Views"></nav><div class="m-menu-foot"><button type="button" class="m-icon m-theme"></button></div><div class="m-grip" aria-hidden="true"><i></i></div></div></dialog>';
}
export function menuItemsHTML(current, { owner = 0 } = {}) {
  const views = VIEWS.filter(([key]) => viewShown(key));
  return views.map(([key, name], i) => '<a class="m-item-link" data-view="' + key + '" href="' + hashFor(key) + '" style="--i:' + i + '"' + (key === current ? ' aria-current="page"' : "") + '><span class="m-label">' + esc(name) + "</span>" + (key === "admin" && owner ? '<b class="m-n" data-state="owner"><span class="m-sr">, owner </span>' + owner + "</b>" : "") + "</a>").join("") + (has("settings") ? '<a class="m-item-link" href="#/settings" style="--i:' + views.length + '"><span class="m-label">Settings</span></a>' : "");
}
export const themeName = (theme) => theme === "dark" ? "Light mode" : "Dark mode";
export function paintTheme(button, theme) {
  const name = themeName(theme);
  if (button.title === name) return;
  button.innerHTML = icon(theme === "dark" ? "sun" : "moon");
  button.title = name;
  button.setAttribute("aria-label", name);
}
export function edgeSwipe(page, dialog, open, side = "right") {
  const doc = page.ownerDocument, win = doc.defaultView;
  let start = null;
  const scope = doc.body, life = new AbortController();
  const options = { passive: true, signal: life.signal };
  const modalOpen = () => [...doc.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < win.innerHeight && win.getComputedStyle(el).visibility !== "hidden";
  });
  scope.addEventListener("touchstart", (e) => {
    start = null;
    if (page.inert || win.getComputedStyle(page).display === "none" || e.touches.length !== 1 || !dialog.isConnected || doc.documentElement.dataset.layout !== "phone" || modalOpen()) return;
    const t = e.touches[0];
    const edge = side === "left" ? t.clientX : win.innerWidth - t.clientX;
    if (edge < 28 || edge > 64) return;
    if (e.composedPath().some((el) => el.nodeType === 1 && (el.matches('input,textarea,select,[role="textbox"]') || el.isContentEditable || el.scrollWidth > el.clientWidth + 1 && /^(auto|scroll|overlay)$/.test(win.getComputedStyle(el).overflowX)))) return;
    start = { id: t.identifier, x: t.clientX, y: t.clientY, at: e.timeStamp };
  }, options);
  scope.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = [...e.touches].find((t2) => t2.identifier === start.id);
    if (e.touches.length !== 1 || !t) {
      start = null;
      return;
    }
    const dx = (t.clientX - start.x) * (side === "left" ? 1 : -1), dy = Math.abs(t.clientY - start.y);
    if (e.timeStamp - start.at > 600 || dx < -12 || dy >= 12 && dy >= Math.abs(dx)) start = null;
  }, options);
  scope.addEventListener("touchend", (e) => {
    const was = start;
    start = null;
    if (!was || e.touches.length || !dialog.isConnected) return;
    const t = [...e.changedTouches].find((t2) => t2.identifier === was.id);
    if (!t) return;
    const dx = (t.clientX - was.x) * (side === "left" ? 1 : -1), dy = Math.abs(t.clientY - was.y);
    if (dx >= 48 && dx > 1.5 * dy && e.timeStamp - was.at <= 600 && !modalOpen()) open();
  }, options);
  scope.addEventListener("touchcancel", () => {
    start = null;
  }, options);
  return () => life.abort();
}
export function createMenu(page, { onOpen, current = () => null, ...sheetOptions } = {}) {
  const dialog = page.querySelector("#m-nav"), items = dialog.querySelector(".m-items");
  if (has("push")) mountPush(dialog);
  const compat = !onOpen;
  const paint = () => {
    patch(items, menuItemsHTML(current(), { owner: ownerCount() }));
    if (compat) for (const link of items.querySelectorAll(".m-item-link")) link.classList.add("m-nav-item");
  };
  if (compat) {
    dialog.classList.add("m-nav");
    dialog.querySelector(".m-theme").className = "m-nav-theme";
  }
  paint();
  const offTurn = onOwnerTurn(paint);
  const menu = createSheet(dialog, { from: "top", focus: () => items.querySelector("[aria-current]"), ...sheetOptions });
  const brand = page.querySelector(".m-brand");
  brand?.addEventListener("click", onOpen ?? (() => menu.open()));
  const offSwipe = edgeSwipe(page, dialog, () => brand?.click());
  const win = page.ownerDocument.defaultView, closeUnder = () => {
    if (menu.isOpen) menu.close();
  };
  win.addEventListener(PAGE_EVENT, closeUnder);
  return { ...menu, paint, get isOpen() {
    return menu.isOpen;
  }, destroy() {
    offTurn();
    offSwipe();
    win.removeEventListener(PAGE_EVENT, closeUnder);
    menu.close();
  } };
}
