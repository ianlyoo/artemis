import { leadRole } from "./names.js";
const MAP = /^#\/map(?:\/(flows)(?:\/([\w-]+))?)?\/?$/;
export const systemMapRoute = (hash) => MAP.test(String(hash ?? ""));
export const mapRoute = (hash) => {
  const m = String(hash ?? "").match(MAP);
  return m ? { view: m[1] ? "flows" : "map", flow: m[2] ?? null } : null;
};
export const mapHash = ({ view = "map", flow = null } = {}) => view === "flows" ? "#/map/flows" + (flow ? "/" + flow : "") : "#/map";
export const standalonePage = (hash) => systemMapRoute(hash) ? "map" : /^#\/dictation-scoring\/?$/.test(String(hash ?? "")) ? "dictation" : /^#\/settings\/?$/.test(String(hash ?? "")) ? "settings" : null;
export const PAGE_EVENT = "home:page";
export const learnRoute = (hash) => /^#\/learn\/?$/.test(String(hash ?? ""));
export const TABS = [["admin", "Admin"], ["status", "Status"], ["workspace", "Workspace"]];
export const tabHash = (tab) => "#/" + tab;
export const STATUS_TIMELINE = "#/status/timeline";
export const boardHash = (id = null) => "#/workspace/boards" + (id ? "/" + encodeURIComponent(id) : "");
export const PHONE_SIGNALS_BOARD = "de8a2e05-f75d-4bcd-b8a9-61abdbc66f9d";
export const PC_VIEW = { admin: "admin", status: "time", workspace: "lead" };
const MOVED = () => [[RegExp(`^/${leadRole()}/(?:card|approval)/([1-9]\\d{0,11})/?$`), (m) => "#/approvals/" + m[1]], [RegExp(`^/(?:${leadRole()}|workspace)/?$`), () => "#/workspace"], [/^\/(?:time|timeline|status\/timeline)\/?$/, () => STATUS_TIMELINE], [/^\/(?:network|seats|status)\/?$/, () => "#/status"], [/^\/(?:workspace\/)?boards(\/[^/]+)?\/?$/, (m) => "#/workspace/boards" + (m[1] ?? "")], [/^\/phone-signals\/?$/, () => boardHash(PHONE_SIGNALS_BOARD)]];
export function canonicalHash({ hash = "", pathname = "/" } = {}) {
  let path = "/" + String(hash ?? "").replace(/^#?\/?/, "");
  if (path === "/") {
    const old = String(pathname ?? "").match(/^\/home(\/(?:boards|approvals)(?:\/[^/]+)?|\/requests|\/system)\/?$/);
    if (!old) return null;
    path = old[1];
    if (/^\/(?:approvals|requests)$/.test(path)) return "#/admin";
    if (!path.startsWith("/boards")) return "#" + path;
  }
  for (const [pattern, to] of MOVED()) {
    const m = path.match(pattern);
    if (m) {
      const next = to(m);
      return next === "#" + path ? null : next;
    }
  }
  return null;
}
export function readRoute({ hash = "", pathname = "/" } = {}) {
  const path = hash.replace(/^#/, "");
  if (systemMapRoute(hash)) return { view: "map", boardId: null };
  if (/^\/phone-signals\/?$/.test(path || pathname)) return { view: "boards", boardId: PHONE_SIGNALS_BOARD };
  if (["/time", "time", "/timeline", "timeline", "/status/timeline", "/status/timeline/"].includes(path)) return { view: "time", boardId: null };
  if (["/network", "network", "/status", "/status/"].includes(path)) return { view: "network", boardId: null };
  if (["/" + leadRole(), leadRole(), "/workspace", "workspace"].includes(path)) return { view: "lead", boardId: null };
  const anchor = chatAnchor(hash);
  if (anchor) return { view: "lead", boardId: null, anchor };
  if (["/ide", "/ide/"].includes(path)) return { view: "ide", boardId: null };
  const approval = path.match(/^\/approvals\/([^/]+)\/?$/) || !path && pathname.match(/^\/home\/approvals\/([^/]+)\/?$/);
  if (approval) {
    let approvalId = approval[1];
    try {
      approvalId = decodeURIComponent(approvalId);
    } catch {
    }
    return { view: "time", boardId: null, drawer: "approvals", approvalId };
  }
  const drawer = path.match(/^\/(requests|approvals|system)\/?$/) || !path && pathname.match(/^\/home\/(requests|approvals|system)\/?$/);
  if (drawer) return { view: "time", boardId: null, drawer: drawer[1] };
  const board = path.match(/^\/(?:workspace\/)?boards(?:\/([^/]+))?\/?$/) || !path && pathname.match(/^\/home\/boards(?:\/([^/]+))?\/?$/);
  if (board) {
    let boardId = null;
    try {
      boardId = board[1] ? decodeURIComponent(board[1]) : null;
    } catch {
    }
    return { view: "boards", boardId };
  }
  return { view: "network", boardId: null };
}
export function routeHash(view, boardId = null) {
  return view === "map" ? "#/map" : view === "boards" || view === "lead" && boardId != null ? boardHash(boardId) : view === "network" ? "#/status" : view === "lead" ? "#/workspace" : view === "ide" ? "#/ide" : view === "time" ? STATUS_TIMELINE : "#/";
}
export function readPCRoute(where) {
  if (/^#\/explorer\/?$/.test(where.hash ?? "")) return { view: "lead", boardId: null, boardList: true };
  const route = readRoute(where);
  if (route.view !== "boards") return route;
  return { ...route, view: "lead", boardTarget: boardTarget(route.boardId), boardList: route.boardId == null };
}
export const boardTarget = (id) => id == null ? null : /^archive:(board|asset|report|draft):./s.test(id) ? { kind: "archive", id: id.slice(8) } : { kind: "board", id };
export function workViewState(view) {
  if (view !== "time" && view !== "network") return null;
  return view === "time" ? { tab: "time", next: "network", icon: "network", label: "Network view" } : { tab: "time", next: "time", icon: "timeline", label: "Timeline view" };
}
export const screenRoute = (hash) => /^#\/(?:screen|browser)(?![\w-]|\/[\w-])/.test(String(hash ?? ""));
const ANCHOR = () => RegExp(`^#?/${leadRole()}/(?:(step|question)/([1-9]\\d{0,11})|(secret)/([A-Za-z0-9][A-Za-z0-9_-]{0,63}))/?$`);
const MEETING = /^#?\/meeting\/([1-9]\d{0,11})\/?$/;
export function chatAnchor(hash) {
  const meeting = MEETING.exec(String(hash ?? ""));
  if (meeting) return { kind: "meeting", id: meeting[1] };
  const notify = RegExp(`^#?/${leadRole()}/notify/([1-9][0-9]{0,15})/?$`).exec(String(hash ?? ""));
  if (notify) return { kind: "notify", id: notify[1] };
  const m = ANCHOR().exec(String(hash ?? ""));
  return m ? { kind: m[1] ?? m[3], id: m[2] ?? m[4] } : null;
}
const ANCHOR_EVENT = "lead:anchor";
let heldAnchor = null;
export function holdAnchor(anchor, now = Date.now()) {
  heldAnchor = anchor ? { ...anchor, at: now } : null;
  try {
    window.dispatchEvent(new Event(ANCHOR_EVENT));
  } catch {
  }
}
export const peekAnchor = (now = Date.now()) => heldAnchor && now - heldAnchor.at < 6e4 ? { kind: heldAnchor.kind, id: heldAnchor.id } : null;
export function takeAnchor(now = Date.now()) {
  const held = peekAnchor(now);
  heldAnchor = null;
  return held;
}
export function routeAnchor(where = location, history = window.history) {
  const anchor = chatAnchor(where.hash);
  if (anchor) {
    history.replaceState(history.state, "", "#/workspace");
    holdAnchor(anchor);
  }
  return anchor;
}
export const onAnchor = (fn) => {
  addEventListener(ANCHOR_EVENT, fn);
  return () => removeEventListener(ANCHOR_EVENT, fn);
};
