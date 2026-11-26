import { offerReload } from "./update.js";
const KEY = "artemis.style-reload";
export const unstyled = (view = window) => view.getComputedStyle(view.document.body).marginTop !== "0px" || !view.getComputedStyle(view.document.documentElement).getPropertyValue("--paper").trim();
export async function recoverStyles({ view = window, storage = sessionStorage, sw = navigator.serviceWorker, notify = () => offerReload({ view }), now = Date.now(), wait = 4e3 } = {}) {
  const last = storage.getItem(KEY);
  if (!unstyled(view) || last != null && now - Number(last) < 6e4) return false;
  storage.setItem(KEY, String(now));
  try {
    const reg = await sw?.getRegistration("/");
    if (reg) {
      const changed = new Promise((resolve) => sw.addEventListener("controllerchange", resolve, { once: true }));
      await reg.update();
      if (reg.installing || reg.waiting) await Promise.race([changed, new Promise((resolve) => setTimeout(resolve, wait))]);
    }
  } catch {
  }
  notify();
  return true;
}
