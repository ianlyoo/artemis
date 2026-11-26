import { statusWord, roleWord } from "./visual-labels.js";
import { heading, mergeReminders } from "./company-message.js";
import { lead, isLead, ledgerName, l10n } from "../names.js";
export const OWN = Object.freeze({ get answered() {
  return l10n("답변함", "Answered");
}, get fyi() {
  return l10n("참고", "FYI");
}, get unanswered() {
  return l10n("미답변", "Unanswered");
}, get roadmap_submitted() {
  return l10n("로드맵 제출", "Roadmap submitted");
} });
const TONES = { wait: "warn", done: "ok", stop: "bad" };
const OWN_TONE = { unanswered: "warn", roadmap_submitted: "warn" };
export const KIND_NAME = Object.freeze({ goal: "Goal", ask: "Ask", project: "Project", request: "Request", approval: "Approval", job: "Admin job", report: "Daily report", other: "", note: "" });
const ROLE = { cto: "CTO", pm: "PM", worker: "Worker", reviewer: "Reviewer", owner: "you" };
export const role = (id) => isLead(id) ? lead() : ROLE[id] ?? id;
const SAYS = [[/^memory maintenance due \((\w+)\)(?:.*?\((\d+) %\))?.*$/, (_, who, pct) => l10n(`${roleWord(who) ?? who} 메모리 정리 필요`, `${roleWord(who) ?? who} memory upkeep due`) + (pct ? ` · ${pct} %` : "")], [/^Agent \S+ on (\S+): turn finished\b.*$/, (_, host) => l10n(`작업자 차례 끝남 · ${host}`, `Worker turn ended · ${host}`)], [/; no reason to wait since \d\d-\d\d (\d\d:\d\d) KST \(last activity\), (\d+) minutes$/, (_, at, n) => l10n(` · ${at}부터 ${n}분째 움직임 없음`, ` · no activity for ${n}m since ${at}`)], [/; its check \d\d-\d\d (\d\d:\d\d) KST is due$/, (_, at) => l10n(` · ${at} 확인 시각 지남`, ` · check at ${at} is past`)]];
export const korean = (text) => text && SAYS.reduce((words, [from, to]) => words.replace(from, to), text);
export function stateOf(value) {
  if (!value) return null;
  if (OWN[value]) return { word: OWN[value], tone: OWN_TONE[value] ?? null };
  const hit = statusWord(value, "goals");
  return hit.word !== value ? { word: hit.word, tone: TONES[hit.tone] ?? null } : null;
}
export function partsOf(item) {
  if (item.kind === "note") return { id: "", title: item.line, text: item.text ?? "", state: null, tone: null, by: item.from };
  if (item.kind === "report") {
    const digest = (item.text ?? "").split("\n").map((line) => line.trim()).filter((line) => line && !/^events /.test(line));
    const since = /since (.+)$/.exec(item.status ?? "")?.[1];
    return { id: item.title ?? "", title: item.events != null ? l10n(`${since ? since + "부터 " : ""}이벤트 ${item.events}건`, `${item.events} events${since ? " since " + since : ""}`) : item.status ?? item.line, text: digest.slice(0, 3).join("\n"), state: null, tone: null, by: null };
  }
  if (item.kind === "ask") {
    const [first = "", ...rest] = (item.text ?? "").split("\n"), state2 = item.status === "asked" ? null : stateOf(item.status);
    return { id: item.id != null ? "#" + item.id : "", title: item.ownerLine ?? first, text: item.ownerLine ? first : rest.join("\n"), state: state2?.word ?? (item.status === "asked" ? null : item.status), tone: state2?.tone ?? null, by: item.from };
  }
  const state = stateOf(item.now), auto = / \(auto\)$/.test(item.status ?? "") ? l10n(" (자동)", " (auto)") : "";
  return { id: item.id != null ? "#" + item.id : "", title: item.title ?? korean(item.line), text: item.title ? item.text ?? "" : "", state: item.title ? state ? state.word + auto : korean(item.status) : null, tone: item.title ? state?.tone ?? null : null, by: item.actor };
}
export const TITLE_MAX = Object.freeze({ pc: 96, phone: 58 });
export function cut(text, max) {
  const words = String(text ?? "");
  if (words.length <= max) return words;
  return (words.slice(0, max).replace(/\s+\S*$/, "") || words.slice(0, max)) + " …";
}
export function cardOf(parsed, { phone = false } = {}) {
  const message = mergeReminders(parsed), { who, count } = heading(message), max = phone ? TITLE_MAX.phone : TITLE_MAX.pc;
  const many = message.items.length > 1, several = message.senders.length > 1;
  const rows = message.items.map((item, n) => {
    const parts = partsOf(item), title = parts.title ?? "", shown = item.kind === "note" ? title : cut(title, max);
    return { key: "r" + n, kind: item.kind, id: [KIND_NAME[item.kind], parts.id].filter(Boolean).join(" "), title: shown, full: shown === title ? null : title, state: parts.state, tone: parts.tone, by: many && several && parts.by ? role(parts.by) : null, text: parts.text || null };
  });
  const one = message.items.length === 1 && !message.more ? { id: rows[0].id, title: partsOf(message.items[0]).title ?? "" } : null;
  return { glyph: message.items.length === 1 && message.items[0].kind === "ask" ? "ask" : "wake", who, count, one, rows, more: message.more > 0 ? `${message.more} more in ${ledgerName()}` : null, merged: message.merged };
}
