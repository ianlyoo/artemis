export const EX_MIN = 200, EX_MAX = 0.3, RAIL = 48;
export const TERM_MIN = 120, TERM_MAX = 0.7, TERM_SHARE = 0.36;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const share = (value) => Math.round(value * 1e4) / 1e4;
export const docMin = (ui) => Math.max(440, Math.round(ui * 38));
export const chatMin = (ui) => Math.max(400, Math.round(ui * 40));
export const defaults = (width) => ({ ex: Math.min(clamp(width * 0.146, 240, 320), width * 0.22), chat: clamp(width * 0.27, 480, 600) });
export function layout({ width, ui = 12, ex = null, chat = null, explorer = true, focus = false }) {
  const base = defaults(width), room = width - docMin(ui), chatLeast = chatMin(ui);
  let exW = explorer ? clamp(ex != null ? ex * width : base.ex, EX_MIN, width * EX_MAX) : RAIL;
  if (focus) return { ex: Math.round(exW), chat: Math.round(width - exW), doc: 0 };
  let chatW = Math.max(chatLeast, chat != null ? chat * width : base.chat);
  const over = exW + chatW - room, give = (explorer ? exW - EX_MIN : 0) + chatW - chatLeast;
  if (over > 0 && give > 0) {
    const part = Math.min(1, over / give);
    if (explorer) exW -= (exW - EX_MIN) * part;
    chatW -= (chatW - chatLeast) * part;
  }
  exW = Math.round(exW);
  chatW = Math.round(chatW);
  return { ex: exW, chat: chatW, doc: width - exW - chatW };
}
export const dragExplorer = ({ width, ui = 12, chat }, px) => share(clamp(px, EX_MIN, Math.min(width * EX_MAX, width - chat - docMin(ui))) / width);
export const dragChat = ({ width, ui = 12, ex }, px) => share(clamp(px, chatMin(ui), width - ex - docMin(ui)) / width);
export const dragTerm = ({ height }, px) => share(clamp(px, TERM_MIN, height * TERM_MAX) / height);
export const SPLIT_MIN = 1100, SPLIT_GAP = 10;
export const sideMin = (ui) => Math.max(400, Math.round(ui * 33));
export const splitFits = ({ width, ui = 12, scale = 1 }) => width * Math.max(1, scale || 1) >= SPLIT_MIN && width >= 2 * sideMin(ui) + SPLIT_GAP;
export function splitWidths({ width, ui = 12, share: part = null }) {
  const room = width - SPLIT_GAP, least = Math.min(sideMin(ui), room / 2);
  const a = Math.round(clamp((part ?? 0.5) * room, least, room - least));
  return { a, b: room - a };
}
export const dragSplit = ({ width, ui = 12 }, px) => {
  const room = width - SPLIT_GAP, least = Math.min(sideMin(ui), room / 2);
  return share(clamp(px, least, room - least) / room);
};
export const DOC_MAX = 1280;
export const readWidth = (ui) => Math.min(840, 66 * ui);
export function docMeasure({ column, ui = 12 }) {
  const pad = Math.max(2 * ui, column * 0.035), inner = Math.max(0, column - 2 * pad);
  return { pad, width: Math.min(inner, DOC_MAX, Math.max(readWidth(ui), inner * 0.8)) };
}
export function snapAfter(snap, dy, height) {
  if (snap !== "full") return dy < -56 ? "full" : dy > 72 ? "closed" : "half";
  return dy > height * 0.5 ? "closed" : dy > 56 ? "half" : "full";
}
