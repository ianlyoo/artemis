import { createApprovals } from "../approvals.js";
import { mountChoices, YES, NO, say } from "./choices.js";
import { cardLine, clean } from "../admin/admin-model.js";
import { cardLinkParts, cardLabel } from "../card-md.js";
import { approvalIds, itemApprovalIds } from "./links.js";
import { still } from "../motion-gate.js";
import { time } from "../mobile/format.js";
import { leadRole, ledgerRef, l10n } from "../names.js";
const owner = (a) => a.level === "owner";
export const optionsOf = (a) => Array.isArray(a?.options) && a.options.some((o) => o?.id != null) ? a.options.filter((o) => o?.id != null) : null;
export function pickedOf(a) {
  const options = optionsOf(a);
  if (!options || a.status !== "approved") return null;
  if (a.option_id != null) {
    const pick = options.find((o) => String(o.id) === String(a.option_id));
    if (pick) return pick;
  }
  const said = String(a.owner_verbatim ?? "");
  return options.filter((o) => o.label && (said === o.label || said.startsWith(o.label + " · "))).sort((x, y) => y.label.length - x.label.length)[0] ?? null;
}
const DECIDED = { get approved() {
  return l10n("승인함", "Approved");
}, get denied() {
  return l10n("거절함", "Declined");
}, get rejected() {
  return l10n("거절함", "Declined");
}, get expired() {
  return l10n("만료됨", "Expired");
} };
export function decidedWords(a) {
  const pick = pickedOf(a);
  if (pick) {
    const said = String(a.owner_verbatim ?? "");
    return [pick.id, said.startsWith(pick.label + " · ") ? said.slice(pick.label.length + 3) : ""].filter(Boolean);
  }
  return [DECIDED[a.status] || a.status, String(a.owner_verbatim ?? "").replace(/\s+/g, " ").trim()].filter(Boolean);
}
export function decidedLine(a) {
  const at = a.decided_at && Number.isFinite(Date.parse(a.decided_at)) ? time(a.decided_at) : "";
  return [...decidedWords(a), at].filter(Boolean).join(" · ");
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function questionOf(a, goal = null) {
  const q = cardLabel(cardLine(a, goal)), options = optionsOf(a);
  if (a.approve_here === false && a.status === "pending") return { rows: [{ q, guess: null }], decides: true, approveHere: false };
  return options ? { options: options.map((o) => String(o.label ?? o.id)), lines: options.map((o) => clean(o.line)), q, guess: options.find((o) => o.recommended)?.label, decides: true } : { rows: [{ q, guess: null }], decides: true };
}
export function questionRecord(a, st = {}) {
  if (st.missing) return { record: { status: "closed" } };
  const options = optionsOf(a), served = options ? { options } : {}, said = String(a.owner_verbatim ?? "").replace(/\s+/g, " ").trim();
  if (a.status === "pending") return !owner(a) ? { record: { id: a.id, status: "waiting", ...served } } : st.card ? { record: { id: a.id, status: "open", ...served } } : { loading: true };
  if (a.status !== "approved" && a.status !== "denied") return { record: { id: a.id, status: "closed", ...served } };
  const pick = pickedOf(a), rest = pick && said.startsWith(pick.label + " · ") ? said.slice(pick.label.length + 3) : pick ? "" : said;
  const answer = options ? { picks: pick ? [pick.label] : [], ...a.status === "denied" ? { denied: true } : {} } : { picks: [a.status === "approved" ? YES : NO] };
  return { record: { id: a.id, status: "answered", answer: { ...answer, ...rest ? { comment: rest } : {} }, ended_at: a.decided_at, ...served } };
}
const LINE_STATE = () => ({ pending: l10n("답 기다리는 중", "Waiting for an answer"), answered: l10n("답함", "Answered"), ...DECIDED });
export function lineState(a) {
  const picks = a.status === "answered" ? Array.isArray(a.answer?.picks) ? a.answer.picks : [] : [pickedOf(a)?.label];
  return [LINE_STATE()[a.status], ...picks.map(say)].filter(Boolean).join(" · ");
}
const refLine = (id, a, goal) => {
  const words = cardLinkParts(cardLine(a, goal)).map((p) => p.href ? '<a class="cmd-link" href="' + esc(p.href) + '">' + esc(p.text) + "</a>" : '<button type="button" class="cac-ref" data-cac-ref="' + id + '" title="Go to the card">' + esc(p.text) + "</button>").join(""), state = lineState(a);
  return '<span data-key="ref:' + id + '" class="cac-line"><span class="cac-tag">' + l10n("질문", "Question") + '</span><span class="cac-words">' + words + "</span>" + (state ? '<span class="cac-state">' + esc(state) + "</span>" : "") + "</span>";
};
function questionHTML(id, row, st = {}, goal = null, { ref = false, placed = false, more = true } = {}) {
  const a = { ...row, ...st.card, id };
  if (placed && (st.missing || !a.status && st.error)) return '<p class="cac-missing" data-key="missing:' + esc(id) + '">' + esc(l10n("카드 #" + id + "를 찾을 수 없어요", "Card #" + id + " is not here")) + "</p>";
  if (st.missing || !a.status && !st.error) return "";
  if (a.kind === "question" || ref && a.status === "pending" && owner(a)) return refLine(id, a, goal);
  const shape = JSON.stringify(questionOf(a, goal)), link = more ? '<a class="cac-more" href="#/approvals/' + esc(id) + '" data-adm-open="' + esc(id) + '">' + l10n("자세히", "Details") + "</a>" : "";
  return '<div class="cac-q" data-key="approval:' + esc(id) + '" data-approval="' + esc(id) + '"><div class="cac-mount" data-cac-mount="' + esc(id) + '" data-key="' + esc(shape) + '"></div>' + link + "</div>";
}
const fading = (n) => n?.nodeType === 1 && n.hasAttribute(LEAVING);
function patch(el, html, leave = null) {
  const t = document.createElement("template");
  t.innerHTML = html;
  merge(el, t.content, leave);
}
function merge(a, b, leave) {
  let seen = /* @__PURE__ */ new Map();
  const key = (n) => {
    const k = n.nodeType === 1 ? n.nodeName + (n.getAttribute("data-key") ?? "." + (n.getAttribute("class") || "")) : "#" + n.nodeType, i = seen.get(k) || 0;
    seen.set(k, i + 1);
    return k + "#" + i;
  };
  const old = new Map([...a.childNodes].filter((n) => !fading(n)).map((n) => [key(n), n]));
  seen = /* @__PURE__ */ new Map();
  const next = [...b.childNodes].map((n) => [key(n), n]), kept2 = new Set(next.map(([k]) => k));
  for (const [k, n] of old) if (!kept2.has(k)) {
    if (!leave?.(n)) n.remove();
    old.delete(k);
  }
  let ref = a.firstChild;
  for (const [k, n] of next) {
    while (fading(ref)) ref = ref.nextSibling;
    const el = old.get(k), use = el ?? n;
    if (el) morph(el, n, leave);
    if (use === ref) ref = ref.nextSibling;
    else a.insertBefore(use, ref);
  }
}
function morph(a, b, leave) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  if (a.hasAttribute("data-cac-mount")) return;
  const own = (name) => name === "open" && a.nodeName === "DETAILS" || name === "value" && a.nodeName === "INPUT";
  for (const name of b.getAttributeNames()) if (!own(name) && a.getAttribute(name) !== b.getAttribute(name)) a.setAttribute(name, b.getAttribute(name));
  for (const name of a.getAttributeNames()) if (!own(name) && !b.hasAttribute(name)) a.removeAttribute(name);
  merge(a, b, leave);
}
const GLIDE = 220, GLIDE_EASE = "ease", LEAVING = "data-cac-leaving";
const glides = /* @__PURE__ */ new WeakMap();
function measure(el, ids, view, whole = false) {
  if (el.hidden || !el.isConnected || typeof el.animate !== "function" || still()) return null;
  const cards = /* @__PURE__ */ new Map();
  for (const card of whole ? [el, ...el.children] : el.children) {
    if (card !== el && !ids.has(card.dataset.approval)) continue;
    const box = card.getBoundingClientRect();
    if (!box.height || view && (box.bottom <= view.top || box.top >= view.bottom)) continue;
    const parts = new Map([...card.children].filter((n) => !fading(n)).map((n) => [n, { box: n.getBoundingClientRect(), opacity: getComputedStyle(n).opacity }]));
    cards.set(card, { box, edge: [card.clientLeft, card.clientTop], parts });
  }
  for (const card of cards.keys()) {
    glides.get(card)?.cancel();
    glides.delete(card);
  }
  return cards.size ? cards : null;
}
function glide(el, was) {
  const ends = [];
  for (const [card, { box, edge, parts }] of was) {
    if (card !== el && card.parentNode !== el) continue;
    for (const part of card.children) {
      const at = part.hasAttribute(LEAVING) && parts.get(part);
      if (!at) continue;
      part.inert = true;
      part.setAttribute("aria-hidden", "true");
      Object.assign(part.style, { position: "absolute", top: at.box.top - box.top - edge[1] + "px", left: at.box.left - box.left - edge[0] + "px", width: at.box.width + "px", margin: "0", gridArea: "auto", boxSizing: "border-box", pointerEvents: "none" });
      part.animate([{ opacity: at.opacity }, { opacity: 0 }], { duration: GLIDE * 0.8, easing: "ease-out", fill: "forwards", id: "cac-leave" }).finished.then(() => part.remove(), () => {
      });
    }
    ends.push([card, box.height]);
  }
  for (const [card, from] of ends) {
    const to = card.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) continue;
    const frame = (height) => ({ height: height + "px", overflow: "clip", boxSizing: "border-box" });
    const run = card.animate([frame(from), frame(to)], { duration: GLIDE, easing: GLIDE_EASE, id: "cac-glide" });
    glides.set(card, run);
    run.finished.then(() => {
      if (glides.get(card) === run) glides.delete(card);
    }, () => {
    });
  }
}
function adminStyle() {
  if (!document.head) return null;
  const found = document.querySelector("link[data-admin-style]");
  if (found) return found;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../admin/admin.css", import.meta.url).href;
  link.dataset.adminStyle = "";
  document.head.append(link);
  return link;
}
let sheets = null;
export function styled() {
  return sheets ??= Promise.all([adminStyle()].map((link) => !link || link.sheet ? null : new Promise((done) => {
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 3e3);
  })));
}
const KEPT = 40, STORE = "chat-approval-cards";
function kept() {
  try {
    return new Map(JSON.parse(localStorage.getItem(STORE) || "[]"));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function keep(cards) {
  try {
    localStorage.setItem(STORE, JSON.stringify([...cards].slice(-KEPT)));
  } catch {
  }
}
export function createApprovalCards({ api, origin = location.origin, open = () => false, scroller = null, follow = null, items = null, reveal = null, island = null, more = true, after = (fn) => requestAnimationFrame(() => fn()) } = {}) {
  let dashboard = null, rows = /* @__PURE__ */ new Map();
  const hosts = /* @__PURE__ */ new Map(), read = /* @__PURE__ */ new Set(), known = kept(), reading = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
  const told = () => {
    for (const fn of [...listeners]) fn();
  };
  const readOnce = (id) => {
    read.add(id);
    const got = approvals.reload(id);
    if (got) {
      reading.add(got);
      got.finally(() => reading.delete(got));
    }
  };
  const approvals = createApprovals(api, () => {
    remember();
    for (const node of hosts.keys()) paint(node);
    told();
  });
  function remember() {
    let changed = false;
    for (const id of read) {
      const st = approvals.state(id), card = st.missing ? null : st.card;
      if (card ? known.get(id) === card : !st.missing || !known.has(id)) continue;
      known.delete(id);
      if (card) known.set(id, card);
      changed = true;
    }
    if (changed) keep(known);
  }
  const sizes = /* @__PURE__ */ new WeakMap();
  let owed = 0;
  const held = scroller && typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const box = target.getBoundingClientRect(), was = sizes.get(target), delta = box.height - was;
      sizes.set(target, box.height);
      if (was == null || Math.abs(delta) < 0.01 || !target.isConnected || box.top >= scroller.getBoundingClientRect().top) continue;
      if (delta < 0 && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 1) {
        owed = 0;
        continue;
      }
      owed += delta;
      const by = Math.round(owed);
      if (by) {
        hold(scroller.scrollTop + by);
        owed -= by;
      }
    }
  }) : null;
  const hold = (at) => {
    const by = Math.round(at - scroller.scrollTop);
    if (by) follow ? follow.shift(by) : scroller.scrollTop += by;
  };
  const said = /* @__PURE__ */ new Map(), linksOf = /* @__PURE__ */ new WeakMap();
  let homes = null;
  const linked = (item) => {
    if (!linksOf.has(item)) linksOf.set(item, itemApprovalIds(item, origin));
    return linksOf.get(item);
  };
  function homeOf(id) {
    if (!homes) {
      homes = /* @__PURE__ */ new Map();
      const list = items?.();
      if (Array.isArray(list)) for (const item of list) {
        const ids = item && (said.get(item.key) ?? (item.role === "assistant" && !item.streaming ? linked(item) : null));
        for (const id2 of ids ?? []) homes.set(id2, item.key);
      }
      for (const [key, ids] of said) for (const id2 of ids) if (!list || !homes.has(id2)) homes.set(id2, key);
    }
    return homes.get(id);
  }
  const typing = (host, id) => {
    const field = document.activeElement;
    return !!field?.matches?.("input,textarea") && host.el.contains(field) && field.closest("[data-approval]")?.dataset.approval === id;
  };
  const away = (host, id) => host.key != null && homeOf(id) !== host.key && !typing(host, id);
  const waiting = /* @__PURE__ */ new Set();
  let queued = false;
  const isLine = (card) => !!card?.startsWith('<span data-key="ref:');
  function relink(key, ids) {
    if (ids) said.set(key, ids);
    else said.delete(key);
    homes = null;
    for (const [node, host] of hosts) if (host.key !== key && host.ids.some((id) => host.drawn.has(id) && isLine(host.drawn.get(id)) !== away(host, id))) waiting.add(node);
    if (queued || !waiting.size) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const nodes = [...waiting];
      waiting.clear();
      for (const node of nodes) paint(node);
    });
  }
  function go(id) {
    if ({ ...rowOf(id), ...approvals.state(id).card }.kind === "question") {
      location.hash = "#/" + leadRole() + "/question/" + id;
      return;
    }
    const key = homeOf(id), card = () => {
      for (const host of hosts.values()) if (host.key === key) return host.el.querySelector('[data-approval="' + id + '"]');
      return null;
    };
    if (key != null && reveal?.(key, card)) return;
    const found = card();
    if (found) found.scrollIntoView({ block: "nearest", behavior: still() ? "auto" : "smooth" });
    else if (open({ kind: ledgerRef(), type: "approval", id: Number(id) }, { from: "link" }) === false) location.hash = "#/approvals/" + id;
  }
  const goalOf = (id) => {
    const goal = rows.get(id)?.goal_id ?? approvals.state(id).card?.goal_id;
    return goal == null ? null : (dashboard?.goals || []).find((g) => String(g.id) === String(goal)) ?? null;
  };
  const rowOf = (id) => known.has(id) && !approvals.state(id).card ? { ...known.get(id), ...rows.get(id) } : rows.get(id);
  async function answerCard(id, { picks = [], comments = [], comment: whole = "" } = {}) {
    const words = [...comments, whole].filter(Boolean).join(" · ");
    const card = approvals.state(id).card, options = questionOf(card).options && optionsOf(card);
    const want = options ? options.find((o) => String(o.label ?? o.id) === picks[0])?.id : picks[0] === YES ? "approve" : picks[0] === NO ? "deny" : null;
    if (want == null) return { ok: false };
    if (approvals.state(id).option !== String(want)) approvals.stage(id, want);
    approvals.comment(id, words);
    await approvals.send(id);
    const now = approvals.state(id);
    return now.error ? { ok: false, line: now.error } : { ok: true };
  }
  function mountQuestions(host) {
    for (const [node, off] of host.mounts) if (!host.el.contains(node) || node.closest("[" + LEAVING + "]")) {
      off();
      host.mounts.delete(node);
    }
    for (const node of host.el.querySelectorAll("[data-cac-mount]")) {
      if (host.mounts.has(node) || node.closest("[" + LEAVING + "]")) continue;
      const id = node.dataset.cacMount, offs = [], ctrl = new AbortController(), card = () => ({ ...rowOf(id), ...approvals.state(id).card, id });
      mountChoices(node, { choice: questionOf(card(), goalOf(id)), ...island ? { island } : {}, questions: { find: () => questionRecord(card(), approvals.state(id)), answer: (_key, _fence, body) => answerCard(id, body), subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      } } }, { signal: ctrl.signal, own: (fn) => offs.push(fn) });
      host.mounts.set(node, () => {
        ctrl.abort();
        for (const fn of offs.splice(0)) fn();
      });
    }
  }
  function paint(node) {
    const host = hosts.get(node);
    if (!host) return false;
    const each = host.ids.map((id) => [id, questionHTML(id, rowOf(id), approvals.state(id), goalOf(id), { ref: away(host, id), placed: host.placed, more })]), html = each.map(([, card]) => card).join("");
    if (html === host.html) return false;
    const changed = new Set(each.filter(([id, card]) => host.drawn.get(id) !== card).map(([id]) => id));
    const swapped = each.some(([id, card]) => host.drawn.has(id) && isLine(host.drawn.get(id)) !== isLine(card));
    host.drawn = new Map(each);
    const view = scroller?.getBoundingClientRect(), top = scroller?.scrollTop, from = view && !host.el.hidden ? host.el.getBoundingClientRect() : null;
    const was = measure(host.el, changed, view, swapped);
    const leave = was && ((part) => {
      const stays = !!was.get(part.parentNode)?.parts.has(part);
      if (stays) part.setAttribute(LEAVING, "");
      return stays;
    });
    host.html = html;
    patch(host.el, html, leave);
    host.el.hidden = !html;
    mountQuestions(host);
    if (was) glide(host.el, was);
    if (from) {
      const to = host.el.getBoundingClientRect().height, by = from.top < view.top ? to - from.height : 0;
      sizes.set(host.el, to);
      if (Math.abs(by) >= 0.5) follow?.wait?.(40);
      if (Math.abs(by) >= 0.5 || was) hold(top + by);
    }
    return true;
  }
  return { attach(node, text, key = null, { placed = false } = {}) {
    const ids = approvalIds(text, origin);
    let host = hosts.get(node);
    if (key != null) relink(key, ids.length ? ids : null);
    if (!ids.length) {
      if (host) this.detach(node);
      return;
    }
    if (!host) {
      adminStyle();
      const el = document.createElement("div");
      el.className = "adm cac";
      el.hidden = true;
      const click = (event) => {
        const to = event.target.closest?.("[data-cac-ref]");
        if (to && el.contains(to)) {
          event.preventDefault();
          go(to.dataset.cacRef);
          return;
        }
        const line = event.target.closest?.("[data-adm-open]");
        if (!line || !el.contains(line)) return;
        event.preventDefault();
        const id = line.dataset.admOpen;
        if (open({ kind: ledgerRef(), type: "approval", id: Number(id) }, { from: "link" }) === false) location.hash = "#/approvals/" + id;
      };
      const left = () => after(() => {
        if (hosts.get(node) === host) paint(node);
      });
      el.addEventListener("click", click);
      el.addEventListener("focusout", left);
      held?.observe(el);
      host = { el, key, placed, ids: [], html: null, drawn: /* @__PURE__ */ new Map(), mounts: /* @__PURE__ */ new Map(), off: () => {
        for (const off of host.mounts.values()) off();
        host.mounts.clear();
        el.removeEventListener("click", click);
        el.removeEventListener("focusout", left);
        held?.unobserve(el);
      } };
      hosts.set(node, host);
    }
    if (host.el.parentNode !== node || node.lastChild !== host.el) node.append(host.el);
    host.ids = ids;
    host.key = key;
    for (const id of ids) readOnce(id);
    if (paint(node) && held) sizes.set(host.el, host.el.getBoundingClientRect().height);
  }, detach(node) {
    const host = hosts.get(node);
    if (!host) return;
    host.off();
    host.el.remove();
    hosts.delete(node);
    waiting.delete(node);
    if (host.key != null && said.has(host.key) && !(items?.() ?? []).some((item) => item?.key === host.key)) relink(host.key, null);
  }, frame(next) {
    if (!next || typeof next !== "object") return;
    dashboard = next;
    rows = new Map(approvals.rows({ approvals: next.approvals || [], goals: next.goals || [] }).map((a) => [String(a.id), a]));
    for (const [id, a] of rows) if (a.status === "pending" && owner(a)) readOnce(id);
    for (const node of hosts.keys()) paint(node);
    told();
  }, settled(ms = 400) {
    let timer = 0;
    return Promise.race([Promise.allSettled([...reading]), new Promise((done) => {
      timer = setTimeout(done, ms);
    })]).finally(() => clearTimeout(timer));
  }, destroy() {
    for (const node of [...hosts.keys()]) this.detach(node);
    held?.disconnect();
  } };
}
