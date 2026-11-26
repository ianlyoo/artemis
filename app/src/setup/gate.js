import { mountIsland } from "../islands/island.js";
import { holdReload } from "../stale.js";
import { homeApi, pairToken, standing } from "./flow.js";
import { tabHash } from "../routing.js";
export const EVERY = 3e3;
export function openGate({ view = globalThis, home = homeApi(), every = EVERY, mark = new URL("../brand-mark.svg", import.meta.url).href } = {}) {
  const doc = view.document;
  return new Promise((resolve) => {
    let root = null, island = null, mounting = null, timer = 0, over = false, inert = [];
    const letGo = holdReload(() => !over);
    const title = doc.title;
    function show(props) {
      if (!root) {
        root = doc.createElement("div");
        Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "1000", overflow: "auto", background: "var(--ground)" });
        inert = [...doc.body.children].filter((node) => !["SCRIPT", "LINK"].includes(node.tagName)).map((node) => [node, node.inert]);
        for (const [node] of inert) node.inert = true;
        doc.body.append(root);
        mounting = mountIsland("setup", root, { mark, home, retry: () => look(), finish: () => {
          view.history.replaceState(null, "", tabHash("workspace"));
          close();
        }, ...props }).then((mounted) => {
          island = mounted;
        }, (error) => {
          root.textContent = "Artemis could not open this page: " + error.message;
        });
      } else mounting.then(() => island?.update(props));
      doc.title = (props.screen === "wizard" ? "Set up" : "Pair") + " · Artemis";
    }
    async function look(token = null) {
      view.clearTimeout(timer);
      if (over) return;
      let found;
      try {
        found = await standing(home, token);
      } catch (error) {
        found = { screen: "offline", error: error.message };
      }
      if (over) return;
      if (found.screen === "app") return close();
      show(found);
      if (["waiting", "elsewhere", "offline"].includes(found.screen)) timer = view.setTimeout(() => look(), every);
    }
    function close() {
      over = true;
      view.clearTimeout(timer);
      view.removeEventListener("hashchange", moved);
      letGo();
      void (mounting ?? Promise.resolve()).then(() => {
        island?.unmount();
        root?.remove();
        for (const [node, value] of inert) node.inert = value;
        doc.title = title;
        resolve();
      });
    }
    function moved() {
      const token = take();
      if (token) void look(token);
    }
    function take() {
      const token = pairToken(view.location.hash);
      if (token) view.history.replaceState(null, "", view.location.pathname + view.location.search);
      return token;
    }
    view.addEventListener("hashchange", moved);
    void look(take());
  });
}
