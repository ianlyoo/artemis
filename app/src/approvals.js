import { pageRevision } from "./chat/source-contract.js";
import { feed } from "./chat/feed.js";
import { esc, date, time } from "./mobile/format.js";
import { cardBodyHTML, titleLine } from "./card-md.js";
import { adminSummary, adminCommandHTML } from "./admin-command.js";
import { markAnswered } from "./owner-steps.js";
import { l10n, lang } from "./names.js";
const when = (at) => Number.isFinite(Date.parse(at)) ? date(at) + " " + time(at) : "—";
const oneLine = (value) => String(value ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").trim();
const fallback = () => l10n("결정을 저장하지 못했어요. 현재 카드를 다시 확인해 주세요.", "Couldn't save the decision. Check the card again.");
const statusName = (value) => ({ pending: "Pending", approved: "Approved", denied: "Denied", rejected: "Rejected", expired: "Expired" })[value] || value;
const via = (value) => ({ home: "Home", discord: "Discord", chat: "chat" })[String(value).toLowerCase()] || value || "—";
const owner = (a) => a.level === "owner";
const kindLevel = (a) => [a.kind, a.goal_id ? "G" + a.goal_id : null, a.level].filter(Boolean).join(" · ");
const lines = (a) => String(a.scope_text ?? a.preimage?.action?.summary ?? "").split(/\r?\n|[\u2028\u2029]/);
export function approvalTitle(a) {
  if (a.kind === "admin_job") return { text: adminSummary(a), lead: false };
  const line = a.kind === "admin_job" ? "" : lines(a).map(titleLine).find(Boolean) || "";
  if (/[\uac00-\ud7a3]/.test(line) || lang() === "en" && line) return { text: line, lead: true };
  return { text: a.goal_title || (a.kind === "admin_job" && a.admin_job?.job_id != null ? l10n("관리자 명령 #", "Admin command #") + a.admin_job.job_id : "") || l10n("승인 요청 #", "Approval #") + a.id, lead: false };
}
const scopeRest = (a, lead) => {
  if (!lead) return a.scope_text;
  const all = lines(a), at = all.findIndex((l) => l.trim());
  return all.slice(at + 1).join("\n").replace(/^\s*\n/, "");
};
export function approvalBodyHTML(a) {
  if (a.kind === "admin_job") return adminCommandHTML(a);
  const scope = scopeRest(a, approvalTitle(a).lead);
  return String(scope ?? "").trim() ? cardBodyHTML(scope, { cls: "approval-scope" }) : "";
}
const commentLine = (value) => String(value ?? "").replace(/[\p{Cc}\u2028\u2029]+/gu, " ").trim().slice(0, 200);
export const cardOptions = (card) => Array.isArray(card?.options) && card.options.length ? card.options : null;
export function decisionBody(card, verdict, reason = "", { option = null, comment = "" } = {}) {
  const body = { verdict, scope_hash: card.scope_hash }, line = oneLine(reason).slice(0, 300), note = commentLine(comment);
  if (verdict === "deny" && line) body.reason = line;
  if (verdict === "approve" && option != null && cardOptions(card)) body.option_id = String(option);
  if (verdict === "approve" && note) body.comment = note;
  return body;
}
function ownerWords(card, body) {
  if (body.verdict === "deny") return body.reason || "";
  const pick = body.option_id != null && cardOptions(card)?.find((o) => String(o.id) === body.option_id);
  return [pick?.label, body.comment].filter(Boolean).join(" · ") || null;
}
const detailPages = new WeakMap(), frameRows = new WeakMap();
function detailCache(page) {
  let cache = detailPages.get(page);
  if (!cache) detailPages.set(page, cache = { entries: new Map() });
  return cache;
}
function approvalRevision(page, id) {
  const list = page?.dashboard?.dashboard?.approvals;
  if (!Array.isArray(list)) return pageRevision(page);
  let rows = frameRows.get(list);
  if (!rows) frameRows.set(list, rows = new Map(list.map((a) => [String(a?.id), JSON.stringify(a)])));
  return rows.get(id) ?? "absent";
}
const detailOf = (page, id) => {
  const record = detailCache(page).entries.get(id);
  return record && record.revision === approvalRevision(page, id) ? record : void 0;
};
function detailRead(api, id, cache, revision) {
  let record = cache.entries.get(id);
  if (record && record.revision === revision) return record;
  record = { revision, result: null, promise: null };
  record.promise = (async () => {
    const response = await api("/approvals/" + encodeURIComponent(id)), body = await response.json();
    const result = { ok: response.ok, status: response.status, body };
    if (response.ok || response.status === 404) record.result = result;
    else if (cache.entries.get(id) === record) cache.entries.delete(id);
    return result;
  })().catch((error) => {
    if (cache.entries.get(id) === record) cache.entries.delete(id);
    throw error;
  });
  cache.entries.set(id, record);
  return record;
}
export function createApprovals(api, changed = () => {
}, { page = feed } = {}) {
  const entries = new Map();
  let selected = null;
  const entry = (id) => {
    id = String(id);
    if (!entries.has(id)) entries.set(id, {});
    const state = entries.get(id), result = detailOf(page, id)?.result;
    if (result?.ok && state.ready && !state.pending && result.body !== state.shared) {
      if (state.card?.scope_hash !== result.body.scope_hash) state.option = null;
      state.card = result.body;
      state.shared = result.body;
    }
    return state;
  };
  async function load(id, { keepError = false } = {}) {
    id = String(id);
    const state = entry(id);
    if (state.loading || state.pending) return state.task;
    const cache = detailCache(page), revision = approvalRevision(page, id), record = detailRead(api, id, cache, revision);
    if (state.record === record && (state.ready || state.missing)) return;
    state.record = record;
    state.loading = true;
    state.ready = false;
    state.missing = false;
    if (!keepError) state.error = "";
    changed();
    state.task = record.promise.then(() => {
    }, () => {
    });
    try {
      const response = await record.promise, data = response.body;
      if (cache.entries.get(id) !== record || approvalRevision(page, id) !== revision) {
        state.record = null;
        return;
      }
      state.shared = data;
      if (response.status === 404) {
        state.missing = true;
        state.card = null;
        return;
      }
      if (!response.ok) {
        state.error = oneLine(data.error) || l10n("카드를 불러오지 못했어요.", "Couldn't load the card.");
        return;
      }
      state.card = data;
      state.ready = true;
      state.forbidden = false;
    } catch {
      state.error = l10n("카드를 불러오지 못했어요. 다시 시도해 주세요.", "Couldn't load the card. Try again.");
    } finally {
      state.loading = false;
      state.task = null;
      changed();
      if (!state.record) void load(id, { keepError });
    }
  }
  async function decide(id, verdict, reason = "") {
    id = String(id);
    const state = entries.get(id) ?? entry(id), card = state.card, options = cardOptions(card);
    if (state.pending || state.loading || !state.ready || state.forbidden || !card?.scope_hash || card.status !== "pending" || !owner(card) || !["approve", "deny"].includes(verdict)) return;
    if (verdict === "approve" && options && !options.some((o) => String(o.id) === state.option)) return;
    state.pending = true;
    state.error = "";
    changed();
    let refresh = false;
    const sent = decisionBody(card, verdict, reason, { option: options ? state.option : null, comment: state.comment });
    try {
      const response = await api("/approvals/" + encodeURIComponent(id) + "/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) }), data = await response.json();
      if (response.ok) {
        state.card = { ...card, ...data, decided_via: "home", decided_at: data.decided_at || (new Date()).toISOString(), owner_verbatim: ownerWords(card, sent), ...sent.option_id ? { option_id: sent.option_id } : {} };
        state.option = null;
        state.comment = "";
        state.decided = verdict;
        markAnswered("approval", id);
        const result = { ok: true, status: 200, body: state.card };
        detailCache(page).entries.set(id, { revision: approvalRevision(page, id), result, promise: Promise.resolve(result) });
        state.shared = state.card;
      } else {
        state.error = data.error === "browser_host" && oneLine(data.message) || oneLine(data.error) || fallback();
        if (response.status === 409) {
          detailCache(page).entries.delete(id);
          state.record = null;
          state.ready = false;
          refresh = true;
        } else if (response.status === 403) {
          state.forbidden = true;
        } else if (response.status !== 400) state.ready = false;
      }
    } catch {
      state.error = fallback();
      state.ready = false;
    } finally {
      state.pending = false;
      changed();
    }
    if (refresh) await load(id, { keepError: true });
  }
  return { state: entry, rows(d) {
    const rows = new Map((d.approvals || []).map((a) => [String(a.id), a]));
    for (const [id, state] of entries) {
      entry(id);
      const cached = detailOf(page, id);
      if (state.record && state.record !== cached && !state.loading && !state.pending) void load(id);
      const row = rows.get(id);
      if (state.card?.status === "pending" && row && row.status !== "pending") {
        state.card = { ...state.card, ...row };
        state.option = null;
      }
      if (state.card) rows.set(id, { ...row, ...state.card });
    }
    if (selected !== null && !rows.has(selected)) rows.set(selected, { id: selected });
    return [...rows.values()].map((a) => ({ ...a, goal_title: a.goal_title || (d.goals || []).find((g) => String(g.id) === String(a.goal_id))?.title }));
  }, open(id) {
    selected = String(id);
    return load(selected);
  }, stage(id, option) {
    const state = entry(id);
    if (state.pending || state.card?.status !== "pending") return;
    option = option == null ? null : String(option);
    state.option = state.option === option ? null : option;
    changed();
  }, comment(id, value) {
    entry(id).comment = String(value ?? "").replace(/[\p{Cc}\u2028\u2029]+/gu, " ").slice(0, 200);
  }, send(id) {
    const state = entry(id), staged = state.option;
    if (staged == null) return;
    if (cardOptions(state.card) || staged === "approve") return decide(id, "approve");
    if (staged === "deny") return decide(id, "deny", state.comment);
  }, reload(id) {
    const state = entry(id);
    if (state.record && !state.loading && !state.pending && (state.forbidden || !state.ready && !state.missing)) detailCache(page).entries.delete(String(id));
    return load(id);
  }, decide };
}
export function approvalDetailHTML(a, state = {}) {
  const job = a.admin_job, reason = a.status !== "pending" && ["denied", "rejected"].includes(a.status) ? a.reason || a.owner_verbatim : null;
  return '<div class="approval-detail">' + (state.missing ? '<p class="approval-note">Not found</p>' : state.loading && !state.card ? '<p class="approval-note" role="status">Loading…</p>' : approvalBodyHTML(a) + (job ? '<dl class="approval-facts"><div><dt>Host</dt><dd>' + esc(job.host_label || job.host) + "</dd></div><div><dt>Requester</dt><dd>" + esc(job.requester) + (job.role ? " · " + esc(job.role) : "") + '</dd></div><div><dt>Expires</dt><dd><time datetime="' + esc(job.expires_at) + '">' + when(job.expires_at) + "</time></dd></div></dl>" : "") + (reason ? '<p class="approval-reason"><span>Reason</span>' + esc(reason) + "</p>" : "")) + "</div>";
}
const decision = (a) => '<span class="band-decision ' + (a.status === "approved" ? "band-running" : "") + '">' + esc(statusName(a.status) || "") + (a.status && a.status !== "pending" ? '<span class="approval-via">' + esc(via(a.decided_via)) + "</span>" : "") + "</span>";
export const approvalLineHTML = (a) => {
  const kind = kindLevel(a), at = a.status === "pending" ? a.created_at : a.decided_at;
  return '<div class="approval-line"><span class="band-id">A' + esc(a.id) + "</span>" + (kind && kind !== approvalTitle(a).text ? '<span class="approval-kind">' + esc(kind) + "</span>" : "") + (a.status ? decision(a) : "") + (a.status && at ? '<time class="approval-at" datetime="' + esc(at) + '">' + when(at) + "</time>" : "") + "</div>" + destinationHTML(a);
};
const destinationHTML = (a) => a.decision_destination?.label ? '<p class="approval-destination">' + esc(a.decision_destination.label) + "</p>" : "";
