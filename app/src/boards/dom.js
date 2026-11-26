import { zoned, withZone } from "../zone.js";
export const NS = "http://www.w3.org/2000/svg";
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2), value);
    else if (name === "className") node.className = value;
    else if (name === "style" && typeof value === "object") for (const [key, val] of Object.entries(value)) node.style.setProperty(key, val);
    else if (name === "checked" || name === "disabled") node[name] = !!value;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  node.append(...children.flat(Infinity).filter((v) => v != null && v !== false).map((v) => v instanceof Node ? v : document.createTextNode(String(v))));
  return node;
}
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) if (value != null) node.setAttribute(name, String(value));
  node.append(...children.flat().filter((v) => v != null).map((v) => v instanceof Node ? v : document.createTextNode(String(v))));
  return node;
}
export const number = (value) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
const dateTime = zoned("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const when = (value) => {
  if (!Number.isFinite(Date.parse(value))) return "—";
  const parts = Object.fromEntries(dateTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return withZone(`${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`);
};
export const shortId = (id) => /^[a-f0-9]{8}-/i.test(id) ? id.slice(0, 8) : id;
export const textOriginal = (source) => typeof source?.path === "string" && /\.(md|html?|csv)$/i.test(source.path);
const ASSET = /^\/canvas\/assets\/[A-Za-z0-9._-]+$|^\/chat\/doc\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|json|pdf|mp4|webm|mov|wav|mp3|m4a|ogg)$|^\/archive\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp|gif|json|pdf|mp4|webm|mov|wav|mp3|m4a|ogg)$/;
export const assetPath = (value) => {
  try {
    const url = new URL(String(value), location.origin);
    return url.origin === location.origin && ASSET.test(url.pathname) && !url.search ? url.pathname : null;
  } catch {
    return null;
  }
};
export function linkURL(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(String(value), location.origin);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    const board = url.origin === location.origin && url.pathname.match(/^\/home\/boards\/([^/]+)$/);
    if (board) return "#/boards/" + encodeURIComponent(decodeURIComponent(board[1]));
    if (String(value).startsWith("#")) return String(value);
    return url.href;
  } catch {
    return null;
  }
}
export async function response(api, path, signal) {
  const result = await api(path, { signal });
  if (result.status === 401) {
    location.assign("/login");
    throw new Error("HTTP 401");
  }
  if (!result.ok) {
    const error = new Error(`HTTP ${result.status}`);
    error.status = result.status;
    throw error;
  }
  return result;
}
export function problem(message, retry) {
  return el("div", { class: "bv-problem", role: "status" }, el("span", {}, message), retry && el("button", { type: "button", class: "bv-button", onclick: retry }, "Retry"));
}
export function scope(parentSignal) {
  const controller = new AbortController(), cleanups = new Set();
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  if (parentSignal?.aborted) controller.abort();
  return { signal: controller.signal, own(cleanup) {
    if (controller.signal.aborted) {
      cleanup();
      return () => {
      };
    }
    cleanups.add(cleanup);
    return () => cleanups.delete(cleanup);
  }, destroy() {
    controller.abort();
    parentSignal?.removeEventListener("abort", abort);
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
      }
    }
    cleanups.clear();
  } };
}
