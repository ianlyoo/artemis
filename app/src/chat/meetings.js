import { clock, dayKey } from "./motion.js";
import { userKo, isLead } from "../names.js";
export const MEETING = "meeting:";
export const meetingKey = (id) => MEETING + id;
export const isMeetingKey = (key) => typeof key === "string" && key.startsWith(MEETING);
const STATES = { requested: ["회의 요청", "wait"], scheduled: ["예정", "idle"], preflight: ["준비 중", "run"], speaking: ["말하는 중", "run"], waiting: ["말씀 기다리는 중", "wait"], saved: ["저장됨", "idle"], closing: ["정리하는 중", "run"], ended: ["끝남", "idle"], failed: ["멈춤", "stuck"], answered: ["채팅으로 답함", "idle"] };
const DAY = 864e5;
export const when = (at) => !clock(at) ? "" : dayKey(at) === dayKey((new Date()).toISOString()) ? clock(at) : `${+dayKey(at).slice(5, 7)}/${+dayKey(at).slice(8)} ${clock(at)}`;
export const meetingWord = (status, meeting) => status === "scheduled" && when(meeting?.starts_at) ? `예정 · ${when(meeting.starts_at)}` : STATES[status]?.[0] ?? status ?? "";
export const meetingTone = (status) => STATES[status]?.[1] ?? "idle";
export const isLive = (meeting) => !!meeting && !["ended", "failed", "answered"].includes(meeting.status);
export const isPlanned = (meeting) => ["requested", "scheduled"].includes(meeting?.status);
export const tookPlace = (meeting) => meeting?.round > 0;
export const canSay = (meeting) => ["speaking", "waiting", "saved", "scheduled"].includes(meeting?.status);
export const canAnswer = (meeting) => meeting?.status === "requested";
export const canSeat = (meeting) => ["preflight", "speaking", "waiting", "saved"].includes(meeting?.status);
export const canEnd = (meeting) => ["requested", "scheduled", "preflight", "speaking", "waiting", "saved"].includes(meeting?.status);
export function nearSlots(now = Date.now()) {
  const half = 30 * 6e4, first = Math.ceil((now + 20 * 6e4) / half) * half;
  const today = Math.floor((now + 9 * 36e5) / DAY);
  const word = (t, at) => {
    const d = Math.floor((t + 9 * 36e5) / DAY) - today;
    return d === 0 ? "오늘" : d === 1 ? "내일" : `${+dayKey(at).slice(5, 7)}/${+dayKey(at).slice(8)}`;
  };
  return [first, first + 36e5, (today + 1) * DAY - 9 * 36e5 + 10 * 36e5].map((t) => {
    const at = new Date(t).toISOString();
    return { at, label: `${word(t, at)} ${clock(at)}` };
  });
}
export const seatMark = (member) => (member.role === "member" ? member.name : member.label || member.name || "?").slice(0, 1).toUpperCase();
const KINDS = { request: "회의 요청", weekly: "주간 회의" };
const PURPOSE = { chair: () => "회의를 이끌고 결정을 정리해요", lead: () => `${userKo()}의 뜻을 지켜요`, cto: () => "기술 방향을 잡아요", pm: (m) => {
  const id = m.project_id ?? /^pm-(\d+)$/.exec(m.name)?.[1];
  return id ? `프로젝트 #${id}의 일을 맡아요` : "맡은 프로젝트의 일을 말해요";
}, member: () => "다른 모델의 눈으로 한 번 더 봐요" };
const SPOKE = { spoke: "말했어요", speaking: "말하는 중", silent: "말 안 했어요" };
export function speakingLine(meeting) {
  const seat = (meeting.members ?? []).find((member) => member.name === meeting.speaker);
  return `${meeting.round}라운드` + (seat ? ` · ${seat.label || seat.name} 발언 중이에요` : "");
}
export function meetingDetail(meeting, items = [], { agenda = null, goalTitle = null } = {}) {
  const round = meeting.round ?? 0, open = round > 0 && ["speaking", "waiting", "saved"].includes(meeting.status);
  const spoke = new Set(items.filter((item) => item.round === round).map((item) => item.speaker));
  const started = when(meeting.started_at), ended = when(meeting.ended_at), starts = when(meeting.starts_at);
  return { id: meeting.id, title: meeting.title || `회의 #${meeting.id}`, kind: KINDS[meeting.kind] ?? "회의", status: STATES[meeting.status]?.[0] ?? meeting.status, tone: meetingTone(meeting.status), goal: meeting.goal_id ? `목표 #${meeting.goal_id}${goalTitle ? ` · ${goalTitle}` : ""}` : "여러 목표", time: started ? `${started} 시작${ended ? ` · ${ended} 끝` : ""}` : starts && isPlanned(meeting) ? `${starts} 예정` : null, round: round > 0 ? `${round}라운드` : null, agenda, seats: (meeting.members ?? []).map((member) => {
    const now = meeting.status === "speaking";
    const state = !open ? null : now && member.name === meeting.speaker ? "speaking" : spoke.has(member.name) ? "spoke" : now ? null : "silent";
    return { name: member.name, label: member.label || member.name, mark: seatMark(member), member: member.role === "member", purpose: PURPOSE[isLead(member.role) ? "lead" : member.role]?.(member) ?? "", state, stateWord: state && SPOKE[state] };
  }) };
}
export function meetingRow(meeting) {
  return { id: meetingKey(meeting.id), role: "meeting", displayName: meeting.title || `회의 #${meeting.id}`, state: meeting.status, goalId: meeting.goal_id, live: isLive(meeting), lastActivityAt: meeting.ended_at ?? meeting.waiting_since ?? meeting.started_at ?? meeting.starts_at ?? null, meeting };
}
export const POLL = Object.freeze({ live: 2e3, most: 3e4 });
const REFUSED = { meeting_closed: "회의가 이미 끝났어요", invalid_text: "보낼 말이 비었거나 너무 길어요", http_403: "이 기기에서는 회의에 말할 수 없어요", conflict: "회의가 그사이 바뀌었어요. 다시 읽어 올게요", invalid_starts_at: "앞으로 30일 안의 시간을 골라 주세요", bad_request: "앞으로 30일 안의 시간을 골라 주세요" };
const refused = (error, what) => error.line ?? REFUSED[error.message] ?? `${what} 못했어요. 다시 눌러 주세요`;
export function createMeeting({ api, meeting: first, timers = globalThis }) {
  const base = `/meetings/${encodeURIComponent(first.id)}`, listeners = new Set(), seqs = new Set(), locals = [], held = new Map();
  let meeting = first, items = [], decisions = [], record = null, agenda = null, goalTitle = null, after = 0, loaded = false, problem = null, endLine = null;
  let reading = null, again = false, timer = null, watched = false, wait = POLL.live, serial = 0, gone = false;
  let ending = false, endRead = Infinity, reads = 0;
  let choosing = null, choiceLine = null;
  let seats = [], seatsOf = null, seating = null, seatLine = null;
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  async function call(path, init) {
    const response = await api(path, init?.body === void 0 ? init : { ...init, headers: { "Content-Type": "application/json" } });
    const body = await response.json().catch(() => void 0);
    if (!response.ok) throw Object.assign(new Error(body?.error ?? `http_${response.status}`), { line: body?.error === "browser_host" ? body.message : void 0 });
    if (body === void 0) throw new Error("invalid_response");
    return body;
  }
  const take = (next) => {
    if (next && String(next.id) === String(first.id)) meeting = next;
  };
  function add(rows) {
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Number.isFinite(row?.seq) || seqs.has(row.seq)) continue;
      seqs.add(row.seq);
      items.push(row);
      after = Math.max(after, row.seq);
      if (row.speaker === "owner") {
        const mine = locals.findIndex((local) => local.status !== "failed" && local.text === row.text && local.after < row.seq);
        if (mine >= 0 && locals[mine].queued) held.set(row.seq, locals[mine].round);
        if (mine >= 0) locals.splice(mine, 1);
      }
    }
    items.sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.seq - b.seq);
  }
  function schedule() {
    timers.clearTimeout(timer);
    timer = null;
    if (watched && !gone && isLive(meeting)) timer = timers.setTimeout(() => void read(), wait);
  }
  async function read() {
    if (reading) {
      again = true;
      return reading;
    }
    const no = ++reads;
    reading = (async () => {
      try {
        const [detail, page] = await Promise.all([call(base), call(`${base}/messages?after=${after}`)]);
        take(detail.meeting);
        decisions = Array.isArray(detail.decisions) ? detail.decisions : [];
        record = typeof detail.record_md === "string" && detail.record_md.trim() ? detail.record_md : null;
        agenda = typeof detail.agenda === "string" && detail.agenda.trim() ? detail.agenda : null;
        goalTitle = typeof detail.goal_title === "string" && detail.goal_title.trim() ? detail.goal_title : null;
        add(page.items);
        loaded = true;
        problem = null;
        wait = POLL.live;
        if (!canSeat(meeting)) {
          seats = [];
          seatsOf = null;
        } else if (seatsOf !== JSON.stringify(meeting.members ?? [])) await readSeats();
      } catch (error) {
        problem = error.message;
        wait = Math.min(POLL.most, wait * 2);
      }
      reading = null;
      if (no >= endRead) {
        ending = false;
        endRead = Infinity;
      }
      if (again) {
        again = false;
        return read();
      }
      emit();
      schedule();
    })();
    return reading;
  }
  async function say(text, local = null) {
    if (!local) {
      local = { key: "said-" + ++serial, text };
      locals.push(local);
    }
    Object.assign(local, { status: "sending", after, queued: meeting.status === "speaking", round: meeting.round, line: null });
    emit();
    const op = canAnswer(meeting) ? "answer" : "say";
    try {
      take((await call(`${base}/${op}`, { method: "POST", body: JSON.stringify({ text }) }))?.meeting);
      if (locals.includes(local)) local.status = "sent";
    } catch (error) {
      local.status = "failed";
      local.line = refused(error, "보내지");
    }
    emit();
    void read();
  }
  async function readSeats() {
    const of = JSON.stringify(meeting.members ?? []);
    try {
      const body = await call(`${base}/seats`);
      seats = Array.isArray(body.choices) ? body.choices : [];
      seatsOf = of;
    } catch {
    }
  }
  async function choose(op, body) {
    if (choosing) return;
    choosing = op;
    choiceLine = null;
    emit();
    try {
      take((await call(`${base}/${op}`, { method: "POST", ...body ? { body: JSON.stringify(body) } : {} }))?.meeting);
    } catch (error) {
      choiceLine = refused(error, op === "time" ? "시간을 정하지" : "열지");
    }
    choosing = null;
    emit();
    void read();
  }
  return { get meeting() {
    return meeting;
  }, get items() {
    return items;
  }, get locals() {
    return locals;
  }, get decisions() {
    return decisions;
  }, get record() {
    return record;
  }, get loaded() {
    return loaded;
  }, get agenda() {
    return agenda;
  }, get goalTitle() {
    return goalTitle;
  }, get problem() {
    return problem;
  }, get ending() {
    return ending;
  }, get endLine() {
    return endLine;
  }, get choosing() {
    return choosing;
  }, get choiceLine() {
    return choiceLine;
  }, get seats() {
    return seats;
  }, get seating() {
    return seating;
  }, get seatLine() {
    return seatLine;
  }, read, queued: (item) => item?.speaker === "owner" && isLive(meeting) && (item.round > meeting.round || meeting.status === "speaking" && held.get(item.seq) === meeting.round), watch(on) {
    watched = !!on;
    if (watched) void read();
    else schedule();
  }, say: (text) => say(text), start: () => choose("start"), setTime: (at) => choose("time", { starts_at: at }), retry(key) {
    const local = locals.find((l) => l.key === key);
    if (local) void say(local.text, local);
  }, async addSeat(choice) {
    if (seating || !choice) return;
    seating = choice;
    seatLine = null;
    emit();
    const body = { role: choice.role, ...choice.role === "pm" ? { project_id: choice.project_id } : {}, ...choice.role === "member" ? { family: choice.family } : {} };
    try {
      take((await call(`${base}/seats`, { method: "POST", body: JSON.stringify(body) }))?.meeting);
    } catch (error) {
      seatLine = refused(error, "자리를 추가하지");
    }
    seating = null;
    emit();
    void read();
  }, discard(key) {
    const at = locals.findIndex((l) => l.key === key);
    const [local] = at >= 0 ? locals.splice(at, 1) : [];
    emit();
    return local?.text ?? "";
  }, async end(note) {
    if (ending) return;
    ending = true;
    endLine = null;
    emit();
    const body = typeof note === "string" && note.trim() ? { body: JSON.stringify({ text: note }) } : {};
    try {
      take((await call(`${base}/end`, { method: "POST", ...body }))?.meeting);
      endRead = reads + 1;
    } catch (error) {
      ending = false;
      endLine = refused(error, "끝내지");
    }
    emit();
    void read();
  }, update(next) {
    if (watched || !next || next.status === meeting.status && next.round === meeting.round) return;
    take(next);
    emit();
  }, subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, destroy() {
    gone = true;
    timers.clearTimeout(timer);
    listeners.clear();
  } };
}
