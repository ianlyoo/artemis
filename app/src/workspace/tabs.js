import { keyOf, toTarget, servedImage, ledgerHash } from "./core.js";
import { isLedger } from "../names.js";
import { isExtKind, extKept } from "./extensions.js";
const tabbed = (target) => !isLedger(target.kind) || !ledgerHash(target.ref);
const kept = (target) => target.kind !== "block" && tabbed(target) && (target.kind !== "image" || servedImage(target)) && (!isExtKind(target.kind) || extKept(target));
export const RESTORE_TABS = 16;
export const canSplitSame = (target) => ["board", "file"].includes(target?.kind);
export function tabTarget(value) {
  const target = toTarget(value);
  return target && value?.view === 2 && canSplitSame(target) ? { ...target, view: 2 } : target;
}
export const tabKeyOf = (target) => (target?.view === 2 && canSplitSame(target) ? "view:2:" : "") + keyOf(target);
export function createTabs() {
  const list = [];
  let active = null;
  const find = (key) => list.find((tab) => tab.key === key) ?? null;
  return { get list() {
    return list;
  }, get active() {
    return active;
  }, find, open(target) {
    const made = toTarget(target);
    if (!made || !tabbed(made)) return { tab: null, added: false };
    const key = keyOf(made);
    let tab = active && keyOf(active.target) === key ? active : list.find((tab2) => keyOf(tab2.target) === key), added = false;
    if (!tab) {
      tab = { key, target: made };
      list.splice(active ? list.indexOf(active) + 1 : list.length, 0, tab);
      added = true;
    }
    return { tab, added };
  }, duplicate(tab) {
    if (!list.includes(tab) || !canSplitSame(tab.target)) return null;
    const key = keyOf(tab.target), other = list.find((item) => item !== tab && keyOf(item.target) === key);
    if (other) return other;
    const view = tab.view === 2 ? 1 : 2, target = toTarget(tab.target);
    const made = { key: tabKeyOf({ ...target, view }), target, ...view === 2 ? { view } : {} };
    list.splice(list.indexOf(tab) + 1, 0, made);
    return made;
  }, show(tab) {
    const before = active;
    if (list.includes(tab)) active = tab;
    return before;
  }, close(tab) {
    const at = list.indexOf(tab);
    if (at < 0) return { closed: false, next: active };
    list.splice(at, 1);
    if (tab !== active) return { closed: true, next: active };
    active = list[at] ?? list[at - 1] ?? null;
    return { closed: true, next: active };
  }, state() {
    const keep = list.filter((tab) => kept(tab.target));
    return { list: keep.map((tab) => tab.view === 2 ? { ...tab.target, view: 2 } : tab.target), active: active && keep.includes(active) ? active.key : null };
  }, restore(state) {
    const targets = Array.isArray(state?.list) ? state.list.map(tabTarget).filter((target) => target && target.kind !== "terminal" && kept(target)) : [];
    for (const entry of targets.slice(-RESTORE_TABS)) {
      const key = tabKeyOf(entry);
      if (!find(key)) list.push({ key, target: toTarget(entry), ...entry.view === 2 ? { view: 2 } : {} });
    }
    return find(state?.active) ?? list[0] ?? null;
  } };
}
