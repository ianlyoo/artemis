import { el } from "../boards/dom.js";
import { iconButton } from "../workspace/icons.js";
import { edgeSwipe } from "./menu.js";
import { createSheet } from "./sheet.js";
export function mountExplorer(page, bar, { id, openTarget, find, store: sharedStore, lists: sharedLists, api, beforeOpen = () => {
}, enabled = () => true, home = null }) {
  const button = iconButton("sidebar", "Explorer", { class: "m-icon m-explorer-open", "aria-haspopup": "dialog", "aria-controls": id, "aria-expanded": "false" });
  const brand = bar.querySelector(".m-brand");
  if (brand) brand.after(button);
  else bar.prepend(button);
  const dialog = el("dialog", { id, class: "m-dialog m-explorer", "aria-label": "Explorer" });
  page.ownerDocument.body.append(dialog);
  let ready = null, sheet = null, body = null, explorer = null, store = sharedStore, after = null, gone = false, empty = !!home;
  const dock = () => {
    if (!explorer) return;
    const inline = empty && home && !dialog.open;
    (inline ? home : body).append(explorer.node);
    explorer.node.querySelector(".ex-collapse").hidden = !!inline;
  };
  const finish = () => {
    const run = after;
    after = null;
    run?.();
    dock();
  };
  const close = (run) => {
    if (typeof run === "function") after = run;
    sheet?.close();
  };
  const popped = () => {
    if (history.state?.phoneExplorer === id) return;
    if (dialog.open) sheet?.close();
    else finish();
  };
  window.addEventListener("popstate", popped);
  async function prepare() {
    const [{ createExplorer }, core, { createStore }, { homeApi }, { loadStyles }] = await Promise.all([import("../workspace/explorer.js"), import("../workspace/core.js"), import("../workspace/store.js"), import("../workspace/api.js"), import("../chat/entry.js")]);
    await loadStyles();
    await core.stylesheet("ide.css");
    await core.stylesheet("../mobile/explorer.css");
    if (gone) return;
    store ??= createStore({ api: api ?? homeApi });
    explorer = createExplorer({ store, lists: sharedLists ?? core.lists(), api: api ?? homeApi, open: (target) => dialog.open ? close(() => openTarget(target)) : openTarget(target), quick: () => dialog.open ? close(find) : find(), collapse: () => close() });
    explorer.node.querySelector(".ex-foot")?.remove();
    body = el("div", { class: "chat ide m-sheet", "data-grab": "" }, explorer.node);
    dialog.append(el("div", { class: "m-scrim", "aria-hidden": "true" }), body);
    explorer.node.querySelector("kbd")?.remove();
    const collapse = explorer.node.querySelector(".ex-collapse");
    collapse.title = "Close explorer";
    collapse.setAttribute("aria-label", "Close explorer");
    sheet = createSheet(dialog, { from: "left", focus: () => collapse, onClose: () => {
      if (history.state?.phoneExplorer === id) history.back();
      else finish();
    } });
    dock();
  }
  const ensure = () => {
    ready ??= prepare().catch((error) => {
      ready = null;
      console.error("Home explorer:", error);
    });
    return ready;
  };
  async function show() {
    if (!enabled()) return;
    await ensure();
    if (!sheet || gone || !enabled() || !button.isConnected || !button.getClientRects().length || sheet.isOpen || dialog.open) return;
    beforeOpen();
    explorer.paint();
    void store.boards();
    void store.reports();
    body.append(explorer.node);
    explorer.node.querySelector(".ex-collapse").hidden = false;
    history.pushState({ ...history.state, phoneExplorer: id }, "", location.href);
    sheet.open();
  }
  button.addEventListener("click", show);
  const offSwipe = edgeSwipe(page, dialog, show, "left");
  return { close, show, async reveal(target) {
    await show();
    explorer?.reveal(target, { dir: true });
  }, async empty(on) {
    empty = on;
    await ensure();
    dock();
  }, get isOpen() {
    return !!dialog.open;
  }, destroy() {
    gone = true;
    offSwipe();
    close();
    explorer?.destroy();
    window.removeEventListener("popstate", popped);
    button.remove();
    dialog.remove();
  } };
}
