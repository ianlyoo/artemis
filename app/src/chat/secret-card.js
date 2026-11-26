import { clock, dayKey } from "./motion.js";
import { l10n } from "../names.js";
export const LINES = Object.freeze({ get save() {
  return l10n("저장하지 못했어요 · 다시 시도", "Didn't save · try again");
}, get busy() {
  return l10n("저장 중이에요 · 잠시 뒤 다시 시도", "Still saving · try again in a moment");
}, get delete() {
  return l10n("삭제하지 못했어요 · 다시 시도", "Didn't delete · try again");
}, get again() {
  return l10n("다시 입력을 열지 못했어요 · 다시 시도", "Didn't reopen the entry · try again");
}, get make() {
  return l10n("만들지 못했어요 · 다시 시도", "Didn't create it · try again");
}, get named() {
  return l10n("이름 칸에 비밀값 같은 글이 있어서 지웠어요 · 이름만 적고, 값은 다음 칸에 넣어 주세요", "The name looked like a secret, so it was cleared · write only the name, and the value in the next field");
}, get load() {
  return l10n("불러오지 못했어요", "Didn't load");
}, get taken() {
  return l10n("이 이름의 비밀값이 이미 있어서 덮어쓰지 않았어요 · 다른 이름으로 요청해 주세요", "A secret with this name exists, so it was not overwritten · ask under another name");
} });
export const LABEL_MAX = 60;
export const KEY_GLYPH = "M15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4 M21 2l-9.6 9.6 M2 15.5a5.5 5.5 0 1 0 11 0 5.5 5.5 0 1 0-11 0z";
const EYE = "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5z";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const ico = (d) => `<svg class="sa-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const eye = (shown) => ico(EYE + (shown ? " M4 4l16 16" : ""));
const btn = (act, label, attrs = "", k = "") => `<button type="button" class="text-control sa-act ${k}" data-act="${act}" ${attrs}><span class="control-label">${label}</span></button>`;
const status = (text, k = "") => `<span class="sa-state ${k}" role="status" aria-live="polite" tabindex="-1">${text}</span>`;
const NOPM = 'autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"';
const day = (iso) => {
  const [y, m, d] = dayKey(iso).split("-").map(Number);
  return { at: Date.UTC(y, m - 1, d), md: `${m}/${d}` };
};
const dayDiff = (iso, now) => Math.round((day(iso).at - day(new Date(now).toISOString()).at) / 864e5);
export function when(iso, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const n = dayDiff(iso, now);
  return n === 0 ? clock(iso) : n === -1 ? l10n("어제 ", "yesterday ") + clock(iso) : `${day(iso).md} ${clock(iso)}`;
}
export function until(iso, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const n = dayDiff(iso, now);
  const at = (n === 0 ? l10n("오늘 ", "today ") : n === 1 ? l10n("내일 ", "tomorrow ") : `${day(iso).md} `) + clock(iso);
  return l10n(at + "까지", "until " + at);
}
export function stateOf(row, now = Date.now()) {
  if (!row) return "missing";
  if (row.deleted_at) return "deleted";
  if (row.state === "open") return Date.parse(row.expires_at) > now ? "open" : "expired";
  return ["saved", "expired", "cancelled", "superseded"].includes(row.state) ? row.state : "expired";
}
const chars = (length) => Number.isSafeInteger(length) ? l10n(length + "자", length + " chars") : "";
export const batchHTML = (batch, now = Date.now()) => `<section class="sa sa-secret sa-batch" data-state="batch" aria-label="${l10n(`비밀값 ${batch.keys.length}개`, `${batch.keys.length} secrets`)}"><div class="sa-head"><span class="sa-title">${l10n(`비밀값 ${batch.keys.length}개`, `${batch.keys.length} secrets`)}</span><span class="sa-meta">${esc(until(batch.expires_at, now))}</span></div>` + batch.keys.map((row) => `<div class="sa-slot" data-secret-item="${esc(row.id)}"></div>`).join("") + "</section>";
export function secretHTML(v, now = Date.now()) {
  const sa = v.item ? "sa-item sa-secret" : "sa sa-secret";
  const line = v.line ? `<p class="sa-reason sa-err" role="alert">${esc(v.line)}</p>` : "";
  if (v.phase === "loading") return '<div class="sa-closed" aria-busy="true"><span class="sa-meta">' + l10n("비밀값 요청", "Secret request") + "</span></div>";
  if (v.phase === "failed") return `<div class="sa-closed" data-state="failed"><span class="sa-meta">${l10n("비밀값 요청", "Secret request")} · ${LINES.load}</span>${btn("reload", l10n("다시 시도", "Try again"))}</div>`;
  if (v.phase === "label") return `<section class="sa sa-secret" data-state="label"><div class="sa-head"><span class="sa-title">${l10n("새 비밀값", "New secret")}</span><span class="sa-meta">${l10n("직접 추가", "Added by you")}</span>${btn("close", l10n("닫기", "Close"), "", "sa-back")}</div>${line}<div class="sa-row sa-field"><input type="text" name="g255-label" data-field="label" maxlength="${LABEL_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(v.label)}" placeholder="${l10n("이름 · 예: 카카오 개발자 키", "Name · e.g. Maps API key")}" aria-label="${l10n("비밀값 이름", "Secret name")}">${btn("next", l10n("다음", "Next"), String(v.label ?? "").trim() ? "" : "disabled", "sa-go")}</div></section>`;
  const c = v.row, state = v.superseded ? "superseded" : stateOf(c, now), label = c.label || c.key;
  const key = c.key && c.key !== c.label ? `<code class="sa-key">${esc(c.key)}</code>` : "";
  const closed = (meta, attrs = "") => `<div class="sa-closed" data-state="${state}"><span class="sa-title">${esc(label)}</span>${key}<span class="sa-meta"${attrs}>${meta}</span></div>`;
  if (state === "deleted") return closed(`${l10n("삭제됨", "Deleted")} · ${esc(when(c.deleted_at, now))}`, ' role="status" aria-live="polite" tabindex="-1"');
  if (state === "superseded") return closed(l10n("새 값으로 바뀜", "Replaced by a new value"));
  if (state === "expired" || state === "cancelled") return closed(state === "expired" ? l10n(`만료됨 · ${esc(when(c.created_at, now))} 요청`, `Expired · asked ${esc(when(c.created_at, now))}`) : l10n(`취소됨 · ${esc(when(c.created_at, now))} 요청`, `Cancelled · asked ${esc(when(c.created_at, now))}`));
  const head = (meta, extra = "") => `<div class="sa-head"><span class="sa-title">${esc(label)}</span>${key}<span class="sa-meta">${meta}</span>${extra}</div>`;
  if (state === "saved") return `<section class="${sa}${v.just ? " sa-just" : ""}" data-state="saved">${head("")}${line}<div class="sa-row sa-done">${v.confirm ? `${status(l10n("삭제할까요?", "Delete it?"), "sa-ask")}${btn("delete-yes", l10n("삭제", "Delete"), "", "sa-del sa-del-yes")}${btn("delete-no", l10n("취소", "Cancel"))}` : `${status(`${l10n("저장됨", "Saved")} · ${chars(c.length)} · ${esc(when(c.saved_at, now))}`)}${btn("again", l10n("다시 입력", "Enter again"))}${btn("delete", l10n("삭제", "Delete"), "", "sa-del")}`}</div></section>`;
  if (state !== "open") return closed("");
  const back = v.local && !v.prev ? btn("back", l10n("뒤로", "Back"), "", "sa-back") : "";
  const note = v.prev ? `<p class="sa-reason">${l10n("새 값으로 바꿉니다 · 이전 값은 보관", "Replacing the value · the old one is kept")} <span class="sa-prev">(${l10n("저장됨", "Saved")} · ${chars(v.prev.length)} · ${esc(when(v.prev.saved_at, now))})</span></p>` : c.reason ? `<p class="sa-reason">${esc(c.reason)}</p>` : "";
  return `<section class="${sa}" data-state="open"${v.prev ? " data-replace" : ""}>${head(v.item ? "" : esc(until(c.expires_at, now)), back)}${note}${line}<div class="sa-row sa-field"><input type="${v.shown ? "text" : "password"}" name="g255-value-${esc(c.id)}" data-field="value" ${NOPM} placeholder="${l10n("값 붙여넣기", "Paste the value")}" aria-label="${esc(l10n(`${label} 값`, `${label} value`))}"><button type="button" class="sa-eye" data-act="show" aria-pressed="${!!v.shown}" aria-label="${v.shown ? l10n("가리기", "Hide") : l10n("보기", "Show")}" title="${v.shown ? l10n("가리기", "Hide") : l10n("보기", "Show")}">${eye(v.shown)}</button>${btn("save", l10n("저장", "Save"), "disabled", "sa-go")}${v.prev ? btn("cancel", l10n("취소", "Cancel")) : ""}</div></section>`;
}
const fragment = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
};
const answer = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch {
  }
  return { status: response.status, body };
};
const call = async (api, path, body) => {
  try {
    return await answer(await api(path, body === void 0 ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  } catch {
    return { status: 0, body: null };
  }
};
export function mountSecret(host, { api, id = null, row = null, item = false, local = false, label = "", focus = null, onRow = () => {
}, onClose = () => {
}, now = Date.now }) {
  const v = { phase: row ? "card" : id ? "loading" : "label", row, base: null, label, confirm: false, prev: null, shown: false, line: "", local, item, superseded: !!row?.superseded, just: false };
  let timer = 0, busy = false, gone = false;
  const items = [];
  const find = (sel) => host.querySelector(sel), field = () => find("input[data-field=value]");
  function paintBatch() {
    for (const card of items.splice(0)) card.destroy();
    host.replaceChildren(fragment(batchHTML(v.row, now())));
    v.row.keys.forEach((key, n) => items.push(mountSecret(host.querySelectorAll("[data-secret-item]")[n], { api, now, row: key, item: true, onRow: (current) => {
      v.row.keys[n] = current;
    } })));
  }
  function paint(focus2 = null) {
    if (gone) return;
    clearTimeout(timer);
    if (v.phase === "batch") return paintBatch();
    host.replaceChildren(fragment(secretHTML(v, now())));
    v.just = false;
    if (v.phase === "card" && !v.superseded && stateOf(v.row, now()) === "open") timer = setTimeout(() => paint(), Math.min(2 ** 31 - 1, Math.max(0, Date.parse(v.row.expires_at) - now()) + 50)), timer?.unref?.();
    if (focus2) {
      const node = find(focus2);
      node?.focus?.({ preventScroll: true });
      if (focus2.includes("label")) node?.select?.();
    }
  }
  const show = (row2, focus2) => {
    v.row = row2;
    v.phase = "card";
    onRow(row2);
    paint(focus2);
  };
  async function load(focus2) {
    const got = await call(api, `/secret-requests/${v.row?.id ?? id}`);
    if (gone) return;
    if (got.status === 200 && Array.isArray(got.body?.keys) && got.body.keys.length) {
      v.row = got.body;
      v.phase = "batch";
      paint();
      return;
    }
    if (got.status === 200 && got.body?.id) show(got.body, focus2);
    else if (!v.row) {
      v.phase = "failed";
      paint();
    } else paint(focus2);
  }
  async function save() {
    const input = field();
    if (!input || busy) return;
    let value = input.value;
    input.value = "";
    if (!value) return;
    busy = true;
    input.readOnly = true;
    const go = find("[data-act=save]");
    if (go) go.disabled = true;
    host.firstElementChild?.setAttribute?.("aria-busy", "true");
    const sent = call(api, `/secret-requests/${v.row.id}/save`, { value });
    value = null;
    const got = await sent;
    busy = false;
    if (gone) return;
    if (got.status === 200) {
      Object.assign(v, { row: { ...v.row, state: "saved", length: got.body?.length, saved_at: got.body?.saved_at ?? new Date(now()).toISOString() }, prev: null, base: null, shown: false, line: "", just: true });
      onRow(v.row);
      paint("[data-act=again]");
      return;
    }
    if (got.status === 409 && got.body?.error === "not_open") {
      v.line = "";
      v.prev = null;
      v.base = null;
      return load();
    }
    const why = got.status === 409 ? got.body?.error : void 0;
    v.line = why === "busy" ? LINES.busy : why === "key_taken" ? LINES.taken : LINES.save;
    v.shown = false;
    paint("input[data-field=value]");
  }
  async function act(name) {
    if (busy) return;
    if (name === "show") {
      const input = field(), toggle = find("[data-act=show]");
      v.shown = !v.shown;
      input?.setAttribute("type", v.shown ? "text" : "password");
      toggle.setAttribute("aria-pressed", String(v.shown));
      const word = v.shown ? l10n("가리기", "Hide") : l10n("보기", "Show");
      toggle.setAttribute("aria-label", word);
      toggle.setAttribute("title", word);
      toggle.replaceChildren(fragment(eye(v.shown)));
      input?.focus?.({ preventScroll: true });
      return;
    }
    if (name === "save") return save();
    if (name === "reload") {
      v.phase = "loading";
      paint();
      return load();
    }
    if (name === "close") {
      gone = true;
      clearTimeout(timer);
      onClose();
      return;
    }
    busy = true;
    try {
      if (name === "next") {
        const text = String(find("input[data-field=label]")?.value ?? "").trim().slice(0, LABEL_MAX);
        if (!text) return;
        v.label = text;
        v.line = "";
        if (v.row && v.row.label === text && stateOf(v.row, now()) === "open") {
          v.phase = "card";
          paint("input[data-field=value]");
          return;
        }
        const got = await call(api, "/secret-requests", { label: text });
        if (gone) return;
        if (got.status === 201 && got.body?.id) show(got.body, "input[data-field=value]");
        else if (got.status === 422) {
          v.label = "";
          v.line = LINES.named;
          paint("input[data-field=label]");
        } else {
          v.line = LINES.make;
          paint("input[data-field=label]");
        }
        return;
      }
      if (name === "back") {
        const input = field();
        if (input) input.value = "";
        Object.assign(v, { phase: "label", shown: false, line: "" });
        paint("input[data-field=label]");
        return;
      }
      if (name === "again") {
        const got = await call(api, `/secret-requests/${v.row.id}/replace`, {});
        if (gone) return;
        if (got.status === 201 && got.body?.id) {
          Object.assign(v, { base: v.row, prev: { length: v.row.length, saved_at: v.row.saved_at }, shown: false, line: "" });
          show(got.body, "input[data-field=value]");
        } else {
          v.line = LINES.again;
          paint("[data-act=again]");
        }
        return;
      }
      if (name === "cancel") {
        const input = field();
        if (input) input.value = "";
        Object.assign(v, { row: v.base, base: null, prev: null, shown: false, line: "" });
        onRow(v.row);
        paint("[data-act=again]");
        return;
      }
      if (name === "delete") {
        v.confirm = true;
        v.line = "";
        paint("[data-act=delete-no]");
        return;
      }
      if (name === "delete-no") {
        v.confirm = false;
        paint("[data-act=delete]");
        return;
      }
      if (name === "delete-yes") {
        const got = await call(api, `/secret-requests/${v.row.id}/delete`, {});
        if (gone) return;
        v.confirm = false;
        if (got.status === 200) {
          v.row = { ...v.row, ...got.body?.id ? got.body : {}, deleted_at: got.body?.deleted_at ?? new Date(now()).toISOString() };
          onRow(v.row);
          paint("[role=status]");
          return;
        }
        if (got.status === 409 && got.body?.error === "superseded") {
          v.superseded = true;
          paint();
          return;
        }
        if (got.status === 409 && got.body?.error === "not_saved") return load();
        v.line = LINES.delete;
        paint("[data-act=delete]");
      }
    } finally {
      busy = false;
    }
  }
  const onClick = (event) => {
    const control = event.target?.closest?.("[data-act]");
    if (v.phase === "batch" || !control || control.disabled || !host.contains(control)) return;
    void act(control.dataset.act);
  };
  const onInput = (event) => {
    if (v.phase === "batch") return;
    const kind = event.target?.dataset?.field;
    if (kind === "value") {
      const go = find("[data-act=save]");
      if (go && !busy) go.disabled = event.target.value === "";
    }
    if (kind === "label") {
      const go = find("[data-act=next]");
      if (go) go.disabled = !String(event.target.value).trim();
    }
  };
  const onKey = (event) => {
    const kind = event.target?.dataset?.field;
    if (kind !== "value" && kind !== "label") return;
    event.stopPropagation();
    if (event.key === "Escape" && kind === "label" && local) {
      event.preventDefault();
      void act("close");
      return;
    }
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void act(kind === "value" ? "save" : "next");
  };
  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("keydown", onKey);
  paint(focus);
  if (id && !row) void load();
  return { get view() {
    return v;
  }, destroy() {
    gone = true;
    clearTimeout(timer);
    for (const card of items.splice(0)) card.destroy();
    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("keydown", onKey);
  } };
}
const pinned = [];
let serial = 0;
const clientApi = (...args) => import("/client.js").then((module) => module.api(...args));
const savedItem = (entry) => ({ key: `secret:${entry.n}`, kind: "notice", role: "notice", id: `secret:${entry.n}`, savedPin: entry.n, text: `${entry.row?.label || entry.row?.key || entry.label} · ${l10n("저장됨", "Saved")}`, at: entry.at });
export const savedSecrets = () => pinned.filter((entry) => entry.at).map(savedItem);
export function createSecretPins({ api = clientApi, store = null } = {}) {
  const node = document.createElement("section");
  node.setAttribute("class", "chat-col chat-secrets");
  node.setAttribute("aria-label", l10n("비밀값", "Secrets"));
  const cards = /* @__PURE__ */ new Map();
  let scroller = null;
  const open = () => pinned.filter((entry) => !entry.at);
  const sync = () => {
    node.hidden = !open().length;
    scroller?.classList?.toggle("has-secrets", open().length > 0);
  };
  const tell = () => store?.setSecrets?.(savedSecrets());
  function mount(entry) {
    const host = document.createElement("div");
    host.setAttribute("class", "msg msg-secret");
    host.setAttribute("data-segment", "secret");
    node.append(host);
    const unpin = () => {
      card.destroy();
      host.remove();
      cards.delete(entry.n);
      sync();
    };
    const card = mountSecret(host, { api, id: entry.id, local: true, label: entry.label, onRow: (row) => {
      entry.id = row.id;
      entry.label = row.label ?? entry.label;
      host.setAttribute("data-secret", row.id);
      if (stateOf(row) === "saved" && row.saved_at) {
        Object.assign(entry, { row, at: row.saved_at, api, focus: true });
        unpin();
        tell();
      }
    }, onClose: () => {
      pinned.splice(pinned.indexOf(entry), 1);
      unpin();
    } });
    cards.set(entry.n, card);
    return host;
  }
  for (const entry of open()) mount(entry);
  sync();
  tell();
  return { node, place(where) {
    if (!where || node.parentNode === where) return;
    scroller = where;
    where.append(node);
    sync();
  }, start() {
    const entry = { n: ++serial, id: null, label: "", row: null, at: null };
    pinned.push(entry);
    sync();
    const host = mount(entry);
    host.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    host.querySelector("input[data-field=label]")?.focus?.({ preventScroll: true });
  }, destroy() {
    for (const card of cards.values()) card.destroy();
    cards.clear();
    node.remove();
    scroller?.classList?.remove("has-secrets");
  } };
}
export const ownSecretId = (item) => pinned.find((entry) => entry.n === item?.savedPin)?.row?.id ?? null;
export function mountOwnSecret(host, item) {
  const entry = pinned.find((e) => e.n === item.savedPin);
  if (!entry) return { destroy() {
  } };
  host.setAttribute("data-secret", entry.row.id);
  const card = mountSecret(host, { api: entry.api ?? clientApi, row: entry.row, focus: entry.focus ? "[data-act=again]" : null, onRow: (row) => {
    entry.row = row;
    host.setAttribute("data-secret", row.id);
  } });
  entry.focus = false;
  return card;
}
export const forgetPins = () => {
  pinned.length = 0;
};
