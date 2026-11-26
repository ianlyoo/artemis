import { el } from "../boards/dom.js";
import { open as openTarget, current, on, chatTarget, toTarget } from "./core.js";
export function createPane({ host, onChange = () => {
} }) {
  const node = el("aside", { class: "pane", hidden: true, "aria-hidden": "true" });
  host.append(node);
  const off = on("active", (target) => onChange({ open: !!target, target }));
  return { node, open: (target, how = {}) => toTarget(target) ? openTarget(target, how) : false, close() {
  }, get current() {
    const now = current();
    return now && now.kind !== "terminal" ? chatTarget(now) : null;
  }, get shown() {
    return !!current();
  }, restore() {
  }, destroy() {
    off();
    node.remove();
  } };
}
