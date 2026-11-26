import { mountIsland } from "../islands/island.js";
import { homeApi } from "./flow.js";
const MARK = new URL("../brand-mark.svg", import.meta.url).href;
export function mountSettingsRoute({ view = globalThis, doc = view.document, home = homeApi() } = {}) {
  const signedOut = () => {
    view.history.replaceState(null, "", view.location.pathname + view.location.search);
    view.location.reload();
  };
  const root = doc.createElement("div");
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "1000", overflow: "auto", background: "var(--ground)" });
  const inert = [...doc.body.children].filter((node) => !["SCRIPT", "LINK"].includes(node.tagName)).map((node) => [node, node.inert]);
  for (const [node] of inert) node.inert = true;
  const title = doc.title;
  doc.title = "Settings · Artemis";
  doc.body.append(root);
  let island = null, gone = false;
  mountIsland("settings", root, { home, mark: MARK, back: "#/", signedOut }).then((mounted) => {
    if (gone) mounted.unmount();
    else island = mounted;
  }).catch((error) => {
    root.textContent = "Settings could not open: " + error.message;
  });
  return () => {
    gone = true;
    island?.unmount();
    root.remove();
    for (const [node, value] of inert) node.inert = value;
    doc.title = title;
  };
}
export function settingsControl(doc = document) {
  const link = doc.createElement("a");
  link.href = "#/settings";
  link.className = "icon-control";
  link.title = "Settings";
  link.setAttribute("aria-label", "Settings");
  link.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 7h8.5M17 7h2.5M4.5 12h2.5M11 12h8.5M4.5 17h10.5M19 17h.5"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/></svg>';
  return link;
}
