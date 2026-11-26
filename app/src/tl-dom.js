import { still } from "./motion-gate.js";
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export function text(el, v) {
  const s = String(v ?? "");
  if (el.textContent !== s) el.textContent = s;
  return el;
}
export function cls(el, name, on) {
  if (el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
  return el;
}
export function css(el, props) {
  for (const [k, v] of Object.entries(props)) if (el.style.getPropertyValue(k) !== String(v)) el.style.setProperty(k, v);
  return el;
}
export function attr(el, name, v) {
  if (v == null || v === false) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== String(v)) el.setAttribute(name, v);
  return el;
}
export const OUT_MS = 420;
const settled = (n) => {
  while (n && n.classList.contains("tl-out")) n = n.nextElementSibling;
  return n;
};
function put(parent, el, before) {
  if (el.isConnected && parent.moveBefore) try {
    return parent.moveBefore(el, before);
  } catch {
  }
  parent.insertBefore(el, before);
}
export function sync(parent, items, keyOf, make, update, { enter = true } = {}) {
  if (enter && still()) enter = false;
  const keys = items.map((i) => String(keyOf(i))), keep = new Set(keys), old = new Map();
  for (const el of [...parent.children]) {
    if (el.dataset.key == null || el.classList.contains("tl-out")) continue;
    if (keep.has(el.dataset.key) && !old.has(el.dataset.key)) old.set(el.dataset.key, el);
    else leave(el);
  }
  const fresh = [];
  let prev = null;
  items.forEach((item, i) => {
    let el = old.get(keys[i]);
    if (el) old.delete(keys[i]);
    else {
      el = make(item);
      el.dataset.key = keys[i];
      if (enter) {
        el.classList.add("tl-enter");
        fresh.push(el);
      }
    }
    update(el, item);
    const want = settled(prev ? prev.nextElementSibling : parent.firstElementChild);
    if (el !== want) put(parent, el, want);
    prev = el;
  });
  if (fresh.length) requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const el of fresh) el.classList.remove("tl-enter");
  }));
  return parent;
}
export function leave(el) {
  el.classList.add("tl-out");
  el.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    if (el.classList.contains("tl-out")) el.remove();
  }, OUT_MS);
}
