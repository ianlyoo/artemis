import { still as gateStill } from "../motion-gate.js";
const EASE = "cubic-bezier(.2,.8,.2,1)", DURATION = 300;
export function tabMotion(list) {
  let before = null;
  const tabs = () => [...list.querySelectorAll(":scope>.ide-tab[data-key]")];
  const look = (node) => {
    const style = node && globalThis.getComputedStyle?.(node);
    return style ? { color: style.color, textShadow: style.textShadow } : null;
  };
  const still = () => !globalThis.matchMedia || gateStill();
  return { record() {
    before = null;
    if (still()) return;
    before = { rects: new Map(), active: null, quiet: null, lit: null };
    for (const tab of tabs()) {
      if (typeof tab.getBoundingClientRect !== "function") return void (before = null);
      const rect = tab.getBoundingClientRect(), label = tab.querySelector(".ide-tab-label");
      before.rects.set(tab.dataset.key, rect);
      if (tab.classList.contains("is-active")) {
        before.active = { key: tab.dataset.key, rect };
        before.lit = look(label);
      } else before.quiet ??= look(label);
    }
  }, play() {
    const was = before;
    before = null;
    if (!was?.rects.size || !list.isConnected || still()) return;
    const timing = { duration: DURATION, easing: EASE };
    for (const tab of tabs()) {
      if (typeof tab.animate !== "function") return;
      const key = tab.dataset.key, rect = tab.getBoundingClientRect(), old = was.rects.get(key), label = tab.querySelector(".ide-tab-label");
      const dx = old ? old.left - rect.left : 0, active = tab.classList.contains("is-active");
      if (!old) tab.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], timing);
      else if (Math.abs(dx) > 0.5) tab.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], timing);
      if (active && was.active && was.active.key !== key) {
        const from = was.active.rect, shift = from.left - rect.left - dx, scale = rect.width ? from.width / rect.width : 1;
        tab.animate([{ transform: `translateX(${shift}px) scaleX(${scale})` }, { transform: "none" }], { ...timing, pseudoElement: "::before" });
        if (was.quiet && label) label.animate([was.quiet, look(label)], timing);
      } else if (!active && was.active?.key === key && was.lit && label) label.animate([was.lit, look(label)], timing);
    }
  } };
}
