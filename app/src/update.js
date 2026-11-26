import { l10n } from "./names.js";
export const UPDATE_LABEL = () => l10n("업데이트 있어요 · 눌러서 새로고침", "Update ready · tap to reload");
export const SAVE_DRAFT = "home:save-draft";
const RELOAD_LABEL = () => l10n("눌러서 새로고침", "Tap to reload");
function paint(button, reason) {
  button.hidden = !reason;
  button.title = reason === "update" ? UPDATE_LABEL() : RELOAD_LABEL();
  button.setAttribute("aria-label", button.title);
}
export function offerReload({ view = globalThis, update = false } = {}) {
  const doc = view.document;
  const reason = doc.documentElement.dataset.homeReload === "update" || update ? "update" : "recover";
  doc.documentElement.dataset.homeReload = reason;
  for (const button of doc.querySelectorAll("[data-home-update]")) paint(button, reason);
}
export function updateButton({ doc = document, reload = () => doc.defaultView.location.reload() } = {}) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "icon-control home-update";
  button.dataset.homeUpdate = "";
  button.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19.25 12a7.25 7.25 0 1 1-2.12-5.13M19.25 4.5v4.25H15"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>';
  paint(button, doc.documentElement.dataset.homeReload);
  button.addEventListener("click", () => {
    doc.defaultView.dispatchEvent(new doc.defaultView.Event(SAVE_DRAFT));
    reload();
  });
  return button;
}
