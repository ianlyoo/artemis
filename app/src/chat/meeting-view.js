import { el, svg } from "../boards/dom.js";
import { prose } from "../boards/rich-text.js";
import { loadStyles } from "./entry.js";
import { control, wholeCells } from "./visuals.js";
import { clock, follower } from "./motion.js";
import { canAnswer, canEnd, canSay, canSeat, isLive, isPlanned, meetingDetail, nearSlots, seatMark, when, speakingLine } from "./meetings.js";
import { mountIsland } from "../islands/island.js";
import { createDictation } from "./dictation.js";
import { markRefNodes, notesEnv, notesFold, replyNotes, runText } from "./notes.js";
import { userKo, has } from "../names.js";
const glyph = (d) => svg("svg", { viewBox: "0 0 24 24", class: "composer-glyph", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 2.1, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d }));
const KEEP = "계속";
const PLACEHOLDER = { speaking: "말씀은 다음 라운드에 전해져요", waiting: "회의에 할 말을 적어 주세요", saved: "말씀하시면 회의가 이어져요", requested: "답을 적어 보내면 요청한 쪽에 그대로 전해요", scheduled: "말씀하시면 회의를 일찍 열어요" };
const HEARD = { recording: "듣고 있어요… 다시 누르면 멈춰요", transcribing: "글로 옮기고 있어요…", unavailable: "이 브라우저에서는 받아쓰기를 쓸 수 없어요" };
const canWrite = (meeting) => canSay(meeting) || canAnswer(meeting);
function stateText(meeting, model) {
  if (model.ending && meeting.status !== "closing") return "회의를 끝내는 중이에요…";
  const since = when(meeting.waiting_since);
  return { requested: "회의 요청이에요 · 지금 들어가거나, 시간을 정하거나, 채팅으로 답해 주세요", scheduled: `${when(meeting.starts_at) || "정한 시간"}에 열려요 · 지금 시작하거나 말씀하시면 일찍 열어요`, answered: "채팅으로 답한 요청이에요 · 읽기만 할 수 있어요", preflight: "회의를 준비하고 있어요", speaking: speakingLine(meeting), waiting: `회의가 ${userKo()} 말씀을 기다려요${since ? ` · ${since}부터` : ""}`, saved: "저장해 둔 회의예요 · 말씀하시면 이어서 시작해요", closing: "회의를 끝내고 결정을 정리하고 있어요", ended: `${when(meeting.ended_at) ? when(meeting.ended_at) + "에 " : ""}끝난 회의예요 · 읽기만 할 수 있어요`, failed: "회의가 멈췄어요" }[meeting.status] ?? meeting.status;
}
const markOf = (member, item) => member ? seatMark(member) : (item.label || item.speaker || "?").slice(0, 1).toUpperCase();
export async function mountMeeting(container, { layout = "pc", agentEntry: entry, active = () => true } = {}) {
  await loadStyles();
  const phone = layout === "phone", model = entry.meeting, key = entry.key;
  const root = el("div", { class: "chat meeting " + (phone ? "chat-phone" : "chat-pc") });
  const top = el("div", { class: "chat-top meeting-top" });
  const column = el("div", { class: "chat-col" }, top);
  const scroller = el("div", { class: "chat-scroll", tabindex: "-1", role: "region", "aria-label": "회의 " + entry.agent.displayName }, column);
  const jump = control("↓ Latest", { class: "chat-jump", hidden: true, title: "Go to where new statements appear" });
  const pin = follower(scroller, jump);
  const state = el("span", { class: "meeting-state", role: "status" });
  const detailHost = el("div", { class: "meeting-details" }), seatHost = el("div", { class: "meeting-seats", hidden: true });
  const end = control("회의 끝내기", { class: "msg-act meeting-end", onclick: () => asking(true) });
  const bar = el("div", { class: phone ? "meeting-bar" : "room-state meeting-bar" }, phone ? el("span", { class: "chat-state" }, state) : state, el("div", { class: "meeting-acts" }, detailHost, seatHost, end));
  const no = control("취소", { class: "msg-act msg-ask-no", onclick: () => asking(false) });
  const yes = control("끝내기", { class: "msg-act msg-ask-yes", onclick: () => {
    asking(false);
    void model.end(noting && !isPlanned(model.meeting) ? noted : void 0);
  } });
  const question = el("p", { class: "msg-ask-q" }), detail = el("p", { class: "msg-ask-detail" });
  const noteHost = el("div", { class: "meeting-note", hidden: true });
  let noted = "", noting = null, noteLost = false;
  const ask = el("div", { class: "msg-ask meeting-ask", role: "alertdialog", hidden: true }, question, detail, noteHost, el("div", { class: "msg-ask-answer" }, no, yes));
  const ENDS = { open: ["회의 끝내기", "회의를 끝낼까요?", "참석자는 더 말하지 않고, 진행자가 결정을 정리해 기록으로 남겨요. 끝낸 회의는 다시 이어갈 수 없어요.", "끝내기"], requested: ["요청 닫기", "회의를 열지 않고 닫을까요?", "요청한 쪽에 닫으셨다고 전해요. 닫은 요청은 다시 열 수 없어요.", "닫기"], scheduled: ["회의 닫기", "회의를 열지 않고 닫을까요?", "정한 시간에 열리지 않아요. 닫은 회의는 다시 열 수 없어요.", "닫기"] };
  const field = el("textarea", { class: "composer-field", rows: "1", enterkeyhint: phone ? "enter" : "send", autocomplete: "off", "aria-label": "회의에 할 말" });
  const sizer = el("textarea", { class: "composer-sizer", rows: "1", tabindex: "-1", readonly: true, "aria-hidden": "true" });
  const send = el("button", { type: "submit", class: "composer-send", "aria-label": "보내기", title: phone ? "보내기" : "Enter로 보내기 · Shift+Enter로 줄 바꾸기" }, glyph("M12 19V5 M6 11l6-6 6 6"));
  let heard = null;
  const mic = !has("dictation") ? null : createDictation({ field, label: "받아쓰기", title: "말하면 입력창에 적혀요 · 누른 채 말하거나, 다시 누르면 멈춰요", onText: () => typed(), onState: (state2) => {
    heard = HEARD[state2] ?? null;
    paintLine();
  } });
  const box = el("div", { class: "composer-box" }, el("div", { class: "composer-text" }, field, sizer), el("div", { class: "composer-bar" }, el("span", { class: "composer-gap" }), mic?.node, send));
  const line = el("p", { class: "composer-line", role: "status", "aria-live": "polite" });
  const paintLine = () => {
    line.textContent = model.endLine ?? model.seatLine ?? heard ?? "";
    line.classList.toggle("is-problem", !!(model.endLine ?? model.seatLine) || heard === HEARD.unavailable);
  };
  const form = el("form", { class: "composer meeting-composer" }, jump, ...phone ? [bar] : [], ask, box, line);
  const dock = el("div", { class: phone ? "chat-dock" : "room-dock" }, ...phone ? [] : [bar], form);
  root.append(...phone ? [scroller, dock] : [el("div", { class: "room-main" }, scroller, dock)]);
  container.replaceChildren(root);
  const draftKey = "chat-draft:" + key;
  try {
    field.value = localStorage.getItem(draftKey) ?? "";
  } catch {
  }
  const keepDraft = () => {
    try {
      if (field.value) localStorage.setItem(draftKey, field.value);
      else localStorage.removeItem(draftKey);
    } catch {
    }
  };
  function grow() {
    if (field.clientWidth === 0) return;
    const max = (parseFloat(getComputedStyle(field).lineHeight) || 24) * (phone ? 5 : 7) + 4;
    sizer.value = field.value;
    field.style.height = Math.min(sizer.scrollHeight, max) + "px";
  }
  const typed = () => {
    form.toggleAttribute("data-empty", !field.value.trim());
    keepDraft();
    grow();
  };
  field.addEventListener("input", typed);
  field.addEventListener("keydown", (event) => {
    if (!phone && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await mic?.finish();
    if (gone) return;
    const text = field.value;
    if (!text.trim() || !canWrite(model.meeting)) return;
    field.value = "";
    typed();
    pin.jump();
    void model.say(text);
  });
  function asking(open) {
    ask.hidden = !open;
    end.hidden = open || !canEnd(model.meeting) || model.ending;
    drawSeats(model.meeting);
    if (open && !isPlanned(model.meeting) && !noteLost) {
      noteHost.hidden = false;
      noting ??= mountIsland("meeting-note", noteHost, { value: noted, onChange: (text) => {
        noted = text;
      } }).then((island) => {
        if (gone) island.unmount();
        return island;
      }).catch((error) => {
        console.error("meeting: the note field did not load", error);
        noteLost = true;
        noteHost.hidden = true;
        return null;
      });
    }
    (open ? no : canEnd(model.meeting) ? end : field).focus({ preventScroll: true });
  }
  const records = new Map();
  let drawn = false;
  function record(id, make) {
    let got = records.get(id);
    if (!got) {
      got = make();
      records.set(id, got);
      if (drawn) got.node.classList.add("is-new");
    }
    return got;
  }
  const memberOf = (item) => model.meeting.members?.find((m) => m.name === item.speaker);
  function statement(item) {
    const member = memberOf(item), seat = item.label || member?.label || item.speaker;
    let text = item.text ?? "", content = body(text);
    const node = el("article", { class: "msg msg-lead", "data-turn": "only", "data-seq": item.seq, "data-speaker": member?.role ?? "member" }, el("header", { class: "turn-head" }, el("span", { class: "turn-mark", "aria-hidden": "true" }, el("span", { class: "g151-agent-mark" }, markOf(member, item))), el("span", { class: "turn-name" }, seat), el("time", { class: "msg-time turn-time", datetime: item.at ?? "" }, clock(item.at))), content);
    return { node, update(next) {
      if (next === text) return;
      const fresh = body(next);
      content.replaceWith(fresh);
      content = fresh;
      text = next;
    } };
  }
  function body(text) {
    const notes = replyNotes([{ type: "md", text }]);
    const node = el("div", { class: "msg-body" }, wholeCells(markRefNodes(prose(runText(text, notes), { notes: notesEnv(notes) }))));
    if (!notes) return node;
    const fold = notesFold({ drawNote: (note2) => prose(note2, { notes }, true) });
    fold.set(notes.items);
    fold.wire(node);
    node.append(fold.node);
    return node;
  }
  function note(item) {
    const text = el("div", { class: "msg-system-text" }, item.text ?? ""), node = el("article", { class: "msg msg-system", "data-seq": item.seq }, text, el("time", { class: "msg-time" }, clock(item.at)));
    text.addEventListener("click", () => {
      if (text.scrollHeight > text.clientHeight + 2 || node.classList.contains("is-open")) node.classList.toggle("is-open");
    });
    return { node };
  }
  function said(text, attrs) {
    const time = el("time", { class: "msg-time" }), status = el("div", { class: "msg-state" });
    const node = el("article", { class: "msg msg-owner", ...attrs }, el("div", { class: "msg-line" }, time, el("div", { class: "msg-bubble" }, el("div", { class: "msg-plain" }, text))), status);
    let shown2 = null;
    return { node, update(at, queued, lineOf) {
      time.textContent = clock(at);
      time.dateTime = at ?? "";
      node.classList.toggle("g151-queued", queued);
      const sign = JSON.stringify([queued, lineOf?.sign]);
      if (sign === shown2) return;
      shown2 = sign;
      status.replaceChildren(...queued ? [el("span", { class: "g151-delivery" }, "다음 라운드에 전해요")] : lineOf?.nodes() ?? []);
    } };
  }
  function localLine(local) {
    if (local.status === "failed") return { sign: "failed:" + local.line, nodes: () => [el("span", { class: "msg-state-line is-problem" }, local.line), control("다시 보내기", { class: "msg-act", onclick: () => model.retry(local.key) }), control("고쳐 쓰기", { class: "msg-act", onclick: () => {
      field.value = model.discard(local.key);
      typed();
      field.focus();
    } })] };
    return local.status === "sending" ? { sign: "sending", nodes: () => [el("span", { class: "msg-state-line" }, "보내는 중…")] } : null;
  }
  const go = el("button", { type: "button", class: "choices-opt meeting-go", onclick: () => {
    pin.jump();
    void model.say(KEEP);
  } }, el("span", { class: "control-label" }, KEEP));
  const goes = el("div", { class: "choices choices-options meeting-goes", "data-n": "1", "data-state": "open", style: "--n:1", role: "group", "aria-label": "회의를 이어가기" }, go);
  function recordNode(meeting) {
    const chair = meeting.members?.find((m) => m.role === "chair");
    const body2 = el("div", { class: "msg-body" });
    const decisions = model.decisions.map((d) => el("section", { class: "meeting-decision" }, el("p", { class: "meeting-decision-head" }, el("a", { href: "#/approvals/" + d.approval_id }, "카드 #" + d.approval_id), d.goal_id ? ` · 목표 #${d.goal_id}` : ""), el("ul", { class: "ca-list" }, el("li", { class: "ca-item" }, el("span", { class: "ca-id" }, `${userKo()} 말씀`), el("div", { class: "ca-what meeting-said" }, d.owner_verbatim ?? "")), el("li", { class: "ca-item" }, el("span", { class: "ca-id" }, "진행자 요약"), el("div", { class: "ca-what meeting-summary" }, d.chair_summary ?? "")))));
    body2.append(...decisions.length ? decisions : [el("p", { class: "meeting-none" }, "이 회의에서 정한 결정은 없어요")]);
    if (model.record) body2.append(el("details", { class: "meeting-minutes" }, el("summary", {}, "회의록"), prose(model.record)));
    return el("article", { class: "msg msg-lead meeting-record", "data-turn": "only" }, el("header", { class: "turn-head" }, el("span", { class: "turn-mark", "aria-hidden": "true" }, el("span", { class: "g151-agent-mark" }, (chair?.label ?? "진").slice(0, 1))), el("span", { class: "turn-name" }, "회의 기록"), el("time", { class: "msg-time turn-time", datetime: meeting.ended_at ?? "" }, when(meeting.ended_at))), body2);
  }
  let recordSign = "";
  const plan = el("div", { class: "meeting-plan" });
  let planned = null, planning = null;
  const answer = () => {
    pin.jump();
    field.focus();
  };
  function drawPlan(meeting) {
    const props = { status: meeting.status, slots: nearSlots(), now: Date.now(), busy: model.choosing, line: model.choiceLine ?? "", onStart: () => void model.start(), onTime: (at) => void model.setTime(at), onAnswer: answer };
    if (planned) planned.update(props);
    else planning ??= mountIsland("meeting-plan", plan, props).then((island) => {
      planned = island;
      if (gone) island.unmount();
      else drawPlan(model.meeting);
      pin.follow();
    }).catch(() => {
      planning = null;
      plan.textContent = "선택지를 불러오지 못했어요. 위의 입력창으로 답하실 수 있어요.";
    });
  }
  let seated = null, seating = null;
  function drawSeats(meeting) {
    seatHost.hidden = !canSeat(meeting) || !model.seats.length || !ask.hidden || model.ending || seating === false;
    if (seatHost.hidden) return;
    const props = { choices: model.seats, busy: model.seating, onPick: (choice) => void model.addSeat(choice), sheet: phone };
    if (seated) seated.update(props);
    else seating ??= mountIsland("meeting-seat", seatHost, props).then((island) => {
      seated = island;
      if (gone) island.unmount();
      else drawSeats(model.meeting);
    }).catch((error) => {
      console.error("meeting: the seat menu did not load", error);
      seating = false;
      seatHost.hidden = true;
    });
  }
  let detailed = null, detailing = null;
  function drawDetail(meeting) {
    const props = { detail: meetingDetail(meeting, model.items, { agenda: model.agenda, goalTitle: model.goalTitle }), sheet: phone };
    if (detailed) detailed.update(props);
    else detailing ??= mountIsland("meeting-detail", detailHost, props).then((island) => {
      detailed = island;
      if (gone) island.unmount();
      else drawDetail(model.meeting);
    }).catch((error) => {
      console.error("meeting: the detail did not load", error);
      detailing = false;
      detailHost.hidden = true;
    });
  }
  let gone = false;
  function paint() {
    const meeting = model.meeting, live = isLive(meeting);
    root.dataset.status = meeting.status;
    const members = (meeting.members ?? []).map((m) => m.label || m.name).join(", ");
    const started = when(meeting.started_at), starts = meeting.status === "scheduled" && when(meeting.starts_at);
    top.replaceChildren(el("p", {}, [meeting.goal_id ? `목표 #${meeting.goal_id}` : "", started ? `${started} 시작` : starts ? `${starts} 예정` : "", members ? `참석 ${members}` : ""].filter(Boolean).join(" · ")));
    const wanted = [];
    let round = null;
    for (const item of model.items) {
      if (item.round !== round) {
        round = item.round;
        wanted.push(record("round:" + round, () => ({ node: el("div", { class: "msg-day", role: "separator" }, el("span", {}, round ? `${round}라운드` : "회의 전")) })).node);
      }
      if (item.speaker === "owner") {
        const got = record("seq:" + item.seq, () => said(item.text ?? "", { "data-seq": item.seq }));
        got.update(item.at, model.queued(item));
        wanted.push(got.node);
      } else if (item.speaker === "system") wanted.push(record("seq:" + item.seq, () => note(item)).node);
      else {
        const text = meeting.kind === "request" && item.seq === 1 && model.agenda ? model.agenda : item.text ?? "";
        const got = record("seq:" + item.seq, () => statement({ ...item, text }));
        got.update(text);
        wanted.push(got.node);
      }
    }
    for (const local of model.locals) {
      const got = record("local:" + local.key, () => said(local.text, { "data-local": local.key }));
      got.update(null, local.status === "sent" && local.queued, localLine(local));
      wanted.push(got.node);
    }
    if (["waiting", "saved"].includes(meeting.status) && !model.locals.some((l) => l.status !== "failed")) wanted.push(goes);
    if (isPlanned(meeting) && !model.locals.some((l) => l.status !== "failed")) {
      wanted.push(plan);
      drawPlan(meeting);
    }
    if (meeting.status === "ended") {
      const sign = JSON.stringify([model.decisions, model.record, meeting.ended_at]);
      if (sign !== recordSign) {
        const fresh = recordNode(meeting);
        if (drawn && recordSign === "") fresh.classList.add("is-new");
        records.get("record")?.node.remove();
        records.set("record", { node: fresh });
        recordSign = sign;
      }
      wanted.push(records.get("record").node);
    }
    let cursor = top.nextSibling;
    for (const child of wanted) {
      if (child === cursor) cursor = cursor.nextSibling;
      else column.insertBefore(child, cursor);
    }
    const keep = new Set([top, ...wanted]);
    for (const child of [...column.childNodes]) if (!keep.has(child)) child.remove();
    for (const [id, got] of records) if (!keep.has(got.node)) records.delete(id);
    if (!keep.has(goes)) goes.remove();
    if (!keep.has(plan)) plan.remove();
    state.textContent = model.problem && model.loaded ? "회의를 다시 읽지 못했어요 · 곧 다시 읽어요" : !model.loaded && model.problem ? "회의를 읽지 못했어요 · 곧 다시 읽어요" : stateText(meeting, model);
    const running = !model.problem && (["preflight", "speaking", "closing"].includes(meeting.status) || model.ending);
    const stateLine = phone ? bar.firstChild : bar;
    stateLine.classList.toggle("is-running", running);
    stateLine.classList.toggle("is-problem", !!model.problem || meeting.status === "failed");
    if (!canEnd(meeting)) ask.hidden = true;
    noteHost.hidden = !noting || noteLost || isPlanned(meeting);
    end.hidden = !ask.hidden || !canEnd(meeting) || model.ending;
    drawSeats(meeting);
    drawDetail(meeting);
    const [ending, asked, told, closing] = ENDS[isPlanned(meeting) ? meeting.status : "open"];
    end.firstChild.textContent = ending;
    question.textContent = asked;
    detail.textContent = told;
    yes.firstChild.textContent = closing;
    ask.setAttribute("aria-label", asked);
    box.hidden = !live || meeting.status === "closing";
    field.disabled = !canWrite(meeting);
    field.placeholder = PLACEHOLDER[meeting.status] ?? "";
    paintLine();
    form.toggleAttribute("data-empty", !field.value.trim());
    form.toggleAttribute("data-blocked", !canWrite(meeting));
    drawn = true;
    pin.follow();
  }
  let docked = null, clear = -1;
  if (phone && typeof ResizeObserver === "function") {
    const fit = () => {
      const next = Math.ceil(dock.getBoundingClientRect().bottom - bar.getBoundingClientRect().top);
      if (next !== clear) {
        clear = next;
        root.style.setProperty("--dock-h", next + "px");
        pin.resized();
      }
    };
    docked = new ResizeObserver(fit);
    docked.observe(dock);
  }
  const grown = typeof ResizeObserver === "function" ? new ResizeObserver(() => pin.resized()) : null;
  grown?.observe(scroller);
  let shown = false, everShown = false;
  const visible = () => active() && root.isConnected && root.getClientRects().length > 0;
  function check() {
    const now = visible();
    if (now === shown) return;
    shown = now;
    model.watch(now);
    if (now && !everShown) {
      everShown = true;
      requestAnimationFrame(() => {
        pin.jump();
        grow();
      });
    }
  }
  const seen = typeof IntersectionObserver === "function" ? new IntersectionObserver(check) : null;
  seen?.observe(root);
  const panel = container.closest("[data-panel]");
  const toggled = panel && typeof MutationObserver === "function" ? new MutationObserver(check) : null;
  toggled?.observe(panel, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
  const off = model.subscribe(paint);
  paint();
  check();
  function unmount() {
    gone = true;
    planned?.unmount();
    seated?.unmount();
    detailed?.unmount();
    mic?.destroy();
    void noting?.then((island) => island?.unmount());
    off();
    model.watch(false);
    seen?.disconnect();
    toggled?.disconnect();
    docked?.disconnect();
    grown?.disconnect();
    pin.destroy();
    root.remove();
  }
  unmount.focus = () => field.focus();
  unmount.visibility = check;
  unmount.park = () => {
    shown = false;
    model.watch(false);
  };
  return unmount;
}
