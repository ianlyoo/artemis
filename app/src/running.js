import { esc, time, koElapsed, clean, shortTitle } from "./mobile/format.js";
import { hostName } from "./pc-data.js";
import { l10n } from "./names.js";
export const WINDOW = 1e4;
const KIND = { test: ["검사", "Tests"], build: ["빌드", "Build"], embed: ["임베딩", "Embedding"], gpu: ["GPU 작업", "GPU job"], train: ["학습", "Training"], infer: ["추론", "Inference"], ocr: ["글자 인식", "Text recognition"], transcribe: ["받아쓰기", "Transcription"], media: ["미디어 작업", "Media job"] };
const at = (v) => typeof v === "string" ? Date.parse(v) : NaN;
export function what(run) {
  if (run.placement?.run_by === "lane") return run.agent_id ? l10n("배포 전 검사", "Pre-ship check") : l10n("메인 검사", "Main check");
  return Object.hasOwn(KIND, run.kind) ? l10n(...KIND[run.kind]) : l10n("작업", "Job");
}
export function jobRows(answer, goals = [], now = Date.now()) {
  const named = new Map(goals.map((g) => [g.id, clean(g.short_name) || shortTitle(g.title)])), whole = new Map(goals.map((g) => [g.id, clean(g.title)]));
  const row = (r, key, kind, label) => ({ key, at: at(r.started_at) || 0, what: kind, goal: r.goal_id == null ? "" : named.get(r.goal_id) || "G" + r.goal_id, goalTitle: r.goal_id == null ? "" : whole.get(r.goal_id) || named.get(r.goal_id) || "G" + r.goal_id, host: r.host ? hostName(r.host) : "—", start: time(r.started_at), lasted: koElapsed(r.started_at, now), label: clean(label) });
  const runs = (Array.isArray(answer?.running) ? answer.running : []).filter((r) => r && typeof r === "object" && Number.isSafeInteger(r.id) && r.status === "running").sort((a, b) => b.id - a.id).map((r) => row(r, "run:" + r.id, what(r), r.label));
  const ships = (Array.isArray(answer?.ships) ? answer.ships : []).filter((s) => s && typeof s.branch === "string").map((s) => row(s, "ship:" + s.branch, l10n("배포", "Ship"), s.branch));
  return [...ships, ...runs].sort((a, b) => b.at - a.at).map(({ at: at2, ...r }) => r);
}
const said = (a) => JSON.stringify([a?.version, a?.ships]);
export function createJobs({ load = async () => (await (await import("/client.js")).api("/runs")).json(), changed = () => {
} } = {}) {
  let answer = null, good = 0, failed = false, busy = false, asked = -Infinity;
  async function read(now) {
    busy = true;
    asked = now;
    const before = { said: said(answer), failed };
    try {
      const got = await load();
      if (got?.ok === true) {
        answer = got;
        good = now;
        failed = false;
      } else failed = true;
    } catch {
      failed = true;
    }
    busy = false;
    if (said(answer) !== before.said || failed !== before.failed) changed();
  }
  return { draw(now = Date.now()) {
    if (!busy && now - asked >= WINDOW) return read(now);
  }, view(goals, now = Date.now()) {
    return { rows: answer ? jobRows(answer, goals, now) : null, failed, good };
  } };
}
export function jobsHTML({ rows, failed }) {
  if (!rows) return '<p class="job-none">' + (failed ? l10n("작업 목록을 읽지 못했어요.", "The job list did not load.") : "—") + "</p>";
  if (!rows.length) return '<p class="job-none">' + l10n("지금 돌아가는 작업이 없어요.", "Nothing is running now.") + "</p>";
  return rows.map((r) => '<div class="job" data-key="' + r.key + '"' + (r.label ? ' title="' + esc(r.label) + '"' : "") + '><div class="job-top"><b>' + esc(r.what) + '</b><span class="job-time"><time>' + esc(r.start) + "</time> · " + esc(r.lasted) + '</span></div><div class="job-where" title="' + esc([r.goalTitle, r.host].filter(Boolean).join(" · ")) + '">' + esc([r.goal, r.host].filter(Boolean).join(" · ")) + "</div></div>").join("");
}
export const kept = ({ rows, failed, good }) => rows && failed ? l10n(time(good) + " 기준", "as of " + time(good)) : "";
