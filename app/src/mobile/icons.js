import { svg } from "../icons.js";
const NAMES = { close: "close", back: "left", chevron: "right", more: "down", sun: "sun", moon: "moon", power: "power", leaf: "leaf", check: "check", retry: "retry", load: "load", bell: "bell", "bell-off": "bell-off", volume: "volume", "volume-off": "volume-off" };
export const ICONS = Object.keys(NAMES);
export const icon = (name, klass = "") => svg(NAMES[name], { klass: "m-ico" + (klass ? " " + klass : ""), attrs: 'data-icon="' + name + '"' });
export const iconButton = (name, label, { klass = "", attrs = "" } = {}) => '<button type="button" class="m-icon' + (klass ? " " + klass : "") + '"' + (attrs ? " " + attrs : "") + ' aria-label="' + label + '" title="' + label + '">' + icon(name) + "</button>";
