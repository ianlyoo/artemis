import { esc } from "./format.js";
import { svg } from "../icons.js";
const NAMES = { search: "search", top: "top", download: "download", raw: "raw", copy: "copy", retry: "retry", restore: "restore", back: "left", prev: "left", next: "right", more: "down", expand: "right", zoomIn: "plus", zoomOut: "minus", fit: "fit", check: "check", external: "external", eye: "eye", eyeOff: "eye-off" };
export const ICONS = Object.keys(NAMES);
export function iconHTML(name, cls = "lib-ico") {
  return svg(NAMES[name] || NAMES.next, { klass: cls });
}
export function iconButtonHTML(name, label, { attrs = "", tag = "button", cls = "" } = {}) {
  const own = tag === "button" ? ' type="button"' : "";
  return "<" + tag + own + ' class="lib-ctl lib-ibtn' + (cls ? " " + cls : "") + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (attrs ? " " + attrs : "") + '><span class="lib-lbl">' + iconHTML(name) + "</span></" + tag + ">";
}
let template = null;
export function iconNode(name, cls = "bv-icon") {
  template ??= document.createElement("template");
  template.innerHTML = iconHTML(name, cls);
  return template.content.firstChild;
}
