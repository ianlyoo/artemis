import { trace } from "./model.js";
export function createHover(roots, read) {
  let hovered = null, frame = 0, leave = 0, cachedModel = null, cache = new Map(), dirty = true, nodes = new Map(), wires = [];
  const applied = new Map(), focus = roots[0];
  function path(key) {
    const { model } = read();
    if (model !== cachedModel) {
      cachedModel = model;
      cache = new Map();
    }
    if (!model || !key) return new Set();
    if (!cache.has(key)) cache.set(key, trace(model, key));
    return cache.get(key);
  }
  function classes(name, next) {
    for (const el of applied.get(name) || []) if (!next.has(el)) el.classList.remove(name);
    for (const el of next) if (!el.classList.contains(name)) el.classList.add(name);
    applied.set(name, next);
  }
  function paint() {
    frame = 0;
    if (dirty) {
      nodes = new Map();
      for (const root of roots) for (const el of root.querySelectorAll("[data-node]")) (nodes.get(el.dataset.node) || nodes.set(el.dataset.node, []).get(el.dataset.node)).push(el);
      wires = roots.flatMap((root) => [...root.querySelectorAll("[data-path]")].map((el) => [el, el.dataset.path.split(" ")]));
      for (const name of ["selected", "hovered", "traced"]) applied.set(name, new Set(roots.flatMap((root) => [...root.querySelectorAll("." + name)])));
      dirty = false;
    }
    if (!hovered?.isConnected) hovered = null;
    const { selected } = read(), key = hovered?.dataset.node, chosen = path(selected), over = path(key);
    const elements = (keys) => new Set([...keys].flatMap((id) => nodes.get(id) || [])), traced = elements(new Set([...chosen, ...over]));
    for (const [el, keys] of wires) if (keys.every((k) => chosen.has(k)) || keys.every((k) => over.has(k))) traced.add(el);
    classes("selected", elements([selected]));
    classes("hovered", elements([key]));
    classes("traced", traced);
    focus.classList.toggle("focus", !!key);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function refresh() {
    dirty = true;
    schedule();
  }
  function pointer(e) {
    const target = e.type === "pointerout" ? e.relatedTarget : e.target, next = target?.closest?.("[data-node]");
    const hit = next && roots.some((root) => root.contains(next)) && !next.matches("button,tr") ? next : null;
    clearTimeout(leave);
    if (hit === hovered) return;
    if (hit) {
      hovered = hit;
      schedule();
    } else leave = setTimeout(() => {
      hovered = null;
      schedule();
    }, 120);
  }
  for (const root of roots) {
    root.addEventListener("pointerover", pointer);
    root.addEventListener("pointerout", pointer);
    new MutationObserver(refresh).observe(root, { childList: true, subtree: true });
  }
  return { refresh, path };
}
