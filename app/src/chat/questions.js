import { segmentsOf } from "./segments.js";
import { parseChoices, SAME, REFUSED } from "./choices.js";
import { whoOf } from "./view.js";
import { markAnswered } from "../owner-steps.js";
import { leadKo, l10n, lead } from "../names.js";
const LEAD = 2e3;
const json = { "Content-Type": "application/json" };
export const notYetLine = () => l10n(`아직 답할 수 없어요. ${leadKo()}의 답이 끝나면 다시 눌러 주세요`, `Not yet: tap again once ${lead()} has finished replying`);
export const NOT_SENT = () => l10n("전송하지 못했어요", "Couldn't send");
export const NOT_NOTED = () => l10n("질문이 이미 닫혀 코멘트가 전달되지 않았어요", "The question was closed already, so the comment did not go");
const sameList = (a, b, same) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
const sameValue = (x, y) => Array.isArray(x) ? sameList(x, y, sameValue) : x === y;
const sameContent = (a, b) => !a === !b && (!a || (Array.isArray(a) ? sameList(a, b, (x, y) => x.page === y.page && x.text === y.text) : a.page === b.page && a.publish === b.publish && sameList(a.entries, b.entries, sameValue) && sameList(a.files, b.files, sameValue) && sameList(a.choices, b.choices, (x, y) => x.name === y.name && x.group === y.group && sameValue(x.value, y.value))));
const samePermission = (a, b) => !a || !b ? !a === !b : a.kind === b.kind && a.goal === b.goal && a.target?.to === b.target?.to && (a.target?.sha256 === b.target?.sha256 || !!(a.target?.form || a.target?.edits) && !(a.target?.sha256 && b.target?.sha256)) && sameContent(a.target?.form, b.target?.form) && sameContent(a.target?.edits, b.target?.edits) && sameList(a.target?.attachments ?? [], b.target?.attachments ?? [], (x, y) => x === y) && (a.kind !== "delete" || sameList(a.target?.paths, b.target?.paths, (x, y) => x === y)) && a.target?.payee === b.target?.payee && a.target?.cap?.amount === b.target?.cap?.amount && a.target?.cap?.currency === b.target?.cap?.currency;
export const sameSpec = (a, b) => !!a && !!b && (a.step ?? null) === (b.step ?? null) && samePermission(a.permission, b.permission) && (a.project ?? null) === (b.project ?? null) && (a.options || b.options ? sameList(a.options, b.options, (x, y) => x === y) : sameList(a.rows, b.rows, (x, y) => x?.q === y?.q && x?.guess === y?.guess));
const CONVERSATION = /^ledger:cv:([1-9][0-9]*)$/;
export function placeQuestions(items, records) {
  const placed = new Map(), rows = new Map();
  for (const record of records ?? []) {
    if (record.action?.board != null) continue;
    const id = String(record.conversation_id);
    if (!rows.has(id)) rows.set(id, []);
    rows.get(id).push(record);
  }
  if (!rows.size) return placed;
  const replies = (items ?? []).filter((item) => item?.role === "assistant" && typeof item.key === "string");
  const lastOfTurn = new Map();
  replies.forEach((item, i) => {
    if (item.turnKey) lastOfTurn.set(item.turnKey, i);
  });
  for (const reply of replies) {
    const id = reply.ledger && reply.key.match(CONVERSATION)?.[1];
    if (!id || !rows.has(id)) continue;
    for (const record of rows.get(id)) placed.set(`${reply.key}:${record.fence}`, record);
    rows.delete(id);
  }
  const free = [...rows.values()];
  replies.forEach((reply, i) => {
    if (reply.ledger || reply.turnKey && lastOfTurn.get(reply.turnKey) !== i) return;
    const fences = new Map(segmentsOf(reply).filter((segment) => segment.type === "choices" && !segment.pending).map((segment) => [segment.fence, parseChoices(segment.text)]));
    if (!fences.size) return;
    const from = Date.parse(reply.replyFrom ?? reply.at) - LEAD, next = replies[i + 1];
    const to = next ? Date.parse(next.replyFrom ?? next.at) : Infinity;
    const at = free.findIndex((row) => {
      const t = Date.parse(row[0].at);
      return t >= from && t <= to && row.every((record) => record.status === REFUSED ? fences.has(record.fence) : sameSpec(record.spec, fences.get(record.fence)));
    });
    if (at < 0) return;
    for (const record of free.splice(at, 1)[0]) placed.set(`${reply.key}:${record.fence}`, record);
  });
  return placed;
}
export async function answerQuestion(api, id, body) {
  let response, reply = null;
  try {
    response = await api("/questions/" + id + "/answer", { method: "POST", headers: json, body: JSON.stringify(body) });
    reply = await response.json();
  } catch {
    return { ok: false, line: NOT_SENT() };
  }
  if (!response.ok || !reply || String(reply.id) !== String(id)) return { ok: false, line: typeof reply?.message === "string" && response.status === 403 ? reply.message : NOT_SENT() };
  if (reply.status !== "open") markAnswered("question", id);
  return { ok: true, reply };
}
export function createQuestions({ api, items }) {
  let records = null, latest = null, reading = null, again = false, version = 0, placed = null, placedFor = null;
  const listeners = new Set();
  const changed = () => {
    version++;
    listeners.forEach((fn) => fn());
  };
  async function read() {
    try {
      const response = await api("/questions"), body = response.ok ? await response.json() : null;
      if (!Array.isArray(body?.items)) return false;
      const refused = Array.isArray(body.refused) ? body.refused.map((fence) => ({ ...fence, status: REFUSED })) : [];
      records = [...body.items, ...refused];
      latest = body.latest ?? null;
      changed();
      return true;
    } catch {
      return false;
    }
  }
  function load() {
    if (reading) {
      again = true;
      return reading;
    }
    reading = (async () => {
      let ok;
      do {
        again = false;
        ok = await read();
      } while (again);
      reading = null;
      return ok;
    })();
    return reading;
  }
  const placement = (list) => {
    const sign = version + "|" + list.length + "|" + list.at(-1)?.key + "|" + (list.at(-1)?.segments?.length ?? 0);
    if (placedFor !== sign) {
      placed = placeQuestions(list, records);
      placedFor = sign;
    }
    return placed;
  };
  function where(id) {
    if (records === null) return null;
    for (const [at, record] of placement(items())) if (String(record.id) === String(id)) return at.slice(0, at.lastIndexOf(":"));
    return null;
  }
  function find(key, fence) {
    if (records === null) return { loading: true };
    const list = items(), record = placement(list).get(`${key}:${fence}`);
    if (record) return { record };
    const reply = list.find((item) => item?.key === key);
    return reply && (latest === null || Date.parse(reply.at) > Date.parse(latest)) ? { waiting: true } : { none: true };
  }
  async function answer(key, fence, body) {
    let found = find(key, fence);
    if (!found.record) {
      await load();
      found = find(key, fence);
    }
    if (found.record?.status !== "open") return !found.record ? { ok: false, line: notYetLine() } : body?.picks?.length ? { ok: true, record: found.record } : { ok: false, line: NOT_NOTED() };
    const sent = await answerQuestion(api, found.record.id, body), had = found.record.notes?.length ?? 0;
    if (!sent.ok) return sent;
    const reply = sent.reply;
    records = records.map((record) => record.id === reply.id ? { ...record, status: reply.status, answer: reply.answer, ended_at: reply.ended_at, notes: reply.notes } : record);
    changed();
    if (!body?.picks?.length && !((reply.notes?.length ?? 0) > had)) return { ok: false, line: NOT_NOTED() };
    return { ok: true, record: records.find((record) => record.id === reply.id) };
  }
  return { load, find, where, answer, authorizes: true, tells: true, notes: true, get loaded() {
    return records !== null;
  }, subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  } };
}
export function questionCard(api, id) {
  id = String(id);
  let record = null, read = false;
  const listeners = new Set(), changed = () => listeners.forEach((fn) => fn());
  async function load() {
    try {
      const response = await api("/questions"), body = response.ok ? await response.json() : null;
      if (!Array.isArray(body?.items)) return false;
      record = body.items.find((item) => String(item.id) === id) ?? null;
      read = true;
      changed();
      return !!record;
    } catch {
      return false;
    }
  }
  function choice() {
    const spec = record?.spec;
    if (!spec || typeof spec !== "object") return null;
    const { details, ...rest } = spec;
    return parseChoices(JSON.stringify(Array.isArray(rest.options) ? { ...rest, options: rest.options.map((label, i) => details?.[i]?.line ? { label, line: details[i].line } : label) } : rest));
  }
  return { load, choice, authorizes: true, notes: true, get loaded() {
    return read;
  }, find: () => record ? { record } : read ? { record: { status: "closed" } } : { loading: true }, async answer(_key, _fence, body) {
    if (record?.status !== "open") return { ok: false, line: body?.picks?.length ? NOT_SENT() : NOT_NOTED() };
    const had = record.notes?.length ?? 0, sent = await answerQuestion(api, id, body);
    if (!sent.ok) return sent;
    const { status, answer, ended_at, notes } = sent.reply;
    record = { ...record, status, answer, ended_at, notes };
    changed();
    if (!body?.picks?.length && !((notes?.length ?? 0) > had)) return { ok: false, line: NOT_NOTED() };
    return { ok: true, record };
  }, subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  } };
}
const words = (value) => String(value ?? "").trim();
export function saidText(spec, { picks = [], comments = [], comment = "" } = {}) {
  const whole = words(comment), tail = whole ? [`코멘트: ${whole}`] : [];
  if (spec.options) return [picks[0], ...tail].join("\n");
  const notes = spec.rows.map((_, i) => words(comments[i]));
  if (!notes.some(Boolean) && !whole && spec.rows.every((row, i) => picks[i] === row.guess)) return SAME;
  return [...spec.rows.map((row, i) => `${row.q}: ${picks[i]}${notes[i] ? ` · 코멘트: ${notes[i]}` : ""}`), ...tail].join("\n");
}
export function readSaid(spec, text) {
  const lines = words(text).split("\n"), count = spec.options ? 1 : spec.rows.length, last = lines[count];
  if (lines.length > count + 1 || last !== void 0 && !last.startsWith("코멘트: ")) return null;
  const comment = last?.slice("코멘트: ".length) ?? "";
  if (spec.options) return spec.options.includes(lines[0]) ? { picks: [lines[0]], ...comment ? { comment } : {} } : null;
  if (lines.length === 1 && lines[0] === SAME) return { picks: spec.rows.map((row) => row.guess) };
  const picks = [], comments = [];
  for (const [i, row] of spec.rows.entries()) {
    const line = lines[i] ?? "", match = line.startsWith(`${row.q}: `) && line.slice(row.q.length + 2).match(/^(예|아니오)(?: · 코멘트: (.+))?$/);
    if (!match) return null;
    picks.push(match[1]);
    comments.push(match[2] ?? "");
  }
  return { picks, ...comments.some(Boolean) ? { comments } : {}, ...comment ? { comment } : {} };
}
export function threadQuestions({ items, answer, api }) {
  function answered() {
    const found = new Map(), open = [];
    for (const item of items() ?? []) {
      if (whoOf(item) !== "owner") {
        for (const segment of segmentsOf(item)) {
          const spec = segment.type === "choices" && !segment.pending && parseChoices(segment.text);
          if (spec) open.push({ id: `${item.key}:${segment.fence}`, spec });
        }
        continue;
      }
      if (item.local && item.local.status !== "sent") continue;
      for (let i = open.length - 1; i >= 0; i--) {
        const said = readSaid(open[i].spec, item.text);
        if (said) {
          found.set(open[i].id, { status: "answered", answer: said, ended_at: item.at });
          open.splice(i, 1);
          break;
        }
      }
    }
    return found;
  }
  return { load: async () => true, get loaded() {
    return true;
  }, subscribe: () => () => {
  }, find: (key, fence) => ({ record: answered().get(`${key}:${fence}`) ?? { status: "open" } }), async answer(key, fence, body) {
    const reply = items().find((item) => item?.key === key);
    const segment = reply && segmentsOf(reply).find((one) => one.type === "choices" && one.fence === fence);
    const spec = segment && parseChoices(segment.text);
    if (!spec) return { ok: false, line: NOT_SENT() };
    let result;
    try {
      result = await answer(saidText(spec, body), key);
    } catch {
      result = { ok: false };
    }
    if (!result?.ok) return { ok: false, line: result?.line || NOT_SENT() };
    if (spec.step) {
      try {
        await api("/owner-steps/" + spec.step + "/done", { method: "POST", headers: json, body: JSON.stringify({ quiet: true }) });
      } catch {
      }
    }
    return { ok: true };
  } };
}
