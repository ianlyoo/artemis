import { offerReload } from "./update.js";
export const PHONE_QUERY = "(max-width: 767.98px)";
export const isTouchIPad = ({ userAgent = "", maxTouchPoints = 0 } = {}) => maxTouchPoints > 1 && /iPad|Macintosh/.test(userAgent);
export function portrait(view) {
  const type = view.screen?.orientation?.type;
  if (/^(portrait|landscape)-/.test(type ?? "")) return type.startsWith("portrait");
  if (typeof view.orientation === "number") return Math.abs(view.orientation) % 180 === 0;
  return view.matchMedia("(orientation: portrait)").matches;
}
export const phoneLayout = ({ ipad, narrow, portrait: portrait2 }) => narrow || ipad && portrait2;
export function currentLayout(view = globalThis) {
  const ipad = isTouchIPad(view.navigator);
  const narrow = ipad ? view.innerWidth < 768 : view.matchMedia(PHONE_QUERY).matches;
  return phoneLayout({ ipad, narrow, portrait: portrait(view) }) ? "phone" : "pc";
}
export function watchLayout({ view = globalThis, initial = currentLayout(view), notify = () => offerReload({ view }), blocked = () => false } = {}) {
  const width = view.matchMedia(PHONE_QUERY), orientation = view.matchMedia("(orientation: portrait)");
  let timer = 0, notified = false, composing = false;
  const check = () => {
    view.clearTimeout(timer);
    timer = view.setTimeout(() => {
      if (notified || currentLayout(view) === initial) return;
      if (blocked() || isTouchIPad(view.navigator) && composing) {
        check();
        return;
      }
      notified = true;
      notify();
    }, 160);
  };
  width.addEventListener("change", check);
  orientation.addEventListener("change", check);
  view.screen?.orientation?.addEventListener("change", check);
  view.addEventListener("orientationchange", check);
  view.addEventListener("resize", check);
  const composeStart = () => {
    composing = true;
  }, composeEnd = () => {
    composing = false;
    check();
  };
  view.addEventListener("compositionstart", composeStart);
  view.addEventListener("compositionend", composeEnd);
  return () => {
    view.clearTimeout(timer);
    width.removeEventListener("change", check);
    orientation.removeEventListener("change", check);
    view.screen?.orientation?.removeEventListener("change", check);
    view.removeEventListener("orientationchange", check);
    view.removeEventListener("resize", check);
    view.removeEventListener("compositionstart", composeStart);
    view.removeEventListener("compositionend", composeEnd);
  };
}
