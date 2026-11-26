import { el } from "./boards/dom.js";
import { getDesk, deskMode, permissionLine } from "./desk-notify.js";
import { iconButton, setIcon } from "./workspace/icons.js";
import { l10n } from "./names.js";
const STATE = { on: { glyph: "bell", label: "Notifications · on" }, "sound-off": { glyph: "bellMute", label: "Notifications · sound off" }, off: { glyph: "bellOff", label: "Notifications · off" } };
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export function createDeskMenu({ desk = getDesk() } = {}) {
  const id = "desk-menu-" + Math.random().toString(36).slice(2, 8);
  const button = iconButton("bell", STATE.on.label, { class: "desk-button", "aria-expanded": "false", "aria-controls": id });
  const row = (name, hint, onchange) => {
    const input = el("input", { type: "checkbox", role: "switch", class: "desk-switch", onchange });
    return { input, node: el("label", { class: "desk-row" }, el("span", { class: "desk-text" }, el("b", {}, name), el("small", {}, hint)), input) };
  };
  const notify = row(l10n("알림", "Notifications"), l10n("데스크톱 알림과 알림음", "Desktop notifications and their sound"), () => void desk.set("notify", notify.input.checked));
  const sound = row(l10n("소리만 끄기", "Mute the sound"), l10n("알림은 그대로 두고 소리만 꺼요", "Notifications stay; only the sound goes"), () => void desk.set("sound", !sound.input.checked));
  const note = el("p", { class: "desk-note", role: "status", hidden: true });
  const panel = el("div", { class: "desk-panel turn-pop desk-pop", id, role: "region", "aria-label": "Notifications", hidden: true }, notify.node, sound.node, note);
  const pop = popover(button, panel);
  let gone = false;
  function paint() {
    if (gone) return;
    const prefs = desk.prefs(), mode = deskMode(prefs), state = STATE[mode];
    button.dataset.state = mode;
    setIcon(button, state.glyph, state.label);
    notify.input.checked = prefs.notify;
    sound.input.checked = !prefs.sound;
    sound.input.disabled = !prefs.notify;
    sound.node.classList.toggle("is-disabled", !prefs.notify);
    const line = prefs.notify ? permissionLine(desk.permission()) : "";
    note.textContent = line;
    note.hidden = !line;
  }
  const off = desk.subscribe(paint);
  paint();
  return { button, panel, paint, destroy() {
    gone = true;
    off();
    pop.destroy();
    panel.remove();
    button.remove();
  } };
}
export function popover(button, panel) {
  let open = false;
  function show(on) {
    open = on;
    button.setAttribute("aria-expanded", String(on));
    if (panel.hidden === !on) return;
    panel.hidden = !on;
    if (on && !reduced() && typeof panel.animate === "function") panel.animate([{ opacity: 0, transform: "translateY(-.4em) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  button.addEventListener("click", () => show(!open));
  const away = (event) => {
    if (open && !panel.contains(event.target) && !button.contains(event.target)) show(false);
  };
  const escape = (event) => {
    if (open && event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      show(false);
      button.focus?.({ preventScroll: true });
    }
  };
  document.addEventListener("pointerdown", away, true);
  document.addEventListener("keydown", escape);
  return { show, destroy() {
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("keydown", escape);
  } };
}
