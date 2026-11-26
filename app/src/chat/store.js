import { deliveryCapabilities } from "./delivery-capabilities.js";
import { createOwnerCards } from "./owner-cards.js";
import { controlsOf, NO_CONTROLS } from "./controls.js";
import { inTurn, sameTurn } from "./turns.js";
import { isNotice, noticeItems, interleaveNotices } from "./notices.js";
import { lead, leadKo, leadRole, l10n } from "../names.js";
const STATES = ["connecting", "ready", "offline", "no_target", "version_mismatch"];
export const SEND_LIMITS = { text: 2e4, images: 4, attachments: 5, attachmentBytes: 50 * 1024 * 1024 };
export const LINES = { get connecting() {
  return `Connecting to ${lead()}…`;
}, offline: "Reconnecting…", get no_target() {
  return `Can't find ${lead()} right now`;
}, get version_mismatch() {
  return `${lead()} chat is under maintenance`;
}, get relaunch() {
  return `${lead()} restarted`;
}, unknown: "Couldn't confirm it arrived. Send it again if it isn't in the chat", refused: "Not sent", held: "It waited unsent, so it goes only if you send it", send_failed: "Not sent. Send it again", send_unknown: "Couldn't confirm it arrived. Send it again if it isn't in the chat", message_conflict: "A different message was already sent with this id", empty_message: "Nothing to send", text_too_long: "The message is too long. Up to 20,000 characters", invalid_body: "This message can't be sent", invalid_id: "This message can't be sent", invalid_text: "This message can't be sent", too_many_images: "Up to 4 images a message", image_too_large: "The image is too large", body_too_large: "The image is too large", image_type: "This image can't be sent", invalid_image: "This image can't be sent", forbidden: "Sending isn't allowed from this device", too_many_attachments: "Up to 5 files a message", attachments_too_large: "Up to 50 MB of files in all", invalid_attachment: "This file can't be sent", unknown_upload: "The file expired. Attach it again", get compact_busy() {
  return `Can't compact while ${lead()} is answering`;
}, compact_alone: "Send /compact without photos or files", get renewing() {
  return `Preparing a new chat · ${lead()} starts fresh at her next pause`;
}, renew_failed: "Couldn't ask for a new chat. Try again", renew_off: "A new chat can't be asked for right now", get command_busy() {
  return `Can't send a command while ${lead()} is answering`;
}, settings_refused: "Couldn't change the setting. Try again", invalid_value: "That setting can't be picked", settings_loading: "Loading the settings. Try again in a moment", settings_unknown: "Couldn't confirm the setting changed", get cancel_failed() {
  return `Couldn't stop ${lead()}'s turn. Try again`;
}, rewind_failed: "Couldn't rewind. Try again", get rewind_busy() {
  return `Can't rewind while ${lead()} is answering`;
}, unknown_message: "This message is no longer in the conversation", rewind_unavailable: "Rewind isn't available right now" };
export function lineOf(error, body, fallback = null, text = "") {
  const command = error === "command_busy" && /^\s*\/([^\s/]+)/.exec(text)?.[1];
  if (command) return `Can't send /${command} while ${lead()} is answering`;
  return LINES[error] ?? (typeof body?.line === "string" ? body.line : fallback);
}
const SETTING_KEYS = ["model", "thinking", "mode"];
const optionOf = (value) => value && typeof value === "object" && typeof value.id === "string" ? { id: value.id, label: typeof value.label === "string" && value.label ? value.label : value.id } : null;
const optionsOf = (list) => Array.isArray(list) ? list.map(optionOf).filter(Boolean) : [];
const settingsOf = (value) => value && typeof value === "object" && Array.isArray(value.models) ? { ...value, model: optionOf(value.model), thinking: optionOf(value.thinking), mode: optionOf(value.mode), models: value.models.filter(optionOf).map((model) => ({ ...optionOf(model), thinking: optionsOf(model.thinking) })), modes: optionsOf(value.modes) } : null;
const count = (value) => Number.isFinite(value) && value >= 0 ? value : null;
const PARTS = ["system", "tools", "files", "conversation", "memory"];
const contextOf = (value) => {
  const used = count(value?.used), max = count(value?.max);
  if (used == null || !max) return null;
  const known = PARTS.some((id) => count(value.parts?.[id]) != null);
  const parts = known ? Object.fromEntries(PARTS.map((id) => [id, count(value.parts[id]) ?? 0])) : null;
  const files = Array.isArray(value.files) ? value.files.filter((file) => typeof file?.path === "string" && count(file.tokens) != null).map(({ path, tokens }) => ({ path, tokens })) : [];
  return { model: optionOf(value.model), used: Math.min(used, max), max, parts, files, saved: count(value.saved) || null, at: typeof value.at === "string" ? value.at : null };
};
const IDLE = Object.freeze({ running: false, phase: "idle", activity: null, line: null, at: null });
const ctoTakesLine = () => l10n(`${leadKo("가")} 잠시 멈춰 있어서 CTO가 대신 받아요`, `${lead()} is paused, so the CTO takes it`);
const noneTakesLine = () => l10n(`${leadKo("가")} 멈춰 있고 CTO에게도 닿지 않아 보내지 못했어요`, `${lead()} is paused and the CTO can't be reached, so it wasn't sent`);
const stateOf = (value) => {
  const known = STATES.includes(value?.state), state = known ? value.state : "offline";
  const cto = state === "no_target" && typeof value?.fallback?.agentId === "string" ? { agentId: value.fallback.agentId } : null;
  const line = state === "ready" ? null : cto ? ctoTakesLine() : state === "no_target" && value?.fallback === null ? noneTakesLine() : LINES[state];
  return { state, line, agent: value?.agent ?? null, canSend: (state === "ready" || !!cto) && value?.canSend !== false, fallback: cto };
};
const turnOf = (value) => value && typeof value === "object" && typeof value.running === "boolean" ? value : IDLE;
const isItem = (value) => !!value && typeof value === "object" && typeof value.key === "string" && !value.key.startsWith("local:");
const reply = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};
export function grown(old, append) {
  const text = old?.text, base = append?.base, more = append?.text, segments = append?.segments;
  if (typeof text !== "string" || typeof more !== "string" || !Number.isInteger(base) || base < 0) return null;
  if (old.streaming !== true) return old;
  if (text.length !== base) return text.length >= base + more.length && text.startsWith(more, base) ? old : null;
  if (!segments) return { ...old, text: text + more, ...typeof append.at === "string" ? { at: append.at } : {} };
  const held = Array.isArray(old.segments) ? old.segments : null, { count: count2, from, grow, tail } = segments;
  if (!held || held.length !== count2 || !Number.isInteger(from) || from < 0 || from > count2 || !Array.isArray(tail)) return null;
  const at = grow === void 0 ? null : held[from];
  if (grow !== void 0 && (typeof grow !== "string" || typeof at?.text !== "string")) return null;
  return { ...old, text: text + more, ...typeof append.at === "string" ? { at: append.at } : {}, segments: [...held.slice(0, from), ...at ? [{ ...at, text: at.text + grow }] : [], ...tail] };
}
const invalid = ({ text = "", images = [], attachments = [] }) => {
  const bytes = attachments.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  return !text.trim() && !images.length && !attachments.length ? "empty_message" : [...text].length > SEND_LIMITS.text ? "text_too_long" : images.length > SEND_LIMITS.images ? "too_many_images" : attachments.length > SEND_LIMITS.attachments ? "too_many_attachments" : bytes > SEND_LIMITS.attachmentBytes ? "attachments_too_large" : null;
};
export const RESEND_AFTER = [3, 10, 30, 60];
export const HOLD_AFTER = 12e4;
export function createChatStore({ api, uuid = () => crypto.randomUUID(), now = () => (new Date()).toISOString(), company = false, resync = null, resendAfter = RESEND_AFTER, holdAfter = HOLD_AFTER, ownerCards = false, ledger = false }) {
  const notifications = new Map(), linked = new Set();
  let notices = [], secrets = [];
  let items = [], byKey = new Map(), before = null, hasOlder = false, agent = null, notice = null, live = false;
  let olderLoad = null;
  let renewing = false;
  let queue = new Map(), queueVersion = 0, queueAttempt = null, queueAgent = null;
  let state = stateOf({ state: "connecting", line: LINES.connecting }), turn = IDLE, settings = null, context = null, controls = NO_CONTROLS;
  let generation = 0, history = { loading: false, error: null, line: null };
  let ledgerItems = [], ledgerNext;
  let stale = false;
  const ledgerOn = () => !!(ledger && agent?.id);
  const canLoadOlder = () => !stale && (hasOlder || ledgerOn() && ledgerNext !== null);
  const olderCursors = () => stale ? void 0 : hasOlder ? { history: before, ledger: ledgerOn() ? void 0 : null } : ledgerOn() && ledgerNext !== null ? { history: null, ledger: ledgerNext } : null;
  async function historyPage(cursor) {
    const mine = generation;
    let status = 0, body = null;
    try {
      const response = await api("/chat/history?before=" + encodeURIComponent(cursor), { expected: ["409 stale_cursor"] });
      status = response.status;
      body = await reply(response);
    } catch {
    }
    if (mine === generation && (status === 409 || status === 400) && !stale) {
      stale = true;
      history = { ...history, error: body?.error ?? "stale_cursor" };
      emit({ type: "history", history: { ...history, hasOlder: canLoadOlder() } });
    }
    return { status, body };
  }
  const local = new Map(), listeners = new Set(), withdrawn = new Set();
  const visible = (item, id = agent?.id) => !withdrawn.has(JSON.stringify([id, item?.messageId]));
  const messages = new Map(), attempts = new Map(), messageVersions = new Map(), sendingNow = new Set();
  let messageVersion = 0;
  const waiting = new Map();
  let appendView = 0;
  const publish = (event) => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(error);
      }
    }
  };
  const cards = ownerCards ? createOwnerCards({ api, history: (cursor) => historyPage(cursor), view: () => ({ items: [...ledgerItems, ...items], agent, older: olderCursors() }), changed: () => publish({ type: "snapshot", reason: "owner_cards", items: items.map(decorated) }) }) : null;
  const emit = (event) => {
    void cards?.update();
    if (event.type === "snapshot") void cards?.refresh();
    publish({ ...event, ...event.item ? { item: decorated(event.item) } : {}, ...event.items ? { items: event.items.map(decorated) } : {} });
  };
  const queued = () => [...queue.values()].sort((a, b) => Number(a.position) - Number(b.position));
  function reconcileQueue(list, since = queueVersion) {
    if (!Array.isArray(list) || since !== queueVersion) return;
    const hadItems = queue.size > 0;
    queue = new Map(list.filter((item) => typeof item?.id === "string").map((item) => [item.id, item]));
    for (const [id, item] of queue) if (!["queued", "sending"].includes(item.state)) queue.delete(id);
    queueVersion++;
    if (hadItems || queue.size) emit({ type: "queue", items: queued() });
  }
  function queueTarget(id) {
    if (!id || id === queueAgent) return;
    queueAgent = id;
    reconcileQueue([]);
    queueAttempt = null;
  }
  async function refreshQueue() {
    const id = agent?.id, since = queueVersion;
    if (!id || !deliveryCapabilities(agent?.role).queue) return false;
    try {
      const response = await api("/chat/thread?" + new URLSearchParams({ agentId: id })), body = await reply(response);
      if (!response.ok || body?.agentId !== id || agent?.id !== id || !Array.isArray(body.queue)) return false;
      reconcileQueue(body.queue, since);
      return true;
    } catch {
      return false;
    }
  }
  async function queuePost(action, fields) {
    const agentId = agent?.id, since = queueVersion;
    if (!deliveryCapabilities(agent?.role).queue) return { ok: false, error: "queue_not_supported", line: l10n("작업실에는 바로 보내 주세요", "Send straight to the workroom") };
    if (!agentId) return { ok: false, line: l10n("대화 연결을 확인해 주세요", "Check the chat connection") };
    const { status, body } = await postJSON("/chat/queue/" + action, { agentId, ...fields });
    const ok = status >= 200 && status < 300;
    if (agent?.id === agentId) {
      if (ok && body?.item) reconcileQueue([...queued().filter((item) => item.id !== body.item.id), body.item], since);
      else if (ok || status === 409 || !status) await refreshQueue();
    }
    const line = body?.error === "queue_full" ? l10n("대기 메시지는 20개까지 보낼 수 있어요", "Up to 20 messages can wait") : status === 409 ? l10n("메시지 상태가 바뀌었어요. 확인 후 다시 시도해 주세요", "The message changed. Check it and try again") : status === 422 ? l10n("보낼 수 없는 내용이에요. 메시지를 확인해 주세요", "This can't be sent. Check the message") : !status ? l10n("접수를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요", "Couldn't confirm it arrived. Try again with the same words") : l10n("처리하지 못했어요. 다시 시도해 주세요", "Couldn't do that. Try again");
    return { ok, status, error: body?.error, line: ok ? null : line };
  }
  const release = (entry) => {
    for (const url of [...entry.item.images.map((image) => image.url), ...entry.item.attachments.map((file) => file.preview)]) if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  };
  const drop = (entry, keep = false) => {
    local.delete(entry.id);
    if (!keep) release(entry);
    emit({ type: "local", key: entry.item.key, item: null });
  };
  const echoed = (item) => {
    if (item.role !== "user" || typeof item.messageId !== "string") return;
    for (const entry of local.values()) if (entry.messageId === item.messageId) drop(entry);
  };
  const setLocal = (entry, fields) => {
    entry.item = { ...entry.item, local: { ...entry.item.local, ...fields } };
    emit({ type: "local", key: entry.item.key, item: entry.item });
  };
  const existingItem = (item) => byKey.get(item.key) ?? (item.role === "user" && item.messageId?.startsWith("home-") ? items.find((old) => old.role === "user" && old.messageId === item.messageId) : null);
  const replace = (list) => {
    items = [];
    byKey = new Map();
    for (const item of list) if (isItem(item) && visible(item) && !existingItem(item)) {
      items.push(item);
      byKey.set(item.key, item);
    }
  };
  const newView = () => {
    generation++;
    history = { loading: false, error: null, line: null };
    ledgerItems = [];
    ledgerNext = void 0;
    stale = false;
  };
  const decorated = (raw) => {
    const item = cards?.item(raw) ?? raw;
    return messages.has(item.messageId) ? { ...item, delivery: messages.get(item.messageId) } : item;
  };
  function message(value, since = messageVersion) {
    if (!company || !value?.messageId || !["queued", "delivered", "failed"].includes(value.state)) return;
    const previous = messages.get(value.messageId);
    const receipt = previous?.receipt ?? value.receipt;
    if ((messageVersions.get(value.messageId) ?? 0) > since || previous?.state === "delivered" && value.state === "queued") value = previous;
    messages.set(value.messageId, { ...previous, ...value, ...receipt ? { receipt } : {} });
    messageVersions.set(value.messageId, ++messageVersion);
    const entry = attempts.get(value.messageId);
    if (value.state === "delivered") attempts.delete(value.messageId);
    if (value.error === "removed" && entry) {
      if (local.has(entry.id)) drop(entry);
      attempts.delete(value.messageId);
    }
    emit({ type: "delivery", message: messages.get(value.messageId) });
  }
  function snapshot(payload) {
    if (!payload?.merge) {
      appendView++;
      waiting.clear();
    }
    const incoming = (Array.isArray(payload?.items) ? payload.items : []).filter((item) => isItem(item) && visible(item, payload?.agent?.id));
    const unread = !incoming.length && items.length && (payload?.loading === true || payload?.state?.state === "connecting");
    if (payload?.merge && items.length) {
      for (let i = incoming.length - 1; i >= 0; i--) {
        let item = incoming[i];
        const old = existingItem(item), next = byKey.get(incoming[i + 1]?.key);
        if (old) {
          item = { ...item, key: old.key };
          items[items.indexOf(old)] = item;
        } else items.splice(next ? items.indexOf(next) : items.length, 0, item);
        byKey.set(item.key, item);
      }
    } else if (!unread) {
      newView();
      replace(incoming);
      before = typeof payload?.before === "string" ? payload.before : null;
      hasOlder = !!payload?.hasOlder && before !== null;
    }
    if (!unread) {
      agent = payload?.agent ?? null;
      turn = turnOf(payload?.turn);
    } else if (payload?.agent) agent = payload.agent;
    queueTarget(agent?.id);
    if (Array.isArray(payload?.queue)) reconcileQueue(payload.queue);
    if (payload?.state) {
      state = stateOf(payload.state);
      controls = controlsOf(payload.state.controls);
    }
    if (payload?.settings) settings = settingsOf(payload.settings) ?? settings;
    for (const entry of [...local.values()]) {
      const echo = items.find((item) => item.role === "user" && item.messageId === entry.messageId);
      const gone = entry.item.local.status === "sent" && entry.agentId && agent?.id && agent.id !== entry.agentId;
      if (echo || gone) {
        local.delete(entry.id);
        release(entry);
      }
    }
    emit({ type: "snapshot", reason: payload?.reason ?? null, items: [...items] });
  }
  function upsert(item) {
    if (!visible(item)) return;
    const old = existingItem(item);
    if (old) item = { ...item, key: old.key };
    if (old) items[items.indexOf(old)] = item;
    else items.push(item);
    byKey.set(item.key, item);
    echoed(item);
    emit({ type: "item", item, live: true });
  }
  function append(payload) {
    const key = payload?.key;
    if (typeof key !== "string" || key.startsWith("local:")) return;
    if (waiting.has(key)) {
      waiting.get(key).push(payload);
      return;
    }
    const old = byKey.get(key), next = grown(old, payload);
    if (next) {
      if (next !== old) upsert(next);
      return;
    }
    waiting.set(key, [payload]);
    const view = appendView, done = () => {
      if (appendView !== view) return;
      const queued2 = waiting.get(key) ?? [];
      waiting.delete(key);
      if (byKey.get(key) === old) return;
      for (const later of queued2) {
        const held = byKey.get(key), item = grown(held, later);
        if (!item) return;
        if (item !== held) upsert(item);
      }
    };
    if (resync) {
      Promise.resolve().then(() => resync(key)).catch(() => {
      }).finally(done);
      return;
    }
    (async () => {
      try {
        const response = await api("/chat/item?" + new URLSearchParams({ key })), body = response.ok ? await reply(response) : null;
        const held = byKey.get(key);
        if (appendView === view && isItem(body?.item) && body.item.key === key && !(held && held.streaming !== true && held !== old)) upsert(body.item);
      } catch {
      }
      done();
    })();
  }
  async function post(entry) {
    setLocal(entry, { status: "sending", error: null, line: null, retry: false });
    const since = messageVersion;
    let status = 0, body = null;
    try {
      const response = await api("/chat/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: entry.body });
      status = response.status;
      body = await reply(response);
    } catch {
    }
    if (company && body?.message) message(body.message, since);
    if (local.get(entry.id) !== entry) return status === 200;
    if (status === 200 && body?.ok) {
      if (!company) entry.body = null;
      entry.agentId = body.agentId ?? null;
      setLocal(entry, { status: "sent" });
      return true;
    }
    const error = typeof body?.error === "string" ? body.error : status === 403 ? "forbidden" : status === 413 ? "body_too_large" : null;
    const line = (fallback) => lineOf(error, body, fallback, entry.item.text);
    if ([400, 403, 409, 413].includes(status)) setLocal(entry, { status: "refused", error: error ?? "refused", line: line(LINES.refused), retry: false });
    else if (status === 502 && error === "send_failed" || status === 503) setLocal(entry, { status: "failed", error: error ?? "offline", line: line(LINES.offline), retry: true });
    else setLocal(entry, { status: "unknown", error: error ?? "unknown", line: line(LINES.unknown), retry: true });
    if (entry.item.local.retry) resendLater(entry);
    return false;
  }
  const resendable = (entry) => local.get(entry.id) === entry && !!entry.body && entry.item.local?.retry === true && entry.item.local.status !== "held";
  const age = (entry) => Date.parse(now()) - Date.parse(entry.item.at);
  const hold = (entry) => setLocal(entry, { status: "held", error: "held", line: LINES.held, retry: true });
  function again(entry) {
    if (!resendable(entry)) return;
    if (age(entry) >= holdAfter) hold(entry);
    else post(entry);
  }
  function resendLater(entry) {
    const n = entry.resends ?? 0;
    clearTimeout(entry.resendTimer);
    if (!resendAfter.length) return;
    entry.resends = n + 1;
    entry.resendTimer = n < resendAfter.length ? setTimeout(() => again(entry), resendAfter[n] * 1e3) : setTimeout(() => {
      if (resendable(entry)) hold(entry);
    }, Math.max(0, holdAfter - age(entry)) || 0);
    entry.resendTimer.unref?.();
  }
  async function postJSON(path, value) {
    try {
      const response = await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      return { status: response.status, body: await reply(response) };
    } catch {
      return { status: 0, body: null };
    }
  }
  function draft(id) {
    const entry = local.get(id);
    if (!entry?.body || ["sending", "sent"].includes(entry.item.local.status)) return null;
    const body = JSON.parse(entry.body), item = entry.item;
    return { text: body.text ?? "", images: (body.images ?? []).map((image, n) => ({ data: image.data, mimeType: image.mimeType, preview: item.images[n]?.url ?? null })), attachments: (body.attachments ?? []).map((upload, n) => ({ id: upload, name: item.attachments[n]?.name ?? upload, size: item.attachments[n]?.size ?? null, mimeType: item.attachments[n]?.mimeType ?? null, ...item.attachments[n]?.preview ? { preview: item.attachments[n].preview } : {} })) };
  }
  const withNotifications = () => {
    const slots = new Map(), start = hasOlder ? -Infinity : items.length ? Date.parse(items[0].at) : Infinity;
    for (const n of [...notifications.values()].filter((n2) => linked.has(n2.key) || !(Date.parse(n2.at) < start)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      let index = items.findIndex((item) => Date.parse(item.at) > Date.parse(n.at));
      if (index < 0) index = items.length;
      if (inTurn(items[index]) && (items[index - 1]?.role === "user" || sameTurn(items[index - 1], items[index]) || turn.turnKey === items[index].turnKey && Date.parse(turn.at) <= Date.parse(n.at))) {
        while (sameTurn(items[index], items[index + 1])) index++;
        index++;
      }
      if (!slots.has(index)) slots.set(index, []);
      slots.get(index).push(n);
    }
    return [...items.flatMap((item, index) => [...slots.get(index) ?? [], item]), ...slots.get(items.length) ?? []];
  };
  function addNotifications(list) {
    let changed = false;
    for (const n of Array.isArray(list) ? list : []) {
      if (n?.silent === true || !Number.isSafeInteger(n?.id) || n.id <= 0 || typeof n.text !== "string" || !Number.isFinite(Date.parse(n.at))) continue;
      const key = `notify:${n.id}`;
      if (notifications.has(key)) continue;
      notifications.set(key, { key, role: "assistant", source: leadRole(), text: n.text, at: n.at, messageId: null, turnKey: key, fromHome: false, images: [], attachments: [], streaming: false });
      changed = true;
    }
    if (changed) emit({ type: "snapshot", reason: "notify", items: withNotifications() });
  }
  return { setNotices(list) {
    notices = noticeItems(list);
    publish({ type: "notices" });
  }, setSecrets(list) {
    secrets = Array.isArray(list) ? list : [];
    publish({ type: "notices" });
  }, addNotifications, refreshOwnerCards: () => cards?.refresh(), async loadNotification(id) {
    const key = `notify:${id}`, held = !linked.has(key) && notifications.has(key);
    linked.add(key);
    if (held) emit({ type: "snapshot", reason: "notify", items: withNotifications() });
    if (notifications.has(key)) return true;
    const response = await api("/chat/item?" + new URLSearchParams({ key: `notify:${id}` }));
    const body = response.ok ? await reply(response) : null;
    if (String(body?.notification?.id) !== String(id)) return false;
    addNotifications([body.notification]);
    return notifications.has(`notify:${id}`);
  }, get items() {
    const list = [...ledgerItems.filter((item) => !isNotice(item)), ...withNotifications(), ...[...local.values()].map((entry) => entry.item)].map(decorated);
    const start = !canLoadOlder() ? -Infinity : list.length ? Date.parse(list[0].at) : Infinity;
    const inRange = [...notices, ...secrets].filter((n) => !(Date.parse(n.at) < start));
    const byKey2 = new Map([...inRange, ...ledgerItems.filter(isNotice)].map((item) => [item.key, item]));
    return interleaveNotices(list, [...byKey2.values()]);
  }, resetLedger() {
    if (ledger) {
      newView();
      emit({ type: "snapshot", reason: "ledger_reset", items });
    }
  }, item: (key) => {
    const item = notifications.get(key) ?? byKey.get(key) ?? [...local.values()].find((entry) => entry.item.key === key)?.item;
    return item ? decorated(item) : null;
  }, get state() {
    return state;
  }, get turn() {
    return turn;
  }, get agent() {
    return agent;
  }, get notice() {
    return cards?.error ? { line: cards.error } : notice;
  }, get live() {
    return live;
  }, get settings() {
    return settings;
  }, get context() {
    return context;
  }, get queue() {
    return queued();
  }, get queueVersion() {
    return queueVersion;
  }, reconcileQueue, refreshQueue, async addQueue({ text = "", images = [], attachments = [] } = {}) {
    const error = invalid({ text, images, attachments });
    if (error || !text.trim()) return { ok: false, error: error ?? "empty_message", line: error ? LINES[error] : l10n("대기할 메시지를 입력해 주세요", "Type the message to queue") };
    const value = { text, ...images.length ? { images: images.map(({ data, mimeType }) => ({ data, mimeType })) } : {}, ...attachments.length ? { attachments: attachments.map((file) => file.id) } : {} };
    const signature = JSON.stringify([agent?.id, value]);
    if (queueAttempt?.signature !== signature) queueAttempt = { signature, id: String(uuid()).toLowerCase(), sentAt: now() };
    const attempt = queueAttempt, result = await queuePost("add", { id: attempt.id, sentAt: attempt.sentAt, ...value });
    if ((result.ok || result.status >= 400 && result.status < 500) && queueAttempt === attempt) queueAttempt = null;
    return { ...result, id: attempt.id };
  }, editQueue: (id, text, revision, attachments) => queuePost("edit", { id, text, revision, ...attachments ? { attachments } : {} }), cancelQueue: (id) => queuePost("cancel", { id }), sendQueueNow: (id) => queuePost("send_now", { id }), holdQueue: (id, hold2) => queuePost("hold", { id, hold: hold2 }), get controls() {
    return controls;
  }, get history() {
    return { ...history, hasOlder: canLoadOlder() };
  }, get messageVersion() {
    return messageVersion;
  }, subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, handle(frame) {
    const kind = frame?.kind, payload = frame?.payload;
    if (typeof kind !== "string" || !kind.startsWith("chat.")) return false;
    if (kind === "chat.state") {
      state = stateOf(payload);
      controls = controlsOf(payload?.controls);
      if (payload?.agent !== void 0) {
        queueTarget(payload.agent?.id);
        agent = payload.agent;
      }
      const pending = payload?.renewing === true, was = renewing;
      renewing = pending;
      if (pending && !was && notice?.reason !== "renewing") notice = { reason: "renewing", line: LINES.renewing };
      else if (!pending && was && notice?.reason === "renewing") notice = null;
      emit({ type: "state", state });
    } else if (kind === "chat.snapshot") snapshot(payload);
    else if (kind === "chat.item") {
      if (isItem(payload)) upsert(payload);
    } else if (kind === "chat.append") append(payload);
    else if (kind === "chat.turn") {
      turn = turnOf(payload);
      emit({ type: "turn", turn });
    } else if (kind === "chat.settings") {
      settings = settingsOf(payload);
      emit({ type: "settings", settings });
    } else if (kind === "chat.context") {
      context = contextOf(payload);
      emit({ type: "context", context });
    } else if (kind === "chat.permissions" && payload?.agentId === agent?.id) emit({ type: "permissions", payload });
    else if (kind === "chat.retracted") {
      if (payload?.agentId === agent?.id) {
        withdrawn.add(JSON.stringify([payload.agentId, payload.messageId]));
        items = items.filter((i) => i.messageId !== payload.messageId);
        byKey.clear();
        for (const item of items) byKey.set(item.key, item);
        for (const entry of [...local.values()]) if (entry.messageId === payload.messageId) drop(entry);
        emit({ type: "snapshot", items: [...items] });
      }
    } else if (kind === "chat.message") message(payload);
    else if (kind === "chat.queue" && payload?.agentId === (agent?.id ?? queueAgent)) reconcileQueue(payload.items);
    else if (kind === "chat.notice") {
      const reason = typeof payload?.reason === "string" ? payload.reason : null, told = typeof payload?.line === "string" ? payload.line : null;
      if (reason || told) {
        notice = { reason, line: LINES[reason] ?? told };
        emit({ type: "notice", notice });
      }
    } else if (kind === "chat.reset") {
      appendView++;
      waiting.clear();
      newView();
      replace([]);
      queueAttempt = null;
      before = null;
      hasOlder = false;
      if (context) {
        context = null;
        emit({ type: "context", context });
      }
      const reason = payload?.reason ?? null, told = typeof payload?.line === "string" ? payload.line : null;
      notice = { reason, line: told && (LINES[reason] ?? told) };
      emit({ type: "reset", reason: notice.reason, line: notice.line });
    }
    return true;
  }, reconcileMessages(list, since = messageVersion) {
    for (const value of list) message(value, since);
  }, canRetryMessage: (id) => messages.get(id)?.state === "failed" && attempts.has(id), async retryMessage(messageId) {
    const entry = attempts.get(messageId);
    if (!entry?.body || messages.get(messageId)?.state !== "failed") return false;
    const body = JSON.parse(entry.body);
    const result = await this.send({ text: body.text, images: body.images ?? [], attachments: (body.attachments ?? []).map((id, i) => ({ id, ...entry.item.attachments[i] })), answers: body.answers, sentAt: body.sentAt });
    if (result.ok || local.has(result.id)) {
      if (local.has(entry.id)) drop(entry);
      attempts.delete(messageId);
    }
    return result.ok;
  }, sendingNow: (id) => sendingNow.has(id), async sendNow(messageId) {
    if (messages.get(messageId)?.state !== "queued" || sendingNow.has(messageId)) return false;
    const since = messageVersion;
    sendingNow.add(messageId);
    emit({ type: "delivery" });
    try {
      const { status, body } = await postJSON("/chat/send_now", { messageId });
      if (status === 200 && body?.message) message(body.message, since);
      else {
        notice = { line: l10n("지금 보내지 못했어요. 메시지 상태를 확인해 주세요", "Couldn't send it now. Check the message") };
      }
      return status === 200;
    } finally {
      sendingNow.delete(messageId);
      emit({ type: "delivery" });
    }
  }, async removeHeld(messageId) {
    if (!messages.get(messageId)?.removable) return false;
    const since = messageVersion;
    const { status, body } = await postJSON("/chat/held/remove", { messageId });
    if (status === 200 && body?.message) message(body.message, since);
    return status === 200;
  }, destroy() {
    newView();
    listeners.clear();
    for (const entry of local.values()) release(entry);
    local.clear();
    attempts.clear();
    messages.clear();
    messageVersions.clear();
    queue.clear();
    queueVersion++;
    queueAttempt = null;
    queueAgent = null;
    replace([]);
  }, connection(up) {
    if (live === !!up) return;
    live = !!up;
    emit({ type: "connection", live });
    if (live && resendAfter.length) {
      for (const entry of [...local.values()]) if (resendable(entry)) {
        clearTimeout(entry.resendTimer);
        again(entry);
      }
    }
  }, check: (message2) => {
    const error = invalid(message2);
    return error ? { error, line: LINES[error] } : null;
  }, async send({ text = "", images = [], attachments = [], answers, sentAt } = {}) {
    const error = invalid({ text, images, attachments });
    if (error) return { ok: false, error, line: LINES[error] };
    const id = String(uuid()).toLowerCase(), messageId = "home-" + id, written = sentAt ?? now();
    const fields = { id, text, sentAt: written };
    if (images.length) fields.images = images.map(({ data, mimeType }) => ({ data, mimeType }));
    if (attachments.length) fields.attachments = attachments.map((file) => file.id);
    if (answers) fields.answers = answers;
    const shown = images.map(({ data, mimeType, preview }) => ({ url: preview ?? `data:${mimeType};base64,${data}`, mimeType }));
    const files = attachments.map(({ name, size, mimeType, preview }) => ({ name, size: size ?? null, mimeType: mimeType ?? null, url: null, ...preview ? { preview } : {} }));
    const entry = { id, messageId, body: JSON.stringify(fields), agentId: null, item: { key: "local:" + id, role: "user", text, at: written, messageId, source: "owner", fromHome: true, images: shown, attachments: files, streaming: false, local: { status: "sending", error: null, line: null, retry: false } } };
    local.set(id, entry);
    if (company) {
      attempts.set(messageId, entry);
    }
    const ok = await post(entry);
    return ok ? { ok, id, key: entry.item.key } : { ok, id, key: entry.item.key, line: entry.item.local?.line ?? null };
  }, async changeSettings(key, id) {
    if (!SETTING_KEYS.includes(key) || typeof id !== "string") return { ok: false, error: "invalid_value", line: LINES.invalid_value };
    let status = 0, body = null;
    try {
      const response = await api("/chat/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: id }) });
      status = response.status;
      body = await reply(response);
    } catch {
    }
    if (status === 200 && body?.ok) {
      const next = settingsOf(body.settings);
      if (next) {
        settings = next;
        emit({ type: "settings", settings });
      }
      return { ok: true, settings };
    }
    const error = typeof body?.error === "string" ? body.error : !status || status === 504 ? "settings_unknown" : "settings_refused";
    return { ok: false, error, line: lineOf(error, body, LINES.settings_refused) };
  }, async commands() {
    const id = agent?.id;
    if (!id) return [];
    try {
      const response = await api("/chat/commands?" + new URLSearchParams({ agentId: id })), body = response.ok ? await reply(response) : null;
      return body?.agentId === id && Array.isArray(body.commands) ? body.commands : [];
    } catch {
      return [];
    }
  }, async renew() {
    const { status, body } = await postJSON("/chat/renew", {});
    if (status === 200 && body?.ok) return { ok: true };
    const error = typeof body?.error === "string" ? body.error : "renew_failed";
    return { ok: false, error, line: LINES[error] ?? LINES.renew_failed };
  }, async cancel() {
    const { status, body } = await postJSON("/chat/cancel", {});
    if (status === 200 && body?.ok) return { ok: true };
    if (status === 409) return { ok: false, error: "idle", line: null };
    return { ok: false, error: typeof body?.error === "string" ? body.error : "cancel_failed", line: LINES.cancel_failed };
  }, async rewind(messageId) {
    if (typeof messageId !== "string" || !messageId) return { ok: false, error: "unknown_message", line: LINES.unknown_message };
    const { status, body } = await postJSON("/chat/rewind", { messageId });
    if (status === 200 && body?.ok) {
      if (body.retracted) {
        withdrawn.add(JSON.stringify([agent?.id, messageId]));
        for (const entry of [...local.values()]) if (entry.messageId === messageId) drop(entry);
        items = items.filter((i) => i.messageId !== messageId);
        byKey.clear();
        for (const item of items) byKey.set(item.key, item);
        emit({ type: "snapshot", items: [...items] });
      }
      return { ok: true, ...body.retracted ? { retracted: true, text: body.text, line: body.line } : {} };
    }
    const error = status === 404 ? "unknown_message" : status === 409 ? "rewind_busy" : status === 501 ? "rewind_unavailable" : "rewind_failed";
    return { ok: false, error, line: LINES[error] };
  }, async retry(id) {
    const entry = local.get(id);
    if (!entry?.item.local.retry || !entry.body) return false;
    return this.canRetryMessage(entry.messageId) ? this.retryMessage(entry.messageId) : post(entry);
  }, discard(id) {
    const entry = local.get(id);
    if (!entry || entry.item.local.status === "sending") return false;
    drop(entry);
    attempts.delete(entry.messageId);
    return true;
  }, draft, takeBack(id) {
    const back = draft(id);
    if (back) drop(local.get(id), true);
    return back;
  }, loadOlder() {
    if (olderLoad?.generation === generation) return olderLoad.promise;
    if (!canLoadOlder()) return Promise.resolve(false);
    const load = { generation, promise: null };
    load.promise = loadOlderPage().finally(() => {
      if (olderLoad === load) olderLoad = null;
    });
    return (olderLoad = load).promise;
  } };
  async function loadOlderPage() {
    const fromLedger = !hasOlder;
    const mine = generation;
    history = { loading: true, error: null, line: null };
    emit({ type: "history", history: { ...history, hasOlder: canLoadOlder() } });
    let status = 0, body = null;
    if (!fromLedger) ({ status, body } = await historyPage(before));
    else {
      try {
        const response = await api("/chat/ledger" + (ledgerNext === void 0 ? "" : "?before=" + encodeURIComponent(ledgerNext)));
        status = response.status;
        body = await reply(response);
      } catch {
      }
    }
    if (mine !== generation) return false;
    if (fromLedger && status === 200 && Array.isArray(body?.items) && (body.next === null || typeof body.next === "string")) {
      const seen = new Set(ledgerItems.map((item) => item.key));
      const older = body.items.slice().reverse().filter((item) => {
        const key = item.kind === "notice" ? "notice:" + item.id : "ledger:" + item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).flatMap((item) => item.kind === "notice" ? noticeItems([item]) : [{ key: "ledger:" + item.id, role: item.who === "owner" ? "user" : "assistant", source: item.who, text: item.text, segments: item.segments, at: item.at, ledger: { agentId: item.agent_id, lastTurnAt: item.agent_last_turn_at ?? null }, masked: item.masked, messageId: null, turnKey: "ledger:" + item.id, streaming: false, fromHome: false, images: [], attachments: [] }]);
      ledgerItems = [...older, ...ledgerItems];
      ledgerNext = body.next;
      history = { loading: false, error: null, line: null };
      emit({ type: "older", items: older });
      emit({ type: "history", history: { ...history, hasOlder: canLoadOlder() } });
      return true;
    }
    if (!fromLedger && status === 200 && Array.isArray(body?.items)) {
      const older = [], seen = new Set();
      for (const item of body.items) if (isItem(item) && visible(item) && !existingItem(item) && !seen.has(item.key)) {
        older.push(item);
        seen.add(item.key);
      }
      items = [...older, ...items];
      for (const item of older) byKey.set(item.key, item);
      before = typeof body.before === "string" ? body.before : null;
      hasOlder = !!body.hasOlder && before !== null;
      history = { loading: false, error: null, line: null };
      for (const item of older) echoed(item);
      emit({ type: "older", items: older });
      emit({ type: "history", history: { ...history, hasOlder: canLoadOlder() } });
      return true;
    }
    if (stale) history = { loading: false, error: body?.error ?? "stale_cursor", line: null };
    else history = { loading: false, error: body?.error ?? "offline", line: lineOf(body?.error, body, LINES.offline) };
    emit({ type: "history", history: { ...history, hasOlder: canLoadOlder() } });
    return false;
  }
}
