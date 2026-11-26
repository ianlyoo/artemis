import { zoned } from "../zone.js";
export const TARGET = Object.freeze({ kind: "db", id: "search" });
const zoneParts = zoned("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function dayTime(value) {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return null;
  const p = Object.fromEntries(zoneParts.formatToParts(at).map((part) => [part.type, part.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export const zoneToday = (now = Date.now()) => dayTime(now).day;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayName(day, now = Date.now()) {
  const today = zoneToday(now), yesterday = dayTime(now - 864e5).day, [year, month, date] = day.split("-");
  const short = `${Number(month)}/${Number(date)}`;
  if (day === today) return `Today · ${short}`;
  if (day === yesterday) return `Yesterday · ${short}`;
  const weekday = WEEKDAY[(new Date(`${day}T12:00:00+09:00`)).getUTCDay()];
  return year === today.slice(0, 4) ? `${weekday} ${short}` : `${weekday} ${day}`;
}
export const recapPath = ({ query = "", before = null } = {}) => {
  const p = new URLSearchParams();
  if (query.trim()) p.set("query", query.trim());
  if (before) p.set("before", before);
  return "/db/recap" + (String(p) ? "?" + p : "");
};
export const LEAD_THREAD = "@lead";
export const threadKey = (thread, lead) => lead && thread?.role === lead ? LEAD_THREAD : thread?.agent_id ?? thread?.name ?? "";
export function recapDays(lines, now = Date.now(), lead = null) {
  const days = [];
  for (const line of lines) {
    const day = dayTime(line.at)?.day;
    if (!day) continue;
    let group = days.at(-1);
    if (group?.day !== day) days.push(group = { day, name: dayName(day, now), threads: [] });
    const key = threadKey(line.thread, lead);
    let thread = group.threads.find((item) => item.key === key);
    if (!thread) group.threads.push(thread = { key, name: line.thread?.name || "Chat", title: line.thread?.title ?? null, lines: [] });
    thread.lines.push(line);
  }
  return days;
}
export function outcome(line) {
  const request = line.request, reply = line.reply?.text || null;
  if (request?.status === "done") return { word: "Done", tone: "done", text: request.result || reply };
  if (request?.status === "dropped") return { word: "Dropped", tone: "dropped", text: request.result || reply };
  if (line.handled) return { word: "Done", tone: "done", text: line.handled };
  if (request) return { word: request.status === "open" ? "Waiting" : "In progress", tone: "open", text: reply };
  return { word: null, tone: null, text: reply };
}
export const failure = (status, body, ledger = "Ledger") => status === 400 && body?.message ? body.message : status === 502 || !status ? ledger + " didn't answer" : `${ledger} said ${status}`;
export function terms(query) {
  return [...new Set(String(query).replace(/["()]/g, " ").split(/\s+/).map((word) => word.replace(/^[-+]|\bOR\b/g, "").trim()).filter((word) => word && word !== "OR" && word.length >= (/[가-힣]/.test(word) ? 1 : 2)))];
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PARTICLES = "이랑|랑|이나|에서|에게|께서|한테|에|의|을|를|이|가|은|는|도|으로|로|와|과|만|까지|부터|처럼|보다|하고|들|이에요|예요|입니다|이고|이다|이야|이며";
export function litPattern(words) {
  if (!words.length) return null;
  const phrase = words.length > 1 ? [words.map(escape).join("\\s*")] : [];
  const typed = [...phrase, ...[...words].sort((a, b) => b.length - a.length).map(escape)];
  const each = words.map(escape).join("|");
  return new RegExp(`(?:(?<![\\p{L}\\p{N}])|(?<=${each}))(?:${typed.join("|")})(?=(?:${each}|${PARTICLES}){0,2}(?![\\p{L}\\p{N}]))`, "giu");
}
export function litParts(text, pattern) {
  const value = String(text ?? "");
  if (!pattern) return [{ text: value, lit: false }];
  const out = [];
  let at = 0;
  for (const match of value.matchAll(pattern)) {
    if (!match[0]) continue;
    if (match.index > at) out.push({ text: value.slice(at, match.index), lit: false });
    out.push({ text: match[0], lit: true });
    at = match.index + match[0].length;
  }
  if (at < value.length) out.push({ text: value.slice(at), lit: false });
  return out;
}
export const MEETINGS = "/meetings?status=all";
export const meetingPath = (id) => `/meetings/${encodeURIComponent(id)}`;
export const MEETING_STATUS = { requested: "Requested", scheduled: "Scheduled", preflight: "Starting", speaking: "Speaking", waiting: "Your turn", saved: "Saved", closing: "Wrapping up", ended: "Ended", failed: "Stopped", answered: "Answered in chat" };
export function meetingDays(meetings, at, now = Date.now()) {
  const time = (meeting) => at(meeting) ? Date.parse(at(meeting)) : Infinity, days = [];
  for (const meeting of [...meetings].sort((a, b) => time(b) - time(a) || 0)) {
    const day = at(meeting) ? dayTime(at(meeting))?.day ?? "" : "";
    let group = days.at(-1);
    if (group?.day !== day) days.push(group = { day, name: day ? dayName(day, now) : "No time yet", meetings: [] });
    group.meetings.push(meeting);
  }
  return days;
}
export const meetingMatch = (meeting, word, query) => !query.trim() || `${meeting.title ?? ""} #${meeting.id} #${meeting.goal_id ?? ""} ${word}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
