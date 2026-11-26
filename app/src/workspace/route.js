import { has, leadRole } from "../names.js";
export const ideIsLead = () => has("workspace");
export const ideHash = (isLead = ideIsLead()) => isLead ? "#/workspace" : "#/ide";
export const phoneIDE = (hash, isLead = ideIsLead()) => /^#\/ide\/?$/.test(hash) || isLead && RegExp(`^#\\/(?:${leadRole()}|workspace)\\/?$`).test(hash);
export async function mountIDE(container, options) {
  globalThis.homePreload?.("workspace/ide.js");
  const { mountIDE: mount } = await import("./ide.js");
  return mount(container, options);
}
export async function openBoardRoute(route, mounting, current = () => true, openTarget = null) {
  const ide = await mounting;
  if (!ide || !current()) return false;
  if (route.boardTarget) {
    openTarget ??= (await import("./core.js")).open;
    return current() ? openTarget(route.boardTarget, { from: "link" }) : false;
  }
  if (route.boardList) return ide.boards?.();
  return false;
}
export async function mountPhoneIDE(doc = document, { isLead = ideIsLead(), phone = () => import("./phone.js"), stream = null } = {}) {
  const page = doc.createElement("div");
  page.className = "ap-page";
  page.id = "ide-phone";
  doc.body.append(page);
  globalThis.homePreload?.("workspace/phone.js");
  const { mountPhone } = await phone();
  return mountPhone(page, { menu: isLead, stream });
}
