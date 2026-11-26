import { when } from "../boards/dom.js";
import { zoned } from "../zone.js";
import { classifyLink, useRoots } from "../chat/links.js";
import { extKey, extTarget, extLabel, extTitle, extWatch, isExtKind } from "./extensions.js";
import { has, ledgerRef, isLedger, l10n } from "../names.js";
export let WORK = null, SYSTEM = null;
const ROOT_PATH = /^\/(?!.*\/\.\.?(\/|$))[^\0]*[^/]$/;
export function learnRoots(entries) {
  const found = {};
  for (const entry of Array.isArray(entries) ? entries : []) if ((entry?.name === "work" || entry?.name === "system") && typeof entry.path === "string" && ROOT_PATH.test(entry.path)) found[entry.name] = entry.path;
  if (!found.work && !found.system) return false;
  const was = WORK + "\n" + SYSTEM;
  WORK = found.work ?? WORK;
  SYSTEM = found.system ?? SYSTEM;
  useRoots(WORK, SYSTEM);
  if (was === WORK + "\n" + SYSTEM) return false;
  emit("roots", { work: WORK, system: SYSTEM });
  return true;
}
const sheets = new Map();
export const stylesheet = (name) => {
  if (sheets.has(name)) return sheets.get(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./" + name, import.meta.url).href;
  const done = new Promise((resolve) => {
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => resolve(false), { once: true });
  });
  document.head.append(link);
  sheets.set(name, done);
  return done;
};
export const rel = (path) => WORK && String(path).startsWith(WORK + "/") ? "work/" + path.slice(WORK.length + 1) : SYSTEM && String(path).startsWith(SYSTEM + "/") ? "system/" + path.slice(SYSTEM.length + 1) : String(path);
export const abs = (label2) => WORK && /^work\//.test(label2) ? WORK + label2.slice(4) : SYSTEM && /^system\//.test(label2) ? SYSTEM + label2.slice(6) : label2;
export const fileName = (path) => String(path).split("/").filter(Boolean).at(-1) || String(path);
export const isolate = (text) => "⁨" + text + "⁩";
export const shortWhen = (value) => when(value).replace(/ KST$/, "");
export const boardMeta = (item, { phone = false } = {}) => phone ? [l10n("보드", "Board"), l10n(shortWhen(item.updatedAt) + " 수정", "Edited " + shortWhen(item.updatedAt)), item.source ? l10n("원본 ", "Source ") + fileName(item.source) : ""] : ["Board", "Edited " + shortWhen(item.updatedAt), item.source ? "Source " + rel(item.source) : ""];
const dayFormat = zoned("ko-KR", { month: "numeric", day: "numeric" });
export const day = (value) => Number.isFinite(Date.parse(value)) ? dayFormat.format(new Date(value)).replace(/\.\s?/g, "/").replace(/\/$/, "") : "";
export const keyOf = (target) => target.kind === "file" ? "file:" + target.path : target.kind === "board" ? "board:" + target.id : isLedger(target.kind) ? target.kind + ":" + target.ref : target.kind === "terminal" ? "term:" + target.id : target.kind === "image" ? "image:" + (target.images?.[target.index ?? 0]?.url ?? "") : target.kind === "archive" ? "archive:" + target.id : isExtKind(target.kind) ? extKey(target) : "block:" + JSON.stringify(target.block);
export const watchKeyOf = (target) => target?.kind === "file" || target?.kind === "board" ? keyOf(target) : extWatch(target);
export const sameTarget = (a, b) => !!a && !!b && keyOf(a) === keyOf(b);
const LEDGER_LISTS = ["goals", "requests", "approvals", "resources"];
const SENT_IMAGE = /^\/chat\/images\/home-[0-9a-f-]{36}\/[0-3]$/;
const sentPath = (url) => {
  const origin = globalThis.location?.origin;
  try {
    const at = new URL(url, origin);
    return at.origin === origin && SENT_IMAGE.test(at.pathname) && !at.search && !at.hash ? at.pathname : null;
  } catch {
    return null;
  }
};
const IMAGE_URL = /^(https?:\/\/|\/(?![/\\])|blob:https?:\/\/|data:image\/)/i;
export const servedImage = (target) => target?.kind === "image" && target.images.length <= 4 && target.images.every((image) => SENT_IMAGE.test(image.url));
export function toTarget(target) {
  if (!target || typeof target !== "object") return null;
  if (target.kind === "file") return typeof target.path === "string" && target.path.startsWith("/") ? { kind: "file", path: target.path } : null;
  if (target.kind === "board") {
    if (typeof target.id !== "string" || !target.id) return null;
    return /^archive:(board|asset|report|draft):./s.test(target.id) ? toTarget({ kind: "archive", id: target.id.slice(8) }) : { kind: "board", id: target.id };
  }
  if (isLedger(target.kind)) {
    if (typeof target.ref === "string") return /^(goal|request|approval)\/\d+$/.test(target.ref) || LEDGER_LISTS.includes(target.ref) ? { kind: target.kind, ref: target.ref } : null;
    return ["goal", "request", "approval"].includes(target.type) && Number.isSafeInteger(Number(target.id)) && Number(target.id) > 0 ? { kind: target.kind, ref: target.type + "/" + Number(target.id) } : null;
  }
  if (target.kind === "terminal") return has("terminals") && typeof target.id === "string" && target.id ? { kind: "terminal", id: target.id } : null;
  if (target.kind === "block") return target.block && typeof target.block === "object" ? { kind: "block", block: target.block } : null;
  if (target.kind === "archive") {
    if (!has("archive")) return null;
    if (typeof target.id !== "string" || target.id.length > 4200 || !/^(board|asset|report|draft):./s.test(target.id)) return null;
    return { kind: "archive", id: target.id, ...typeof target.title === "string" && target.title ? { title: target.title.slice(0, 300) } : {}, .../^\d{4}-\d{2}$/.test(target.month ?? "") ? { month: target.month } : {} };
  }
  if (target.kind === "image") {
    const list = Array.isArray(target.images) ? target.images : [];
    if (!list.length || !list.every((image) => typeof image?.url === "string" && IMAGE_URL.test(image.url))) return null;
    const index = Number.isInteger(target.index) && target.index >= 0 && target.index < list.length ? target.index : 0;
    const from = typeof target.from === "string" && target.from && target.from.length <= 40 ? { from: target.from } : {};
    return { kind: "image", images: list.map((image) => ({ url: sentPath(image.url) ?? image.url })), index, ...from };
  }
  return extTarget(target);
}
export const linkTarget = (href, origin = location.origin) => toTarget(classifyLink(href, origin));
export function chatTarget(target) {
  if (!isLedger(target?.kind)) return target ?? null;
  const [type, id] = target.ref.split("/");
  return id ? { kind: target.kind, type, id: Number(id) } : null;
}
export function parseKey(key) {
  const [, kind, rest] = String(key).match(/^([a-z][a-z0-9_]*):(.+)$/s) ?? [];
  if (!kind || !["file", "board", "term", "archive"].includes(kind) && !isLedger(kind)) return toTarget({ kind: ledgerRef(), ref: String(key) });
  return kind === "file" ? toTarget({ kind, path: rest }) : kind === "board" ? toTarget({ kind, id: rest }) : isLedger(kind) ? toTarget({ kind, ref: rest }) : kind === "term" ? toTarget({ kind: "terminal", id: rest }) : kind === "archive" ? toTarget({ kind, id: rest }) : null;
}
const LEDGER_NAMES = { goals: "Goals", requests: "Requests", approvals: "Approvals", resources: "Resources" };
export function ledgerLabel(ref) {
  const [kind, id] = String(ref).split("/");
  if (!id) return LEDGER_NAMES[kind] ?? ref;
  return (kind === "goal" ? "Goal" : kind === "request" ? "Request" : "Approval") + " #" + id;
}
export const termName = (term) => String((term?.owner === "home" ? term?.name : term?.title || term?.name) || "Terminal");
export function label(target, data) {
  if (target.kind === "file") return fileName(target.path);
  if (target.kind === "board") return data?.boards?.find((board) => board.id === target.id)?.title || target.id.slice(0, 8);
  if (isLedger(target.kind)) return ledgerLabel(target.ref);
  if (target.kind === "terminal") {
    const term = data?.terminals?.find((item) => item.id === target.id);
    return term ? termName(term) + (term.owner === "home" && term.cwd ? " · " + term.cwd : "") : "Terminal";
  }
  if (target.kind === "image") return "Image";
  if (target.kind === "archive") return target.title || data?.archive?.items?.find((item) => item.id === target.id)?.title || "Archived";
  if (isExtKind(target.kind)) return extLabel(target, data);
  return target.block?.title || target.title || "Visual";
}
export function title(target, data) {
  if (target.kind === "file") return data?.titles?.get(keyOf(target)) || fileName(target.path);
  if (isLedger(target.kind)) {
    const [kind, id] = target.ref.split("/");
    if (kind === "goal") {
      const goal = data?.goals?.find((item) => item.id === Number(id));
      if (goal) return "#" + goal.id + " " + goal.title;
    }
  }
  if (isExtKind(target.kind)) return extTitle(target, data);
  return label(target, data);
}
export const PREFIX = "artemis-home-ide-";
export function createSaved(storage = () => globalThis.localStorage) {
  return { read(key, fallback) {
    try {
      const value = storage()?.getItem(PREFIX + key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }, write(key, value) {
    try {
      const store = storage();
      if (!store) return false;
      if (value == null) store.removeItem(PREFIX + key);
      else store.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  } };
}
export const saved = createSaved();
const listeners = new Map();
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name)?.delete(fn);
}
export function emit(name, payload) {
  for (const fn of [...listeners.get(name) ?? []]) {
    try {
      fn(payload);
    } catch (error) {
      console.error("IDE:", error);
    }
  }
}
let opener = null, active = null;
export const setOpener = (fn) => {
  opener = fn;
};
export const open = (target, how = {}) => {
  const made = toTarget(target);
  return opener && made ? opener(made, how) : Promise.resolve(false);
};
export const ledgerHash = (ref) => /^goal\/\d+$/.test(ref) ? null : /^approval\/\d+$/.test(ref) ? "#/approvals/" + ref.slice(9) : ref === "approvals" ? "#/approvals" : /^requests?(\/\d+)?$/.test(ref) ? "#/requests" : "#/network";
export const setActive = (target) => {
  active = target;
  emit("active", target);
};
export const current = () => active;
const isPlain = (kind) => kind === "file" || kind === "board" || isLedger(kind);
export const RECENT = 12, PINS = 30;
export function lists(store = saved) {
  const known = new Map(), forgotten = new Map();
  const later = (a, b) => Number.isFinite(Date.parse(a)) && Number.isFinite(Date.parse(b)) && Date.parse(a) - Date.parse(b) > 1;
  return { recent: () => store.read("recent", []).map(toTarget).filter(Boolean), pins: () => store.read("pins", []).map(toTarget).filter(Boolean), touch(target) {
    const plain = toTarget(target);
    if (!plain || !isPlain(plain.kind)) return;
    store.write("recent", [plain, ...this.recent().filter((item) => !sameTarget(item, plain))].slice(0, RECENT));
    emit("recent");
  }, pinned: (target) => store.read("pins", []).some((item) => sameTarget(toTarget(item), target)), move(from, to) {
    const moved = (item) => item.kind === "file" && (item.path === from || item.path.startsWith(from + "/")) ? { ...item, path: to + item.path.slice(from.length) } : item;
    for (const name of ["recent", "pins"]) {
      const now = store.read(name, []).map(toTarget).filter(Boolean), next = now.map(moved);
      if (next.some((item, n) => item !== now[n])) {
        store.write(name, next);
        emit(name);
      }
    }
  }, forget(path) {
    const gone = (item) => item.kind === "file" && (item.path === path || item.path.startsWith(path + "/")), dropped = {};
    for (const name of ["recent", "pins"]) {
      const now = store.read(name, []).map(toTarget).filter(Boolean);
      dropped[name] = now.filter(gone);
      if (dropped[name].length) {
        store.write(name, now.filter((item) => !gone(item)));
        emit(name);
      }
    }
    if (dropped.recent.length || dropped.pins.length) forgotten.set(path, dropped);
  }, recall(path) {
    const back = forgotten.get(path);
    if (!back) return;
    forgotten.delete(path);
    for (const item of [...back.recent].reverse()) this.touch(item);
    for (const item of back.pins) this.pin(item, true);
  }, pin(target, on2) {
    const plain = toTarget(target);
    if (!plain || !isPlain(plain.kind)) return;
    const rest = this.pins().filter((item) => !sameTarget(item, plain));
    store.write("pins", (on2 ? [...rest, plain] : rest).slice(-PINS));
    emit("pins");
  }, know(key, mtime) {
    if (mtime && (!known.has(key) || later(mtime, known.get(key)))) {
      known.set(key, mtime);
      emit("seen", key);
    }
  }, changed(key) {
    const seen = store.read("seen", {})[key], now = known.get(key);
    return !!seen && !!now && later(now, seen);
  }, see(key, mtime) {
    this.know(key, mtime);
    const now = known.get(key);
    if (!now) return;
    const seen = store.read("seen", {});
    if (seen[key] === now) return;
    delete seen[key];
    seen[key] = now;
    store.write("seen", Object.fromEntries(Object.entries(seen).slice(-200)));
    emit("seen", key);
  } };
}
const SHAPES = [/\bhq_[A-Za-z0-9_-]{12,}/, /\bsk-[A-Za-z0-9_-]{16,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bxox[abposr]-[A-Za-z0-9-]{8,}/, /\bAKIA[0-9A-Z]{16}\b/, /-{5}BEGIN/, /\beyJ[A-Za-z0-9_-]{10,}/, /password\s*[=:]\s*["']?[^\s"'<>]{6,}/i];
export const MASK_SHAPES = { private_key: /-----BEGIN (?:[A-Z0-9 ]{1,64} )?PRIVATE KEY-----/, aws_access_key: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, github_token: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40})/, anthropic_key: /\bsk-ant-[A-Za-z0-9_-]{20}/, openai_key: /\bsk-[A-Za-z0-9_-]{20}/, "google_api_key": /\b(?:AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])|AQ\.[0-9A-Za-z_-]{40})/, slack_token: /\bxox[abprs]-[A-Za-z0-9-]{10}/, discord_token: /\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27}/, jwt: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8}/, hq_token: /\bhq_(?:host|agent|bot|home|cli|paseo)_[A-Za-z0-9_-]{20}/, bearer_token: /\b(?:[Bb]earer|Basic)\s{1,16}(?=[A-Za-z0-9._~+/-]{0,4095}\d)[A-Za-z0-9._~+/-]{16}/, assigned_secret: /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|totp|비밀번호|암호)\s{0,64}[:=]\s{0,64}[^\s'"<>,}]{6}/i, discord_webhook: /https?:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[^\s"'<>]/, stripe_key: /\b(?:sk_live|sk_test|rk_live|rk_test|pk_live)_[0-9A-Za-z]{20}/, stripe_webhook_secret: /\bwhsec_[0-9A-Za-z+/]{20}/ };
const LEDGER_SHAPES = [...Object.values(MASK_SHAPES), /[a-z][a-z0-9+.-]{0,63}:\/\/[^\s/:@]{1,512}:[^\s/@]{3,512}@/i];
const WORDS = /* @__PURE__ */ new Set(["password", "passwd", "passphrase", "pwd", "secret", "token", "credential", "credentials", "pin", "otp", "totp", "key", "authorization", "bearer", "cookie", "cvv", "cvc", "mnemonic"]);
const ENDINGS = /* @__PURE__ */ new Set(["ref", "reference", "id", "name", "path", "file", "label", "hash", "budget", "count", "limit", "usage", "estimate", "length"]);
const COMPACT = /^(?:api|access|private|client|auth|refresh|user|admin|login|db|database|account|service|secret)(?:password|passwd|passphrase|pwd|secret|token|credential|pin|otp|totp|key)$/;
const RELEASE = /* @__PURE__ */ new Set(["release", "image", "lime", "commit", "build", "base", "digest", "version"]);
const PINNED = /^(?:[0-9a-f]{7,40}|sha256:[0-9a-f]{64}|[^\s@'"<>]+@sha256:[0-9a-f]{64}|v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const spellings = (key) => [...new Set([key, key.replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z0-9])(?=[A-Z][a-z])/g, "_")].map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")))];
const credential = (names) => names.some((name) => /(?:^|_)(?:pincode|pin_code)(?:_|$)/.test(name)) || names.some((name) => {
  const words = name.split("_").filter(Boolean), compact = words.join("");
  if (!words.length || words.length === 2 && words[0] === "is" && words[1] === "secret" || words.length > 1 && ENDINGS.has(words.at(-1))) return false;
  return words.some((word) => WORDS.has(word)) || WORDS.has(compact) || COMPACT.test(compact);
});
function keyedSecret(text) {
  const assign = /([A-Za-z0-9_-]+)["']?[ \t]*[:=][ \t]*/g;
  for (let found = assign.exec(text); found; found = assign.exec(text)) {
    const names = spellings(found[1]), at = assign.lastIndex, quote = text[at] === '"' || text[at] === "'" ? text[at] : null;
    const pin = names.some((name) => name === "pin" || name.endsWith("_pin"));
    const value = quote ? text.slice(at + 1, (text.indexOf(quote, at + 1) + 1 || at + 130) - 1) : /^[^\s'"<>,}\]]*/.exec(text.slice(at))[0];
    if (pin) {
      if (!names.every((name) => name.endsWith("_pin") && RELEASE.has(name.slice(0, -4))) || !PINNED.test(value) || /^\d{7,40}$/.test(value)) return true;
    } else if (quote && text[at + 1] && text[at + 1] !== quote && !/\s/.test(text[at + 1]) && credential(names)) return true;
  }
  return false;
}
export const looksSecret = (text) => {
  const value = String(text ?? "");
  return !!value.trim() && (SHAPES.some((shape) => shape.test(value)) || LEDGER_SHAPES.some((shape) => shape.test(value)) || keyedSecret(value));
};
export function textIndex(root, skip = ".ide-fold,.fold-note,.bv-code-head,.cv-head .text-control,button") {
  const parts = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (node) => node.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    parts.push({ node, start: text.length });
    text += node.data;
  }
  return { text, parts };
}
const partAt = (index, offset) => {
  let lo = 0, hi = index.parts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (index.parts[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return index.parts[lo];
};
export function rangeOf(index, start, end) {
  if (!index.parts.length) return null;
  const a = partAt(index, start), b = partAt(index, Math.max(start, end - 1)), range = document.createRange();
  range.setStart(a.node, Math.min(a.node.data.length, start - a.start));
  range.setEnd(b.node, Math.min(b.node.data.length, end - b.start));
  return range;
}
export function offsetOf(index, node, offset) {
  if (node.nodeType === Node.TEXT_NODE) {
    const part = index.parts.find((item) => item.node === node);
    if (part) return part.start + offset;
  }
  const point = document.createRange();
  try {
    point.setStart(node, offset);
  } catch {
    return null;
  }
  for (const part of index.parts) if (point.comparePoint(part.node, 0) >= 0) return part.start;
  return index.text.length;
}
export function squeeze(text) {
  let s = "";
  const map = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) {
    s += text[i];
    map.push(i);
  }
  return { s, map };
}
export function locate(index, { exact, prefix = "", suffix = "" }) {
  const all = squeeze(index.text), quote = squeeze(String(exact).replace(/…$/, "")).s;
  if (!quote) return null;
  const hits = [];
  for (let at = all.s.indexOf(quote); at >= 0 && hits.length < 50; at = all.s.indexOf(quote, at + 1)) hits.push(at);
  if (!hits.length) return null;
  const before = squeeze(prefix).s.slice(-12), after = squeeze(suffix).s.slice(0, 12);
  const pick = hits.find((at) => (!before || all.s.slice(0, at).endsWith(before)) && (!after || all.s.slice(at + quote.length).startsWith(after))) ?? hits.find((at) => before && all.s.slice(0, at).endsWith(before)) ?? hits[0];
  return { start: all.map[pick], end: all.map[pick + quote.length - 1] + 1 };
}
export function highlight(name, ranges) {
  if (typeof Highlight !== "function" || !CSS.highlights) return;
  const list = ranges.filter(Boolean);
  if (list.length) CSS.highlights.set(name, new Highlight(...list));
  else CSS.highlights.delete(name);
}
export const clip = (text, n) => {
  const line = String(text ?? "").replace(/\s+/g, " ").trim(), points = [...line];
  return points.length > n ? points.slice(0, n - 1).join("").trimEnd() + "…" : line;
};
