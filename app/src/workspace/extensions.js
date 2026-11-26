import { el } from "../boards/dom.js";
import { iconButton } from "./icons.js";
import { has, ledgerRef } from "../names.js";
export const OWN_SECTIONS = ["find", "turn", "pinned", "recent", "ledger", "reports", "files", "status", "outline"];
export const ownKinds = () => ["file", "board", ledgerRef(), "terminal", "image", "block", "archive"];
const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const sections = new Map(), kinds = new Map(), tools = new Map(), rendered = new Set(), closed = new Set(), dashboards = new Set(), watchers = new Set();
let serial = 0;
const said = (error) => console.error("IDE extension:", error);
const safely = (fn, fallback, ...args) => {
  try {
    return fn(...args);
  } catch (error) {
    said(error);
    return fallback;
  }
};
const sorted = (map) => [...map.values()].sort((a, b) => a.order - b.order || a.serial - b.serial);
const need = (value, name) => {
  if (typeof value !== "function") throw new TypeError(name + " must be a function");
  return value;
};
const changed = (what) => {
  for (const fn of [...watchers]) safely(fn, null, what);
};
const undo = (map, id, spec, what) => () => {
  if (map.get(id) === spec) {
    map.delete(id);
    changed(what);
  }
};
export function registerSection({ id, title, glyph, order = 0, render, count = () => null } = {}) {
  if (!NAME.test(String(id)) || OWN_SECTIONS.includes(id) || sections.has(id)) throw new Error("registerSection: id " + id + " is taken or not [a-z][a-z0-9-]*");
  const spec = { id, title: String(title ?? id), glyph: String(glyph || "folder"), order: Number(order) || 0, serial: serial++, render: need(render, "render"), count: need(count, "count") };
  sections.set(id, spec);
  changed("sections");
  return undo(sections, id, spec, "sections");
}
export function registerKind(kind, { key, toTarget, label, title, kept = false, render, crumbs = null, watch = null } = {}) {
  if (!NAME.test(String(kind)) || ownKinds().includes(kind) || kinds.has(kind)) throw new Error("registerKind: kind " + kind + " is taken or not [a-z][a-z0-9-]*");
  const spec = { kind, key: need(key, "key"), toTarget: need(toTarget, "toTarget"), label: need(label, "label"), title: typeof title === "function" ? title : label, kept: kept === true, render: need(render, "render"), crumbs: typeof crumbs === "function" ? crumbs : null, watch: typeof watch === "function" ? watch : null };
  kinds.set(kind, spec);
  changed("kinds");
  return undo(kinds, kind, spec, "kinds");
}
export function registerDocTool({ id, glyph, label, order = 0, when = () => true, run } = {}) {
  if (!NAME.test(String(id)) || tools.has(id)) throw new Error("registerDocTool: id " + id + " is taken or not [a-z][a-z0-9-]*");
  if (!label) throw new Error("registerDocTool: a label (its English name)");
  const spec = { id, glyph: String(glyph || "plus"), label: String(label), order: Number(order) || 0, serial: serial++, when: need(when, "when"), run: need(run, "run") };
  tools.set(id, spec);
  changed("tools");
  return undo(tools, id, spec, "tools");
}
export function updateDocTools() {
  changed("when");
}
export function onDocRendered(fn) {
  rendered.add(need(fn, "onDocRendered"));
  return () => {
    rendered.delete(fn);
  };
}
export function onTabClosed(fn) {
  closed.add(need(fn, "onTabClosed"));
  return () => {
    closed.delete(fn);
  };
}
export function onDashboard(fn) {
  dashboards.add(need(fn, "onDashboard"));
  return () => {
    dashboards.delete(fn);
  };
}
export function onRegistry(fn) {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}
const SECTION_NEEDS = { drafts: "drafts", previews: "drafts", changes: "drafts" };
export const extSections = () => sorted(sections).filter((spec) => !SECTION_NEEDS[spec.id] || has(SECTION_NEEDS[spec.id]));
const TOOL_NEEDS = { save: "edit", "edit-source": "edit" };
export const extTools = () => sorted(tools).filter((spec) => !TOOL_NEEDS[spec.id] || has(TOOL_NEEDS[spec.id]));
export function sectionCount(spec, data) {
  const n = safely(spec.count, null, data);
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
export function sectionBody(spec, args) {
  let body;
  try {
    body = spec.render(args);
  } catch (error) {
    said(error);
    return [el("p", { class: "ex-quiet" }, "Couldn't show this section")];
  }
  return body == null ? null : [].concat(body).filter(Boolean);
}
export const isExtKind = (kind) => kinds.has(kind);
const KIND_NEEDS = { computer: "pc", sysmap: "sysmap", draft: "drafts", preview: "drafts", commit: "drafts", compare: "drafts", since: "drafts" };
export function extTarget(raw) {
  const spec = kinds.get(raw?.kind);
  if (!spec || KIND_NEEDS[spec.kind] && !has(KIND_NEEDS[spec.kind])) return null;
  const made = safely(spec.toTarget, null, raw);
  return made && typeof made === "object" && !Array.isArray(made) ? { ...made, kind: spec.kind } : null;
}
export function extKey(target) {
  const spec = kinds.get(target?.kind);
  if (!spec) return null;
  const key = String(safely(spec.key, "", target) ?? "");
  return key.startsWith(spec.kind + ":") ? key : spec.kind + ":" + key;
}
const named = (spec, fn, target, data) => {
  const text = fn ? safely(fn, null, target, data) : null;
  return text == null || text === "" ? spec.kind : String(text);
};
export const extLabel = (target, data) => {
  const spec = kinds.get(target?.kind);
  return spec ? named(spec, spec.label, target, data) : null;
};
export const extTitle = (target, data) => {
  const spec = kinds.get(target?.kind);
  return spec ? named(spec, spec.title, target, data) : null;
};
export function extCrumbs(target, data) {
  const spec = kinds.get(target?.kind);
  if (!spec) return null;
  const parts = spec.crumbs ? safely(spec.crumbs, null, target, data) : null;
  return Array.isArray(parts) && parts.length ? parts.map(String) : [extLabel(target, data)];
}
export function extWatch(target) {
  const spec = kinds.get(target?.kind);
  const key = spec?.watch ? safely(spec.watch, null, target) : null;
  return typeof key === "string" && key ? key : null;
}
export const extKept = (target) => kinds.get(target?.kind)?.kept === true;
export function mountKind(target, { host, api, store, open, onChange = () => {
} }) {
  const spec = kinds.get(target.kind);
  let life = null, made = null;
  async function render() {
    life?.abort();
    if (made?.dispose) safely(() => made.dispose(), null);
    made = null;
    const now = life = new AbortController();
    let result = null;
    try {
      result = await spec.render({ target, api, store, open, signal: now.signal, changed: () => {
        if (life === now) onChange("changed");
      } });
    } catch (error) {
      said(error);
    }
    if (life !== now) {
      if (result?.dispose) safely(() => result.dispose(), null);
      return false;
    }
    made = result?.node ? result : null;
    host.replaceChildren(made ? made.node : el("p", { class: "pane-muted" }, "Couldn't show this"));
    return !!made;
  }
  return { ready: spec ? render() : Promise.resolve(false), get shown() {
    return !!made;
  }, get head() {
    return made?.head !== false;
  }, get controls() {
    return made?.controls instanceof Element ? made.controls : null;
  }, get tools() {
    return made?.tools !== false;
  }, outline() {
    if (!made) return [];
    const list = safely(() => made.outline, []);
    return Array.isArray(list) ? list.filter((entry) => entry?.el).map((entry) => ({ level: Math.max(1, Math.min(6, Number(entry.level) || 1)), text: String(entry.text ?? ""), el: entry.el })) : [];
  }, async refresh() {
    if (made?.refresh) {
      try {
        await made.refresh();
      } catch (error) {
        said(error);
      }
      return true;
    }
    return render();
  }, dispose() {
    life?.abort();
    life = null;
    const was = made;
    made = null;
    if (was?.dispose) safely(() => was.dispose(), null);
  } };
}
export function createDocTools(context) {
  const node = el("span", { class: "ide-doctools" }), buttons = new Map();
  const shownFor = (spec, now) => !!now && safely(spec.when, false, { target: now.target, doc: now.doc }) === true;
  function button(spec) {
    const made = iconButton(spec.glyph, spec.label, { class: "ide-doctool", "data-tool": spec.id });
    made.addEventListener("click", () => {
      const now = context(), tool = tools.get(spec.id);
      if (tool && shownFor(tool, now)) safely(tool.run, null, now);
    });
    return made;
  }
  function paint() {
    const now = context(), list = extTools();
    for (const [id, made] of buttons) if (!tools.has(id)) {
      made.remove();
      buttons.delete(id);
    }
    for (const spec of list) if (!buttons.has(spec.id)) buttons.set(spec.id, button(spec));
    const order = list.map((spec) => buttons.get(spec.id));
    for (const [n, spec] of list.entries()) order[n].hidden = !shownFor(spec, now);
    if (order.length !== node.children.length || order.some((made, n) => node.children[n] !== made)) node.replaceChildren(...order);
    node.hidden = !list.length;
  }
  return { node, paint, buttons };
}
export function docRendered(doc) {
  for (const fn of [...rendered]) safely(fn, null, doc);
  changed("when");
}
export function tabClosed(target) {
  for (const fn of [...closed]) safely(fn, null, { target });
}
export function dashboardFrame(payload) {
  for (const fn of [...dashboards]) safely(fn, null, payload);
}
