import { el } from "../boards/dom.js";
import { mountChoices, permitLine, shield } from "./choices.js";
import { questionCard } from "./questions.js";
import { mountIsland } from "../islands/island.js";
import { revealQuestion, seekQuestion } from "../boards/cards.js";
import { feed } from "./feed.js";
import { when, elapsed, koElapsed } from "../mobile/format.js";
import { markStepDone, onOwnerTurn, ownerCount, ownerFrame, ownerTurn, stepDone, stepState } from "../owner-steps.js";
import { iconButton } from "../workspace/icons.js";
import { cardLine, shortTitle } from "../admin/admin-model.js";
import { postQuote, todoQuote, quoteRef, quotedBy, REVEAL_EVENT } from "./quote.js";
import { withoutQuote, replyText } from "./reply.js";
import { whoOf } from "./view.js";
import { stepLink } from "../step-route.js";
import { distinct, linkMaterials, questionMaterials, stepMaterials } from "./materials.js";
import { leadKo, userKo, leadRole, l10n, lead } from "../names.js";
const OPEN = "home-turn-open", SEEN = "home-turn-seen", KEEP = 300;
const store = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
const read = (key) => {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    store()?.setItem(key, value);
  } catch {
  }
};
const shared = { open: read(OPEN) === "1", asked: false, seen: null, listeners: new Set() };
const seenIds = () => shared.seen ??= new Set((() => {
  try {
    const v = JSON.parse(read(SEEN) ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
})());
const tell = () => {
  for (const fn of [...shared.listeners]) fn();
};
export const turnOpen = () => shared.open;
export function setTurnOpen(on) {
  on = !!on;
  if (on === shared.open) return;
  shared.open = on;
  if (!on) shared.asked = false;
  write(OPEN, on ? "1" : "0");
  tell();
}
export function seeSteps(ids) {
  const seen = seenIds(), fresh = ids.filter((id) => !seen.has(id));
  if (!fresh.length) return false;
  for (const id of fresh) seen.add(id);
  const kept = [...seen].slice(-KEEP);
  if (kept.length < seen.size) {
    seen.clear();
    for (const id of kept) seen.add(id);
  }
  write(SEEN, JSON.stringify(kept));
  setTurnOpen(true);
  return true;
}
export function resetTurnState() {
  shared.open = read(OPEN) === "1";
  shared.asked = false;
  shared.seen = null;
}
const ID = /^[1-9]\d{0,11}$/;
const line = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const openSteps = (d) => ((d?.owner_work ?? d)?.owner_groups ?? []).flatMap((g) => g.actions ?? []).filter((r) => r.kind === "step" && ID.test(String(r.id)) && !stepDone(r.id));
const goalOf = (t) => t.goal_id ?? (t.kind === "goal" ? t.id : null);
const hasCard = (t) => ["approval", "step", "question"].includes(t.kind) && ID.test(String(t.id));
const placeOf = (t) => !hasCard(t) && ID.test(String(goalOf(t))) ? "#/admin/goal/" + goalOf(t) : null;
function materialOf(t, a) {
  if (t.kind === "approval") return distinct(linkMaterials([a.scope_text, ...Array.isArray(a.options) ? a.options.map((o) => o?.line) : []].filter((v) => typeof v === "string").join("\n")));
  if (t.kind === "step") return stepMaterials(t);
  return t.kind === "question" && ID.test(String(t.id)) ? null : [];
}
export function openItems(d) {
  const approvals = new Map((d?.approvals ?? []).map((a) => [String(a.id), a]));
  const goals = new Map((d?.goals ?? []).map((g) => [g.id, g]));
  const item = (t) => {
    const id = String(t.id), goal = goals.get(t.goal_id ?? (t.kind === "goal" ? t.id : null));
    const a = approvals.get(id) ?? { id: t.id, goal_id: t.goal_id, scope_text: t.what };
    return { key: t.key, kind: t.kind, id, goal_id: goalOf(t), title: shortTitle(t.title || goal?.title), since: t.since, what: t.kind === "approval" ? cardLine(a, goal) : t.what || goal?.owner_action || t.title || goal?.title, card: hasCard(t), href: placeOf(t), material: materialOf(t, a), permission: t.permission ?? null, ...typeof t.action?.board === "string" && t.action.board ? { board: t.action.board, fence: Number(t.action.board_fence) || 0 } : {} };
  };
  return ownerTurn(d).map((t) => ({ ...item(t), actions: (t.actions.length ? t.actions : [t]).map(item) }));
}
export function commentsOf(items, item) {
  const ref = quoteRef(item), out = [];
  items.forEach((m, i) => {
    if (m.role !== "user" || whoOf(m) !== "owner" || !quotedBy(m.text, ref)) return;
    let end = i + 1;
    while (end < items.length && !(items[end].role === "user" && whoOf(items[end]) === "owner")) end++;
    const span = items.slice(i + 1, end);
    if (!span.some((r) => r.origin)) {
      const cut = span.findIndex((r) => r.role === "user");
      if (cut >= 0) span.length = cut;
    }
    const said = span.filter((r) => r.role === "assistant" && (!r.internal || r.origin === "owner") && replyText(r).trim());
    const mine = said.filter((r) => r.origin === "owner"), answer = mine.length ? mine : said;
    out.push({ key: m.key, words: withoutQuote(replyText(m)).trim(), reply: answer.length ? answer.map(replyText).join("\n").split("\n").filter((l) => l.trim()).slice(0, 3).join("\n") : null, to: answer[0]?.key ?? null });
  });
  return out;
}
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const WORDS = { pc: { name: "To-do", open: (n) => "To-do · " + n + " open", empty: "Nothing to do", done: "Done", age: elapsed }, phone: { get name() {
  return l10n("할 일", "To-do");
}, open: (n) => l10n("할 일 " + n + "개", "To-do · " + n + " open"), get empty() {
  return l10n("할 일이 없어요", "Nothing to do");
}, get done() {
  return l10n("완료", "Done");
}, age: koElapsed } };
const TALK = { get back() {
  return l10n("목록으로", "Back to the list");
}, get loading() {
  return l10n("불러오는 중", "Loading");
}, get unread() {
  return l10n("이 질문을 불러오지 못했어요", "Couldn't load this question");
}, get quote() {
  return l10n("인용", "Quote");
}, get comment() {
  return l10n("댓글", "Comment");
}, get related() {
  return l10n("관련 자료", "Related");
}, get kinds() {
  return { file: l10n("파일", "File"), board: l10n("보드", "Board"), web: l10n("웹", "Web"), route: l10n("열기", "Open") };
}, get placeholder() {
  return l10n(`${leadKo()}에게 댓글`, `Comment to ${lead()}`);
}, get send() {
  return l10n("보내기", "Send");
}, get waiting() {
  return l10n("답 기다리는 중", "Waiting for an answer");
}, get quoteOnly() {
  return l10n("(인용만)", "(quote only)");
}, get failed() {
  return l10n("보내지 못했어요", "Couldn't send");
} };
export function sheetReach(panel, below) {
  const from = panel?.offsetParent;
  if (!from || panel.hidden) return 0;
  return Math.max(0, Math.ceil(from.getBoundingClientRect().top + panel.offsetTop + panel.offsetHeight - below.getBoundingClientRect().top));
}
export function clearSheet(panel, below, root, moved = () => {
}) {
  let reach = -1;
  const under = () => {
    const next = sheetReach(panel, below);
    if (next !== reach) {
      reach = next;
      root.style.setProperty("--turn-h", next + "px");
      moved();
    }
  };
  const sized = typeof ResizeObserver === "function" ? new ResizeObserver(under) : null;
  sized?.observe(panel);
  return () => sized?.disconnect();
}
export function createTurnList({ api, phone = false, now = () => Date.now(), store: store2 = null, quote = postQuote, open = null, island = mountIsland } = {}) {
  const id = "turn-list-" + Math.random().toString(36).slice(2, 8), words = WORDS[phone ? "phone" : "pc"];
  const count = el("span", { class: "turn-count" });
  const button = iconButton("checklist", words.name, { class: "turn-button", "aria-expanded": "false", "aria-controls": id });
  button.append(count);
  const list = el("ul", { class: "turn-items", role: "list" });
  const empty = el("p", { class: "turn-empty", hidden: true }, words.empty);
  const backHost = el("div", { class: "turn-back" }), cardLine2 = el("p", { class: "turn-card-line" });
  const cardBody = el("div", { class: "turn-card-body" }), cardExtra = el("div", { class: "turn-card-extra" });
  const view = el("div", { class: "turn-card", role: "group", hidden: true }, el("div", { class: "turn-card-head" }, backHost, cardLine2), cardBody, cardExtra);
  const panel = el("div", { class: "turn-panel turn-pop" + (phone ? " is-phone" : ""), id, role: "region", "aria-label": words.name, hidden: true }, list, empty, view);
  panel.hidden = true;
  empty.hidden = true;
  view.hidden = true;
  const items = new Map(), groups = new Map();
  const chats = () => store2 ?? feed.store;
  let threadTick = 0;
  const later = (fn) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  let steps = [], gone = false, known = false, card = null;
  function item(s) {
    const key = s.key, step = s.kind === "step";
    const tick = step ? el("input", { type: "checkbox", class: "turn-tick", "aria-label": words.done }) : el("span", { class: "turn-mark", "aria-hidden": "true" });
    const text = s.card ? el("button", { type: "button", class: "turn-text" }) : el("a", { class: "turn-text", ...s.href == null ? {} : { href: s.href } });
    const age = el("time", { class: "turn-age" });
    const error = el("p", { class: "turn-error", role: "alert", hidden: true });
    const quoteBtn = el("button", { type: "button", class: "turn-act turn-quote" }, TALK.quote);
    const countN = el("span", { class: "turn-n" }), commentBtn = el("button", { type: "button", class: "turn-act turn-comment", "aria-expanded": "false" }, TALK.comment, countN);
    const field = el("textarea", { class: "turn-field", rows: "1", placeholder: TALK.placeholder, "aria-label": TALK.comment, enterkeyhint: phone ? "enter" : "send" });
    const sendBtn = el("button", { type: "button", class: "turn-act turn-send" }, TALK.send);
    const fail = el("p", { class: "turn-error", role: "alert", hidden: true });
    const box = el("div", { class: "turn-box", hidden: true }, el("div", { class: "turn-write" }, field, sendBtn), fail);
    const thread = el("div", { class: "turn-thread", hidden: true });
    box.hidden = thread.hidden = fail.hidden = true;
    const relatedBtn = el("button", { type: "button", class: "turn-act turn-related", hidden: true, "aria-expanded": "false" }, TALK.related);
    const mats = el("ul", { class: "turn-mats", role: "list", "aria-label": TALK.related, hidden: true });
    relatedBtn.hidden = mats.hidden = true;
    const extra = el("div", { class: "turn-extra" }, el("div", { class: "turn-acts" }, quoteBtn, commentBtn, relatedBtn), mats, box, thread);
    const node = el("div", { class: "turn-item", ...step ? { "data-step": s.id } : { "data-item": key } }, tick, text, age, error, extra);
    if (step) tick.addEventListener("change", () => {
      if (tick.checked) void markStepDone(api, s.id);
    });
    text.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (it.s.card) openCard(it);
      else if (it.s.href) setTurnOpen(false);
    });
    node.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      for (let at = event.target; at && at !== node; at = at.parentNode) if (at === text || at === tick || at === error || at === extra) return;
      event.preventDefault();
      if (it.s.card) openCard(it);
      else if (it.s.href) {
        setTurnOpen(false);
        location.hash = it.s.href;
      }
    });
    const it = { key, id: s.id, s, step, node, tick, text, age, permit: null, error, extra, box, field, thread, commentBtn, countN, relatedBtn, mats, material: null, matSig: "", sig: "", sending: false, leaving: false };
    quoteBtn.addEventListener("click", () => quoteItem(it.s));
    relatedBtn.addEventListener("click", () => {
      const list2 = usable(it.material);
      if (onBoard(it.s)) void openQuestion(it);
      else if (list2.length === 1) openMaterial(list2[0]);
      else if (list2.length) {
        mats.hidden = !mats.hidden;
        relatedBtn.setAttribute("aria-expanded", String(!mats.hidden));
      }
    });
    mats.addEventListener("click", (event) => {
      const pick = event.target.closest?.("[data-mat]");
      if (!pick) return;
      mats.hidden = true;
      relatedBtn.setAttribute("aria-expanded", "false");
      openMaterial(usable(it.material)[Number(pick.dataset.mat)]);
    });
    commentBtn.addEventListener("click", () => {
      if (box.hidden) openBox(it);
      else closeBox(it);
    });
    sendBtn.addEventListener("click", () => void sendComment(it, fail, sendBtn));
    field.addEventListener("input", () => grow(field));
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        closeBox(it);
        return;
      }
      if (event.key === "Enter" && !phone && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void sendComment(it, fail, sendBtn);
      }
    });
    field.addEventListener("focus", () => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => box.scrollIntoView?.({ block: "nearest" }));
    });
    thread.addEventListener("click", (event) => {
      const to = event.target.closest?.("[data-to]");
      if (to) jumpTo(to.dataset.to);
    });
    return it;
  }
  const grow = (field) => {
    field.style.height = "auto";
    if (field.scrollHeight) field.style.height = Math.min(field.scrollHeight, 160) + "px";
  };
  function openBox(it) {
    it.box.hidden = false;
    it.commentBtn.setAttribute("aria-expanded", "true");
    it.field.focus?.({ preventScroll: true });
    it.box.scrollIntoView?.({ block: "nearest" });
  }
  function closeBox(it) {
    it.box.hidden = true;
    it.commentBtn.setAttribute("aria-expanded", "false");
    it.commentBtn.focus?.({ preventScroll: true });
  }
  const onBoard = (s) => !!(s?.board && s.fence && open);
  async function openQuestion(it) {
    const s = it.s;
    setTurnOpen(false);
    revealQuestion(s.board, s.fence);
    let opened2 = false;
    try {
      opened2 = !!await open({ kind: "file", path: s.board }, { from: "link" });
    } catch {
    }
    if (opened2) seekQuestion();
    else if (!gone && items.get(it.key) === it) {
      setTurnOpen(true);
      openCard(it);
    }
  }
  function openCard(it) {
    closeCard();
    const life = new AbortController(), offs2 = [], owner = { signal: life.signal, own: (fn) => offs2.push(fn) };
    card = { it, off: () => {
      life.abort();
      for (const fn of offs2.splice(0)) {
        try {
          fn();
        } catch {
        }
      }
    } };
    cardLine2.textContent = it.s.title ?? "";
    view.dataset.item = it.key;
    cardBody.replaceChildren();
    drawCard(it.s, cardBody, owner);
    cardExtra.append(it.extra);
    list.hidden = empty.hidden = true;
    view.hidden = false;
    panel.scrollTop = 0;
    const back = island("turn-back", backHost, { label: TALK.back, size: phone ? "lg" : "md", focus: true, onBack: () => closeCard({ focus: true }) }).catch((error) => {
      console.error("To-do: the back control did not load", error);
      return null;
    });
    owner.own(() => void back.then((mounted) => mounted?.unmount()));
  }
  function closeCard({ focus = false } = {}) {
    if (!card) return;
    const { it, off } = card;
    card = null;
    off();
    cardBody.replaceChildren();
    it.node.append(it.extra);
    delete view.dataset.item;
    view.hidden = true;
    list.hidden = false;
    empty.hidden = !!ownerCount() || items.size > 0 || !known;
    if (focus && it.node.isConnected) it.text.focus?.({ preventScroll: true });
  }
  function drawCard(s, host, owner) {
    const later2 = (load) => load.then((part) => owner.signal.aborted ? null : part).catch((error) => {
      console.error("To-do: a card did not load", error);
      return null;
    });
    if (s.kind === "approval") {
      void later2(Promise.all([import("./approval-card.js"), import("../approvals.js")])).then((parts) => {
        if (!parts) return;
        const [part, { createApprovals, approvalDetailHTML }] = parts, id2 = String(s.id);
        const ask = el("div", { class: "turn-card-ask" }), detail = el("div", { class: "turn-card-detail" });
        host.replaceChildren(ask, detail);
        const paint2 = () => {
          if (!owner.signal.aborted) {
            const state = read2.state(id2);
            detail.innerHTML = approvalDetailHTML(state.card ?? { id: id2 }, state);
          }
        };
        const read2 = createApprovals(api, paint2), cards = part.createApprovalCards({ api, more: false, island, ...open ? { open } : {} });
        cards.frame(ownerFrame());
        cards.attach(ask, "#/approvals/" + id2, null, { placed: true });
        void read2.open(id2)?.catch?.(() => {
        });
        paint2();
        owner.own(onOwnerTurn(() => cards.frame(ownerFrame())));
        owner.own(() => cards.destroy());
      });
    } else if (s.kind === "step") {
      void later2(import("../boards/step-card.js")).then((part) => {
        if (part) {
          const step = part.mountStep(host, s.id, { api });
          owner.own(() => step.destroy());
        }
      });
    } else {
      const question = questionCard(api, s.id), wait = el("p", { class: "turn-card-wait" }, TALK.loading);
      host.append(wait);
      void question.load().then(() => {
        if (owner.signal.aborted) return;
        const choice = question.choice();
        if (!choice) {
          wait.textContent = TALK.unread;
          return;
        }
        const node = el("div", { class: "turn-card-q", "data-segment": "choices", "data-question": s.id });
        host.replaceChildren(node);
        mountChoices(node, { choice, key: "question:" + s.id, questions: question, island }, owner);
      });
    }
  }
  const usable = (list2) => (list2 ?? []).filter((m) => m.target ? !!open : !!(m.url || m.route));
  function openMaterial(m) {
    if (!m) return;
    setTurnOpen(false);
    if (m.target) {
      try {
        void Promise.resolve(open(m.target, { from: "link" })).catch(() => {
        });
      } catch {
      }
    } else if (m.url) globalThis.open?.(m.url, "_blank", "noopener,noreferrer");
    else location.hash = m.route;
  }
  function drawMaterial(it) {
    const list2 = usable(it.material), sig = JSON.stringify(list2);
    it.relatedBtn.hidden = !list2.length && !onBoard(it.s);
    if (sig === it.matSig) return;
    it.matSig = sig;
    it.mats.replaceChildren(...list2.map((m, n) => el("li", {}, el("button", { type: "button", class: "turn-mat", "data-mat": String(n), title: m.url ?? m.target?.path ?? m.label }, el("span", { class: "turn-mat-kind" }, TALK.kinds[m.kind] ?? ""), el("span", { class: "turn-mat-name" }, m.label)))));
    if (list2.length < 2) {
      it.mats.hidden = true;
      it.relatedBtn.setAttribute("aria-expanded", "false");
    }
  }
  function materials() {
    if (gone || panel.hidden) return;
    for (const it of items.values()) {
      if (it.leaving || it.material || it.asking || it.s?.kind !== "question" || onBoard(it.s)) continue;
      it.asking = true;
      void questionMaterials(api, it.s.id, location.origin).then((list2) => {
        it.asking = false;
        if (gone || !list2) return;
        it.material = distinct(list2);
        drawMaterial(it);
      });
    }
  }
  const toLead = (taken) => {
    if (!taken && location.hash !== "#/" + leadRole()) location.hash = "#/" + leadRole();
  };
  function quoteItem(s) {
    const where = quote(todoQuote(s, location.origin));
    setTurnOpen(false);
    toLead(where === "composer");
  }
  function jumpTo(key) {
    setTurnOpen(false);
    later(() => later(() => {
      const detail = { key, taken: false };
      dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail }));
      toLead(detail.taken);
    }));
  }
  async function sendComment(it, fail, sendBtn) {
    const words2 = it.field.value.trim();
    if (!words2 || it.sending) return;
    it.sending = true;
    sendBtn.disabled = true;
    fail.hidden = true;
    it.field.value = "";
    grow(it.field);
    let result = null;
    try {
      result = await chats().send({ text: todoQuote(it.s, location.origin) + "\n" + words2 });
    } catch {
    }
    it.sending = false;
    sendBtn.disabled = false;
    if (result?.ok) {
      threads();
      return;
    }
    if (!result?.id && !it.field.value) {
      it.field.value = words2;
      grow(it.field);
    }
    fail.textContent = result?.line || TALK.failed;
    fail.hidden = false;
  }
  function threads() {
    if (gone || panel.hidden) return;
    const all = chats().items;
    for (const it of items.values()) {
      if (it.leaving || !it.s) continue;
      const found = commentsOf(all, it.s), shown = found.slice(-3), sig = JSON.stringify(shown);
      it.countN.textContent = found.length ? String(found.length) : "";
      it.commentBtn.setAttribute("aria-label", found.length ? TALK.comment + " " + found.length + l10n("개", "") : TALK.comment);
      if (sig === it.sig) continue;
      it.sig = sig;
      it.thread.hidden = !shown.length;
      it.thread.replaceChildren(...shown.map((c) => el("div", { class: "turn-ex" }, c.words ? el("p", { class: "turn-said" }, c.words) : el("p", { class: "turn-said is-quiet" }, TALK.quoteOnly), c.reply ? el("button", { type: "button", class: "turn-answer", "data-to": c.to }, c.reply) : el("p", { class: "turn-wait" }, TALK.waiting))));
    }
  }
  function fill(it, s) {
    it.s = s;
    const what = line(s.what) || l10n(`${userKo()} 할 일`, "My step");
    if (it.text.textContent !== what) it.text.textContent = what;
    if (it.text.tagName === "A") {
      if (s.href == null) it.text.removeAttribute("href");
      else if (it.text.getAttribute("href") !== s.href) it.text.setAttribute("href", s.href);
    }
    if (card?.it === it && cardLine2.textContent !== (s.title ?? "")) cardLine2.textContent = s.title ?? "";
    if (s.material) it.material = s.material;
    drawMaterial(it);
    const since = s.since ?? "";
    it.age.textContent = since ? words.age(since, now()) : "";
    if (since) {
      it.age.setAttribute("datetime", since);
      it.age.setAttribute("title", when(since, now()));
    }
    const band = permitLine(s.permission), sign = band ? JSON.stringify(band) : "";
    if ((it.permit?.dataset.sign ?? "") !== sign) {
      it.permit?.remove();
      it.permit = null;
      delete it.node.dataset.permit;
      if (band) {
        it.permit = el("p", { class: "turn-permit", "data-sign": sign }, shield("turn-permit-icon"), el("span", { class: "turn-permit-asks" }, band.asks), el("span", { class: "turn-permit-act" }, band.act), el("span", { class: "turn-permit-aim" }, band.aim));
        it.node.insertBefore(it.permit, it.error);
        it.node.dataset.permit = band.kind;
      }
    }
    if (!it.step) return;
    const st = stepState(it.id);
    it.tick.checked = !!(st.pending || st.done);
    it.tick.disabled = !!st.pending;
    if (st.pending) it.node.setAttribute("aria-busy", "true");
    else it.node.removeAttribute("aria-busy");
    it.node.classList.toggle("is-ticked", !!st.pending);
    it.error.textContent = st.error ?? "";
    it.error.hidden = !st.error;
  }
  function leave(it) {
    if (it.leaving) return;
    it.leaving = true;
    it.node.classList.add("is-leaving");
    if (it.step) {
      it.tick.checked = true;
      it.tick.disabled = true;
    }
    const done = () => {
      it.node.remove();
      if (items.get(it.key) === it) items.delete(it.key);
      paint();
    };
    if (reduced() || typeof it.node.animate !== "function" || panel.hidden) {
      done();
      return;
    }
    const h = it.node.getBoundingClientRect().height;
    const run = it.node.animate([{ height: h + "px", opacity: 1, transform: "none" }, { height: h + "px", opacity: 0, transform: "translateX(.6em)", offset: 0.55 }, { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    run.onfinish = done;
    run.oncancel = done;
  }
  function paint() {
    if (gone) return;
    const live = new Set(steps.flatMap((g) => g.actions.map((a) => a.key)));
    if (card && !live.has(card.it.key)) closeCard({ focus: true });
    for (const it of items.values()) if (!live.has(it.key)) leave(it);
    const groupKeys = new Set(steps.map((g) => g.key));
    for (const [key, node] of groups) if (!groupKeys.has(key)) {
      node.remove();
      groups.delete(key);
    }
    let at = null;
    for (const g of steps) {
      let group = groups.get(g.key);
      if (!group) {
        group = el("li", { "data-owner-group": g.key, class: "turn-group" });
        group.style.listStyle = "none";
        groups.set(g.key, group);
      }
      let child = null;
      for (const s of g.actions) {
        let it = items.get(s.key);
        if (it?.leaving) continue;
        if (!it) {
          it = item(s);
          items.set(s.key, it);
        }
        fill(it, s);
        const next2 = child ? child.nextSibling : group.firstChild;
        if (next2 !== it.node) group.insertBefore(it.node, next2);
        child = it.node;
      }
      const next = at ? at.nextSibling : list.firstChild;
      if (next !== group) list.insertBefore(group, next);
      at = group;
    }
    const n = ownerCount();
    count.textContent = n ? String(n) : "";
    button.classList.toggle("is-quiet", !n);
    button.setAttribute("aria-label", n ? words.open(n) : words.name);
    empty.hidden = !!card || !!n || items.size > 0 || !known;
    if (known && !n && !items.size && shared.open && !shared.asked) {
      setTurnOpen(false);
      return;
    }
    show(shared.open);
    threads();
    materials();
  }
  function show(on) {
    if (!on) closeCard();
    button.setAttribute("aria-expanded", String(on));
    if (panel.hidden === !on) return;
    panel.hidden = !on;
    if (on && !reduced() && typeof panel.animate === "function") panel.animate([{ opacity: 0, transform: "translateY(-.4em) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function fromStore() {
    const d = ownerFrame();
    if (!d) return;
    known = true;
    steps = openItems(d);
    seeSteps(steps.flatMap((g) => g.actions.map((s) => s.kind === "step" ? s.id : s.key)));
    paint();
  }
  button.addEventListener("click", () => {
    const on = !shared.open;
    shared.asked = on && !steps.length;
    setTurnOpen(on);
  });
  const away = (event) => {
    if (shared.open && !panel.hidden && !panel.contains(event.target) && !button.contains(event.target) && panel.isConnected) setTurnOpen(false);
  };
  const inField = (target) => panel.contains(target) && (target.isContentEditable || !!target.closest?.("input, textarea, select"));
  const escape = (event) => {
    if (!shared.open || panel.hidden || event.key !== "Escape" || event.isComposing || event.defaultPrevented || inField(event.target)) return;
    event.preventDefault();
    if (card) {
      closeCard({ focus: true });
      return;
    }
    setTurnOpen(false);
    button.focus?.({ preventScroll: true });
  };
  document.addEventListener("pointerdown", away, true);
  document.addEventListener("keydown", escape);
  const untalk = chats().subscribe?.(() => {
    if (!threadTick && !panel.hidden) threadTick = later(() => {
      threadTick = 0;
      threads();
    });
  }) ?? (() => {
  });
  const offs = [untalk, onOwnerTurn(fromStore)];
  const opened = () => paint();
  shared.listeners.add(opened);
  offs.push(() => shared.listeners.delete(opened));
  fromStore();
  paint();
  return { button, panel, destroy() {
    closeCard();
    gone = true;
    for (const off of offs) off();
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("keydown", escape);
    panel.remove();
    button.remove();
  } };
}
