import { el } from "../boards/dom.js";
import { loadStyles } from "../chat/entry.js";
import { homeApi } from "../workspace/api.js";
import { stylesheet, lists, saved, toTarget, sameTarget, setActive } from "../workspace/core.js";
import { createStore } from "../workspace/store.js";
import { createDoc } from "../workspace/doc.js";
import { createQuick } from "../workspace/quick.js";
import { holdReload } from "../stale.js";
import { mountExplorer } from "./explorer.js";
export async function mountExplorerTab(panel, bar, { api = homeApi } = {}) {
  await loadStyles();
  await Promise.all([stylesheet("ide.css"), stylesheet("../mobile/explorer.css"), stylesheet("../mobile/explorer-tab.css")]);
  const store = createStore({ api }), list = lists();
  const home = el("div", { class: "chat ide m-explorer m-explorer-home" });
  const content = el("div", { class: "chat ide m-explorer-document", hidden: true });
  const node = el("div", { class: "m-explorer-tab" }, home, content);
  panel.classList.add("m-reports");
  panel.replaceChildren(node);
  let doc = null, target = null, shown = false;
  const drawer = mountExplorer(panel, bar, { id: "m-explorer", api, store, lists: list, home, enabled: () => shown && panel.classList.contains("on"), openTarget: open, find: () => quick.show() });
  const quick = createQuick({ api, store, lists: list, open, dir: (target2) => drawer.reveal(target2), accept: (item) => !item.act && item.target?.kind !== "terminal" });
  quick.node.classList.add("m-explorer-quick");
  const unhold = holdReload(() => !!doc?.dirty);
  async function open(next, how = {}) {
    next = toTarget(next);
    if (!next) return false;
    if (sameTarget(target, next)) return doc;
    doc?.destroy();
    target = next;
    doc = createDoc({ target, api, store, phone: true, open });
    content.replaceChildren(doc.node);
    content.hidden = false;
    home.hidden = true;
    void drawer.empty(false);
    list.touch(target);
    saved.write("phone-explorer-last", target);
    if (shown) setActive(target);
    const current = doc;
    await current.ready;
    if (current !== doc) return false;
    current.show(shown);
    if (how.find) current.find(how.find);
    if (shown) current.scroller.focus({ preventScroll: true });
    return current;
  }
  const last = toTarget(saved.read("phone-explorer-last", null));
  if (last) void open(last);
  else await drawer.empty(true);
  return { show(on) {
    const changed = shown !== on;
    shown = on;
    doc?.show(on);
    if (!on) {
      drawer.close();
      quick.hide();
      return;
    }
    setActive(target);
    if (changed) {
      void store.boards({ force: true });
      void store.reports({ force: true });
      if (doc?.item && !doc.dirty) void doc.reload({ quiet: true });
    }
  }, frame(frame) {
    if (frame.kind === "dashboard") store.dashboard(frame.payload);
    if (frame.kind !== "canvas") return;
    store.canvas(frame.payload);
    const board = target?.kind === "board" && store.data.boards.find((board2) => board2.id === target.id);
    if (shown && board && doc?.item && board.updatedAt !== doc.item.updatedAt) void doc.reload({ quiet: true });
  }, destroy() {
    shown = false;
    drawer.destroy();
    quick.destroy();
    doc?.destroy();
    unhold();
    node.remove();
  } };
}
