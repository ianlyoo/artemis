import { el } from "../boards/dom.js";
import { mountChoices, YES, NO } from "./choices.js";
export const PERMISSION_RETRY = Object.freeze({ delays: [2e3, 5e3, 15e3, 3e4], quiet: 3 });
export function createProviderPermissions({ api, changed = () => {
}, timer = setTimeout, cancel = clearTimeout }) {
  let agentId = null, generation = 0, revision = 0, enabled = false, error = null, failures = 0, retry = null;
  const stopRetry = () => {
    cancel(retry);
    retry = null;
  };
  const rows = new Map();
  function frame(payload) {
    if (!agentId || payload?.agentId !== agentId || !Array.isArray(payload.permissions)) return;
    revision++;
    const pending = new Set();
    for (const p of payload.permissions) {
      if (typeof p?.id !== "string" || !/^[0-9a-f]{64}$/.test(p.requestDigest) || !Array.isArray(p.allowedDecisions)) continue;
      pending.add(p.id);
      if (!rows.has(p.id)) rows.set(p.id, { id: p.id, requestDigest: p.requestDigest, summary: String(p.summary || "Permission requested"), allowedDecisions: p.allowedDecisions.filter((d) => d === "allow" || d === "deny"), expiresAt: p.expiresAt, status: "pending" });
    }
    for (const row of rows.values()) if (row.status === "pending" && !pending.has(row.id)) row.status = "resolved";
    const done = [...rows.values()].filter((r) => !["pending", "sending"].includes(r.status));
    for (const row of done.slice(0, Math.max(0, done.length - 40))) rows.delete(row.id);
    stopRetry();
    failures = 0;
    error = null;
    changed();
  }
  async function refresh() {
    stopRetry();
    if (!agentId || !enabled) return;
    const id = agentId, gen = generation, rev = ++revision;
    try {
      const response = await api("/chat/permissions?agentId=" + encodeURIComponent(id)), body = await response.json();
      if (gen !== generation || rev !== revision) return;
      if (response.status !== 200 || body?.agentId !== id || !Array.isArray(body.permissions)) throw new Error("read");
      frame(body);
    } catch {
      if (gen !== generation || rev !== revision) return;
      const { delays, quiet } = PERMISSION_RETRY;
      retry = timer(() => {
        retry = null;
        void refresh();
      }, delays[Math.min(failures++, delays.length - 1)]);
      if (failures >= quiet && !error) {
        error = "Permissions could not be loaded yet. Retrying…";
        changed();
      }
    }
  }
  return { get rows() {
    return [...rows.values()].map((r) => ({ ...r, enabled }));
  }, get error() {
    return error;
  }, select(id) {
    if (agentId === id) return;
    generation++;
    revision++;
    agentId = id;
    rows.clear();
    failures = 0;
    error = null;
    changed();
    return refresh();
  }, enable(value) {
    if (enabled !== !!value) {
      enabled = !!value;
      changed();
    }
  }, frame, refresh, async decide(id, decision) {
    const row = rows.get(id);
    if (!enabled || !row || row.status !== "pending" || !row.allowedDecisions.includes(decision)) return false;
    if (Date.parse(row.expiresAt) <= Date.now()) {
      row.status = "expired";
      changed();
      return false;
    }
    const gen = generation, target = agentId, rev = ++revision;
    row.status = "sending";
    changed();
    try {
      const response = await api("/chat/permissions/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: target, permissionId: id, expectDigest: row.requestDigest, decision }) });
      const body = await response.json();
      if (gen !== generation) return false;
      if (response.status === 200 && body?.ok) {
        row.status = decision === "allow" ? "approved" : "denied";
        row.decidedAt = (new Date()).toISOString();
        if (rev === revision) frame({ agentId: target, permissions: body.permissions });
        changed();
        return true;
      }
      row.status = response.status === 409 ? "conflict" : "unknown";
      row.error = response.status === 409 ? "This permission was already decided, changed or expired. Your decision was not applied." : "The decision could not be confirmed. Reload to see current requests; it will not be sent again.";
    } catch {
      if (gen !== generation) return false;
      row.status = "unknown";
      row.error = "The decision could not be confirmed. Reload to see current requests; it will not be sent again.";
    }
    changed();
    return false;
  }, destroy() {
    stopRetry();
    generation++;
    revision++;
    agentId = null;
    rows.clear();
  } };
}
export const permissionChoice = (row) => ({ rows: [{ q: row.summary, guess: null }], decides: true, comment: false });
export function permissionRecord(row) {
  if (!row.enabled && ["pending", "sending"].includes(row.status)) return { loading: true };
  if (["pending", "sending"].includes(row.status)) return { record: { id: row.id, status: "open" } };
  if (row.status === "approved" || row.status === "denied") return { record: { id: row.id, status: "answered", answer: { picks: [row.status === "approved" ? YES : NO] }, ended_at: row.decidedAt } };
  return { record: { id: row.id, status: "closed" } };
}
export function createProviderPermissionCards({ api, store, onChange = () => {
}, timer, cancel, island }) {
  const node = el("section", { class: "chat-col chat-permissions", "aria-label": "Provider permissions" });
  const cards = el("div", { class: "chat-permission-list" }), notice = el("p", { class: "chat-permission-error", role: "alert" });
  const reload = el("button", { type: "button", class: "text-control", onclick: () => model.refresh() }, "Reload permissions");
  const mounts = new Map(), listeners = new Set(), told = () => {
    for (const fn of [...listeners]) fn();
  };
  const mount = (row) => {
    const host = el("div", { class: "chat-permission", "data-permission": row.id }), ctrl = new AbortController(), offs = [], now = () => model.rows.find((r) => r.id === row.id) ?? row;
    mountChoices(host, { choice: permissionChoice(row), ...island ? { island } : {}, questions: { find: () => permissionRecord(now()), answer: async (_key, _fence, body) => await model.decide(row.id, body.picks?.[0] === YES ? "allow" : "deny") ? { ok: true } : { ok: false, line: now().error || void 0 }, subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    } } }, { signal: ctrl.signal, own: (fn) => offs.push(fn) });
    return { host, off: () => {
      ctrl.abort();
      for (const fn of offs.splice(0)) fn();
    } };
  };
  node.append(cards, notice, reload);
  const model = createProviderPermissions({ api, timer, cancel, changed() {
    const rows = model.rows, ids = new Set(rows.map((r) => r.id));
    for (const [id, m] of mounts) if (!ids.has(id)) {
      m.off();
      m.host.remove();
      mounts.delete(id);
    }
    for (const row of rows) if (!mounts.has(row.id)) mounts.set(row.id, mount(row));
    const order = rows.map((r) => mounts.get(r.id).host);
    if (order.some((host, i) => cards.children[i] !== host)) cards.replaceChildren(...order);
    told();
    notice.textContent = model.error || "";
    notice.hidden = !model.error;
    reload.hidden = !model.error && !rows.some((r) => r.error);
    node.hidden = !rows.length && !model.error;
    onChange(node);
  } });
  let behind = true;
  function sync(event = {}) {
    if (event.type === "reset") {
      void model.select(null);
      model.enable(false);
      return;
    }
    if (event.type && !["snapshot", "state", "connection", "permissions"].includes(event.type)) return;
    if (event.type === "connection" && !event.live) behind = true;
    const ready = store.live && store.state.state === "ready";
    model.enable(ready);
    if (store.state.state === "no_target") void model.select(null);
    else if (ready) {
      const read = model.select(store.agent?.id ?? null);
      if (read) behind = false;
      else if (behind && event.type === "snapshot" && event.reason !== "owner_cards") {
        behind = false;
        void model.refresh();
      }
    }
    if (event.type === "permissions") model.frame(event.payload);
  }
  const off = store.subscribe(sync);
  node.hidden = true;
  sync();
  return { node, destroy() {
    off();
    model.destroy();
    for (const m of mounts.values()) m.off();
    mounts.clear();
  } };
}
