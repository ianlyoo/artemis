import { leadKo, userKo, isLead, ledgerName, ledgerRef, l10n } from "../names.js";
import { dayOf, unwall } from "../zone.js";
const say = (word) => Array.isArray(word) ? l10n(...word) : word;
export const COLUMNS = Object.freeze({ goals: { id: "#", title: ["목표", "Goal"], status: ["상태", "Status"], size: ["크기", "Size"], projects: ["프로젝트", "Projects"], created_at: ["만든 때", "Created"], updated_at: ["바뀐 때", "Updated"] }, events: { id: "#", at: ["때", "When"], kind: ["종류", "Kind"], actor: ["누가", "Who"], goal: ["목표", "Goal"], project: ["프로젝트", "Project"], agent: ["에이전트", "Agent"], summary: ["내용", "Summary"] }, requests: { id: "#", at: ["때", "When"], channel: ["경로", "Channel"], role: ["받은 쪽", "To"], status: ["상태", "Status"], goal: ["목표", "Goal"], text: ["요청", "Request"], result: ["결과", "Result"], closed_at: ["닫은 때", "Closed"] }, seats: { seat: "좌석", status: "상태", week_pct: "주간 사용률", five_hour_pct: "5시간 사용률", burn_per_hour: "시간당 소모", week_resets_at: "주간 초기화", five_hour_resets_at: "5시간 초기화", at: "확인 시각" }, resources: { kind: "종류", key: "이름", label: "기기", status: "상태", cpus: "CPU", load: "부하", mem_free_gb: "남은 메모리", disk_used_pct: "디스크 사용률", gpu_util: "GPU 사용률", gpu_mem_free_mb: "남은 GPU 메모리", gpu_mem_used_mb: "쓴 GPU 메모리", at: "확인 시각" } });
const ANY = Object.freeze(Object.assign({}, ...Object.values(COLUMNS), { id: "#", title: ["제목", "Title"], status: ["상태", "Status"], kind: ["종류", "Kind"], label: ["이름", "Name"], name: ["이름", "Name"], value: ["값", "Value"], count: ["개수", "Count"], date: ["날짜", "Date"], time: ["시각", "Time"], when: ["때", "When"], at: ["확인 시각", "Checked"], key: ["이름", "Name"] }));
export const UNITS = Object.freeze({ week_pct: "%", five_hour_pct: "%", disk_used_pct: "%", gpu_util: "%", mem_free_gb: "GB", gpu_mem_free_mb: "MB", gpu_mem_used_mb: "MB" });
const LEDGER = { goals: { received: "idle", planning: "idle", awaiting_approval: "wait", executing: "go", done_candidate: "done", done: "done", blocked: "stop", blocked_on_owner: "wait", awaiting_owner: "wait", paused: "idle", dropped: "idle", merged: "done" }, requests: { open: "wait", in_progress: "go", done: "done", dropped: "idle" } };
const RESOURCE = Object.fromEntries(Object.entries({ go: ["정상"], wait: ["오래됨", "새 작업 멈춤"], stop: ["연결 끊김", "만료", "인증 필요", "못 씀", "형식 오류", "한도 걸림"], idle: ["잠듦", "꺼짐", "알 수 없음", "쉬는 중", "없음"] }).flatMap(([tone, words]) => words.map((word) => [word, [word, tone]])));
const STATUS = { seats: RESOURCE, resources: { ...RESOURCE, OK: ["정상", "go"], OFFLINE: ["꺼짐", "stop"], WARN: ["주의", "wait"], DOWN: ["꺼짐", "stop"] } };
let ANY_STATUS;
export function statusLabels(words) {
  for (const [view, tones] of Object.entries(LEDGER)) STATUS[view] = Object.fromEntries(Object.entries(tones).map(([raw, tone]) => [raw, [words?.[raw] ?? raw, tone]]));
  ANY_STATUS = Object.assign({}, STATUS.seats, STATUS.resources, STATUS.requests, STATUS.goals, { closed: [["닫힘", "Closed"], "done"], running: [["실행 중", "Running"], "go"], failed: [["실패", "Failed"], "stop"], waiting: [["기다리는 중", "Waiting"], "wait"], idle: [["쉬는 중", "Idle"], "idle"], stuck: [["막힘", "Stuck"], "stop"] });
}
statusLabels(null);
const WRITTEN = new Map(Object.entries({ go: ["진행 중", "진행", "실행 중"], wait: ["대기", "대기 중", "보류", "보류 중", "검토", "검토 중"], stop: ["막힘", "실패", "중단"], done: ["끝", "완료"] }).flatMap(([tone, words]) => words.map((word) => [word.replace(/\s+/g, ""), tone])));
const SIZES = { small: ["작음", "Small"], big: ["큼", "Big"], medium: ["보통", "Medium"] };
const writtenTone = (raw) => {
  const word = raw.replace(/\s+/g, "");
  return WRITTEN.get(word) ?? (word === (userKo() + "대기").replace(/\s+/g, "") ? "wait" : void 0);
};
const ROLE_WORDS = Object.freeze({ cto: "CTO", pm: "PM", worker: ["작업자", "Worker"], reviewer: ["검토자", "Reviewer"], aide: ["보좌관", "Aide"] });
export const roleWord = (id) => isLead(id) ? leadKo() : id === "owner" ? userKo() : Object.hasOwn(ROLE_WORDS, id ?? "") ? say(ROLE_WORDS[id]) : void 0;
export function sourceView(src) {
  const at = String(src ?? ""), ref = ledgerRef() + ":", match = at.startsWith(ref) ? /^([a-z_]+)(?:\?(.*))?$/.exec(at.slice(ref.length)) : null;
  return match ? { view: match[1], filters: Object.fromEntries(new URLSearchParams(match[2] ?? "")) } : null;
}
export const columnLabel = (key, view = null) => say(COLUMNS[view]?.[key] ?? ANY[key] ?? key);
export function statusWord(value, view = null) {
  const raw = String(value ?? "").trim(), hit = STATUS[view]?.[raw] ?? ANY_STATUS[raw] ?? ANY_STATUS[raw.toLowerCase()] ?? ANY_STATUS[raw.toUpperCase()];
  return hit ? { word: say(hit[0]), tone: hit[1] } : { word: raw || "—", tone: writtenTone(raw) ?? "idle" };
}
export const isStatusValue = (value) => {
  const raw = String(value ?? "").trim();
  return !!raw && (statusWord(raw).word !== raw || writtenTone(raw) !== void 0);
};
export const isStatusColumn = (key, values) => /^(status|state|상태)$/i.test(String(key)) || values.length > 0 && values.every((value) => value == null || value === "" || statusWord(value).word !== String(value).trim());
const NUMBER = /^[-+−]?\d[\d,]*(?:\.\d+)?$/;
const TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;
export function shortTime(value, now = Date.now()) {
  const match = TIME.exec(String(value ?? ""));
  if (!match) return String(value ?? "");
  const [, y, m, d, hh, mm] = match, today = dayOf(now);
  if (`${y}-${m}-${d}` === today) return `${hh}:${mm}`;
  return y === today.slice(0, 4) ? `${Number(m)}/${Number(d)} ${hh}:${mm}` : `${y}-${m}-${d}`;
}
const DAY = /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2}))(?:[ T](\d{1,2}):(\d{2}))?(?![\d:/-])/;
const pad = (n) => String(n).padStart(2, "0");
export function whenDay(value, now = Date.now()) {
  const match = DAY.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, y, mo, d, m2, d2, hh, mm] = match, month = Number(mo ?? m2), date = Number(d ?? d2);
  if (month < 1 || month > 12 || date < 1 || date > 31 || hh != null && (Number(hh) > 23 || Number(mm) > 59)) return null;
  const at = (year2) => unwall(Date.UTC(year2, month - 1, date, Number(hh ?? 0), Number(mm ?? 0))), thisYear = Number(dayOf(now).slice(0, 4));
  const year = y ? Number(y) : [thisYear - 1, thisYear, thisYear + 1].reduce((best, next) => Math.abs(at(next) - now) < Math.abs(at(best) - now) ? next : best);
  return { day: `${year}-${pad(month)}-${pad(date)}`, time: hh == null ? "" : `${pad(hh)}:${mm}`, at: at(year) };
}
const NEAR = { [-1]: ["어제", "Yesterday"], 0: ["오늘", "Today"], 1: ["내일", "Tomorrow"] };
export function dayLine(day, now = Date.now()) {
  const [y, m, d] = day.split("-").map(Number), noon = Date.UTC(y, m - 1, d, 12), apart = Math.round((noon - Date.parse(dayOf(now) + "T12:00:00Z")) / 864e5);
  const weekday = new Date(noon).getUTCDay();
  return [say(NEAR[apart]), `${m}/${d}`, l10n("일월화수목금토"[weekday], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday])].filter(Boolean).join(" ");
}
export const isTimeColumn = (key, values) => /(^at$|_at$|^time$|^date$|^when$|시각$|때$)/i.test(String(key)) || values.length > 0 && values.every((value) => value == null || value === "" || TIME.test(String(value)));
export const isNumberColumn = (values) => values.some((value) => value != null && value !== "") && values.every((value) => value == null || value === "" || NUMBER.test(String(value).trim().replace(/%$/, "")));
export const toNumber = (value) => {
  const n = Number(String(value ?? "").trim().replace(/,/g, "").replace(/^−/, "-").replace(/%$/, ""));
  return Number.isFinite(n) ? n : NaN;
};
export function cellText(key, value, view = null, now = Date.now()) {
  if (value == null || value === "") return "—";
  const text = String(value);
  if (/^(status|state|상태)$/i.test(key)) return statusWord(text, view).word;
  if (/^(size|크기)$/.test(key) && SIZES[text]) return say(SIZES[text]);
  if (/^(role|actor|받은 쪽)$/.test(key) && roleWord(text)) return roleWord(text);
  if (UNITS[key] && NUMBER.test(text)) return UNITS[key] === "%" ? text + "%" : text + " " + UNITS[key];
  if (TIME.test(text)) return shortTime(text, now);
  return text;
}
export const seriesName = (name, view = null) => columnLabel(name, view);
export function unitOf(block) {
  const fromKey = (block?.series ?? []).map((series) => UNITS[series?.name]).find(Boolean);
  if (fromKey) return fromKey;
  const inTitle = /\(([^()]{1,6})\)\s*$/.exec(String(block?.title ?? ""));
  return inTitle ? inTitle[1] : "";
}
const VIEWS = { goals: ["목표", "goals"], events: ["오늘 기록", "today"], requests: ["요청", "requests"], seats: "좌석", resources: "기기", completed: ["완료한 일", "done"] };
export function provenanceLine(provenance, src, now = Date.now()) {
  const parts = String(provenance ?? "").split(" · ").filter(Boolean), source = sourceView(src);
  const stamped = parts.map((part) => {
    const match = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) KST 기준$/.exec(part);
    return match ? l10n(shortTime(match[1], now) + " 기준", "as of " + shortTime(match[1], now)) : part;
  });
  if (!source) return stamped.join(" · ");
  const filters = Object.entries(source.filters).map(([key, value]) => key === "status" && value === "active" ? source.view === "requests" ? l10n("열린 것", "open") : l10n("진행 중인 것", "under way") : key === "status" ? statusWord(value, source.view).word : ["goal", "id", "project"].includes(key) ? "#" + value : key === "kind" ? { host: "컴퓨터", gpu: "GPU" }[value] ?? value : key === "size" ? say({ big: ["큰 것", "big"], small: ["작은 것", "small"] }[value] ?? value) : value);
  return [ledgerName() + " " + say(VIEWS[source.view] ?? source.view), ...filters, ...stamped.slice(1)].join(" · ");
}
export function rowQuestion(view, cells) {
  const get = (key) => cells[key] == null || cells[key] === "" ? null : String(cells[key]);
  const quote = (text) => text.length > 40 ? text.slice(0, 39) + "…" : text;
  if (view === "goals" && get("id")) return l10n(`#${get("id")}${get("title") ? ` 「${quote(get("title"))}」` : ""} 지금 어디까지 됐어?`, `How far along is #${get("id")}${get("title") ? ` “${quote(get("title"))}”` : ""}?`);
  if (view === "requests" && get("id")) return l10n(`요청 #${get("id")}${get("text") ? ` 「${quote(get("text"))}」` : ""} 어떻게 됐어?`, `What became of request #${get("id")}${get("text") ? ` “${quote(get("text"))}”` : ""}?`);
  if (view === "seats" && get("seat")) return `${get("seat")} 좌석 사용량 어때?`;
  if (view === "resources" && (get("label") || get("key"))) return `${get("label") ?? get("key")} 지금 상태 어때?`;
  const first = Object.values(cells).find((value) => value != null && String(value).trim() && !NUMBER.test(String(value)));
  return first ? l10n(`「${quote(String(first))}」 이거 자세히 알려줘`, `Tell me more about “${quote(String(first))}”`) : null;
}
