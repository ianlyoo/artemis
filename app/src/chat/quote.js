import { createDraftKeeper, DRAFT_KEY } from "./draft.js";
import { withoutQuote } from "./reply.js";
import { leadRole, l10n } from "../names.js";
export const QUOTE_EVENT = "lead:quote", REVEAL_EVENT = "lead:reveal", QUOTE_FOCUS = "chat-quote-focus";
const line = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const clip = (value, n) => [...value].length > n ? [...value].slice(0, n - 1).join("") + "…" : value;
export function approvalQuote({ id, title }, origin) {
  const n = String(id), name = clip(line(title), 80);
  return `> ${l10n("인용", "Quote")} · ${l10n("결정 #", "Decision #")}${n}${name ? " · " + name : ""}
> ${String(origin).replace(/\/+$/, "")}/#/approvals/${encodeURIComponent(n)}
`;
}
export function todoQuote(item, origin) {
  if (item.kind === "approval") return approvalQuote({ id: item.id, title: item.what }, origin);
  const base = String(origin).replace(/\/+$/, ""), what = line(item.what), title = line(item.title), id = encodeURIComponent(item.id);
  const link = item.kind === "step" ? "/#/step/" + id : item.kind === "question" ? "/#/" + leadRole() + "/question/" + id : "/#/admin";
  return `> ${l10n("인용", "Quote")} · ${quoteRef(item)}${title && title !== what ? " · " + title : ""}
> ${what}
> ${base}${link}
`;
}
const REFS = () => ({ approval: l10n("결정 #", "Decision #"), step: l10n("할 일 #", "Step #"), question: l10n("질문 #", "Question #") });
export const quoteRef = (item) => REFS()[item.kind] ? REFS()[item.kind] + item.id : l10n("목표 #", "Goal #") + (item.goal_id ?? item.id);
export const quotedBy = (text, ref) => {
  const head = `> ${l10n("인용", "Quote")} · ${ref}`;
  return String(text ?? "").startsWith(head) && !/\d/.test(String(text)[head.length] ?? "");
};
export function withQuote(quote, text = "") {
  const rest = withoutQuote(text);
  return quote + (rest.trim() ? "\n" + rest.replace(/^\s*\n/, "") : "");
}
export function postQuote(text, { target = globalThis, storage = globalThis.localStorage ?? null, session = globalThis.sessionStorage ?? null } = {}) {
  const detail = { text, taken: false };
  target.dispatchEvent?.(new CustomEvent(QUOTE_EVENT, { detail }));
  if (detail.taken) return "composer";
  const keeper = createDraftKeeper({ storage, key: DRAFT_KEY }), kept = keeper.load();
  keeper.save({ text: withQuote(text, kept?.text), uploads: kept?.files ?? [] });
  try {
    session?.setItem(QUOTE_FOCUS, String(text.length));
  } catch {
  }
  return "draft";
}
export function takeQuoteFocus(session = globalThis.sessionStorage ?? null) {
  let raw = null;
  try {
    raw = session?.getItem(QUOTE_FOCUS) ?? null;
    session?.removeItem(QUOTE_FOCUS);
  } catch {
    return null;
  }
  const at = Number(raw);
  return raw !== null && Number.isSafeInteger(at) && at >= 0 ? at : null;
}
