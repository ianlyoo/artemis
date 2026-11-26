import { dayKey, dayLabel } from "./motion.js";
import { segmentsOf } from "./segments.js";
import { visualKind, KIND } from "./kinds.js";
import { imageOf } from "./step-words.js";
import { sameTurn, inTurn, isPost } from "./turns.js";
import { replyTime } from "./reply.js";
import { isNoReply, isInternal } from "./no-reply.js";
import { isCompany, isKeepWarm, isOk, isPrompt } from "./company-message.js";
import { isNotice } from "./notices.js";
import { lead, leadRole, l10n } from "../names.js";
export const whoOf = (item) => item?.ledger ? item.role === "user" ? "owner" : "lead" : item?.fold === "keep-warm" ? "keep-warm" : item?.role === "assistant" ? "lead" : item?.role === "activity" ? "activity" : item?.role === "user" && isCompany(item.text) ? "company" : item?.role === "user" && isPrompt(item.text) ? "prompt" : item?.role === "user" && (item.source ?? "owner") === "owner" ? "owner" : "system";
const lastTurn = (item) => [item.ledger.lastTurnAt, item.at].filter((at) => Number.isFinite(Date.parse(at ?? ""))).reduce((late, at) => late === void 0 || Date.parse(at) > Date.parse(late) ? at : late, void 0) ?? item.at;
export function rows(items, start = 0, end = items.length) {
  const out = [], days = new Set();
  for (let i = Math.max(0, start); i < Math.min(end, items.length); i++) {
    const item = items[i], day = dayKey(item.at);
    if (day && !days.has(day)) {
      days.add(day);
      out.push({ key: "day:" + day, day: dayLabel(item.at) });
    }
    out.push({ key: item.key, item, index: i });
    let next = i + 1;
    while (isNotice(items[next])) next++;
    if (item.ledger && item.ledger.agentId !== items[next]?.ledger?.agentId) {
      out.push({ key: "seam:" + item.key, seam: l10n("이전 대화 · ", "Earlier · ") + replyTime(lastTurn(item)) });
    }
  }
  return out;
}
export const WINDOW = Object.freeze({ initial: 60, grow: 40, max: 140 });
export function createWindow(limits = WINDOW) {
  let first = null, last = null;
  return { limits, span(keys) {
    const at = last === null ? -1 : keys.indexOf(last), end = at >= 0 ? at + 1 : keys.length;
    let start = first === null ? -1 : keys.indexOf(first);
    if (start < 0 || start >= end) start = Math.max(0, end - limits.initial);
    return { start, end };
  }, set(keys, { start, end }) {
    first = keys[start] ?? null;
    last = end >= keys.length ? null : keys[end - 1] ?? null;
  }, reset() {
    first = last = null;
  }, get first() {
    return first;
  }, get last() {
    return last;
  } };
}
export function around(n, first, last, reach = 0, limits = WINDOW) {
  first = Math.max(0, Math.min(first, n - 1));
  last = Math.max(first, Math.min(last, n - 1));
  if (last + 1 - first >= limits.max) return { start: first, end: Math.min(n, first + limits.max) };
  const want = reach + limits.grow, start = Math.max(0, first - want), end = Math.min(n, last + 1 + want);
  const above = first - start, below = end - last - 1, spare = limits.max - (last + 1 - first);
  if (above + below <= spare) return { start, end };
  const keep = Math.min(above, Math.max(spare - below, Math.floor(spare / 2)));
  return { start: first - keep, end: last + 1 + spare - keep };
}
export function place(span, n, view, limits = WINDOW) {
  let next = null;
  if (view.pinned) {
    if (span.end < n || span.end - span.start > limits.max) next = { start: Math.max(0, n - limits.initial), end: n };
    else if (view.above && span.start > 0) next = { start: Math.max(0, span.start - limits.grow, n - limits.max), end: n };
  } else {
    const out = view.first < span.start || view.last >= span.end;
    const short = view.above && span.start > 0 || view.below && span.end < n;
    if (out || short || span.end - span.start > limits.max) next = around(n, view.first, view.last, view.reach, limits);
  }
  return next && (next.start !== span.start || next.end !== span.end) ? next : null;
}
const oneLine = (text, limit = 90) => {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  return line.length > limit ? line.slice(0, limit - 1) + "…" : line;
};
export function outline(items) {
  const out = [];
  for (const item of items) {
    const who = whoOf(item);
    if (who === "owner") {
      const files = (item.images?.length || 0) + (item.attachments?.length || 0);
      const text = oneLine(item.text) || (files ? files + (files === 1 ? " attachment" : " attachments") : "");
      if (text) out.push({ key: item.key, kind: "ask", at: item.at ?? null, text });
    } else if (who === "lead") {
      segmentsOf(item).forEach((segment, index) => {
        const block = segment?.type === "block" ? segment.block : null;
        const kind = visualKind(block);
        if (kind) out.push({ key: item.key, kind, segment: index, title: oneLine(block.title, 60) || KIND[kind] });
      });
    }
  }
  return out;
}
export const entryId = (entry) => entry.kind === "ask" ? entry.key : entry.key + "#" + entry.segment;
export const STATE_LINES = Object.freeze({ get connecting() {
  return `Connecting to ${lead()}…`;
}, offline: "Reconnecting…", get no_target() {
  return `Can't find ${lead()} right now`;
}, get version_mismatch() {
  return `${lead()} chat is under maintenance`;
} });
const DOWN = "Disconnected from Home · you can send once it reconnects";
export function stateLine(store) {
  const { state, line, canSend } = store.state;
  if (state === "connecting") return line ?? STATE_LINES.connecting;
  if (!store.live) return DOWN;
  if (state === "ready") return canSend ? null : line ?? "Can't send right now";
  if (store.state.fallback && canSend) return null;
  return line ?? STATE_LINES[state] ?? STATE_LINES.offline;
}
export const fallbackLine = (store) => store.state.fallback && store.state.canSend && store.live ? store.state.line : null;
export const linkDown = (store) => !store.live || store.state.state === "connecting";
const PROVIDER_IMAGE = /^\s*!\[[^\]]*\]\([^)]*paseo-attachments(?:-[^/\\)]+)?[/\\]+(?:[^/\\)]+[/\\]+)?[0-9a-f]{64}\.[a-z0-9]+\)/;
export function providerImages(text) {
  let rest = String(text ?? ""), count = 0, hit;
  while (hit = PROVIDER_IMAGE.exec(rest)) {
    rest = rest.slice(hit[0].length);
    count++;
  }
  return count ? { count, rest: rest.replace(/^\s+/, "") } : null;
}
function imageParts(item) {
  if (item?.role !== "assistant") return null;
  const segments = Array.isArray(item.segments) ? item.segments : null, first = segments ? segments[0] : { type: "md", text: item.text };
  const found = first?.type === "md" ? providerImages(first.text) : null;
  if (!found) return null;
  const step = { key: item.key + ":image", role: "activity", text: "", at: item.at ?? null, messageId: null, source: item.source ?? leadRole(), fromHome: false, images: [], attachments: [], streaming: false, turnKey: item.turnKey ?? null, tools: Array.from({ length: found.count }, () => ({ name: "Image", status: "done", refs: [] })), more: 0 };
  const after = segments ? [...found.rest ? [{ ...first, text: found.rest }] : [], ...segments.slice(1)] : null;
  const rest = segments ? after.length ? { ...item, segments: after, text: found.rest } : null : found.rest ? { ...item, text: found.rest } : null;
  return [step, rest];
}
export function withImageSteps(items, cache = new WeakMap()) {
  const out = [];
  for (const item of items) {
    let parts = cache.get(item);
    if (parts === void 0) {
      parts = imageParts(item);
      cache.set(item, parts);
    }
    if (!parts) {
      out.push(item);
      continue;
    }
    const [step, rest] = parts, prev = out.at(-1);
    const seen = prev?.role === "activity" && (prev.turnKey ?? null) === (step.turnKey ?? null) && !!imageOf(prev.tools?.at(-1));
    if (!seen) out.push(step);
    if (rest) out.push(rest);
  }
  return out;
}
const isNote = (item) => item.role === "note" || item.role === "activity" && item.wake != null;
export function withWakeNotes(items, cache = new WeakMap()) {
  const notes = new Map();
  for (const item of items) if (isNote(item)) notes.set(item.wake, [...notes.get(item.wake) ?? [], item]);
  if (!notes.size) return items;
  return items.flatMap((item) => {
    if (isNote(item)) return [];
    const mine = notes.get(item.key);
    if (!mine) return [item];
    let joined = cache.get(item);
    if (joined?.notes.length !== mine.length || mine.some((note, n) => joined.notes[n] !== note)) {
      joined = { ...item, notes: mine };
      cache.set(item, joined);
    }
    return [joined];
  });
}
export function withKeepWarm(items, cache = new WeakMap()) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const wake = items[i], reply = items[i + 1];
    if (!reply || reply.role !== "assistant" || reply.streaming || whoOf(wake) !== "company" || sameTurn(reply, items[i + 2])) {
      out.push(wake);
      continue;
    }
    const segments = segmentsOf(reply), said = segments.length && segments.every((segment) => segment.type === "md") ? segments.map((segment) => segment.text ?? "").join("") : null;
    if (said === null || reply.images?.length || reply.attachments?.length || !isOk(said) || !isKeepWarm(wake.text)) {
      out.push(wake);
      continue;
    }
    let folded = cache.get(wake);
    if (folded?.reply !== reply) {
      folded = { key: wake.key, role: "user", fold: "keep-warm", at: wake.at ?? null, text: wake.text, wake, reply };
      cache.set(wake, folded);
    }
    out.push(folded);
    i++;
  }
  return out;
}
const silent = new WeakMap();
export const turnSilent = (item) => {
  let said = silent.get(item);
  if (said === void 0) {
    said = quiet(item);
    silent.set(item, said);
  }
  return said;
};
const quiet = (item) => {
  if (isPost(item)) return false;
  if (item.ledger) return item.role === "assistant" && (isNoReply(item.text) || isInternal(item.text));
  if (item.role === "activity") return !(item.tools ?? []).some((tool) => imageOf(tool));
  if (item.role !== "assistant" || item.images?.length || item.attachments?.length) return false;
  const segments = segmentsOf(item);
  return segments.every((segment) => segment.type === "md") && isNoReply(segments.map((segment) => segment.text ?? "").join(""));
};
export function withoutNoReply(items) {
  const out = [];
  for (let i = 0; i < items.length; ) {
    if (!inTurn(items[i])) {
      if (whoOf(items[i]) !== "prompt") out.push(items[i]);
      i++;
      continue;
    }
    let end = i + 1;
    while (end < items.length && sameTurn(items[i], items[end])) end++;
    const run = items.slice(i, end), trigger = i > 0 ? items[i - 1] : null;
    const internal = !!trigger && (items[i].ledger ? !(trigger.role === "user" && trigger.ledger?.agentId === items[i].ledger.agentId) : trigger.role === "user" && whoOf(trigger) !== "owner");
    if (!(internal && (whoOf(trigger) === "prompt" || run.some((item) => item.role === "assistant")) && run.every(turnSilent))) out.push(...run);
    i = end;
  }
  return out;
}
