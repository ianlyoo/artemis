import { updateButton } from "./update.js";
import { seatUsageHTML } from "./seat-usage.js";
import { closeShortcut } from "./workspace/close-shortcut.js";
import { codexCapacity, codexRowHTML } from "./codex.js";
import { apiCredit, apiRowHTML } from "./api.js";
import { antigravityRows, antigravityHTML } from "./antigravity.js";
import { hostRows, hostHealth, hostMetrics, hostWorkHTML, createHostSwitches } from "./host-switches.js";
import { hostName } from "./pc-data.js";
import { prepareControls, controlMarkup } from "./pc-controls.js";
import { icon, iconButton } from "./icons.js";
import { createStatusRefresh, refreshRequest, LABEL as REFRESH } from "./status-refresh.js";
import { createJobs, jobsHTML, kept } from "./running.js";
import { createSplit } from "./split.js";
import { createHover } from "./hover.js";
import { recoverStyles } from "./recover.js";
import { streamEvents, api } from "/client.js";
import { startStream } from "./stream.js";
import { QUIET_MS } from "./quiet.js";
import { watchStale } from "./stale.js";
import { createPageStream, chatTurns } from "./workspace/page.js";
import { ideHash, openBoardRoute } from "./workspace/route.js";
import { has, onSettings, lead, leadKo, ledgerName, l10n } from "./names.js";
import { readPCRoute as readBaseRoute, routeHash as baseRouteHash, screenRoute, learnRoute, workViewState, canonicalHash, boardHash, TABS, PC_VIEW, routeAnchor } from "./routing.js";
import { stepId, terminalId } from "./step-route.js";
import { itemHash } from "./item-route.js";
import { wireEntry } from "./chat/entry.js";
import { feed } from "./chat/feed.js";
import { configureDesk, getDesk } from "./desk-notify.js";
let pendingStep = null, screenNext = false, learnNext = false, termNext = null;
function readRoute(location2) {
  const moved = canonicalHash(location2);
  if (moved) window.history.replaceState(window.history.state, "", moved);
  if (screenRoute(location2.hash)) {
    window.history.replaceState(window.history.state, "", ideHash());
    screenNext = has("pc");
    return { view: "lead", boardId: null };
  }
  if (learnRoute(location2.hash)) {
    window.history.replaceState(window.history.state, "", ideHash());
    learnNext = has("learn");
    return { view: "lead", boardId: null };
  }
  if (routeAnchor(location2)) return readRoute(location2);
  const term = terminalId(location2.hash);
  if (term != null) {
    window.history.replaceState(window.history.state, "", ideHash());
    termNext = has("terminals") ? term : null;
    return { view: "lead", boardId: null };
  }
  const step = stepId(location2.hash);
  if (step != null) {
    pendingStep = dashboard ? null : step;
    window.history.replaceState(window.history.state, "", dashboard ? itemHash({ kind: "step", id: step }, dashboard) : "#/workspace");
    return readRoute(location2);
  }
  const done = location2.hash.match(/^#\/completed(?:\/(\d+))?\/?$/);
  if (/^#\/admin\/?$/.test(location2.hash)) return { view: "admin", boardId: null, card: null };
  const goal = location2.hash.match(/^#\/admin\/goal\/([1-9]\d{0,11})\/?$/);
  if (goal) return { view: "admin", boardId: null, card: null, goal: Number(goal[1]) };
  const route = done ? { view: "admin", boardId: null, completed: true, goalId: done[1] ? Number(done[1]) : null } : readBaseRoute(location2);
  if (route.drawer === "approvals" && route.approvalId != null) return { view: "admin", boardId: null, card: route.approvalId };
  if (route.drawer === "approvals" || route.drawer === "requests") return { view: "admin", boardId: null, card: null };
  if (route.view === "ide") {
    window.history.replaceState(window.history.state, "", ideHash());
    return { ...route, view: "lead" };
  }
  return route;
}
const VIEW_NEEDS = { admin: "approvals", completed: "approvals", time: "network", network: "network", lead: "chat" };
const viewShown = (view2) => has(VIEW_NEEDS[view2]);
const firstView = () => TABS.map(([tab]) => PC_VIEW[tab]).find(viewShown) ?? null;
function shownRoute(route) {
  if (!viewShown(route.view)) {
    const view2 = firstView();
    if (view2 && location.hash !== routeHash(view2)) window.history.replaceState(window.history.state, "", routeHash(view2));
    return { view: view2, boardId: null };
  }
  return has("boards") || !(route.boardTarget || route.boardList) ? route : { ...route, boardTarget: null, boardList: false };
}
const routeHash = (view2, id) => view2 === "admin" ? id != null ? "#/approvals/" + encodeURIComponent(id) : "#/admin" : view2 === "completed" ? "#/completed" + (id != null ? "/" + id : "") : baseRouteHash(view2, id);
import { buildModel, busyCount, attentionCount, ms, trace, reviewAge, ageLabel, standingAgent, waitFacts } from "./model.js";
import { seatFigures, seatWord } from "./seats.js";
import { createTimeline } from "./tl-view.js";
import { createHistory } from "./tl-data.js";
import { createGraphView } from "./graph-view.js";
import { onOwnerTurn, ownerCount } from "./owner-steps.js";
import { esc, time, date, when, glyph, clean, stateLabel, statusView, drawWires, patch } from "./lanes.js";
import { zoneName, withZone } from "./zone.js";
recoverStyles();
prepareControls(document);
const refs = new Map([...document.querySelectorAll("[id]")].map((el) => ["#" + el.id, el]));
const stable = new Map([".workspace", ".toolbar"].map((key) => [key, document.querySelector(key)]));
const $ = (s) => refs.get(s) || stable.get(s) || refs.get("#primary").querySelector(s) || document.querySelector(s);
const ago = (v) => {
  const n = Math.max(0, Date.now() - ms(v));
  return !Number.isFinite(n) ? "—" : n < 6e4 ? Math.floor(n / 1e3) + "s" : n < 36e5 ? Math.floor(n / 6e4) + "m" : Math.floor(n / 36e5) + "h";
};
const clip = (v, n = 25) => clean(v).length > n ? clean(v).slice(0, n - 1) + "…" : clean(v);
const hostSwitches = createHostSwitches(api, () => {
  if (dashboard) renderSidebar();
});
const statusRefresh = createStatusRefresh({ post: refreshRequest(api), changed: () => {
  if (dashboard && model) renderSidebar();
} });
const jobs = createJobs({ changed: () => {
  if (dashboard && model && ["time", "network"].includes(view)) renderSidebar();
} });
let dashboard = null, model = null, fetched = null, ok = true, error = "", connected = false, selected = null, showWaiting = false, showLater = false;
let renderError = "", stale = false, graphDragging = false, deferredFrame = null, deferredRender = false, routeTurn = 0;
let renderWrites = null, renderAfter = null, scrollSnapshot = {};
const mutate = (fn) => renderWrites ? renderWrites.push(fn) : fn();
const afterPaint = (fn) => renderAfter ? renderAfter.push(fn) : fn();
function setHTML(target, markup) {
  mutate(() => patch(target, controlMarkup(markup)));
}
function renderFailed(err) {
  const message = String(err?.message || err);
  if (renderError !== message) console.error("Home render:", message);
  renderError = message;
  updateClock();
  return false;
}
const waitingKey = "artemis-show-waiting", restingKey = "artemis-show-resting";
try {
  showWaiting = localStorage.getItem(waitingKey) === "1";
  showLater = localStorage.getItem(restingKey) === "1";
} catch {
}
const navItems = ((nav) => TABS.map(([tab]) => nav.querySelector('[data-view="' + PC_VIEW[tab] + '"]')))(document.querySelector(".view-toggle"));
function paintNav() {
  const nav = document.querySelector(".view-toggle");
  for (const item of navItems) item.remove();
  nav.append(...navItems.filter((item) => viewShown(item.dataset.view)));
  document.querySelector("#lead-view").setAttribute("aria-label", lead());
  document.querySelector("#primary").setAttribute("aria-label", l10n("작업과 에이전트", "Work and agents"));
}
paintNav();
const initialRoute = shownRoute(readRoute(location));
let view = initialRoute.view, boardId = initialRoute.boardId, retryAt = 0, downAt = 0;
function lazyAdmin(root, options = {}, load = () => import("./admin/admin.js"), css = () => new URL("./admin/admin.css", import.meta.url).href) {
  let admin = null, loading = null, want = null;
  function style() {
    if (document.querySelector("link[data-admin-style]")) return null;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = css();
    link.dataset.adminStyle = "";
    const loaded = new Promise((done) => {
      link.onload = link.onerror = done;
    });
    document.head.append(link);
    return loaded;
  }
  function ensure() {
    return loading ??= Promise.all([load(), style()]).then(([{ createAdmin }]) => {
      admin = createAdmin(root, options);
      if (want) admin.show(want.id, want.how);
      else admin.hide();
      return admin;
    }).catch((err) => {
      loading = null;
      console.error("Home Admin:", String(err?.message || err));
      if (want) root.textContent = "Couldn't load Admin. Reload the page.";
      return null;
    });
  }
  return { show(id = null, how = {}) {
    want = { id, how };
    if (admin) return admin.show(id, how);
    root.hidden = false;
    void ensure();
  }, hide() {
    want = null;
    if (admin) admin.hide();
    else root.hidden = true;
  }, get data() {
    return admin?.data ?? null;
  }, get shown() {
    return admin ? admin.shown : want != null;
  }, get loaded() {
    return loading;
  } };
}
const adminView = lazyAdmin($("#admin-view"), { api, closed: () => {
  location.hash = "#/admin";
} });
onOwnerTurn(() => {
  const n = ownerCount(), tab = $("#adm-tab-n");
  tab.textContent = n || "";
  tab.hidden = !n;
});
wireEntry(document.querySelector(".lead-entry"));
const chatTurn = chatTurns();
let chatMount = null;
function ensureChat() {
  if (chatMount) return chatMount;
  if (ideMount) {
    chatTurn.down(ideMount);
    ideMount = null;
  }
  const mount = chatMount = chatTurn.mount(() => import("./chat/chat.js")).then((chat) => chat.mountChat($("#lead-view"), { layout: "pc" }).catch((err) => chat.mountProblem($("#lead-view"), err))).catch((err) => {
    if (chatMount === mount) chatMount = null;
    console.error("Home chat:", String(err?.message || err));
    $("#lead-view").textContent = l10n(leadKo() + " 채팅을 불러오지 못했어요. 새로고침해 주세요.", "Couldn't load the chat with " + lead() + ". Reload the page.");
  });
  return mount;
}
configureDesk({ enabled: true, presence: () => dashboard?.presence?.state ?? null, chatVisible: () => leadShows(view) !== null });
getDesk().attach(feed.store);
let ideView = null, ideMount = null;
function leadShows(view2) {
  return view2 === "lead" && has("chat") ? has("workspace") ? "ide" : "chat" : null;
}
function ensureIDE(on) {
  if (on && !ideMount) {
    if (!ideView) {
      ideView = document.createElement("section");
      ideView.id = "ide-view";
      ideView.setAttribute("aria-label", "Workspace");
      $("#lead-view").after(ideView);
    }
    chatTurn.down(chatMount);
    chatMount = null;
    ideMount = chatTurn.mount(() => import("./workspace/route.js")).then((ide) => ide.mountIDE(ideView, { stream: pageStream })).catch((err) => {
      console.error("Home IDE:", String(err?.message || err));
      ideView.textContent = "Couldn't load the Workspace. Reload the page.";
      return null;
    });
  } else if (ideMount) void ideMount.then((ide) => ide?.away?.(!on));
  if (ideView) ideView.hidden = !on;
}
let drawer = initialRoute.drawer || null, lanes = [], standing = [];
let selectionTrace = new Set(), graph = { x: 0, y: 0, k: 1, controller: null }, refit = false, entered = "", enterTimer = 0, lastSignature = "", paintCount = 0;
const tlView = createTimeline(), tlHistory = createHistory((start, end) => api("/timeline?start=" + Math.floor(start) + "&end=" + Math.ceil(end)).then((r) => r.ok ? r.json() : null), { changed: () => {
  if (view === "time" && dashboard) render();
} });
const hover = createHover([$("#primary"), $("#sidebar")], () => ({ model, selected }));
createSplit($("#rail-split"), { host: $(".workspace"), prop: "--x-rail-w", key: "artemis-rail-width", share: () => $(".workspace").clientWidth, width: () => $("#sidebar").getBoundingClientRect().width, changed: () => {
  if (view === "time" && dashboard) render();
} });
function buttonNode(key, label, klass = "", tip = "") {
  return '<button class="' + klass + '" data-node="' + esc(key) + '" title="' + esc(tip || label) + '">' + esc(label) + "</button>";
}
function render() {
  if (graphDragging) {
    deferredRender = true;
    return true;
  }
  if (!dashboard) {
    renderChrome();
    return true;
  }
  const oldModel = model, oldSelected = selected;
  const focused = document.activeElement, focusKey = focused?.dataset.node;
  scrollSnapshot = { sidebar: $("#sidebar").scrollTop, inspector: $(".inspect-body")?.scrollTop || 0, drawer: $("#drawer-body").querySelector(".data-wrap")?.scrollTop || 0 };
  const expanded = [...$("#sidebar").querySelectorAll("details[open]")].map((el) => el.querySelector("summary b")?.textContent), previousSelection = model?.nodes.get(selected);
  renderWrites = [];
  renderAfter = [];
  try {
    model = buildModel(dashboard);
    if (previousSelection?.kind === "apply") {
      const apply = dashboard.system?.applies?.find((a) => a.host === previousSelection.data.host && a.component === previousSelection.id);
      if (apply) model.nodes.set(selected, { ...previousSelection, data: { ...apply, created_at: apply.at }, state: apply.status === "ok" ? "done" : "stuck" });
    }
    if (selected && !model.nodes.has(selected)) selected = null;
    selectionTrace = selected ? trace(model, selected) : new Set();
    if (["time", "network"].includes(view)) {
      renderWork();
      renderSidebar();
    }
    if (drawer) renderDrawer();
    const writes = renderWrites, after = renderAfter;
    renderWrites = null;
    renderAfter = null;
    for (const write of writes) write();
    renderChrome();
    $("#busy-count").textContent = busyCount(dashboard);
    $("#warning-count").textContent = attentionCount(dashboard);
    $("#view-title").textContent = view === "time" ? "Timeline" : "Trace";
    $(".toolbar").hidden = view === "time";
    const showToggles = ["time", "network"].includes(view);
    $("#graph-controls").hidden = view !== "network";
    $("#waiting-toggle").hidden = !showToggles;
    $("#waiting-toggle").setAttribute("aria-pressed", showWaiting);
    $("#resting-toggle").hidden = !showToggles;
    $("#resting-toggle").setAttribute("aria-pressed", showLater);
    $("#sidebar").querySelectorAll("details").forEach((el) => {
      el.open = expanded.includes(el.querySelector("summary b")?.textContent);
    });
    updateClock();
    paintCount++;
    document.documentElement.dataset.rendered = String(paintCount);
    for (const fn of after) fn();
    if (scrollSnapshot.sidebar) $("#sidebar").scrollTop = scrollSnapshot.sidebar;
    if (scrollSnapshot.inspector && $(".inspect-body")) $(".inspect-body").scrollTop = scrollSnapshot.inspector;
    if (focusKey && focused !== document.activeElement) {
      const match = [...document.querySelectorAll("[data-node]")].find((el) => el.dataset.node === focusKey && el.tagName === focused.tagName);
      match?.focus({ preventScroll: true });
    }
    return true;
  } catch (err) {
    renderWrites = null;
    renderAfter = null;
    model = oldModel;
    selected = oldSelected;
    return renderFailed(err);
  }
}
function renderWork() {
  const net = statusView(model, { showWaiting, showLater });
  ({ lanes, standing } = net);
  setHTML($("#primary"), view === "time" ? '<div class="tl-host" data-own></div>' : net.html);
  afterPaint(() => {
    if (view === "time") {
      tlView.mount($(".tl-host"));
      tlView.update({ dashboard, model, history: tlHistory.frame(dashboard) });
      graph.controller?.destroy();
      graph.controller = null;
    } else {
      const panel = $(".net"), created = graph.controller?.panel !== panel;
      if (created) {
        graph.controller?.destroy();
        graph.controller = createGraphView(panel, graph, { start: () => {
          graphDragging = true;
        }, finish: settleGraph, layout: () => drawWires($("#graph-world"), lanes, standing) });
      }
      if (created || refit || graph.controller.fitting) {
        refit = false;
        graph.controller.fit();
      } else drawWires($("#graph-world"), lanes, standing);
    }
    renderWorkSwitch();
    if (entered !== view) {
      entered = view;
      const primary = $("#primary");
      if (primary.classList.contains("enter")) {
        primary.classList.remove("enter");
        void primary.offsetWidth;
      }
      primary.classList.add("enter");
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => primary.classList.remove("enter"), 1600);
    }
  });
}
function meter(v, klass = "") {
  return '<div class="meter ' + klass + '"><i style="--value:' + Math.max(0, Math.min(100, Number(v) || 0)) + '%"></i></div>';
}
function renderResources() {
  const seats = dashboard.resources?.seats || [], hosts = hostRows(dashboard), now = Date.now();
  if (!document.hidden) jobs.draw(now);
  const running = jobs.view(model.goals, now), note = [running.rows?.length ? running.rows.length + " running" : "", kept(running)].filter(Boolean).join(" · ");
  return '<div class="side-heading jobs-heading"><b>Jobs</b>' + (note ? "<small>" + esc(note) + "</small>" : "") + '</div><div class="jobs">' + jobsHTML(running) + "</div>" + (has("seats") ? '<div class="side-heading seats-heading"><b>Seats</b><small>사용량 · 0–100%</small>' + statusRefresh.html((attrs) => iconButton(attrs, "retry", REFRESH, "status-refresh-button")) + "</div>" + statusRefresh.noteHTML("refresh-note") + seats.map((s) => {
    const d = s.data || {}, node = model.nodes.get("seat:" + s.key), expired = s.fault === true && !d.red;
    return '<div class="seat ' + (expired ? "expired" : "") + '" data-node="seat:' + esc(s.key) + '" tabindex="0" role="button"><div class="seat-top"><b>' + esc(s.key) + '</b><span class="seat-status ' + node.state + '">' + (expired ? esc(d.status !== "OK" ? seatWord(s) : "No figures") : node.busy + "/" + node.active + " busy") + "</span></div>" + seatUsageHTML(s) + "</div>";
  }).join("") + codexRowHTML(codexCapacity(dashboard.resources?.codex), esc, date, time) + antigravityRows(dashboard.resources?.antigravity, now).map((r) => antigravityHTML(r)).join("") + apiRowHTML(apiCredit(dashboard.resources?.api), esc) : "") + (has("hosts") ? '<div class="side-heading"><b>Devices</b><small>Load per CPU</small></div>' + hosts.map((h) => {
    const status = hostHealth(h, now), m = hostMetrics(h, dashboard.resources?.gpu, status.muted);
    return '<div class="host" data-node="host:' + esc(h.key) + '"><div class="host-top" tabindex="0" role="button"><b>' + esc(h.label || h.key) + '</b><span class="host-health ' + status.health + (status.health === "idle" ? " host-rest" : "") + '">' + esc(status.status) + "</span></div>" + (status.asleep ? '<div class="host-sleep-note">필요할 때 깨워요.</div>' : "") + '<div class="host-metrics' + (m.muted ? " muted" : "") + '"><div><small>' + m.cpus + '</small><strong class="' + (m.high ? "stuck" : "") + '">' + m.load + "</strong>" + meter(m.loadValue, m.high ? "high" : "") + "</div><div><small>Free mem</small><strong>" + m.mem + "</strong></div><div><small>" + m.last.label + "</small><strong>" + m.last.value + "</strong>" + meter(m.last.meter) + (m.last.free ? '<small class="gpu-free">' + m.last.free + "</small>" : "") + "</div></div>" + hostWorkHTML(h) + hostSwitches.html(h.key, status) + "</div>";
  }).join("") : "") + (has("sysmap") ? '<div class="side-heading"><b>System</b>' + iconButton('data-drawer="system" aria-haspopup="dialog"', "grid", "Applies") + '</div><div class="system-strip"><span>Unlinked ' + (dashboard.system?.unlinked_owner_messages ?? "—") + "</span><span>Last poll " + ago(dashboard.system?.last_bot_poll_at) + "</span></div>" : "");
}
function renderSidebar() {
  if (!selected || !model.nodes.has(selected)) {
    setHTML($("#sidebar"), renderResources());
    return;
  }
  const n = model.nodes.get(selected), d = n.data, facts = [["State", stateLabel(n)]];
  if (n.kind === "goal" && n.state === "owner" && d.owner_action) facts.push(["Owner action", d.owner_action, "wrap"]);
  if (n.eta) facts.push(["ETA", n.eta.word]);
  const wait = waitFacts(n, [...tlHistory.view().events, ...dashboard.today || []], model.projects);
  facts.push(...wait);
  if (n.kind === "review") facts.push(["Item", d.noun + " #" + d.id], ["Age", ageLabel(reviewAge(d))], ["Since", time(d.since)]);
  if (n.kind === "event") facts.splice(0, 1, ["Kind", d.kind], ["At", time(d.at)], ["Actor", d.actor]);
  const standing2 = n.kind === "agent" && standingAgent(d);
  for (const [key, label] of [...standing2 ? [] : [["goal_id", "Goal"], ["project_id", "Project"], ["request_id", "Request"]], ["role", "Role"], ["level", "Level"], ["host", "Host"], ["seat", "Seat"]]) if (d[key] != null) facts.push([label, key === "host" ? hostName(d[key]) : d[key]]);
  if (d.busy !== void 0) facts.push(["Busy", d.busy ? "Yes" : "No"]);
  for (const [key, label] of [["created_at", "Created"], ["opened_at", "Opened"], ["closed_at", "Closed"], ["last_turn_at", "Last turn"], ["next_check_at", "Next check"], ["decided_at", "Decided"]]) if (d[key] && !(wait.length && key === "next_check_at")) facts.push([label, when(d[key]) + (key === "last_turn_at" ? " / " + ago(d[key]) : "")]);
  if (n.kind === "agent" && d.external) facts.push(["Source", "Codex · external"], ["Model", d.model || "—"]);
  if (n.kind === "seat" && n.id === "codex") {
    const c = codexCapacity(dashboard.resources?.codex);
    facts.push(["Activity", c.status]);
    for (const w of c.windows) {
      facts.push([w.label, w.percent]);
      if (w.reset) facts.push([w.label + " reset", withZone(date(w.reset) + " " + time(w.reset))]);
    }
    if (c.reason) facts.push(["Reason", c.reason, "wrap"]);
  } else if (n.kind === "seat") {
    const f = seatFigures(d.data);
    facts.push(["Quota", seatWord(d)]);
    for (const [k, l] of [["five_hour", "5h %"], ["fable_weekly", "Fable weekly %"], ["weekly", "All weekly %"]]) facts.push([l, f[k] ?? "—"]);
    for (const [k, l] of [["five_hour_resets_at", "5h reset"], ["fable_weekly_resets_at", "Fable weekly reset"], ["weekly_resets_at", "All weekly reset"]]) if (f[k]) facts.push([l, date(f[k]) + " " + time(f[k])]);
  }
  if (n.kind === "host") {
    for (const [k, l] of [["load", "Load"], ["cpus", "CPUs"], ["mem_free_gb", "Free GB"], ["disk_used_pct", "Disk %"]]) if (d.data?.[k] != null) facts.push([l, d.data[k]]);
  }
  const details = [["Review", n.kind === "review" ? d.text || d.what : null], ["Blocked", n.why ? null : d.blocked], ["Summary", n.kind === "event" ? d.summary : null], ["Request", d.owner_text], ["Scope", d.scope_text], ["Intent", d.intent], ["Done criteria", d.done_criteria]].filter(([, v]) => v);
  const related = [...selectionTrace].map((k) => model.nodes.get(k)).filter((x) => x && x.key !== selected);
  const url = n.kind === "approval" ? null : safeDiscord(d.card_url), kind = { goal: "Goal", project: "Project", agent: "Agent", seat: "Seat", host: "Device", request: "Request", approval: "Approval", review: "Review", event: "Event", apply: "Apply" }[n.kind] || n.kind;
  const ownerGoal = model.nodes.get(n.kind === "goal" ? n.key : n.kind === "project" ? "goal:" + d.goal_id : "");
  const offGraph = ownerGoal?.state === "done" || ownerGoal?.place === "waiting" && !showWaiting || ownerGoal?.place === "later" && !showLater;
  setHTML($("#sidebar"), '<div class="inspector"><div class="side-heading inspect-head"><b>' + esc(kind) + '</b><span class="inspect-tools">' + (offGraph ? "" : iconButton('data-view="network"', "network", "Trace in Network", "trace-button")) + (url ? '<a class="icon-control" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="Open in Discord" aria-label="Open in Discord">' + icon("external") + "</a>" : "") + iconButton('id="clear-selection"', "close", "Clear selection") + '</span></div><div class="inspect-body"><div class="inspect-title"><small class="' + n.state + '">' + glyph(n.state) + " " + n.kind + " " + esc(n.kind === "host" ? hostName(n.id) : n.id) + '</small><h2 title="' + esc(n.kind === "host" ? hostName(n.id) : n.label) + '">' + esc(n.kind === "host" ? hostName(n.id) : n.label) + "</h2>" + (n.whyFull ? '<p class="inspect-why ' + n.state + '">' + esc(n.whyFull.join("\n")) + "</p>" : "") + '</div><table class="facts"><tbody>' + facts.map(([k, v, wrap]) => "<tr" + (wrap ? ' class="wrap"' : "") + "><td>" + esc(k) + '</td><td title="' + esc(v) + '">' + esc(v) + "</td></tr>").join("") + "</tbody></table>" + details.map(([k, v]) => '<div class="detail-block"><details><summary><b>' + esc(k) + icon("down", "ico fold-mark") + "</b><span>" + esc(clean(v)) + "</span></summary><p>" + esc(v) + "</p></details></div>").join("") + '<div class="side-heading"><b>Connected</b><small>' + related.length + '</small></div><div class="trace-links">' + related.map((x) => buttonNode(x.key, x.kind === "agent" ? x.data.role + " / " + (standingAgent(x.data) ? "standing" : x.data.project_id ? "P" + x.data.project_id : x.label) : x.kind + " " + (x.kind === "host" ? hostName(x.id) : x.id), x.state, x.kind === "host" ? hostName(x.id) : x.label)).join("") + "</div></div></div>");
}
function safeDiscord(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "discord.com" ? u.href : null;
  } catch {
    return null;
  }
}
function renderSystem() {
  const applies = dashboard.system?.applies || [], hosts = [...new Set(applies.map((a) => a.host))], components = [...new Set(applies.map((a) => a.component))].sort();
  setHTML($("#drawer-body"), '<div class="data-wrap"><table class="apply-table"><thead><tr><th>Component</th>' + hosts.map((h) => "<th>" + esc(hostName(h)) + "</th>").join("") + "</tr></thead><tbody>" + components.map((c) => "<tr><td>" + esc(c) + "</td>" + hosts.map((h) => {
    const a = applies.find((a2) => a2.host === h && a2.component === c);
    return "<td>" + (a ? '<button class="apply-cell ' + (a.status === "ok" ? "" : "bad") + '" data-apply="' + esc(h + "|" + c) + '" aria-label="' + esc(hostName(h) + " " + c + " " + a.status) + '" title="' + esc(a.status + " · " + String(a.commit || "—").slice(0, 8) + " · " + time(a.at)) + '"></button>' : '<span class="apply-cell missing" title="Not installed"></span>') + "</td>";
  }).join("") + "</tr>").join("") + "</tbody></table></div>");
}
function renderDrawer() {
  const body = $("#drawer-body"), scroll = renderWrites ? scrollSnapshot.drawer : body.querySelector(".data-wrap")?.scrollTop || 0;
  mutate(() => {
    $("#drawer-title").textContent = "Applies";
    $("#drawer-count").innerHTML = '<span class="running">● OK</span> · <span class="stuck">◆ Check</span> · <span class="idle">— None</span>';
  });
  renderSystem();
  afterPaint(() => {
    const wrap = body.querySelector(".data-wrap");
    if (wrap && scroll) wrap.scrollTop = scroll;
  });
}
function openDrawer(kind) {
  if (!dashboard || kind !== "system" || !has("sysmap")) return;
  closeDrawer();
  drawer = kind;
  renderDrawer();
  $("#drawer").showModal();
  $("#tooltip").hidden = true;
}
function closeDrawer() {
  if ($("#drawer").open) $("#drawer").close();
  drawer = null;
}
function zoomGraph(factor) {
  graph.controller?.zoom(factor);
}
function fitGraph() {
  graph.controller?.fit();
}
let suppressClick = false;
function settleGraph() {
  suppressClick = true;
  setTimeout(() => suppressClick = false, 30);
  graphDragging = false;
  const frame = deferredFrame;
  deferredFrame = null;
  const needsRender = deferredRender;
  deferredRender = false;
  if (frame) handleFrame(frame);
  else if (needsRender) render();
}
function select(key) {
  if (!model) return;
  selected = selected === key ? null : key;
  selectionTrace = hover.path(selected);
  hover.refresh();
  renderSidebar();
  $("#tooltip").hidden = true;
}
function renderChrome() {
  const isChat = leadShows(view) === "chat", isIDE = leadShows(view) === "ide";
  const isAdmin = view === "admin";
  $(".workspace").hidden = isChat || isIDE || isAdmin || !viewShown(view);
  $("#admin-view").hidden = !isAdmin;
  $("#lead-view").hidden = !isChat;
  ensureIDE(isIDE);
  if (isChat) void ensureChat();
  const tab = workViewState(view)?.tab ?? view;
  document.querySelectorAll("[data-view]").forEach((b) => {
    const active = b.dataset.view === (b.closest(".view-toggle") ? tab : view);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active);
  });
  renderWorkSwitch();
  const dark = document.documentElement.dataset.theme === "dark", toggle = $("#theme-toggle");
  const next = "Switch to " + (dark ? "light" : "dark") + " mode";
  toggle.setAttribute("aria-pressed", String(dark));
  if (toggle.getAttribute("aria-label") !== next) {
    toggle.setAttribute("aria-label", next);
    toggle.title = next;
  }
}
function renderWorkSwitch() {
  const state = workViewState(view);
  if (!state) return;
  const button = $("#work-view-toggle");
  if (button.dataset.workView !== state.next) {
    button.dataset.workView = state.next;
    button.innerHTML = icon(state.icon);
    button.title = state.label;
    button.setAttribute("aria-label", state.label);
  }
  const host = view === "time" ? $("#primary").querySelector(".tl-ranges") : document.querySelector(".toolbar .view-label");
  if (host && button.parentNode !== host) host.append(button);
}
function navigate(next, id = null) {
  if (!["admin", "time", "network", "completed", "lead"].includes(next) || !viewShown(next)) return;
  const hash = routeHash(next, id);
  if (location.hash !== hash) window.history.pushState(null, "", hash);
  applyRoute();
}
function changeView(next) {
  const switchFocused = document.activeElement === $("#work-view-toggle");
  navigate(next);
  if (switchFocused && workViewState(next)) $("#work-view-toggle").focus({ preventScroll: true });
}
function applyRoute() {
  const route = shownRoute(readRoute(location));
  closeDrawer();
  const turn = ++routeTurn;
  if (route.view === "admin" && route.card == null && /^#\/(requests|approvals)\/?$/.test(location.hash)) window.history.replaceState(window.history.state, "", "#/admin");
  drawer = route.drawer || null;
  view = route.view;
  boardId = route.boardId;
  renderChrome();
  if (route.boardTarget || route.boardList) void openBoardRoute(route, ideMount, () => turn === routeTurn).catch(renderFailed);
  if (view === "admin") adminView.show(route.card, { goal: route.goal ?? null });
  else adminView.hide();
  $("#tooltip").hidden = true;
  render();
  if (drawer && dashboard) openDrawer(drawer);
  if (screenNext && leadShows(view) === "ide") {
    screenNext = false;
    void ideMount?.then((ide) => ide?.screen?.());
  }
  if (learnNext && leadShows(view) === "ide") {
    learnNext = false;
    void ideMount?.then((ide) => ide?.learn?.());
  }
  if (termNext != null && leadShows(view) === "ide") {
    const id = termNext;
    termNext = null;
    void ideMount?.then((ide) => ide?.terminal?.(id));
  }
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("artemis-home-theme", theme);
  } catch {
  }
  const url = new URL(location.href);
  url.searchParams.set("theme", theme);
  window.history.replaceState(null, "", url);
  renderChrome();
}
function put(node, key, value) {
  if (node[key] !== value) node[key] = value;
}
function updateClock() {
  const zone = zoneName();
  put($("#clock"), "textContent", time(Date.now()));
  put($("#clock+small"), "textContent", zone);
  put($("#clock+small"), "hidden", !zone);
  const age = Date.now() - ms(fetched), problem = renderError ? "RENDER ERROR" : !ok ? ledgerName().toUpperCase() + " ERROR" : stale ? "STALE" : !connected && retryAt && Date.now() - downAt >= QUIET_MS ? "RETRY " + Math.max(0, Math.ceil((retryAt - Date.now()) / 1e3)) + "s" : age > 9e4 ? "DATA −" + ago(fetched) : "";
  put($("#connection"), "textContent", problem);
  put($("#connection"), "hidden", !problem);
  put($("#connection"), "title", "Fetched " + (fetched || "—") + (error ? " · " + error : "") + (renderError ? " · " + renderError : ""));
}
document.addEventListener("click", (e) => {
  if (hostSwitches.click(e)) return;
  if (suppressClick) return;
  if (e.target.closest("#theme-toggle")) {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    return;
  }
  if (e.target.closest("a")) return;
  if (e.target.closest(".request-ask")) return;
  if (e.target.closest("[data-status-refresh]")) {
    statusRefresh.press();
    return;
  }
  const drawerButton = e.target.closest("[data-drawer]");
  if (drawerButton) {
    openDrawer(drawerButton.dataset.drawer);
    return;
  }
  if (e.target.closest("#close-drawer")) {
    closeDrawer();
    return;
  }
  const work = e.target.closest("[data-work-view]");
  if (work) {
    changeView(work.dataset.workView);
    return;
  }
  const v = e.target.closest("[data-view]");
  if (v) {
    changeView(v.dataset.view === "time" && v.closest(".view-toggle") ? "network" : v.dataset.view);
    return;
  }
  const ev = e.target.closest("[data-event]");
  if (ev) {
    select("event:" + ev.dataset.event);
    return;
  }
  const n = e.target.closest("[data-node]");
  if (n) {
    if (drawer) closeDrawer();
    select(n.dataset.node);
    return;
  }
  if (e.target.closest("#clear-selection")) {
    select(selected);
    return;
  }
  if (e.target.closest("#waiting-toggle")) {
    showWaiting = !showWaiting;
    try {
      localStorage.setItem(waitingKey, showWaiting ? "1" : "0");
    } catch {
    }
    refit = true;
    render();
    return;
  }
  if (e.target.closest("#resting-toggle")) {
    showLater = !showLater;
    try {
      localStorage.setItem(restingKey, showLater ? "1" : "0");
    } catch {
    }
    refit = true;
    render();
    return;
  }
  if (e.target.closest("#zoom-fit")) {
    fitGraph();
    return;
  }
  if (e.target.closest("#zoom-in") || e.target.closest("#zoom-out")) {
    zoomGraph(e.target.closest("#zoom-in") ? 1.2 : 1 / 1.2);
    return;
  }
  const apply = e.target.closest("[data-apply]");
  if (apply) {
    closeDrawer();
    const [host, component] = apply.dataset.apply.split("|"), a = dashboard.system.applies.find((a2) => a2.host === host && a2.component === component);
    model.nodes.set("apply:selection", { key: "apply:selection", kind: "apply", id: component, data: { ...a, created_at: a.at }, state: a.status === "ok" ? "done" : "stuck", label: component + " / " + hostName(host) + " · " + String(a.commit || "—").slice(0, 8) });
    selected = "apply:selection";
    selectionTrace = new Set();
    renderSidebar();
  }
});
window.addEventListener("keydown", (e) => {
  if (typeof e.key !== "string") e.stopImmediatePropagation();
}, true);
document.addEventListener("keydown", (e) => closeShortcut(e), true);
document.addEventListener("keydown", (e) => {
  if (e.target.closest(".host-switch")) return;
  if (e.key === "Escape" && drawer) {
    e.preventDefault();
    closeDrawer();
    return;
  }
  if (view === "lead") return;
  if (e.target.closest(".request-ask")) return;
  if (e.key === "Escape") {
    if (selected) select(selected);
    $("#tooltip").hidden = true;
  }
  if (e.key === "Enter" || e.key === " ") {
    const target = e.target.closest("[data-node]");
    if (target && !["BUTTON", "A"].includes(target.tagName)) {
      e.preventDefault();
      if (drawer) closeDrawer();
      select(target.dataset.node);
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (["+", "=", "-"].includes(e.key) && !drawer && view === "network") {
    e.preventDefault();
    zoomGraph(e.key === "-" ? 1 / 1.2 : 1.2);
    return;
  }
  if (e.key.toLowerCase() === "c") changeView("completed");
  if (e.key.toLowerCase() === "g") changeView("network");
  if (e.key.toLowerCase() === "t") changeView("time");
});
document.addEventListener("pointermove", (e) => {
  const hit = e.target.closest("[data-event]"), tip = $("#tooltip");
  if (!hit) {
    tip.hidden = true;
    return;
  }
  const item = model?.nodes.get("event:" + hit.dataset.event)?.data;
  if (!item) return;
  tip.innerHTML = "<strong>" + esc(time(item.at) + " · " + item.kind) + "</strong>" + esc(clip(item.summary, 250));
  tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 400) + "px";
  tip.style.top = Math.min(e.clientY + 16, window.innerHeight - 160) + "px";
});
window.addEventListener("hashchange", applyRoute);
$("#drawer").addEventListener("close", () => {
  if (!$("#drawer").open && drawer === "system") drawer = null;
});
let lifecycle = null, clockTimer = null, renderTimer = null, resizeTimer = null, tlTimer = null;
function handleFrame(frame) {
  if (graphDragging) {
    if (frame?.kind === "dashboard") {
      deferredFrame = frame;
      return "deferred";
    }
    return true;
  }
  const previous = { dashboard, fetched, ok, error };
  try {
    if (!frame || typeof frame !== "object") return false;
    if (frame.kind === "canvas") return true;
    if (frame.kind !== "dashboard") return true;
    const payload = frame.payload || {};
    ok = payload.ok !== false;
    error = payload.error ? String(payload.error) : "";
    fetched = payload.fetched_at || fetched;
    if (payload.dashboard && typeof payload.dashboard === "object") {
      const signature = JSON.stringify(payload.dashboard);
      dashboard = payload.dashboard;
      const switchesChanged = hostSwitches.observe(dashboard.hosts, dashboard.controller);
      statusRefresh.update(dashboard);
      if (signature !== lastSignature || renderError || switchesChanged) {
        if (!render()) {
          ({ dashboard, fetched, ok, error } = previous);
          return false;
        }
        renderError = "";
        lastSignature = signature;
        if (!window.__firstRenderMs) window.__firstRenderMs = performance.now();
      }
      if (drawer && !$("#drawer").open) openDrawer(drawer);
      if (pendingStep != null) {
        const id = pendingStep;
        pendingStep = null;
        if (/^#\/workspace\/?$/.test(location.hash)) {
          window.history.replaceState(null, "", itemHash({ kind: "step", id }, dashboard));
          applyRoute();
        }
      }
    }
    stale = false;
    updateClock();
    return true;
  } catch (err) {
    ({ dashboard, fetched, ok, error } = previous);
    return renderFailed(err);
  }
}
const pageStream = createPageStream({ start: startStream, read: streamEvents, onFrame: handleFrame, lifecycle: false, onConnection: (live, delay = 0) => {
  connected = live;
  if (live) stale = false;
  retryAt = live ? 0 : Date.now() + delay;
  downAt = live ? 0 : downAt || Date.now();
  updateClock();
}, onStale: () => {
  stale = true;
  connected = false;
  updateClock();
}, onUnauthorized: () => location.assign("/login") });
document.querySelector(".header-actions").prepend(updateButton());
let settingsDoor = null;
const mountDoor = (m) => {
  const door = m.settingsControl(document);
  document.querySelector(".header-actions").append(door);
  return door;
};
function paintSettingsDoor() {
  if (!has("settings")) settingsDoor?.then((door) => door.remove());
  settingsDoor = has("settings") ? settingsDoor ?? import("./setup/route.js").then(mountDoor) : null;
}
paintSettingsDoor();
function startRuntime() {
  if (lifecycle) return;
  lifecycle = new AbortController();
  const signal = lifecycle.signal;
  connected = false;
  retryAt = 0;
  updateClock();
  pageStream.start(signal);
  clockTimer = setInterval(updateClock, 1e3);
  renderTimer = setInterval(() => {
    if (dashboard) render();
  }, 6e4);
  tlTimer = setInterval(() => {
    if (view === "time" && dashboard && model && !document.hidden && !(Date.now() - tlView.model?.now < 15e3)) tlView.update({ dashboard, model, history: tlHistory.view() });
  }, 5e3);
}
function stopRuntime() {
  lifecycle?.abort();
  lifecycle = null;
  clearInterval(clockTimer);
  clearInterval(renderTimer);
  clearInterval(tlTimer);
  clearTimeout(resizeTimer);
  routeTurn++;
}
window.addEventListener("pagehide", stopRuntime);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    startRuntime();
    applyRoute();
  }
});
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (view === "time") render();
  }, 100);
});
window.history.replaceState(null, "", initialRoute.completed ? "#/completed" + (initialRoute.goalId ? "/" + initialRoute.goalId : "") : initialRoute.boardList ? boardHash() : initialRoute.drawer ? "#/" + initialRoute.drawer : routeHash(view, view === "admin" ? initialRoute.card : boardId));
onSettings(() => {
  paintNav();
  applyRoute();
  paintSettingsDoor();
});
applyRoute();
startRuntime();
watchStale();
