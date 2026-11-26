import { createChatStore } from "./store.js";
import { xhrUpload } from "./attach.js";
import { createMeeting, isMeetingKey, meetingRow, meetingTone, meetingWord, tookPlace } from "./meetings.js";
import { CQO, createCqoRecord, cqoRow, verdictWord } from "./cqo.js";
import { lead as leadName, leadRole, isLead, has, l10n } from "../names.js";
export const SECRETARY = "personal-secretary";
export const LEAD_KEY = "@lead";
export const agentName = (agent) => agent?.displayName ?? leadName();
export const agentState = (agent) => agent?.role === "meeting" ? meetingWord(agent.state, agent.meeting) : agent?.role === "cqo" ? verdictWord(agent.state) : agent?.state === "needs_permission" ? "waiting on permission" : agent?.state ?? "connecting";
export const stateClass = (agent) => agent?.role === "meeting" ? "g151-" + meetingTone(agent.state) : agent?.role === "cqo" ? agent.state === "judging" ? "g151-run" : "g151-idle" : agent?.state === "running" ? "g151-run" : agent?.state === "needs_permission" ? "g151-wait" : "g151-idle";
export const deliveryLine = (message) => message?.state === "queued" ? message.held ? l10n("Queued · 턴이 끝나면 전달돼요", "Queued · goes when the turn ends") : l10n("Queued · 지금 하던 단계를 마치면 읽어요", "Queued · read once the current step ends") : message?.state === "delivered" ? "Delivered" : message?.state === "failed" ? "Not sent" : "";
export const findAgent = (roster, id) => roster.find((a) => a.id === id) ?? (id === SECRETARY ? roster.find((a) => a.pinned === "secretary") : void 0);
export const receiptLine = (agent, message) => ["pm", "worker", "reviewer"].includes(agent?.role) && message?.receipt?.launcher_name ? l10n(`→ ${message.receipt.launcher_name}에도 알렸어요 · 기록됨`, `→ ${message.receipt.launcher_name} told too · recorded`) : "";
export const studioHelper = (agent) => agent?.role === "studio" && !!agent.parentId;
export const tutor = (agent) => agent?.pinned === "tutor";
const room = (agent) => agent?.role === "studio" && !tutor(agent);
export const namePrefix = (agent) => agent?.role === "meeting" ? "회의 · " : !room(agent) ? "" : studioHelper(agent) ? "보조 · " : "작업실 · ";
export const PAST = 5;
const offered = (agent) => agent?.role === "studio" || studioHelper(agent) ? has("studio") : agent?.role === "meeting" ? has("meetings") : agent?.role === "cqo" || agent?.id === CQO ? has("cqo") : true;
export function groupedAgents(all, query = "") {
  const agents = all.filter(offered);
  const worker = (a) => ["worker", "reviewer"].includes(a.role) || studioHelper(a);
  const newest = (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
  const q = query.trim().toLocaleLowerCase();
  const meetings = agents.filter((a) => a.role === "meeting").sort(newest), live = meetings.filter((a) => a.live), ended = meetings.filter((a) => !a.live);
  const past = q ? ended : ended.filter((a) => tookPlace(a.meeting)).slice(0, PAST);
  const roots = agents.filter((a) => !worker(a) && a.role !== "meeting").sort((a, b) => {
    const rank = (a2) => isLead(a2.role) ? 0 : tutor(a2) ? 1 : a2.role === "studio" ? 2 : a2.role === "cqo" ? 5 : a2.pinned ? 3 : a2.role === "cto" ? 4 : 6;
    return rank(a) - rank(b) || (a.role === "studio" ? (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") : (b.projectId ?? 0) - (a.projectId ?? 0));
  });
  const rows = [], seen = new Set();
  function visit(agent, nested = false, group = null) {
    if (seen.has(agent.id)) return;
    seen.add(agent.id);
    rows.push({ agent, nested, group });
    for (const child of agents.filter((a) => worker(a) && a.parentId === agent.id)) visit(child, true);
  }
  const top = roots.filter((a) => isLead(a.role) || a.role === "studio");
  for (const root of top) {
    seen.add(root.id);
    rows.push({ agent: root, nested: false, group: room(root) && !rows.some((row) => room(row.agent)) ? "작업실" : null });
    if (isLead(root.role)) live.forEach((meeting, i) => visit(meeting, false, i === 0 ? "회의" : null));
    if (room(root)) for (const child of agents.filter((a) => studioHelper(a) && a.parentId === root.id)) visit(child, true);
  }
  const apart = top.some((a) => a.role === "studio") || live.length > 0;
  for (const root of top.filter((a) => isLead(a.role))) agents.filter((a) => worker(a) && a.parentId === root.id).forEach((child, i) => visit(child, !apart, apart && i === 0 ? `${leadName()}’s workers` : null));
  for (const root of roots.filter((a) => !top.includes(a))) visit(root, false, root.role === "pm" && !root.pinned ? `Project ${root.projectId ?? "—"}` : null);
  let other = false;
  for (const agent of agents) if (!seen.has(agent.id) && agent.role !== "meeting") {
    visit(agent, false, other ? null : "Other workers");
    other = true;
  }
  [...live, ...past].forEach((meeting, i) => {
    if (!seen.has(meeting.id)) visit(meeting, false, meeting.live ? i === 0 ? "회의" : null : meeting === past[0] ? "지난 회의" : null);
  });
  if (!q) return rows;
  const kind = (agent) => agent.role === "studio" ? "작업실 studio" : agent.role === "meeting" ? "회의 meeting" : agent.role;
  const matches = ({ agent }) => (agent.pinned ? agentName(agent) : `${agentName(agent)} ${agent.displayName ?? ""} ${kind(agent)} ${agent.goalId ?? ""}`).toLocaleLowerCase().includes(q);
  return rows.filter((row) => row.agent.pinned && !row.nested || matches(row)).map((row) => ({ ...row, group: null, ...matches(row) ? {} : { miss: true } }));
}
export function deviceId(storage = globalThis.localStorage) {
  try {
    const kept = storage?.getItem("home-chat-device");
    if (/^[A-Za-z0-9_-]{1,64}$/.test(kept ?? "")) return kept;
    const id = crypto.randomUUID();
    storage?.setItem("home-chat-device", id);
    return id;
  } catch {
    return "default";
  }
}
export const ROSTER_RETRY = Object.freeze({ first: 1e4, most: 3e5 });
export function createAgents({ api, device = deviceId(), uuid, now, cacheSize = 12, leadStore = null } = {}) {
  const entries = new Map(), listeners = new Set();
  const lead = leadStore ? { key: LEAD_KEY, agent: { id: LEAD_KEY, get displayName() {
    return leadName();
  }, get role() {
    return leadRole();
  }, state: "connecting" }, store: leadStore, loaded: false, loading: null, events: [], top: 0, revision: 0, upload: xhrUpload } : null;
  if (lead) entries.set(lead.key, lead);
  const limit = Math.max(lead ? 2 : 1, Math.floor(cacheSize) || 12);
  let roster = lead ? [lead.agent] : [], live = false, started = false, selected = null, refreshing = null, error = null, globalState = null, leadSettings = null, leadContext = null, rosterSign = "", retryTimer = null, retryWait = ROSTER_RETRY.first, discovered = false;
  let meetings = [], meetingsRead = null;
  const meetingEntries = new Map();
  const cqo = { key: CQO, agent: cqoRow(), record: createCqoRecord({ api }) };
  cqo.record.subscribe(() => {
    const next = cqoRow(cqo.record.cases);
    if (JSON.stringify(next) !== JSON.stringify(cqo.agent)) {
      cqo.agent = next;
      emit();
    }
  });
  const pinnedRows = () => cqo.record.loaded && has("cqo") ? [cqo.agent] : [];
  cqo.toLead = (text) => lead ? lead.store.send({ text }) : Promise.resolve({ ok: false, line: `Can't find ${leadName()} right now` });
  cqo.openLead = () => lead && select(lead.key);
  const signature = (list) => JSON.stringify(list.map((a) => [a.id, a.state, a.lastActivityAt, a.displayName, a.parentId]));
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const json = async (path, init) => {
    const response = await api(path, init?.body === void 0 ? init : { ...init, headers: { ...init.headers, "Content-Type": "application/json" } });
    const body = await response.json().catch(() => void 0);
    if (!response.ok) throw new Error(body === void 0 ? `http_${response.status}` : body?.error ?? "offline");
    if (body === void 0) throw new Error("invalid_response");
    return body;
  };
  const query = (path, id, params = {}) => path + "?" + new URLSearchParams({ agentId: id, ...params });
  const selectedId = () => entries.get(selected)?.agent.id ?? selected;
  const leadAway = () => !!lead && lead.store.state.state === "no_target";
  function syncLead(metadata = {}) {
    if (!lead) return;
    lead.agent = { ...lead.agent, ...metadata, ...lead.store.agent, role: leadRole(), displayName: metadata.displayName ?? lead.agent.displayName, state: lead.store.turn.running ? "running" : lead.store.state.state === "ready" ? "idle" : metadata.state ?? lead.agent.state };
    roster = [lead.agent, ...roster.filter((a) => !isLead(a.role) && a.id !== lead.agent.id)];
  }
  function retryLater() {
    if (!lead || !listeners.size || retryTimer) return;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      await refreshRoster();
      if (!error && selected) void refreshThread(selected);
    }, retryWait);
    retryWait = Math.min(ROSTER_RETRY.most, retryWait * 2);
    retryTimer.unref?.();
  }
  function reread() {
    void refreshRoster().then(() => {
      if (selected) void refreshThread(selected);
    });
  }
  function fallback(reason) {
    error = reason;
    if (lead) {
      roster = [lead.agent];
      if (!isMeetingKey(selected) && selected !== CQO) selected = lead.key;
    }
    for (const entry of entries.values()) state(entry);
    retryLater();
  }
  function leadApi(path, init) {
    if (lead && (["/chat/held/remove", "/chat/send_now"].includes(path) || path === "/chat/send" && discovered && !error && !leadAway())) {
      return api(path, { ...init, body: JSON.stringify({ ...JSON.parse(init.body), agentId: lead.agent.id, ...path === "/chat/send" ? { device } : {} }) });
    }
    return api(path, init);
  }
  function trim() {
    for (const [id, entry] of entries) {
      if (entries.size <= limit) break;
      if (id === selected || entry === lead) continue;
      entries.delete(id);
      entry.store.destroy();
    }
  }
  function scopedApi(id) {
    return async (path, init) => {
      if (path.startsWith("/chat/history?")) {
        const cursor = new URLSearchParams(path.split("?")[1]).get("before");
        const response = await api(query("/chat/history", id, { before: cursor }), init);
        const body = await response.json();
        if (body.reset) void refreshThread(id, true);
        return new Response(JSON.stringify({ ...body, hasOlder: !!body.before }), { status: response.status });
      }
      if (path === "/chat/settings" && entries.get(id)?.agent.state === "ended") return new Response(JSON.stringify({ error: "no_target" }), { status: 503 });
      if (["/chat/send", "/chat/cancel", "/chat/held/remove", "/chat/send_now", "/chat/settings"].includes(path)) {
        return api(path, { ...init, body: JSON.stringify({ ...JSON.parse(init.body), agentId: id, ...path === "/chat/send" ? { device } : {} }) });
      }
      if (path === "/chat/rewind" && (!isLead(entries.get(id)?.agent.role) || entries.get(id)?.agent.state === "ended")) {
        return new Response(JSON.stringify({ error: "not_lead" }), { status: 403 });
      }
      return api(path, init);
    };
  }
  function state(entry) {
    if (entry === lead) return;
    const ended = entry.agent.state === "ended";
    const phase = !live || error || globalState?.state === "offline" ? "offline" : globalState?.state === "version_mismatch" ? "version_mismatch" : ended ? "no_target" : "ready";
    entry.store.handle({ kind: "chat.state", payload: { state: phase, agent: entry.agent, canSend: phase === "ready" && entry.loaded, controls: { cancel: phase === "ready" && entry.loaded, rewind: isLead(entry.agent.role) && globalState?.controls?.rewind === true } } });
  }
  function meetingEntry(id) {
    if (meetingEntries.has(id)) return meetingEntries.get(id);
    const row = meetings.find((a) => a.id === id);
    if (!row) return null;
    const meeting = createMeeting({ api, meeting: row.meeting });
    const entry = { key: id, agent: row, meeting };
    meeting.subscribe(() => {
      const next = meetingRow(meeting.meeting);
      if (JSON.stringify(next) === JSON.stringify(entry.agent)) return;
      entry.agent = next;
      meetings = meetings.map((a) => a.id === id ? next : a);
      emit();
    });
    meetingEntries.set(id, entry);
    return entry;
  }
  async function refreshMeetings() {
    if (!has("meetings")) return meetings;
    if (meetingsRead) return meetingsRead;
    meetingsRead = (async () => {
      try {
        const body = await json("/meetings?status=all");
        if (!Array.isArray(body.items)) throw new Error("invalid_meetings");
        const before = JSON.stringify(meetings);
        meetings = body.items.filter((m) => m && m.id !== void 0 && m.id !== null).map(meetingRow);
        for (const [id, entry] of meetingEntries) {
          const listed = meetings.find((a) => a.id === id);
          if (listed) {
            entry.meeting.update(listed.meeting);
            entry.agent = meetingRow(entry.meeting.meeting);
            meetings = meetings.map((a) => a.id === id ? entry.agent : a);
          } else if (id !== selected) {
            entry.meeting.destroy();
            meetingEntries.delete(id);
          }
        }
        if (JSON.stringify(meetings) !== before) emit();
      } catch {
      } finally {
        meetingsRead = null;
      }
      return meetings;
    })();
    return meetingsRead;
  }
  function get(id) {
    if (isMeetingKey(id)) return has("meetings") ? meetingEntry(id) : null;
    if (id === CQO) return cqo.record.loaded && has("cqo") ? cqo : null;
    if (lead && (id === lead.key || id === lead.agent.id)) return lead;
    if (entries.has(id)) return entries.get(id);
    const agent = findAgent(roster, id);
    if (!agent) return null;
    if (entries.has(agent.id)) return entries.get(agent.id);
    id = agent.id;
    const store = createChatStore({ api: scopedApi(id), company: true, uuid, now, resync: () => refreshThread(id) });
    const entry = { key: id, agent, store, loaded: false, loading: null, events: [], top: 0, revision: 0, upload: (file, options) => xhrUpload(file, { ...options, url: query("/chat/upload", id, { name: options.name }) }) };
    entries.set(id, entry);
    store.connection(live);
    state(entry);
    if (isLead(agent.role)) {
      if (leadSettings) store.handle({ kind: "chat.settings", payload: leadSettings });
      if (leadContext) store.handle({ kind: "chat.context", payload: leadContext });
    }
    return entry;
  }
  async function refreshRoster() {
    started = true;
    if (has("meetings")) void refreshMeetings();
    if (has("cqo")) void cqo.record.read();
    if (refreshing) return refreshing;
    clearTimeout(retryTimer);
    retryTimer = null;
    refreshing = (async () => {
      try {
        const body = await json("/chat/roster?" + new URLSearchParams({ device }));
        if (!Array.isArray(body.agents)) throw new Error("invalid_roster");
        roster = body.agents;
        error = null;
        discovered = true;
        retryWait = ROSTER_RETRY.first;
        rosterSign = signature(roster);
        syncLead(roster.find((a) => isLead(a.role)));
        for (const entry of entries.values()) {
          if (entry === lead) continue;
          const listed = roster.find((a) => a.id === entry.agent.id), back = entry.gone && !!listed;
          entry.gone = !listed;
          entry.agent = listed ?? { ...entry.agent, state: "ended" };
          state(entry);
          if (back && entry.key === selected) void refreshThread(entry.key);
        }
        const open = entries.get(selected), pin = open?.agent.pinned && roster.find((a) => a.pinned === open.agent.pinned);
        if (open?.agent.pinned && open.agent.state === "ended" && pin && pin.id !== open.agent.id) void select(pin.id);
      } catch (e) {
        fallback(e.message);
      } finally {
        refreshing = null;
        emit();
      }
      return roster;
    })();
    return refreshing;
  }
  async function refreshThread(id, reset = false) {
    if (isMeetingKey(id)) return meetingEntry(id)?.meeting.read();
    if (id === CQO) return has("cqo") ? cqo.record.read() : void 0;
    const entry = get(id);
    if (!entry) return;
    id = entry.key;
    if (entry === lead && (!discovered || lead.agent.id === lead.key || leadAway()) || entry.gone) return;
    if (reset) {
      entry.revision++;
      entry.loaded = false;
      entry.events = [];
    }
    if (entry.loading) return entry.loading;
    const revision = entry.revision, since = entry.store.messageVersion, queueSince = entry.store.queueVersion;
    entry.loading = (async () => {
      try {
        const body = await json(query("/chat/thread", entry.agent.id, { device }));
        if (entries.get(id) !== entry || entry.revision !== revision) return;
        if (body.agentId !== entry.agent.id || !Array.isArray(body.items)) throw new Error("invalid_agent");
        const merge = entry.loaded;
        entry.loaded = true;
        if (entry === lead) syncLead(body.agent);
        else {
          entry.agent = body.agent ?? entry.agent;
          const running = entry.agent.state === "running";
          entry.store.handle({ kind: "chat.snapshot", payload: { ...body, queue: void 0, merge, hasOlder: !!body.before, turn: { running, phase: running ? "answering" : "idle", turnKey: body.items?.at(-1)?.turnKey } } });
          if (body.settings !== void 0) entry.store.handle({ kind: "chat.settings", payload: body.settings });
          if (body.context !== void 0) entry.store.handle({ kind: "chat.context", payload: body.context });
        }
        entry.store.reconcileMessages(body.messages ?? [], since);
        entry.store.reconcileQueue(body.queue, queueSince);
        for (const frame of entry.events.splice(0)) handleAgentFrame(entry, frame);
        state(entry);
        if (id === selected) {
          entry.agent = { ...entry.agent, unread: 0 };
          roster = roster.map((a) => a.id === entry.agent.id ? { ...a, unread: 0 } : a);
        }
        emit();
      } catch {
        if (entry !== lead && entries.get(id) === entry && entry.revision === revision) {
          fallback("thread_unavailable");
          emit();
        }
      } finally {
        entry.loading = null;
        if (entries.get(id) === entry && entry.revision !== revision) void refreshThread(id);
      }
    })();
    return entry.loading;
  }
  async function select(id) {
    const entry = get(id);
    if (!entry) return null;
    id = entry.key;
    if (selected && selected !== id) {
      void refreshThread(selected);
      roster = roster.map((a) => a.id === selectedId() ? { ...a, unread: 0 } : a);
    }
    selected = id;
    if (entry.meeting || entry.record) {
      emit();
      await (entry.meeting ?? entry.record).read();
      return entry;
    }
    entries.delete(id);
    entries.set(id, entry);
    trim();
    emit();
    await refreshThread(id);
    return entry;
  }
  function handleAgentFrame(entry, frame) {
    const { kind, payload } = frame;
    if (kind === "chat.agent.item") entry.store.handle({ kind: "chat.item", payload: payload.item });
    if (kind === "chat.agent.append") {
      const { agentId: _agent, ...append } = payload;
      entry.store.handle({ kind: "chat.append", payload: append });
    }
    if (kind === "chat.agent.settings") entry.store.handle({ kind: "chat.settings", payload: payload.settings });
    if (kind === "chat.agent.context") entry.store.handle({ kind: "chat.context", payload: payload.context });
    if (kind === "chat.agent.permissions") entry.store.handle({ kind: "chat.permissions", payload });
    if (kind === "chat.agent.turn") entry.store.handle({ kind: "chat.turn", payload: { ...payload, running: payload.phase === "started", phase: payload.phase === "started" ? "answering" : "idle" } });
  }
  return { get roster() {
    const pinned = pinnedRows();
    return meetings.length || pinned.length ? [...roster, ...pinned, ...meetings] : roster;
  }, get selected() {
    return selectedId();
  }, get error() {
    return error;
  }, lead, leadApi, get, has: (id) => entries.has(id) || meetingEntries.has(id) || !!lead && id === lead.agent.id || id === CQO && cqo.record.loaded, refreshRoster, refreshThread, refreshMeetings, subscribe(fn) {
    listeners.add(fn);
    if (error) retryLater();
    return () => {
      listeners.delete(fn);
      if (!listeners.size) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
  }, select, studioOptions: async () => json("/chat/studio"), async createStudio(input) {
    const result = await json("/chat/studio", { method: "POST", body: JSON.stringify(input) });
    await refreshing;
    await refreshRoster();
    if (!roster.some((agent) => agent.id === result.agentId)) throw new Error("studio_roster_timeout");
    return result;
  }, async closeStudio(id) {
    await json("/chat/studio/close", { method: "POST", body: JSON.stringify({ agentId: id }) });
    await refreshing;
    await refreshRoster();
    if (selectedId() === id && lead) await select(lead.key);
  }, async renameStudio(id, title) {
    const body = await json("/chat/studio/title", { method: "POST", body: JSON.stringify({ agentId: id, title }) });
    await refreshing;
    await refreshRoster();
    return body.title;
  }, frame(frame) {
    const { kind, payload } = frame;
    if (kind === "chat.state") {
      globalState = payload;
      for (const entry of entries.values()) state(entry);
    }
    if (lead && ["chat.state", "chat.snapshot", "chat.turn", "chat.reset"].includes(kind)) {
      syncLead();
      if (kind === "chat.snapshot") lead.loaded = true;
      emit();
    }
    if (kind === "chat.settings" || kind === "chat.context") {
      if (kind === "chat.settings") leadSettings = payload;
      else leadContext = payload;
      for (const entry of entries.values()) if (entry !== lead && isLead(entry.agent.role)) entry.store.handle(frame);
    }
    if (kind === "chat.roster" && started && signature(payload?.agents ?? []) !== rosterSign) void refreshRoster();
    if (kind === "chat.message") (payload?.agentId === lead?.agent.id ? lead : entries.get(payload?.agentId))?.store.handle(frame);
    if (kind === "chat.retracted") (payload?.agentId === lead?.agent.id ? lead : entries.get(payload?.agentId))?.store.handle(frame);
    if (kind === "chat.queue") (payload?.agentId === lead?.agent.id ? lead : entries.get(payload?.agentId))?.store.handle(frame);
    if (kind === "chat.agent.permissions" && payload?.agentId === lead?.agent.id) handleAgentFrame(lead, frame);
    if (kind?.startsWith("chat.agent.")) {
      const entry = entries.get(payload?.agentId);
      if (entry && entry !== lead) {
        if (kind === "chat.agent.reset") void refreshThread(payload.agentId, true);
        else if (entry.loading) entry.events.push(frame);
        else handleAgentFrame(entry, frame);
      }
      if ((kind === "chat.agent.item" && payload.item?.role !== "user" || kind === "chat.agent.append") && payload.agentId !== selectedId()) {
        roster = roster.map((a) => a.id === payload.agentId ? { ...a, unread: Math.max(1, a.unread ?? 0) } : a);
        emit();
      }
    }
  }, connection(up) {
    const changed = live !== !!up;
    live = !!up;
    for (const entry of entries.values()) {
      entry.store.connection(live);
      state(entry);
    }
    if (changed && live && started) reread();
  }, refresh() {
    if (live && started) reread();
  } };
}
