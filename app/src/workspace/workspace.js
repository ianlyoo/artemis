import { saved as kept, toTarget, servedImage } from "./core.js";
import { isExtKind, extKept } from "./extensions.js";
import { tabTarget, tabKeyOf } from "./tabs.js";
const KEYS = { tabs: "tabs", explorer: "explorer", panes: "panes", terms: "terms", phone: "phone", chat: "chat" };
const part = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const strings = (value, max, test = () => true) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.length <= 600 && test(item)))].slice(-max) : [];
const TERM_ID = /^[A-Za-z0-9_-]{1,80}$/;
const GONE_FOLDS = ["status"];
const HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const lasting = (target) => !!target && !["block", "terminal"].includes(target.kind) && (target.kind !== "image" || servedImage(target)) && (!isExtKind(target.kind) || extKept(target));
const keptSplit = (split, keys) => split && typeof split === "object" && keys.includes(split.a) && keys.includes(split.b) && split.a !== split.b ? { a: split.a, b: split.b, focus: split.focus === "b" ? "b" : "a" } : null;
export function readWorkspace(store = kept) {
  const tabs = store.read(KEYS.tabs, null), explorer = store.read(KEYS.explorer, null), panes = store.read(KEYS.panes, null), terms = store.read(KEYS.terms, null), phone = store.read(KEYS.phone, null);
  const list = Array.isArray(tabs?.list) ? tabs.list.map(tabTarget).filter(lasting) : [];
  const keys = list.map(tabKeyOf);
  const termList = strings(terms?.list, 8, (id) => TERM_ID.test(id));
  const last = toTarget(phone?.last);
  const sides = keptSplit(tabs?.split, keys);
  return { chat: { agentId: typeof store.read(KEYS.chat, null)?.agentId === "string" ? store.read(KEYS.chat, null).agentId.slice(0, 200) : null }, tabs: { list, active: keys.includes(tabs?.active) ? tabs.active : null, ...sides ? { split: sides } : {} }, explorer: { open: explorer?.open !== false, folds: strings(explorer?.folds, 40, (id) => !GONE_FOLDS.includes(id)), dirs: strings(explorer?.dirs, 200, (path) => path.startsWith("/")), host: typeof explorer?.host === "string" && HOST.test(explorer.host) ? explorer.host : null }, panes: { ex: part(panes?.ex, 0.05, 0.6), chat: part(panes?.chat, 0.1, 0.9), focus: panes?.focus === true, ...part(panes?.split, 0.1, 0.9) != null ? { split: panes.split } : {}, ...part(panes?.zoom, 0.8, 1.6) != null ? { zoom: Math.round(panes.zoom * 10) / 10 } : {} }, terms: { list: termList, active: termList.includes(terms?.active) ? terms.active : null, open: terms?.open === true, share: part(terms?.share, 0.05, 0.9), line: terms?.line === true }, phone: { last: lasting(last) && !isExtKind(last.kind) ? last : null, spots: phone?.spots && typeof phone.spots === "object" && !Array.isArray(phone.spots) ? Object.fromEntries(Object.entries(phone.spots).filter(([key, value]) => typeof key === "string" && Number.isFinite(value?.top)).slice(-40)) : {} } };
}
export function writeWorkspace(parts, store = kept) {
  if (parts.chat) store.write(KEYS.chat, { agentId: typeof parts.chat.agentId === "string" ? parts.chat.agentId.slice(0, 200) : null });
  if (parts.tabs) {
    const list = parts.tabs.list.map(tabTarget).filter(lasting), keys = list.map(tabKeyOf), sides = keptSplit(parts.tabs.split, keys);
    store.write(KEYS.tabs, { list, active: keys.includes(parts.tabs.active) ? parts.tabs.active : null, ...sides ? { split: sides } : {} });
  }
  if (parts.explorer) store.write(KEYS.explorer, parts.explorer);
  if (parts.panes) store.write(KEYS.panes, parts.panes);
  if (parts.terms) store.write(KEYS.terms, parts.terms);
  if (parts.phone) store.write(KEYS.phone, parts.phone.last?.kind === "image" && !servedImage(toTarget(parts.phone.last)) ? { ...parts.phone, last: null } : parts.phone);
}
