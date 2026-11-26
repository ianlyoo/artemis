import { proseOf } from "./markdown-code.js";
import { splitNotes } from "../md.js";
import { PHONE_SIGNALS_BOARD } from "../routing.js";
import { hosts, ledgerRef, isLedger } from "../names.js";
export let WORK = null, SYSTEM = null;
export const useRoots = (work, system) => {
  WORK = work;
  SYSTEM = system;
};
const OTHER = Object.freeze({ kind: "other" });
const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};
const boardLink = (raw) => {
  const id = decode(raw);
  return id && !id.includes("/") ? { kind: "board", id } : OTHER;
};
const fileLink = (raw, roots) => {
  const path = decode(raw);
  return path && roots.some((root) => path.startsWith(root + "/")) && !path.split("/").includes("..") && !path.includes("\0") ? { kind: "file", path } : OTHER;
};
const APPROVAL = /^#\/approvals\/([1-9]\d{0,14})\/?$/;
const NETWORK = /^https:\/\/[a-z0-9-]+(\.[a-z0-9.-]+:\d+)$/i;
export const homeOrigin = (value, origin) => {
  if (value === origin) return true;
  const home = NETWORK.exec(hosts().home ?? ""), at = NETWORK.exec(String(value));
  return !!home && !!at && at[1].toLowerCase() === home[1].toLowerCase();
};
export function classifyLink(href, origin, work = WORK, system = SYSTEM) {
  const raw = String(href).trim(), roots = [work, system].filter(Boolean);
  const hash = raw.match(/^#\/boards\/([^/?#]+)\/?$/);
  if (hash) return boardLink(hash[1]);
  const ref = ledgerRef(), item = raw.match(new RegExp(`^(?:${ref}:|#/${ref}/)(goal|request|approval)/([1-9]\\d{0,14})/?$`));
  if (item) return { kind: ref, type: item[1], id: Number(item[2]) };
  const drawer = raw.match(APPROVAL);
  if (drawer) return { kind: ref, type: "approval", id: Number(drawer[1]) };
  if (roots.some((root) => raw.startsWith(root + "/"))) return fileLink(raw.split(/[?#]/)[0], roots);
  if (/^file:/i.test(raw)) {
    try {
      const u = new URL(raw);
      return u.host ? OTHER : fileLink(u.pathname, roots);
    } catch {
      return OTHER;
    }
  }
  let url;
  try {
    url = new URL(raw, origin);
  } catch {
    return OTHER;
  }
  if (!homeOrigin(url.origin, origin)) return OTHER;
  const board = url.pathname.match(/^\/(?:home|canvas)\/boards\/([^/]+)(?:\/source)?\/?$/);
  if (board) return boardLink(board[1]);
  const route = /^\/(?:home\/?)?$/.test(url.pathname) && url.hash.match(APPROVAL) || !url.hash && url.pathname.match(/^\/home\/approvals\/([1-9]\d{0,14})\/?$/);
  if (route) return { kind: ledgerRef(), type: "approval", id: Number(route[1]) };
  if (url.pathname === "/chat/doc" || url.pathname === "/chat/doc/download") {
    const path = url.searchParams.get("path");
    return path ? { kind: "file", path } : OTHER;
  }
  return OTHER;
}
const candidates = (ref = ledgerRef()) => new RegExp(String.raw`https?:\/\/[^\s<>()[\]{}"'${"`"}\u0080-\uffff]+|(?<![\w/.:#-])(?:#\/approvals\/|#\/${ref}\/approval\/|${ref}:approval\/|\/home\/approvals\/)\d+\/?(?!\w)`, "g");
export function approvalIds(text, origin) {
  const ids = [];
  for (const [raw] of proseOf(splitNotes(text).text).matchAll(candidates())) {
    const target = classifyLink(raw.replace(/[.,;:!?]+$/, ""), origin), id = isLedger(target.kind) && target.type === "approval" ? String(target.id) : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
export const itemApprovalIds = (item, origin) => approvalIds(Array.isArray(item?.segments) ? item.segments.filter((segment) => segment?.type === "md").map((segment) => segment.text ?? "").join("\n") : item?.text, origin);
export function refTarget(ref) {
  if ((ref?.kind === "goal" || ref?.kind === "request") && /^[1-9]\d{0,14}$/.test(String(ref.id))) return { kind: ledgerRef(), type: ref.kind, id: Number(ref.id) };
  const path = ref?.kind === "file" && typeof ref.path === "string" ? ref.path : "";
  if (path.startsWith("/") && !path.endsWith("/") && !path.split("/").includes("..") && !path.includes("\0")) return { kind: "file", path };
  if (ref?.kind === "board" && typeof ref.id === "string" && ref.id && !ref.id.includes("/")) return { kind: "board", id: ref.id };
  return null;
}
export const targetKey = (target) => target.kind === "file" ? "file:" + target.path : target.kind === "board" ? "board:" + target.id : isLedger(target.kind) ? `${target.kind}:${target.type}/${target.id}` : target.kind === "image" ? "image:" + (target.images?.[target.index ?? 0]?.url ?? "") : "block:" + JSON.stringify(target.block);
export const paneHref = (target) => target.kind === "board" ? "#/boards/" + encodeURIComponent(target.id) : isLedger(target.kind) && target.type === "approval" ? `#/approvals/${target.id}` : isLedger(target.kind) ? `#/${target.kind}/${target.type}/${target.id}` : "/chat/doc/download?path=" + encodeURIComponent(target.path);
export const chatHref = (raw, origin) => {
  const target = classifyLink(raw, origin);
  return target.kind === "other" ? null : paneHref(target);
};
export function ownHref(href, origin = globalThis.location?.origin) {
  const raw = String(href ?? "").trim();
  if (/^#\/[\w\-./%~?=&:]*$/.test(raw)) return raw;
  if (!raw || raw.startsWith("#")) return null;
  let url;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !homeOrigin(url.origin, origin)) return null;
  const path = url.pathname + url.search + url.hash, target = classifyLink(path, origin);
  if (target.kind !== "other") return paneHref(target);
  if (/^\/phone-signals\/?$/.test(url.pathname) && !url.search) return "#/boards/" + PHONE_SIGNALS_BOARD;
  return /^\/(?:home\/?)?$/.test(url.pathname) && /^#\//.test(url.hash) ? url.hash : path;
}
const anchorsIn = (root) => [...root.querySelectorAll("a[href]"), ...[...root.querySelectorAll(".bv-html-host")].flatMap((host) => host.shadowRoot ? anchorsIn(host.shadowRoot) : [])];
export function markLinks(root, origin) {
  for (const anchor of anchorsIn(root)) {
    const href = anchor.getAttribute("href"), target = classifyLink(href, origin);
    if (target.kind !== "other") {
      if (/^https?:/i.test(href.trim()) && !href.trim().startsWith(origin + "/")) anchor.setAttribute("href", paneHref(target));
      anchor.setAttribute("data-chat-link", "pane");
      anchor.removeAttribute("target");
      continue;
    }
    let url;
    try {
      url = new URL(href, origin);
    } catch {
      continue;
    }
    if (href.trim().startsWith("#") || !["http:", "https:"].includes(url.protocol)) continue;
    const own = ownHref(href, origin);
    if (own) {
      anchor.setAttribute("href", own);
      anchor.setAttribute("data-chat-link", "route");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      continue;
    }
    anchor.setAttribute("data-chat-link", "tab");
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
}
export function wireLinks(root, { origin, open }) {
  const click = (event) => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.composedPath().find((node) => node.tagName === "A" && node.hasAttribute("href"));
    if (anchor?.hasAttribute("download")) return;
    const target = anchor ? classifyLink(anchor.getAttribute("href"), origin) : OTHER;
    if (target.kind === "other") return;
    if (open(target, { from: "link" }) !== false) event.preventDefault();
  };
  root.addEventListener("click", click);
  return () => root.removeEventListener("click", click);
}
export function autoOpen(open) {
  const decided = new Set();
  return (event) => {
    if (event.type === "snapshot") {
      for (const item2 of event.items) if (!item2.streaming) decided.add(item2.key);
      return;
    }
    if (event.type === "older") {
      for (const item2 of event.items) decided.add(item2.key);
      return;
    }
    const item = event.type === "item" && event.live ? event.item : null;
    if (!item || item.role !== "assistant" || item.streaming || decided.has(item.key)) return;
    decided.add(item.key);
    const newest = (item.segments || []).findLast((segment) => segment.type === "open" || segment.type === "preview");
    if (newest?.type === "preview") open({ kind: "preview", id: newest.id }, { from: "auto", key: item.key, title: null });
    else if (newest) open(newest.target, { from: "auto", key: item.key, title: newest.title ?? null });
  };
}
