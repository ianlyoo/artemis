import { parseCompany, heading } from "./company-message.js";
import { leadKo, user, isLead, ledgerName, isLedger, l10n } from "../names.js";
import { zoned } from "../zone.js";
const HEAD = /^> (?:답장|Reply) · ([^\r\n]+?) · (\d{1,2}\/\d{1,2} \d{2}:\d{2})\n/;
const APPROVAL = /^> (?:인용|Quote) · (?:결정|할 일|질문|목표|Decision|Step|Question|Goal) #\d+[^\n]*\n(?:>[^\n]*(?:\n|$))*/;
export const REPLY_GLYPH = "M9 5 3 11l6 6 M3 11h10a7 7 0 0 1 7 7";
export const SWIPE_THRESHOLD = 48;
export const replySwipe = (dx, dy) => dx >= SWIPE_THRESHOLD && Math.abs(dy) < 24 && dx > Math.abs(dy) * 1.5;
const timeFormat = zoned("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function replyTime(at) {
  if (!at) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(timeFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
export function replySender(item, identity) {
  if (item.role === "assistant" || item.role === "activity") return !identity || isLead(identity.role) ? leadKo() : identity.displayName || identity.role || l10n("에이전트", "Agent");
  const company = parseCompany(item.text);
  if (company) return heading(company).who || ledgerName();
  const source = item.source ?? "owner";
  if (source === "owner") return user();
  return isLead(source) ? leadKo() : isLedger(source) ? ledgerName() : { cto: "CTO", pm: "PM", worker: l10n("작업자", "Worker"), system: l10n("시스템", "System") }[source] ?? source;
}
export const replyText = (item) => String(item.text || item.segments?.filter((s) => s.type === "md").map((s) => s.text).join("\n") || (item.images?.length ? l10n(`사진 ${item.images.length}장`, `${item.images.length} photo${item.images.length > 1 ? "s" : ""}`) : item.attachments?.map((f) => f.name).join("\n") || "")).replace(/\r\n?/g, "\n");
export function makeReply(item, identity, selection = null) {
  const time = replyTime(item.at), who = replySender(item, identity).replace(/[\r\n]+/g, " ");
  const text = selection === null ? (parseReply(replyText(item))?.body ?? replyText(item)).split("\n").filter((s) => s.trim()).slice(0, 3).join("\n") : String(selection).replace(/\r\n?/g, "\n").trim();
  return time && text.trim() ? { who, time, text } : null;
}
export function replyBlock(reply) {
  return `> ${l10n("답장", "Reply")} · ${reply.who} · ${reply.time}
${reply.text.split("\n").map((line) => "> " + line).join("\n")}`;
}
export function parseReply(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n"), head = HEAD.exec(source);
  if (!head) return null;
  const rest = source.slice(head[0].length), lines = rest.split("\n"), quoted = [];
  let n = 0;
  while (n < lines.length && /^>(?: |$)/.test(lines[n])) quoted.push(lines[n++].replace(/^> ?/, ""));
  if (!quoted.length || !quoted.some((line) => line.trim())) return null;
  if (n < lines.length && lines[n].trim()) return null;
  return { who: head[1], time: head[2], text: quoted.join("\n"), body: lines.slice(n).join("\n").replace(/^\n+/, "") };
}
export function withoutQuote(text) {
  const source = String(text ?? ""), reply = parseReply(source);
  if (reply) return reply.body;
  return APPROVAL.test(source) ? source.replace(APPROVAL, "").replace(/^\n+/, "") : source;
}
export const withReply = (reply, words = "") => reply ? replyBlock(reply) + (String(words).trim() ? "\n\n" + withoutQuote(words) : "") : String(words);
const comparable = (text) => String(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "").replace(/\[\^\w+\]/g, "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
export function findReply(items, reply, identity) {
  const text = comparable(reply.text);
  if (!text) return null;
  return items.find((item) => replySender(item, identity) === reply.who && replyTime(item.at) === reply.time && [replyText(item), replyText(item).replace(/\[\^(\w+)\]/g, "$1")].some((source) => comparable(source).includes(text))) ?? null;
}
export const replyPreview = (reply) => reply.text.split("\n").find((line) => line.trim()) ?? "";
