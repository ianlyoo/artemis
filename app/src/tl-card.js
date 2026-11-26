import { stepsFor, goalSteps, nowStep, duration, hhmm, clockAt, goalLabel, STATE_WORD, barWord, hot } from "./tl-model.js";
import { scrub } from "./tl-steps.js";
import { EASE, reduced } from "./tl-motion.js";
import { userKo, l10n } from "./names.js";
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function rowLength(row, now) {
  if (!hot(row.state) || !Number.isFinite(row.since)) return "";
  return duration(now - row.since) + (row.sinceUnsure ? l10n(" 넘게", "+") : "");
}
export function nowCell(P, row, now) {
  const word = row.word || STATE_WORD[row.state] || row.state, d = rowLength(row, now);
  if (row.state === "done") return { w: word + (Number.isFinite(row.since) ? " " + clockAt(row.since, now) : ""), time: "", by: "", tx: "" };
  if (row.kind !== "agent" || !hot(row.state)) return { w: word + (d ? " " + d : "") + (row.warn ? " △" : ""), time: "", by: "", tx: row.warn || "" };
  const step = nowStep(P, row);
  return { w: word + (d ? " " + d : ""), time: step ? hhmm(step.at) : "", by: step?.actor || "", tx: step?.text || "" };
}
export function goalCell(group, now, { ownerShown = false } = {}) {
  const hotGoal = group.state === "owner";
  const w = [group.word, group.warn && !hotGoal ? "△" : ""].filter(Boolean).join(" ");
  const next = group.next && !(hotGoal && ownerShown) ? group.next : null, said = !next && group.said ? group.said : null;
  return { w, tx: next ? next.text : said ? said.text : "", who: next ? next.who : said ? clockAt(said.at, now) : "", said: !!said };
}
const stepItems = (steps) => steps.length ? steps.map((s) => "<li><time>" + hhmm(s.at) + "</time><span><em>" + esc(s.tag) + "</em>" + (s.text ? " " + esc(s.text) : "") + "</span></li>").join("") : '<li class="tl-c-none"><span>' + l10n("이 구간에 남은 단계 기록이 없어요", "No steps recorded in this span") + "</span></li>";
export function cardHTML(P, row, bar, now, { head = true, full = false, why = true } = {}) {
  const owner = row.kind === "owner", state = bar ? bar.state : row.state;
  const word = state === "owner" ? l10n("▲ 차례", "▲ My turn") : bar ? barWord(bar) : row.word || STATE_WORD[state] || state;
  const span = bar ? (bar.live ? now : bar.end) - bar.start : hot(row.state) && Number.isFinite(row.since) ? now - row.since : 0;
  const unsure = bar ? !!bar.clipped || bar.start < P.horizon : !!row.sinceUnsure;
  const length = span > 0 ? duration(span) + (unsure ? l10n(" 넘게", "+") : "") : "";
  const goal = P.goals.get(row.goalId), runGoal = bar?.goal != null ? P.goals.get(bar.goal) : null;
  const when = bar ? clockAt(bar.start, now) + "–" + (bar.live ? l10n("지금", "now") : clockAt(bar.end, now)) : "";
  const where = [goalLabel(runGoal || goal), when, bar && bar.turns.length > 1 ? l10n("턴 " + bar.turns.length + "번", bar.turns.length + " turns") : ""].filter(Boolean).join(" · ");
  const title = scrub(row.agent?.title).replace(/^#\d+\s*·\s*/, "");
  return (head ? '<div class="tl-c-head"><b>' + esc(owner ? userKo() : row.name) + '</b><span class="tl-c-sep">·</span><span class="tl-c-state ' + state + '">' + esc(word) + "</span>" + (length ? '<span class="tl-c-sep">·</span><span class="tl-c-len">' + length + "</span>" : "") + "</div>" : "") + (full && title && title !== row.name ? '<div class="tl-c-full">' + esc(title) + "</div>" : "") + (owner ? '<div class="tl-c-what">' + esc(bar?.what || row.what) + "</div>" : "") + (why && row.warn ? '<div class="tl-c-where">△ ' + esc(row.warn) + "</div>" : "") + (where || !head && length ? '<div class="tl-c-where">' + esc([where, !head ? length : ""].filter(Boolean).join(" · ")) + "</div>" : "") + '<ol class="tl-c-steps">' + stepItems(stepsFor(P, row, bar)) + "</ol>";
}
export function goalCardHTML(P, group, now) {
  const word = goalCell(group, now).w, next = group.next ? group.next.all || [group.next.text, group.next.who].filter(Boolean).join(" · ") : "";
  const agents = (group.members || []).filter((r) => r.kind === "agent").length;
  const where = [agents ? l10n("에이전트 ", "Agents ") + agents : "", Number.isFinite(group.createdAt) ? l10n(clockAt(group.createdAt, now) + " 시작", "started " + clockAt(group.createdAt, now)) : ""].filter(Boolean).join(" · ");
  return '<div class="tl-c-head"><b>' + esc(goalLabel(group.goal).replace(/ .*/, "") + " " + group.title) + "</b>" + (word ? '<span class="tl-c-sep">·</span><span class="tl-c-state ' + group.state + '">' + esc(word) + "</span>" : "") + "</div>" + (where ? '<div class="tl-c-where">' + esc(where) + "</div>" : "") + (next ? '<div class="tl-c-what">' + l10n("다음 · ", "Next · ") + esc(next) + "</div>" : "") + (group.warn ? '<div class="tl-c-where">△ ' + esc(group.warn) + "</div>" : "") + '<ol class="tl-c-steps">' + stepItems(goalSteps(P, group.id, 3).map((s) => s.line)) + "</ol>";
}
export function detailHTML(P, row, bar, now) {
  const cell = row.kind === "agent" ? nowCell(P, row, now) : null;
  const step = cell && cell.tx ? '<p class="tl-c-now">' + (cell.time ? "<time>" + cell.time + "</time>" : "") + (cell.by ? "<b>" + esc(cell.by) + "</b>" : "") + "<span>" + esc(cell.tx) + "</span></p>" : "";
  return step + cardHTML(P, row, bar, now, { head: false, full: true, why: !step });
}
const TARGET = ".tl-bar, .tl-agent .tl-lab, .tl-owner .tl-lab, .tl-agent .tl-now, .tl-owner .tl-now, .tl-goal .tl-time, .tl-goal .tl-now";
export function createCard(root, read) {
  const card = document.createElement("div");
  card.className = "tl-card";
  card.setAttribute("role", "tooltip");
  card.hidden = true;
  let hot2 = null, px = 0, timer = 0;
  const lit = /* @__PURE__ */ new Set();
  const light = (el, row) => {
    for (const x of lit) x.classList.remove("tl-hot", "tl-lit");
    lit.clear();
    if (!el) return;
    for (const x of [el, row]) if (x) {
      x.classList.add("tl-hot");
      lit.add(x);
    }
    const key = row?.dataset.key;
    if (key) {
      for (const g of root.querySelectorAll(".tl-links .tl-link")) if (g.dataset.from === key || g.dataset.to === key) {
        g.classList.add("tl-lit");
        lit.add(g);
      }
    }
  };
  function content(el) {
    const { P, V, now } = read(), rowEl = el.closest(".tl-row");
    if (!P || !V || !rowEl || rowEl.classList.contains("tl-out")) return "";
    if (rowEl.classList.contains("tl-goal")) {
      const g = V.groups.find((x) => x.key === rowEl.dataset.key);
      return g && g.kind === "goal" ? goalCardHTML(P, g, now) : "";
    }
    const row = V.rows.find((r) => r.key === rowEl.dataset.key);
    if (!row) return "";
    const bar = el.classList.contains("tl-bar") ? row.bars.find((b) => b.key === el.dataset.key) : row.bars[row.bars.length - 1] || null;
    return cardHTML(P, row, bar, now);
  }
  function place(el) {
    const a = el.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, gap = 8;
    const x = Math.min(innerWidth - w - 16, Math.max(16, px - 24));
    const below = a.bottom + gap + h <= innerHeight - 12, y = below ? a.bottom + gap : Math.max(12, a.top - gap - h);
    card.style.left = Math.round(x) + "px";
    card.style.top = Math.round(y) + "px";
    card.dataset.side = below ? "below" : "above";
  }
  function open(el, x) {
    const html = content(el);
    if (!html) {
      close();
      return;
    }
    if (!card.isConnected) document.body.append(card);
    px = x ?? el.getBoundingClientRect().left + 24;
    card.innerHTML = html;
    card.hidden = false;
    place(el);
    hot2 = el;
    light(el, el.closest(".tl-row"));
    if (!reduced()) card.animate([{ opacity: 0, transform: "translateY(" + (card.dataset.side === "above" ? 3 : -3) + "px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE });
  }
  function close() {
    clearTimeout(timer);
    hot2 = null;
    card.hidden = true;
    light(null);
  }
  function refresh() {
    if (!hot2) return;
    if (!hot2.isConnected || hot2.closest(".tl-out")) {
      close();
      return;
    }
    const html = content(hot2);
    if (!html) {
      close();
      return;
    }
    if (card.innerHTML !== html) card.innerHTML = html;
    place(hot2);
    light(hot2, hot2.closest(".tl-row"));
  }
  root.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const el = e.target.closest?.(TARGET);
    if (!el || !root.contains(el)) return;
    clearTimeout(timer);
    if (el !== hot2) open(el, e.clientX);
  });
  root.addEventListener("pointerout", (e) => {
    const next = e.relatedTarget?.closest?.(TARGET);
    if (next && root.contains(next)) return;
    clearTimeout(timer);
    timer = setTimeout(close, 80);
  });
  root.addEventListener("scroll", close, { passive: true });
  return { open, close, refresh, get hot() {
    return hot2;
  }, card };
}
