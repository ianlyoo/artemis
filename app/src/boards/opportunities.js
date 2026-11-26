import { el } from "./dom.js";
const names = { compete: "대회·활동", earn: "일·수입", support: "지원" };
const performers = { "agents build": "에이전트 제작", "owner performs": "본인 수행", mixed: "함께 수행" };
const verdicts = { pass: "자격 충족", check: "자격 확인 필요", fail: "자격 불일치" };
export async function mountOpportunities(node, env) {
  node.classList.add("opps");
  const state = el("p", { class: "opps-state", role: "status", "aria-live": "polite" }, "기회 목록을 읽고 있어요");
  node.append(state);
  const request = async (path, body) => {
    const response = await env.api(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: env.signal } : { signal: env.signal });
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.message || "목록이 바뀌었어요. 다시 열어 주세요.");
    return answer;
  };
  const button = (text, fn, label = text) => {
    const b = el("button", { type: "button", class: "bv-button", "aria-label": label }, text);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await fn();
        state.textContent = "저장했어요";
      } catch (error) {
        state.textContent = error.message;
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };
  let data;
  try {
    data = await request("/opps/board");
  } catch (error) {
    state.textContent = "기회 목록을 읽지 못했어요. 다시 열어 주세요. " + error.message;
    return;
  }
  if (env.signal?.aborted) return;
  state.textContent = "";
  const batch = data.batch, choices = [];
  const commentField = (title) => el("input", { class: "bv-answer-text opps-comment", type: "text", maxlength: 200, placeholder: "코멘트(선택)", "aria-label": title + " 코멘트" });
  const sources = (item) => {
    const sightings = [...new Map((item.sightings || []).map((s) => [s.route + "\n" + s.source_url, s])).values()];
    if (!sightings.length) return null;
    return el("details", { class: "opps-detail" }, el("summary", {}, "발견 출처"), el("ul", {}, sightings.map((s) => el("li", {}, /^https?:\/\//i.test(s.source_url) ? el("a", { href: s.source_url, target: "_blank", rel: "noopener noreferrer" }, s.route) : s.route))));
  };
  const row = (item, weekly = false) => {
    const s = item.scores || {}, comment2 = commentField(item.title);
    const metric = item.family === "support" ? `${item.support_value_per_minute ?? "미확인"}원/분` : item.score == null ? "미채점 · 마감순" : `${item.score}점`;
    const root = el("li", { class: "opps-row" }, el("strong", { class: "opps-title" }, item.title), el("p", { class: "opps-deadline" }, item.deadline_text), el("p", { class: "opps-gives" }, s.gives || "혜택 미확인"), el("p", { class: "opps-meta" }, `${metric} · 본인 ${item.effort_hours ?? "미확인"}시간(추정) · ${performers[item.who_performs] || "담당 미확인"}`));
    const details = el("details", { class: "opps-detail" }, el("summary", {}, "자세히"), el("p", {}, `${item.family}/${item.kind} · ${verdicts[item.eligibility?.verdict] || "자격 확인 필요"}`), el("p", {}, "이번 주 준비: " + (s.agent_work || "준비 작업을 확인해야 해요")), el("p", {}, s.recommendation || "채점 후 추천 여부를 정해요"), el("p", {}, (item.eligibility?.questions || []).join(" ")), el("ul", {}, Object.values(s.ratings || {}).map((r) => el("li", {}, r.evidence))));
    if (s.conditions_note) root.append(el("p", { class: "opps-condition" }, s.conditions_note));
    for (const d of s.documents || []) if (d.required) root.append(el("p", { class: "opps-condition" }, `${d.name} 필요 · 발급비 ${d.issuing_fee || "미확인(발급 전 확인)"}`));
    if (item.too_late) root.append(el("p", { class: "opps-condition" }, "too late for a top entry · 최상위 입상 준비 시작일이 지났어요"));
    if (item.state_reason && s.rank_refusal) root.append(el("p", { class: "opps-condition" }, item.state_reason));
    root.append(details);
    const provenance = sources(item);
    if (provenance) root.append(provenance);
    const controls = el("div", { class: "opps-controls" });
    if (weekly) {
      const recommended = batch.recommended_ids?.includes(item.id) ?? true;
      const choice = { id: item.id, yes: recommended, comment: null };
      choices.push(choice);
      const group = el("div", { class: "opps-choices", role: "group", "aria-label": item.title + " 준비 여부" });
      for (const [yes, text] of [[true, "예"], [false, "아니요"]]) {
        const b = el("button", { type: "button", class: "bv-button", "aria-pressed": String(choice.yes === yes), "aria-label": item.title + " " + text }, text);
        b.addEventListener("click", () => {
          choice.yes = yes;
          for (const sibling of group.children) sibling.setAttribute("aria-pressed", String(sibling === b));
        });
        group.append(b);
      }
      comment2.addEventListener("input", () => {
        choice.comment = comment2.value || null;
      });
      controls.append(group, comment2);
    } else if (batch?.status === "pending" && batch.ids.map(String).includes(String(item.id))) {
      controls.append(el("span", { class: "opps-meta" }, "이번 주 추천안에서 골라 주세요"));
    } else {
      for (const [action, text] of item.eligibility?.verdict === "fail" ? [["pass", "넘기기"]] : [["pick", "고르기"], ["pass", "넘기기"]]) controls.append(button(text, async () => {
        await request("/opps/action", { action, item_id: item.id, signature: item.signature, comment: comment2.value || null });
        root.replaceChildren(el("p", {}, item.title + " · " + (action === "pick" ? "이번 주 준비를 시작해요" : "넘겼어요")));
      }, item.title + " " + text));
      controls.append(comment2);
    }
    root.append(controls);
    return root;
  };
  if (batch?.status === "pending") {
    node.append(el("h2", {}, "이번 주 추천안"), el("p", { class: "opps-meta" }, "준비할 항목을 골라 한 번에 승인해 주세요. 발송·신청은 각각 다시 승인받아요."), el("ul", { class: "opps-list" }, batch.ids.map((id) => data.items.find((i) => String(i.id) === String(id))).filter(Boolean).map((i) => row(i, true))), button("이번 주 승인", async () => {
      await request("/opps/decision", { approval_id: batch.approval_id, scope_hash: batch.scope_hash, choices });
      node.replaceChildren(el("p", { role: "status" }, "이번 주 계획을 저장했어요. 승인한 항목을 준비해요. 다시 열면 최신 상태를 볼 수 있어요."));
    }));
  }
  for (const [family, title] of Object.entries(names)) {
    const items = data.items.filter((i) => i.family === family && ["new", "ranked", "shown"].includes(i.state));
    const eligible = items.filter((i) => i.eligibility?.verdict !== "fail"), failed = items.filter((i) => i.eligibility?.verdict === "fail");
    node.append(el("h2", {}, title), el("p", { class: "opps-meta" }, "상위 3개 · " + (eligible.slice(0, 3).map((i) => i.title).join(" · ") || "없어요")), el("ul", { class: "opps-list" }, eligible.map((i) => row(i))));
    if (failed.length) node.append(el("details", { class: "opps-detail" }, el("summary", {}, `자격 불일치 ${failed.length}건`), el("ul", { class: "opps-list" }, failed.map((i) => row(i)))));
  }
  const picked = data.items.filter((i) => ["picked", "preparing", "prepared"].includes(i.state));
  if (picked.length) node.append(el("h2", {}, "진행 중"), el("ul", { class: "opps-list" }, picked.map((i) => {
    const row2 = el("li", { class: "opps-row" }, i.title + " · " + i.deadline_text, el("p", {}, i.scores?.conditions_note || ""));
    const provenance = sources(i);
    if (provenance) row2.append(provenance);
    return row2;
  })));
  const link = el("input", { type: "url", class: "bv-answer-text opps-comment", placeholder: "놓친 공고 주소", "aria-label": "놓친 공고 링크" });
  const comment = commentField("놓친 공고");
  node.append(el("h2", {}, "놓친 공고"), link, comment, button("놓친 공고 기록", async () => {
    await request("/opps/action", { action: "miss", url: link.value, comment: comment.value || null });
    link.value = "";
    comment.value = "";
  }), el("h2", {}, "수집 상태"), el("p", { class: "opps-meta" }, data.health), el("p", { class: "opps-meta" }, `처음 발견 때 7일 미만 ${data.measure.short}건 · 이미 종료 ${data.measure.closed}건 · 주중 알림 ${data.measure.pushed}건`), el("ul", {}, data.items.filter((i) => i.first_seen_days_left != null && Number(i.first_seen_days_left) < 7).map((i) => el("li", {}, i.title + " · " + i.first_seen_days_left + "일 남음"))));
}
