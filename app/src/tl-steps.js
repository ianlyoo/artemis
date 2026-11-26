import { userKo, l10n } from "./names.js";
export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const parsed = new Map();
export const ms = (v) => {
  if (typeof v !== "string") return typeof v === "number" ? v : v == null ? NaN : Date.parse(v);
  let t = parsed.get(v);
  if (t === void 0) {
    if (parsed.size >= 2e4) parsed.clear();
    parsed.set(v, t = v === "" ? NaN : Date.parse(v));
  }
  return t;
};
const UUID = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const EMAIL = /\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const TOKEN = /\b[A-Za-z0-9_-]{40,}\b/g;
const SECRET = /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}|\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
const ASSIGNED = /\b(api[_-]?key|token|secret|password|passwd)(\s*[:=]\s*)\S+/gi;
export const scrub = (v) => clean(v).replace(SECRET, "…").replace(ASSIGNED, "$1$2…").replace(UUID, "$1").replace(EMAIL, "$1…@$2").replace(TOKEN, "…");
const unquote = (s) => clean(s).replace(/^"|"$/g, "").replace(/^“|”$/g, "");
const HQ_LINE = /^(?:project|goal) #\d+ ".*?": (.*?) by \w+(?:: (.*))?$/;
const hqLine = (s) => {
  const m = HQ_LINE.exec(s);
  return m ? { parts: m[1].split("; "), note: unquote(m[2] || "") } : null;
};
export const OWN_STEPS = new Set(["project.note", "goal.note", "goal.waiting", "goal.status", "ask.created", "ask.answered", "agent.child_completed", "agent.turn_started", "agent.created", "health.incident", "request.logged", "owner_message.handled"]);
export const FINAL_REPORT = new Set(["agent.goal_finished", "health.incident"]);
export const isFinalReport = (e) => e.kind === "agent.goal_finished" && /final report/.test(e.summary || "");
export const MENTION_STEPS = new Set(["project.note", "goal.note", "goal.waiting", "ask.created", "ask.answered", "ask.unanswered"]);
export const isReport = (k) => String(k || "").startsWith("report.");
export const TURN_EDGES = new Set(["agent.turn_started", "agent.child_completed", "agent.created"]);
export const childOutcome = (e) => e.kind === "agent.child_completed" ? String(e.summary || "").match(/:\s*([a-z_]+)\s*$/)?.[1] || "" : "";
export const waitingText = (e) => scrub(e.summary).replace(/^goal #\d+:\s*/, "");
export function stepText(e) {
  const s = scrub(e.summary), k = e.kind;
  let m;
  switch (k) {
    case "agent.turn_started":
      return l10n("턴 시작", "Turn started");
    case "agent.created":
      return l10n("시작", "Started");
    case "agent.child_completed": {
      const o = childOutcome(e);
      return l10n("턴 끝", "Turn ended") + (o ? " · " + o : "");
    }
    case "agent.goal_finished":
    case "health.incident": {
      const r = s.match(/final report (RESULT:\s*\w+)/i);
      return r ? l10n("최종 보고 ", "Final report ") + r[1] : s.replace(/^Agent \S+ on \S+:\s*/, "");
    }
    case "project.note":
    case "goal.note": {
      const n = hqLine(s);
      return n ? n.note || n.parts.join("; ") : unquote(s.replace(/^(project|goal) #\d+(?: "[^"]*")?:\s*/, ""));
    }
    case "goal.waiting": {
      const t = waitingText(e);
      return /^waiting\/check updated$/.test(t) ? "" : l10n("다음 · ", "Next · ") + t;
    }
    case "goal.status": {
      const t = s.replace(/^goal #\d+(?: "[^"]*")?:\s*/, "");
      m = t.match(/^(\S+ → \S+) by \w+:?\s*(.*)$/);
      return m ? m[1] + (m[2] ? ": " + unquote(m[2]) : "") : t;
    }
    case "ask.created": {
      m = s.match(/^ask #(\d+) from \S+(?: \([^)]*\))? to (\S+?):\s*(.*)$/);
      return m ? "ask #" + m[1] + " → " + m[2] + ": " + unquote(m[3]) : s;
    }
    case "ask.answered": {
      m = s.match(/^ask #(\d+) answered by \w+:\s*(.*)$/);
      return m ? "ask #" + m[1] + l10n(" 답: ", " answered: ") + unquote(m[2]) : s;
    }
    case "ask.unanswered": {
      m = s.match(/^ask #(\d+) from \S+ to \S+ unanswered since [\d-]+ ([\d:]+) KST/);
      return m ? "ask #" + m[1] + l10n(" 답 없음 · " + m[2] + "부터", " unanswered since " + m[2]) : s;
    }
    case "request.logged": {
      m = s.match(/^#(\d+) logged by \w+:\s*(.*)$/);
      return m ? l10n("요청 #", "Request #") + m[1] + ": " + unquote(m[2]) : s;
    }
    case "owner_message.handled": {
      m = s.match(/^\w+ closed m\d+ in chat:\s*(.*)$/);
      return m ? l10n("채팅 답: ", "Chat reply: ") + unquote(m[1]) : s;
    }
    default:
      if (isReport(k)) {
        m = s.match(/^\w+ (progress|lesson|incident|blocked)(?: \([^)]*\))?:\s*(.*)$/);
        return m ? (m[1] === "progress" ? "" : m[1] + ": ") + unquote(m[2]) : s;
      }
      return s;
  }
}
export const STEP_TAG = { get "project.note"() {
  return l10n("메모", "Note");
}, get "goal.note"() {
  return l10n("메모", "Note");
}, get "report.progress"() {
  return l10n("진행", "Progress");
}, get "report.lesson"() {
  return l10n("교훈", "Lesson");
}, get "report.incident"() {
  return l10n("사고", "Incident");
}, get "report.blocked"() {
  return l10n("확인", "Check");
}, get "ask.created"() {
  return l10n("질문", "Ask");
}, get "ask.answered"() {
  return l10n("답", "Answer");
}, get "goal.waiting"() {
  return l10n("대기", "Waiting");
}, get "goal.status"() {
  return l10n("상태", "Status");
}, get "project.status"() {
  return l10n("상태", "Status");
}, get "project.parked"() {
  return l10n("쉬어 감", "Parked");
}, get "launch.done"() {
  return l10n("띄움", "Launched");
}, get "health.incident"() {
  return l10n("최종 보고", "Final report");
}, get "agent.goal_finished"() {
  return l10n("최종 보고", "Final report");
}, get "request.logged"() {
  return l10n("요청", "Request");
}, get "request.attached"() {
  return l10n("요청", "Request");
}, get "owner_message.handled"() {
  return l10n(userKo() + "께 답", "Reply to me");
}, get "agent.child_completed"() {
  return l10n("턴을 마쳤어요", "Turn done");
}, get "agent.turn_started"() {
  return l10n("턴 시작", "Turn started");
}, get "agent.registered"() {
  return l10n("시작", "Started");
} };
export const FILLER = new Set(["agent.child_completed", "agent.turn_started", "agent.registered"]);
const dequote = (s) => s.replace(/^"(.*)"$/s, "$1").replace(/^"/, "");
export function stepLine(e) {
  const s = scrub(e.summary);
  let tag = STEP_TAG[e.kind] || e.kind, text = s;
  switch (e.kind) {
    case "project.note":
    case "goal.note": {
      const n = hqLine(s);
      text = n ? n.note || n.parts.join("; ") : s.replace(/^(project|goal) #\d+(?: ".*?")?:\s*/, "");
      break;
    }
    case "report.progress":
    case "report.lesson":
    case "report.incident":
    case "report.blocked":
      text = s.replace(/^\S+ (progress|lesson|incident|blocked)( \([^)]*\))?: /, "");
      break;
    case "ask.created": {
      const m = /^ask #\d+ from \S+(?: \([^)]*\))? to (\S+?): (.*)$/.exec(s);
      if (m) {
        tag = l10n("질문 → ", "Ask → ") + m[1];
        text = dequote(m[2]);
      }
      break;
    }
    case "ask.answered":
      text = dequote(s.replace(/^ask #\d+ answered by [^:]+: /, ""));
      break;
    case "goal.waiting":
      text = s.replace(/^goal #\d+:\s*/, "");
      break;
    case "goal.status":
    case "project.status": {
      const n = hqLine(s), move = n ? n.parts.find((p) => p.includes(" → ")) || "" : "";
      text = n ? [move, n.note].filter(Boolean).join(": ") || n.parts.join("; ") : s.replace(/^(goal|project) #\d+ ".*?": /, "");
      break;
    }
    case "agent.goal_finished":
    case "health.incident":
      text = s.replace(/^.*?final report /, "");
      break;
    case "request.logged":
      text = dequote(s.replace(/^#\d+ logged by [^:]+: /, ""));
      break;
    case "request.attached":
      text = s.replace(/^goal #\d+ ".*?": /, "");
      break;
    case "owner_message.handled":
      text = dequote(s.replace(/^\S+ closed \S+ in chat: /, ""));
      break;
    case "agent.registered":
      text = (/registered on (\S+)/.exec(s) || [])[1] || "";
      break;
    case "agent.child_completed":
    case "agent.turn_started":
      text = "";
      break;
  }
  return { at: ms(e.at), kind: e.kind, tag, text: text.replace(/…$/, "").trim(), id: e.id };
}
