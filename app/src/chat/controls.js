import { lead, ledgerName } from "../names.js";
export const ASKS = Object.freeze({ get stop() {
  return `Stop ${lead()}'s turn?`;
}, rewind: "Rewind to this message?", get rewindDetail() {
  return `${lead()} forgets the later messages. Files and ${ledgerName()} changes stay.`;
} });
export const controlsOf = (value) => Object.freeze({ cancel: value?.cancel === true, rewind: value?.rewind === true, renew: value?.renew === true });
export const NO_CONTROLS = controlsOf(null);
export function sendMode({ running = false, cancel = false, empty = true, declined = false } = {}) {
  return running && cancel && empty && !declined ? "stop" : "send";
}
export const canRewind = (controls, item) => controls?.rewind === true && item?.role === "user" && (item.source ?? "owner") === "owner" && typeof item.messageId === "string" && !!item.messageId && (item.local?.status === "sent" || !item.local && !String(item.key ?? "").startsWith("local:"));
export function fieldHeight({ want, base, collapsed = false }) {
  const tall = want > base + 1, folded = collapsed && tall;
  return { height: folded ? base : want, collapsed: folded, collapsible: tall && !folded };
}
