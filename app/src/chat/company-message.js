import { ledgerName, ledgerRef, isLedger } from "../names.js";
const NOUNS = [["your ask", "ask"], ["admin job", "job"], ["daily report", "report"], ["goal", "goal"], ["ask", "ask"], ["project", "project"], ["request", "request"], ["approval", "approval"]];
const AGENTS = new Set(["cto", "pm", "worker", "reviewer"]);
const WAKE = /^\[company wake · ([a-z][\w-]*) · (\d+) items? · (\d\d-\d\d \d\d:\d\d) KST\][ \t]*(?:\n|$)/;
const ASK = /^(?:from (\S+?)(?: \(([^)]*)\))?|answered by (\S+?))(?: to (\w+))?( \(fyi\b[^)]*\))?(?: unanswered since (\d\d-\d\d \d\d:\d\d)(?: KST)?)?:\s*(?:"([\s\S]*?)"?)?\s*$/;
const MARK = /^⟦company:(worker)⟧[ \t]*/;
const HEADER = /^\[company ([a-z][\w-]*) · /;
const LAUNCH = "⟦company:launch⟧";
const lines = (text) => String(text ?? "").replace(/\r\n?/g, "\n");
export const isCompany = (text) => {
  const head = lines(String(text ?? "").slice(0, 160));
  return WAKE.test(head) || MARK.test(head);
};
export const isPrompt = (text) => {
  const head = String(text ?? "").slice(0, 40);
  if (head.startsWith(LAUNCH)) return true;
  const kind = HEADER.exec(head)?.[1];
  return !!kind && kind !== "wake";
};
export function parseItem(line, more = []) {
  const item = { kind: "other", id: null, title: null, status: null, now: null, from: null, to: null, actor: null, scope: null, since: null, text: null, line };
  let rest = line;
  const noun = NOUNS.find(([word]) => rest.toLowerCase().startsWith(word + " ") || rest.toLowerCase() === word);
  if (noun) {
    item.kind = noun[1];
    rest = rest.slice(noun[0].length).trimStart();
  }
  const id = /^#(\d+)\b\s*/.exec(rest);
  if (id) {
    item.id = Number(id[1]);
    rest = rest.slice(id[0].length);
  }
  if (item.kind === "report") {
    const day = /^(\d\d-\d\d): (\d+) events? since (.+)$/.exec(rest);
    if (day) Object.assign(item, { title: day[1], status: `${day[2]} events since ${day[3]}`, events: Number(day[2]) });
  } else {
    const title = /^"((?:[^"\\]|\\.)*)"/.exec(rest);
    if (title) {
      item.title = title[1];
      rest = rest.slice(title[0].length);
    }
    const ask = item.kind === "ask" ? ASK.exec(rest) : null;
    if (ask) {
      Object.assign(item, { from: ask[1] ?? ask[3] ?? null, scope: ask[2] ?? null, to: ask[4] ?? null, since: ask[6] ?? null, status: ask[3] ? "answered" : ask[6] ? "unanswered" : ask[5] ? "fyi" : "asked" });
      item.actor = item.from;
      item.text = ask[7] ?? null;
    } else if (item.kind === "ask") {
      Object.assign(item, { kind: "other", id: null, title: null });
    } else if (item.kind !== "other") {
      rest = rest.replace(/^:\s*/, "");
      const by = /^(.*?)\s+by (\w+)(?:\s*[:·]\s*|\s+(?=\())?([\s\S]*)$/.exec(rest);
      if (by) {
        item.status = by[1].trim() || null;
        item.actor = by[2];
        item.text = by[3].trim() || null;
      } else item.status = rest.trim() || null;
    }
  }
  if (more.length) item.text = [item.text, more.join("\n")].filter(Boolean).join("\n");
  if (item.status && item.kind !== "report") {
    const last = item.status.split("→").at(-1).trim();
    item.now = /^[a-z_]+(?: [a-z_]+)?$/.test(last) ? last.replace(" ", "_") : last.split(/\s+/)[0] || null;
  }
  const owner = /^\s*(?:-\s*)?Owner line\b[^:\n]*:\s*(.+)$/m.exec(item.text ?? "");
  if (owner) item.ownerLine = owner[1].trim().replace(/^"([\s\S]*)"$/, "$1");
  return item;
}
export function parseCompany(text) {
  const source = lines(text).replace(/\nInternal wake:[\s\S]*$/, ""), head = WAKE.exec(source);
  if (!head) return parseMarked(source);
  const out = { to: head[1], at: head[3], count: Number(head[2]), items: [], more: 0, senders: [] };
  let current = null;
  const flush = () => {
    if (current) out.items.push(parseItem(current.line, current.more));
    current = null;
  };
  for (const raw of source.slice(head[0].length).split("\n")) {
    const more = /^(\d+) more — see state\s*$/.exec(raw);
    if (more) {
      flush();
      out.more += Number(more[1]);
      continue;
    }
    if (raw.startsWith("- ")) {
      flush();
      current = { line: raw.slice(2).trim(), more: [] };
      continue;
    }
    if (current && (raw.startsWith("  ") || !raw.trim())) {
      current.more.push(raw.replace(/^ {2}/, ""));
      continue;
    }
    if (raw.trim()) {
      flush();
      current = { line: raw.trim(), more: [] };
    }
  }
  flush();
  for (const item of out.items) if (item.text) item.text = item.text.replace(/\n+$/, "");
  if (out.count > out.items.length + out.more) out.more = out.count - out.items.length;
  for (const item of out.items) {
    const who = AGENTS.has(item.actor) ? item.actor : !/[^\w-]/.test(item.actor ?? "") ? ledgerRef() : null;
    if (who && !out.senders.includes(who)) out.senders.push(who);
  }
  return out;
}
function parseMarked(source) {
  const mark = MARK.exec(source);
  if (!mark) return null;
  const [line = "", ...rest] = source.slice(mark[0].length).trim().split("\n"), text = rest.join("\n").replace(/^\s*\n|\s+$/g, "");
  const item = { kind: "note", id: null, title: null, status: null, now: null, from: mark[1], to: null, actor: mark[1], scope: null, since: null, text: text.trim() ? text : null, line: line.trim() };
  return { to: null, at: null, count: 1, items: [item], more: 0, senders: [mark[1]] };
}
export function mergeReminders(message) {
  if (!message) return message;
  const items = [], first = /* @__PURE__ */ new Map();
  let merged = 0;
  for (const item of message.items) {
    const key = item.kind === "ask" && item.id != null ? item.id : null, at = key === null ? void 0 : first.get(key);
    const row = at === void 0 ? null : items[at];
    const reminder = item.status === "unanswered", held = row?.status === "unanswered";
    if (!row || !reminder && !held) {
      if (key !== null && at === void 0) first.set(key, items.length);
      items.push(item);
      continue;
    }
    const words = held && !reminder ? item : row;
    items[at] = { ...words, status: "unanswered", now: "unanswered", since: (held ? row.since : item.since) ?? item.since ?? null };
    merged++;
  }
  return { ...message, items, merged };
}
const ROLE = { cto: "CTO", pm: "PM", worker: "Worker", reviewer: "Reviewer" };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function heading(message) {
  const count = Math.max(message.items.length + message.more, message.count - (message.merged ?? 0));
  return { who: message.senders.map((role) => isLedger(role) ? ledgerName() : ROLE[role] ?? role).join(", ") || ledgerName(), count: plural(count, "item") };
}
const KEEP_WARM = /^keep-warm for project #\d+: nothing new\b/;
export function isKeepWarm(text) {
  const message = parseCompany(text);
  return !!message && message.items.length > 0 && !message.more && message.count === message.items.length && message.items.every((item) => item.kind === "other" && KEEP_WARM.test(item.line) && !item.text);
}
export const isOk = (text) => /^ok\.?$/i.test(String(text ?? "").trim());
