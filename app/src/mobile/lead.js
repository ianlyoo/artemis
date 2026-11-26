import { lead } from "../names.js";
const CHAT = "../chat/chat.js";
export const leadWaiting = () => lead() + " chat opens here soon";
export function createLeadSlot(container, load = () => import(CHAT), head = () => {
}) {
  let mounting = null, unmount = null;
  const wait = () => {
    container.innerHTML = '<p class="m-empty m-lead-wait">' + leadWaiting() + "</p>";
    return false;
  };
  const quietly = (run) => {
    try {
      run?.();
    } catch (err) {
      console.error("Home chat:", String(err?.message || err));
    }
  };
  return { show() {
    if (mounting) return mounting;
    const run = mounting = load().then(async (chat) => {
      if (typeof chat?.mountChat !== "function") throw Error("chat.js exports no mountChat");
      if (mounting !== run) return false;
      container.innerHTML = "";
      const done = await chat.mountChat(container, { layout: "phone", head }), off = typeof done === "function" ? done : null;
      if (mounting !== run) {
        quietly(off);
        return false;
      }
      unmount = off;
      return true;
    }, () => mounting === run && wait()).catch((err) => {
      console.error("Home chat:", String(err?.message || err));
      return mounting === run && wait();
    });
    return run;
  }, unmount() {
    const off = unmount;
    unmount = null;
    mounting = null;
    quietly(off);
  } };
}
