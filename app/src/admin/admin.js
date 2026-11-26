import { createCompletedPanel } from "../completed-panel.js";
import { createApprovals, approvalBodyHTML } from "../approvals.js";
import { postQuote, todoQuote } from "../chat/quote.js";
import { createApprovalCards } from "../chat/approval-card.js";
import { loadStyles } from "../chat/entry.js";
import { createAdminData } from "./admin-data.js";
import { adminData, startQueueOrder } from "./admin-model.js";
import { adminHTML, boardView, overviewView, railView, workSize } from "./admin-view.js";
import { mountIsland } from "../islands/island.js";
import { createOwnerState } from "./owner-state.js";
import { markStepDone, onOwnerTurn, ownerFrame, stepDone, stepState } from "../owner-steps.js";
import { leadRole, has } from "../names.js";
function scroller(el) {
  for (let n = el; n; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY;
    if ((y === "auto" || y === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}
function anchored(root, draw) {
  const main = root.querySelector(".adm-main"), box = main && scroller(main);
  if (!box || box.scrollTop < 1) {
    draw();
    return;
  }
  const doc = box === document.scrollingElement, view = doc ? 0 : box.getBoundingClientRect().top, end = doc ? innerHeight : box.getBoundingClientRect().bottom;
  const seen = [...root.querySelectorAll(".adm-isl,[data-adm-row]")].filter((n) => doc || box.contains(n)).map((n) => [n, n.getBoundingClientRect()]).filter(([, r]) => r.bottom > view && r.top < end && r.height).sort((a, b) => (a[1].top < view) - (b[1].top < view) || a[1].top - b[1].top).slice(0, 6).map(([n, r]) => [n, r.top]);
  draw();
  const kept = seen.find(([n]) => n.isConnected);
  if (kept) {
    const d = kept[0].getBoundingClientRect().top - kept[1];
    if (Math.abs(d) > 0.01) box.scrollTop += d;
  }
}
function patch(target, html, then = () => {
}) {
  const t = document.createElement("template");
  t.innerHTML = html;
  anchored(target, () => {
    merge(target, t.content);
    then();
  });
}
function merge(a, b) {
  let seen = new Map();
  const key = (n) => {
    const k = n.nodeType === 1 ? n.nodeName + (n.getAttribute("data-key") ?? "." + (n.getAttribute("class") || "")) : "#" + n.nodeType, i = seen.get(k) || 0;
    seen.set(k, i + 1);
    return k + "#" + i;
  };
  const old = new Map([...a.childNodes].map((n) => [key(n), n]));
  seen = new Map();
  const kept = new Set([...b.childNodes].map(key));
  seen = new Map();
  for (const [k, n] of old) if (!kept.has(k)) {
    n.remove();
    old.delete(k);
  }
  const at = new Map([...a.childNodes].map((n, i) => [n, i]));
  const next = [...b.childNodes].map((n) => {
    const el = old.get(key(n));
    if (el) morph(el, n);
    return el || n;
  });
  const stay = inOrder(next.map((n) => at.get(n) ?? -1));
  for (let i = next.length - 1, ref = null; i >= 0; ref = next[i--]) if (!stay.has(i)) a.insertBefore(next[i], ref);
}
function inOrder(at) {
  const tails = [], prev = [];
  at.forEach((v, i) => {
    if (v < 0) return;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const m = lo + hi >> 1;
      if (at[tails[m]] < v) lo = m + 1;
      else hi = m;
    }
    prev[i] = lo ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const stay = new Set();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) stay.add(i);
  return stay;
}
function morph(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  if (a.hasAttribute("data-own")) return;
  const own = (name) => name === "open" && a.nodeName === "DETAILS" || name === "value" && a.nodeName === "INPUT";
  for (const { name, value } of b.attributes) if (!own(name) && a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!own(name) && !b.hasAttribute(name)) a.removeAttribute(name);
  merge(a, b);
}
export function createAdmin(root, { api, closed = () => {
  location.hash = "#/admin";
}, island = mountIsland } = {}) {
  if (!document.querySelector("link[data-admin-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./admin.css", import.meta.url).href;
    link.dataset.adminStyle = "";
    document.head.append(link);
  }
  void loadStyles();
  root.classList.add("adm");
  const content = document.createElement("div");
  content.className = "adm-content";
  const panel = document.createElement("dialog");
  root.replaceChildren(content, panel);
  const completed = createCompletedPanel(panel, { api, counted: (n) => {
    if (done !== n) {
      done = n;
      drawIslands();
    }
  } });
  function completedRoute() {
    const m = location.hash.match(/^#\/(?:completed|work\/done)(?:\/(\d+))?\/?$/);
    if (m) completed.show(m[1] ? Number(m[1]) : null);
    else completed.hide();
    drawIslands();
  }
  let dashboard = null, shown = false, focus = null, reveal = false, data = null, work = null, filter = null, go = null, visit = null, goTo = null, seek = null, done = null, asked = null;
  const loaded = new Set(), source = createAdminData();
  const approvals = createApprovals(api, () => paint()), me = has("admin") ? createOwnerState(api, () => drawIslands()) : null;
  const after = (fn) => requestAnimationFrame(() => fn());
  const asks = createApprovalCards({ api, island, more: false });
  function paint() {
    if (!dashboard || !shown) return;
    const current = adminData(source.lanes(dashboard), dashboard, Date.now(), stepDone);
    data = held(current);
    if (filter && !data.slices.some((s) => s.key === filter)) filter = null;
    if (goTo != null) {
      if (data.work.some((c) => c.key === goTo)) {
        filter = null;
        work = go = goTo;
      }
      seek = goTo;
      goTo = null;
    }
    const open = openedHTML();
    root.toggleAttribute("data-open", !!open);
    patch(content, open + adminHTML(), () => {
      drawAsk();
      drawIslands();
    });
    const card = reveal && content.querySelector(".adm-open");
    if (card) {
      reveal = false;
      after(() => card.scrollIntoView({ block: "nearest", behavior: "instant" }));
    }
    const goal = seek && rowOf(seek);
    if (seek && (goal || islands.get("board")?.handle)) {
      seek = null;
      if (goal) after(() => goal.scrollIntoView({ block: "center", behavior: "instant" }));
    }
  }
  const rowOf = (key) => {
    const n = [...root.querySelectorAll("[data-adm-row]")].find((el) => el.dataset.admRow === key);
    return n?.closest("tr") ?? n ?? null;
  };
  const islands = new Map();
  const boardProps = () => ({ part: "board", phone: document.documentElement.dataset.layout === "phone", narrow: !!root.querySelector(".adm-completed[open]"), view: boardView(data, { completed: done ?? dashboard.completed?.total ?? 0, expanded: new Set(work ? [work] : []), filter, goto: go, steps: stepState }), onWork: (key) => {
    work = work === key ? null : key;
    go = null;
    paint();
  }, onFilter: (key) => {
    filter = filter === key ? null : key;
    paint();
  }, onCompleted: () => {
    location.hash = "#/completed";
  } });
  const railProps = () => ({ part: "rail", phone: document.documentElement.dataset.layout === "phone", view: railView(data), owner: me?.view() ?? null, onOwner: (which) => me?.set(which), shown: { seats: has("seats"), hosts: has("hosts") } });
  const overviewProps = () => ({ part: "overview", phone: document.documentElement.dataset.layout === "phone", view: overviewView(data, { filter, day: dashboard?.day }), onFilter: (key) => {
    filter = filter === key ? null : key;
    paint();
  } });
  function drawIslands() {
    if (!shown || !data) return;
    for (const [part, props] of [["overview", overviewProps()], ["board", boardProps()], ["rail", railProps()]]) {
      const host = content.querySelector(".adm-isl-" + part);
      if (!host) continue;
      let it = islands.get(part);
      if (it && it.host !== host) {
        void it.ready.then((h) => h?.unmount());
        it = null;
      }
      if (it) {
        it.props = props;
        it.handle?.update(props);
        continue;
      }
      it = { host, props, handle: null };
      islands.set(part, it);
      it.ready = island("admin", host, props).then((h) => {
        it.handle = h;
        h.update(it.props);
        if (part === "board" && seek) paint();
        return h;
      }).catch(() => {
        if (islands.get(part) === it) islands.delete(part);
        return null;
      });
    }
  }
  function held(d) {
    const v = visit ??= { work: null, size: new Map() };
    const fresh = (c) => {
      v.size.set(c.key, workSize(c.state));
      return c.key;
    };
    const rank = new Map((v.work ??= d.all.map(fresh)).map((k, i) => [k, i]));
    for (const c of d.all) if (!rank.has(c.key)) {
      rank.set(c.key, v.work.length);
      v.work.push(fresh(c));
    }
    return { ...d, work: [...d.work].sort((a, b) => startQueueOrder(a, b) || rank.get(a.key) - rank.get(b.key)).map((c) => ({ ...c, size: v.size.get(c.key) })) };
  }
  function openedHTML() {
    if (focus == null) return "";
    if (!loaded.has(focus)) {
      loaded.add(focus);
      void approvals.reload(focus);
    }
    const row = approvals.rows({ approvals: dashboard.approvals || [], goals: dashboard.goals || [] }).find((a) => String(a.id) === focus), st = approvals.state(focus);
    const body = st.card ? approvalBodyHTML({ ...row, ...st.card }) : "", phone = document.documentElement.dataset.layout === "phone";
    return '<section class="adm-open" data-key="open:' + focus + '"><div class="adm-open-main"><div class="chat adm-ask' + (phone ? " chat-phone" : "") + '" data-own data-adm-ask="' + focus + '" data-key="ask:' + focus + '"></div>' + (body ? '<div class="adm-open-body">' + body + "</div>" : "") + '</div><button type="button" class="adm-close" data-adm-close>Close</button></section>';
  }
  function drawAsk() {
    const host = content.querySelector("[data-adm-ask]");
    if (asked && asked !== host) asks.detach(asked);
    if (host && asked !== host) asks.attach(host, "#/approvals/" + host.dataset.admAsk, null, { placed: true });
    asked = host;
  }
  function quote(key) {
    const t = (data?.all || []).flatMap((c) => c.turn || []).find((x) => x.key === key);
    if (!t) return;
    postQuote(todoQuote({ kind: t.kind, id: t.id, goal_id: t.goal, title: t.title, what: t.line }, location.origin));
    if (location.hash !== "#/" + leadRole()) location.hash = "#/" + leadRole();
  }
  function update(d) {
    dashboard = d;
    me?.observe(d.presence);
    asks.frame(d);
    void completed.update(d.completed, d.goals);
    paint();
  }
  const sync = () => {
    const d = ownerFrame();
    if (d && d !== dashboard) update(d);
    else paint();
  };
  onOwnerTurn(sync);
  sync();
  root.addEventListener("click", (e) => {
    const done2 = e.target.closest?.("[data-step-done]");
    if (done2 && root.contains(done2)) {
      e.preventDefault();
      void markStepDone(api, done2.dataset.stepDone);
      return;
    }
    const hit = e.target.closest("[data-adm-close],[data-adm-goto],[data-adm-quote]");
    if (!hit || !root.contains(hit)) return;
    e.preventDefault();
    if (hit.hasAttribute("data-adm-close")) {
      closed();
      return;
    }
    if (hit.dataset.admQuote != null) {
      quote(hit.dataset.admQuote);
      return;
    }
    const key = hit.dataset.admGoto;
    if (!data?.work.some((c) => c.key === key)) return;
    filter = null;
    work = go = key;
    paint();
    const el = rowOf(key);
    if (el) after(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  });
  return { show(id = null, how = {}) {
    if (!shown) visit = null;
    shown = true;
    root.hidden = false;
    focus = id == null ? null : String(id);
    reveal = focus != null;
    goTo = how.goal == null ? null : "goal:" + how.goal;
    seek = null;
    paint();
    completedRoute();
  }, hide() {
    shown = false;
    completed.hide();
    root.hidden = true;
    visit = null;
  }, get data() {
    return data;
  }, get shown() {
    return shown;
  } };
}
