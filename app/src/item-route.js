import { stepLink, findStep } from "./step-route.js";
import { stepDone } from "./owner-steps.js";
import { leadRole, l10n } from "./names.js";
const LINES = () => ({ question: { answered: l10n("이 질문은 이미 답했어요", "This question is answered already"), expired: l10n("이 질문은 만료됐어요", "This question expired"), gone: l10n("이 질문을 찾을 수 없어요", "This question is not here") }, step: { cleared: l10n("이 할 일은 이미 완료했어요", "This step is done already"), expired: l10n("이 할 일은 만료됐어요", "This step expired"), withdrawn: l10n("이 할 일은 철회됐어요", "This step was withdrawn"), gone: l10n("이 할 일을 찾을 수 없어요", "This step is not here") } });
const liveStep = (d, id) => {
  const row = findStep(d, Number(id));
  return row && !stepDone(id) ? row : null;
};
const linkHash = (link) => link?.url ? "#/screen" : link?.route ?? null;
export function itemHash({ kind, id } = {}, d = null) {
  if (kind === "approval") return "#/approvals/" + id;
  if (kind === "question") return "#/" + leadRole() + "/question/" + id;
  if (kind === "step") return linkHash(stepLink(liveStep(d, id)?.link)) ?? "#/" + leadRole() + "/step/" + id;
  return null;
}
export function itemAway({ kind, id } = {}, d = null) {
  if (kind !== "step") return null;
  const row = liveStep(d, id);
  return linkHash(stepLink(row?.link)) ?? (row?.goal_id ? "#/admin/goal/" + row.goal_id : null);
}
export async function itemState({ kind, id } = {}, api) {
  try {
    if (kind === "question") {
      const response = await api("/approvals/" + encodeURIComponent(id));
      if (response.status === 404) return "gone";
      const status = response.ok ? (await response.json())?.status : null;
      return !status ? null : status === "pending" ? "open" : status === "expired" ? "expired" : "answered";
    }
    if (kind === "step") {
      const response = await api("/db/read?kind=owner_steps&id=" + encodeURIComponent(id));
      return response.ok ? (await response.json())?.item?.status ?? "gone" : null;
    }
  } catch {
  }
  return null;
}
export const itemLine = ({ kind } = {}, state) => LINES()[kind]?.[state] ?? null;
