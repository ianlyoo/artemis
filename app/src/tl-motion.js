import { still } from "./motion-gate.js";
export const EASE = "cubic-bezier(.22,.8,.2,1)";
export const reduced = still;
export function slide(container, { duration = 560 } = {}) {
  const before = new Map();
  if (!reduced()) {
    for (const el of container.children) if (el.dataset.key != null && !el.classList.contains("tl-out")) before.set(el, el.getBoundingClientRect().top);
  }
  return () => {
    const moved = [];
    for (const el of before.size ? container.children : []) {
      const top = before.get(el);
      if (top == null || el.classList.contains("tl-out")) continue;
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) moved.push([el, dy]);
    }
    return () => {
      for (const [el, dy] of moved) el.animate([{ transform: "translateY(" + dy.toFixed(1) + "px)" }, { transform: "none" }], { duration, easing: EASE });
    };
  };
}
