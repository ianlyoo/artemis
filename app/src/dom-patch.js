const LIVE = ["hovered", "traced", "selected", "moving", "dragging"], OWNED = ["class", "style", "hidden", "open", "data-density"];
function morph(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  for (const { name, value } of b.attributes) if (name !== "class" && name !== "hidden" && a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!OWNED.includes(name) && !b.hasAttribute(name)) a.removeAttribute(name);
  const cls = [b.getAttribute("class") || "", ...LIVE.filter((c) => a.classList.contains(c))].join(" ").trim();
  if ((a.getAttribute("class") || "") !== cls) a.setAttribute("class", cls);
  if (!a.hasAttribute("data-own")) merge(a, b);
}
function merge(a, b) {
  let seen = new Map();
  const key = (el) => {
    const k = el.nodeType === 1 ? el.dataset.node ?? el.dataset.lane ?? el.dataset.event ?? el.nodeName + "." + (el.classList[0] || "") : "#" + el.nodeType, i = seen.get(k) || 0;
    seen.set(k, i + 1);
    return k + "#" + i;
  };
  const old = new Map([...a.childNodes].map((el) => [key(el), el]));
  seen = new Map();
  let ref = a.firstChild;
  for (const n of [...b.childNodes]) {
    const k = key(n), el = old.get(k), use = el && el.nodeName === n.nodeName ? el : n;
    if (use === el) {
      old.delete(k);
      morph(el, n);
    }
    if (use === ref) ref = ref.nextSibling;
    else a.insertBefore(use, ref);
  }
  for (const el of old.values()) el.remove();
}
let template = null;
export function patch(target, html) {
  template ??= document.createElement("template");
  template.innerHTML = html;
  merge(target, template.content);
}
