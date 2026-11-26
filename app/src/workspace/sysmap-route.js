import { el } from "../boards/dom.js";
import { mountSystemMap } from "./sysmap.js";
import { mapHash, mapRoute } from "../routing.js";
function switchTheme() {
  const value = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem("artemis-home-theme", value);
  } catch {
  }
  return value;
}
export function mountSystemMapRoute() {
  const onRoute = (next) => {
    const hash = mapHash(next);
    if (hash !== location.hash) history.replaceState(history.state, "", hash);
  };
  const view = mountSystemMap({ chrome: "standalone", onTheme: switchTheme, route: mapRoute(location.hash), onRoute });
  const root = el("main", { class: "sm-standalone" }, view.node);
  const siblings = [...document.body.children].filter((n) => n instanceof HTMLElement && !["SCRIPT", "LINK"].includes(n.tagName));
  const inert = siblings.map((n) => [n, n.inert]);
  for (const [n] of inert) n.inert = true;
  const title = document.title;
  document.title = "System map · Artemis";
  document.body.append(root);
  const dispose = () => {
    view.dispose();
    root.remove();
    for (const [n, value] of inert) n.inert = value;
    document.title = title;
  };
  return Object.assign(dispose, { route: (hash) => view.route(mapRoute(hash)) });
}
