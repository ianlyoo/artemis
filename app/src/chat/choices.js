import { el, svg } from "../boards/dom.js";
import { control } from "./visuals.js";
import { clock } from "./motion.js";
import { mountIsland } from "../islands/island.js";
import { leadKo, userKo, lead, user, l10n } from "../names.js";
export const YES = "예", NO = "아니오", SAME = "그대로";
export const say = (value) => value === YES ? l10n(YES, "Yes") : value === NO ? l10n(NO, "No") : value === SAME ? l10n(SAME, "As is") : value;
export const SEND = () => l10n("보내기", "Send"), CHANGED = () => l10n("바꿈", "changed"), ANSWERED = () => l10n("답함", "Answered");
export const CLOSED = () => l10n("닫힘", "Closed"), PICK_WAITS = () => l10n("선택 대기 중", "Waiting for a pick");
export const UNREADABLE = () => l10n("선택지를 읽을 수 없어요", "These choices don't read"), OFF = () => l10n("답장에 붙여 보내면 질문으로 열려요", "Sent with a reply, this opens as a question");
export const REFUSED = "refused";
export const toldLine = () => l10n(`버튼을 그릴 수 없어 ${leadKo()}에게 다시 보내 달라고 알렸어요`, `These buttons don't draw, so ${lead()} was asked to send them again`);
export const OPTION_MAX = 20, ROW_MAX = 100, Q_MAX = 200, LINE_MAX = 200;
const KEYS = ["q", "options", "guess", "rows", "step", "permission", "plan", "replaces", "supersedes", "supersede_phrases", "project"];
export const APPROVED = () => l10n("승인함", "Approved"), DENIED = () => l10n("거절함", "Declined"), ASKS = () => l10n("승인 질문", "Approval");
export const WAITING = () => l10n("대기 중", "Waiting"), RECOMMENDED = () => l10n("추천", "Suggested");
export const PERMITS = { get send_as_owner() {
  return l10n(`${userKo()} 이름으로 보내기`, `Send as ${user()}`);
}, get delete() {
  return l10n("되돌릴 수 없는 삭제", "Delete for good");
}, get payment() {
  return l10n("결제", "Payment");
} };
const TICK = "M5 12.5l4.5 4.5L19 7.5";
export const SHIELD = "M12 3l7 3v5.2c0 4.3-2.9 8.2-7 9.8-4.1-1.6-7-5.5-7-9.8V6z M9 12l2.2 2.2L15.5 10";
export const shield = (look) => svg("svg", { viewBox: "0 0 24 24", class: look, "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: SHIELD }));
const label = (value, max) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
const line = (value, max) => {
  const word = label(value, max);
  return word && !/[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/.test(word) ? word : null;
};
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const commentText = (value) => String(value ?? "").trim();
const plain = (text2) => !/[\p{Cc}\p{Cf}]/u.test(text2);
const digest = (value) => typeof value === "string" && value.length === 64 && /^[0-9a-f]+$/.test(value);
const only = (value, names) => !!value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...names].sort());
const absolute = (value) => {
  if (typeof value !== "string" || value.length > 300 || value.trim() !== value || !plain(value)) return false;
  const match = /^(?:[a-z][a-z0-9-]*:)?(\/.*)$/.exec(value);
  return !!match && match[1].split("/").slice(1).every((part) => !["", ".", ".."].includes(part));
};
const text = (value) => typeof value === "string" && !/[\p{Cf}\0-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value);
const page = (value) => typeof value === "string" && /^https:\/\/[a-z0-9.-]+(:\d+)?\//.test(value) && plain(value);
const named = (value) => text(value) && !!value.trim();
const chosen = (value) => typeof value === "boolean" || named(value) || Array.isArray(value) && value.length > 0 && value.every(named);
function shown(value) {
  if ("form" in value) {
    const f = value.form;
    return only(f, ["page", "entries", "files", "choices", "publish"]) && page(f.page) && named(f.publish) && Array.isArray(f.entries) && f.entries.every((e) => text(e) || Array.isArray(e) && e.length > 0 && e.every(text)) && Array.isArray(f.files) && f.files.every(digest) && Array.isArray(f.choices) && f.choices.every((c) => (only(c, ["name", "value"]) || only(c, ["name", "group", "value"])) && named(c.name) && (c.group === void 0 || named(c.group)) && chosen(c.value)) ? { form: f } : null;
  }
  const edits = value.edits;
  return Array.isArray(edits) && edits.length > 0 && edits.every((e) => only(e, ["page", "text"]) && page(e.page) && text(e.text)) ? { edits } : null;
}
function target(kind, value) {
  const content = kind === "send_as_owner" && value && typeof value === "object" && ["form", "edits"].find((key) => key in value);
  if (content && (only(value, ["to", content]) || only(value, ["to", content, "sha256"]))) {
    const to = typeof value.to === "string" ? value.to.trim() : "", what = shown(value);
    if (!to || to.length > 80 || !plain(to) || !what || "sha256" in value && !digest(value.sha256)) return null;
    return { to, ...what, ..."sha256" in value ? { sha256: value.sha256 } : {} };
  }
  if (kind === "send_as_owner" && (only(value, ["to", "sha256"]) || only(value, ["to", "sha256", "attachments"]) || only(value, ["to", "sha256", "entries"]))) {
    const to = typeof value.to === "string" ? value.to.trim() : "";
    const { sha256, attachments = [] } = value;
    if (!to || to.length > 80 || !plain(to) || !digest(sha256)) return null;
    if ("entries" in value) return positive(value.entries) ? { to, sha256, entries: value.entries } : null;
    if (!Array.isArray(attachments) || attachments.length > 10 || !attachments.every(digest) || new Set(attachments).size !== attachments.length) return null;
    return { to, sha256, ...attachments.length ? { attachments: [...attachments].sort() } : {} };
  }
  if (kind === "delete" && only(value, ["paths"]) && Array.isArray(value.paths)) {
    const paths = value.paths;
    return paths.length >= 1 && paths.length <= 10 && paths.every(absolute) && new Set(paths).size === paths.length ? { paths: [...paths] } : null;
  }
  if (kind === "payment" && only(value, ["payee", "cap"]) && only(value.cap, ["amount", "currency"])) {
    const payee = typeof value.payee === "string" ? value.payee.trim() : "", { amount, currency } = value.cap;
    return payee && payee.length <= 80 && plain(payee) && typeof amount === "number" && amount > 0 && amount <= 1e12 && typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? { payee, cap: { amount, currency } } : null;
  }
  return null;
}
export function parsePermission(value) {
  if (!only(value, ["kind", "goal", "target"]) || !Object.hasOwn(PERMITS, value.kind) || !(Number.isSafeInteger(value.goal) && value.goal > 0)) return null;
  const aim = target(value.kind, value.target);
  return aim && { kind: value.kind, goal: value.goal, target: aim };
}
const capOf = (cap) => `${cap.amount.toLocaleString(l10n("ko-KR", "en-US"))} ${cap.currency}`;
export function permitLine(value) {
  const p = parsePermission(value);
  if (!p) return null;
  const { paths = [], attachments = [], form, edits, entries, sha256 } = p.target;
  const files = form ? l10n(` · 보낼 곳 ${form.page} · 입력 ${form.entries.length}개 · 선택 ${form.choices.length}개 · 파일 ${form.files.length}개`, ` · page ${form.page} · ${form.entries.length} entries · ${form.choices.length} choices · ${form.files.length} files`) : edits ? l10n(` · 수정 ${edits.length}곳`, ` · ${edits.length} edits`) : entries ? l10n(` · 수정 항목 ${entries}개 · 매니페스트 SHA-256 ${sha256}`, ` · ${entries} items · manifest SHA-256 ${sha256}`) : attachments.length ? l10n(` · 첨부 SHA-256 ${attachments.join(" · ")}`, ` · attachment SHA-256 ${attachments.join(" · ")}`) : "";
  return { kind: p.kind, asks: ASKS(), act: PERMITS[p.kind], aim: p.kind === "send_as_owner" ? l10n(`받는 곳 ${p.target.to}${files}`, `To ${p.target.to}${files}`) : p.kind === "payment" ? l10n(`받는 곳 ${p.target.payee} · 한도 ${capOf(p.target.cap)}`, `To ${p.target.payee} · up to ${capOf(p.target.cap)}`) : l10n(`지울 곳 ${paths[0]}${paths.length > 1 ? ` 외 ${paths.length - 1}곳` : ""}`, `Delete ${paths[0]}${paths.length > 1 ? ` and ${paths.length - 1} more` : ""}`) };
}
function option(value) {
  if (typeof value === "string") {
    const word2 = label(value, OPTION_MAX);
    return word2 && { label: word2 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["label", "line", "media"].includes(key))) return null;
  const word = label(value.label, OPTION_MAX), under = "line" in value ? line(value.line, LINE_MAX) : "";
  const media = !("media" in value) || Array.isArray(value.media) && value.media.length >= 1 && value.media.length <= 6;
  return word && under !== null && media ? { label: word, line: under } : null;
}
const revokes = (spec) => spec.supersedes == null ? spec.supersede_phrases == null : Array.isArray(spec.supersedes) && spec.supersedes.every((id) => typeof id === "string" && id.trim()) && (spec.supersede_phrases == null || Array.isArray(spec.supersede_phrases) && spec.supersede_phrases.length <= 3 && spec.supersede_phrases.every((phrase) => typeof phrase === "string" && phrase.trim().length >= 3 && phrase.trim().length <= 40));
export function parseChoices(text2) {
  let spec;
  try {
    spec = JSON.parse(String(text2 ?? ""));
  } catch {
    return null;
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || "options" in spec === "rows" in spec || Object.keys(spec).some((key) => !KEYS.includes(key)) || spec.replaces != null && !positive(spec.replaces) || "project" in spec && !positive(spec.project) || !revokes(spec)) return null;
  const routing = { ...positive(spec.step) ? { step: spec.step } : {}, ..."project" in spec ? { project: spec.project } : {} };
  if ("options" in spec) {
    const given = Array.isArray(spec.options) ? spec.options.map(option) : [], options = given.map((o) => o?.label);
    if (!(given.length >= 2 && given.length <= 6 && given.every(Boolean) && new Set(options).size === options.length) || "permission" in spec) return null;
    const q = "q" in spec ? line(spec.q, Q_MAX) : "", lines = given.map((o) => o.line ?? "");
    if (q === null || "guess" in spec && !options.includes(spec.guess) || "plan" in spec && !positive(spec.plan)) return null;
    return { options, ...lines.some(Boolean) ? { lines } : {}, ...q ? { q } : {}, ..."guess" in spec ? { guess: spec.guess } : {}, ...spec.plan ? { plan: spec.plan } : {}, ...routing };
  }
  if (["q", "guess", "plan"].some((key) => key in spec)) return null;
  const rows = Array.isArray(spec.rows) ? spec.rows.map((row) => row && typeof row === "object" && !Object.keys(row).some((key) => key !== "q" && key !== "guess") && label(row.q, ROW_MAX) && [YES, NO].includes(row.guess) ? { q: label(row.q, ROW_MAX), guess: row.guess } : null) : [];
  if (!(rows.length >= 1 && rows.length <= 8 && rows.every(Boolean))) return null;
  if (!("permission" in spec)) return { rows, ...routing };
  const permission = parsePermission(spec.permission);
  return permission && rows.length === 1 ? { rows, ...routing, permission } : null;
}
const choiceWord = (value) => value === true ? l10n("체크", "checked") : value === false ? l10n("체크 안 함", "not checked") : [].concat(value).join(", ");
function contentLines(aim) {
  if (aim.edits) return aim.edits.flatMap((e, i) => [[`${l10n("수정", "Edit")} ${i + 1}`, e.page, "choices-permit-digest"], ["", e.text, "choices-permit-text"]]);
  const f = aim.form;
  return [[l10n("보낼 곳", "Page"), f.page, "choices-permit-digest"], ...f.entries.map((e, i) => [`${l10n("입력", "Entry")} ${i + 1}`, Array.isArray(e) ? e.join(" · ") : e, "choices-permit-text"]), ...f.choices.map((c, i) => [i ? "" : l10n("선택", "Choices"), `${c.group ? `${c.group} › ` : ""}${c.name}: ${choiceWord(c.value)}`]), ...f.files.map((sha256, i) => [i ? "" : l10n("파일 SHA-256", "File SHA-256"), sha256, "choices-permit-digest"]), [l10n("제출 버튼", "Submit button"), f.publish]];
}
function permitBand({ kind, target: aim }) {
  const lines = kind === "send_as_owner" ? [[l10n("받는 곳", "To"), aim.to], ...aim.form || aim.edits ? contentLines(aim) : aim.entries ? [[l10n(`수정 항목 ${aim.entries}개`, `${aim.entries} items`), `SHA-256 ${aim.sha256}`, "choices-permit-digest"]] : [...(aim.attachments ?? []).map((sha256, i) => [i ? "" : l10n("첨부 SHA-256", "Attachment SHA-256"), sha256, "choices-permit-digest"]), [l10n("내용", "Content"), `sha256 ${aim.sha256.slice(0, 12)}`, "choices-permit-digest"]]] : kind === "payment" ? [[l10n("받는 곳", "To"), aim.payee], [l10n("한도", "Up to"), capOf(aim.cap)]] : aim.paths.map((path, i) => [i ? "" : l10n("지울 곳", "Delete"), path]);
  return el("div", { class: "choices-permit", "data-kind": kind }, shield("choices-permit-icon"), el("p", { class: "choices-permit-head" }, el("span", { class: "choices-permit-asks" }, ASKS()), PERMITS[kind]), el("dl", { class: "choices-permit-aim" }, lines.map(([name, value, look]) => [el("dt", {}, name), el("dd", { class: look }, value)])));
}
export function questionState(questions, key, fence) {
  if (!questions) return { state: "off" };
  const found = questions.find(key, fence), record = found.record, id = record?.id != null ? { id: String(record.id) } : {};
  const media = Array.isArray(record?.options) ? { options: record.options } : {};
  if (found.loading) return { state: "loading" };
  if (record?.status === REFUSED) return { state: REFUSED };
  const notes = Array.isArray(record?.notes) && record.notes.length ? { notes: record.notes } : {};
  if (found.waiting || record?.status === "open") return { state: "open", ...id, ...media, ...notes };
  if (record?.status === "answered") return { state: "answered", ...record.answer, at: record.ended_at, ...id, ...media, ...notes };
  if (record?.status === "waiting") return { state: "waiting", ...id, ...media };
  return { state: "closed", ...id, ...media };
}
const themeNow = () => globalThis.document?.documentElement?.dataset?.theme === "dark" ? "dark" : "light";
function shownMedia(served) {
  const items = (Array.isArray(served?.media) ? served.media : []).filter((m) => m && typeof m.url === "string" && m.url);
  return items.filter((m) => !m.theme || !items.some((n) => n.theme && n.theme !== m.theme) || m.theme === themeNow());
}
const soundsOf = (served) => shownMedia(served).filter((m) => m.kind === "audio");
function mediaTiles(node, served, caption) {
  const items = shownMedia(served).filter((m) => m.kind !== "audio");
  if (!items.length) return null;
  const tiles = items.map((m) => {
    const tile = el("button", { type: "button", class: "choices-tile", "aria-label": l10n(`${caption} 크게 보기`, `${caption}, larger`), onclick: async (event) => {
      event.stopPropagation();
      const all = [...node.querySelectorAll(".choices-tile")], at = all.indexOf(tile);
      const { openViewer } = await import("../image-viewer.js");
      openViewer(all.map((each) => each.viewItem), Math.max(0, at), { from: tile.firstChild });
    } }, m.kind === "video" ? el("video", { class: "choices-media", src: m.url, muted: true, playsinline: true, preload: "metadata", "aria-hidden": "true" }) : el("img", { class: "choices-media", src: m.url, alt: "", loading: "lazy", decoding: "async", draggable: "false" }));
    tile.viewItem = { src: m.url, kind: m.kind === "video" ? "video" : "image", poster: "", caption };
    return tile;
  });
  return el("span", { class: "choices-tiles" }, tiles);
}
function unreadable(text2, told) {
  let spec = null;
  try {
    spec = JSON.parse(String(text2 ?? ""));
  } catch {
  }
  const list = spec && typeof spec === "object" && !Array.isArray(spec) ? Array.isArray(spec.rows) ? spec.rows.map((row) => row?.q) : spec.options : null;
  const words = (Array.isArray(list) ? list : []).filter((word) => typeof word === "string" && word.trim()).map((word) => word.trim());
  const line2 = el("p", { class: "choices-unreadable" }, told && words.length ? toldLine() : UNREADABLE());
  return words.length ? [el("ul", { class: "choices-plain" }, words.map((word) => el("li", {}, word))), line2] : [line2];
}
export function mountChoices(node, { text: text2, key, fence = 0, questions = null, subscribe = null, island = mountIsland, choice: given = null }, owner) {
  const choice = given ?? parseChoices(text2);
  if (!choice) {
    node.append(...unreadable(text2, questions?.tells));
    return node;
  }
  if (choice.step) node.dataset.step = String(choice.step);
  let sending = null, drawn = "";
  const notesOk = !!questions?.notes;
  const repaint = () => {
    drawn = "";
    paint();
  };
  const showNotes = (sent, now, rowsOf = null) => {
    sent.hidden = !now.notes?.length;
    sent.replaceChildren(...(now.notes ?? []).map((n) => el("p", { class: "choices-said" }, el("span", { class: "choices-said-label" }, `${l10n("코멘트", "Comment")} ${clock(n.at)}`.trim()), [...rowsOf ? (n.comments ?? []).map((c, i) => c ? `${rowsOf[i].q}: ${c}` : "").filter(Boolean) : [], ...n.comment ? [n.comment] : []].join(" · "))));
  };
  const error = el("p", { class: "choices-error", role: "alert", style: { "color": "var(--muted)", "margin": ".4em 0" } });
  const derived = () => {
    const now = questionState(questions, key, fence);
    if (now.id) node.dataset.question = now.id;
    else delete node.dataset.question;
    return now;
  };
  const note = (now) => now.state === "answered" ? now.denied ? `${DENIED()} · ${clock(now.at)}` : `${ANSWERED()} ${clock(now.at)}`.trim() : now.state === "open" && now.notes?.length ? `${`${l10n("코멘트 보냄", "Comment sent")} ${clock(now.notes.at(-1).at)}`.trim()} · ${PICK_WAITS()}` : now.state === "closed" ? CLOSED() : now.state === "waiting" ? WAITING() : now.state === "off" ? OFF() : "";
  const go = async (body, sent = () => {
  }) => {
    if (!questions || sending || derived().state !== "open") return;
    error.textContent = "";
    sending = body;
    paint();
    node.querySelector(".choices")?.focus?.({ preventScroll: true });
    let result;
    try {
      result = await questions.answer(key, fence, body);
    } catch {
      result = { ok: false };
    }
    if (owner?.signal?.aborted) return;
    sending = null;
    if (!result?.ok) error.textContent = result?.line || l10n("전송하지 못했어요", "Couldn't send");
    else sent();
    paint();
  };
  const tick = () => svg("svg", { viewBox: "0 0 24 24", class: "choices-tick", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: TICK }));
  const commentField = (label2, compact = false) => {
    if (choice.comment === false) return { host: el("div", { class: "choices-comment", hidden: true }), said: el("p", { class: "choices-said", hidden: true }), note: "", show() {
    }, clear() {
    } };
    const host = el("div", { class: "choices-comment", hidden: true }), said = el("p", { class: "choices-said", hidden: true });
    let note2 = "", mounted = null, lost = false;
    const close = () => {
      const was = mounted;
      mounted = null;
      void was?.then((field) => field?.unmount());
    };
    owner?.own?.(close);
    return { host, said, get note() {
      return note2;
    }, clear() {
      note2 = "";
      close();
    }, show(value, open, busy) {
      said.hidden = open || !value;
      said.replaceChildren(...said.hidden ? [] : [el("span", { class: "choices-said-label" }, l10n("코멘트", "Comment")), value]);
      host.hidden = !open || lost;
      if (!open) return close();
      const props = { label: label2, compact, value: note2, disabled: busy, onChange: (text3) => {
        const was = !!commentText(note2);
        note2 = text3;
        if (was !== !!commentText(text3)) repaint();
      } };
      if (mounted) return void mounted.then((field) => field?.update(props));
      mounted = island("choices-comment", host, props).catch((error2) => {
        console.error("choices: the comment field did not load", error2);
        lost = true;
        host.hidden = true;
        return null;
      });
    } };
  };
  let paint;
  if (choice.options) {
    const comment = commentField(l10n("코멘트", "Comment")), line2 = el("p", { class: "choices-note" });
    let draftPick = null, served = "";
    const stacked = !!choice.lines?.some(Boolean);
    const buttons = choice.options.map((option2, i) => control(option2, { class: "choices-opt", "aria-pressed": "false", onclick: () => {
      if (sending === null && derived().state === "open") {
        draftPick = i;
        paint();
      }
    } }));
    const send = control(SEND(), { class: "choices-send", onclick: () => {
      const words = commentText(comment.note);
      if (draftPick !== null) go({ picks: [choice.options[draftPick]], ...words ? { comment: words } : {} });
      else if (notesOk && words) go({ picks: [], comment: words }, () => comment.clear());
    } });
    const foot = el("div", { class: "choices-foot" }, comment.host, send), sent = el("div", { class: "choices-sent", hidden: true });
    buttons.forEach((button, i) => {
      if (choice.guess === choice.options[i]) button.firstChild.after(el("span", { class: "choices-rec" }, RECOMMENDED()));
      if (choice.lines?.[i]) button.append(el("span", { class: "choices-line" }, choice.lines[i]));
    });
    const tiles = choice.options.map(() => el("span", { class: "choices-tiles-at", hidden: true }));
    const soundsAt = choice.options.map(() => el("span", { class: "choices-sound-at", hidden: true }));
    let players = [];
    const unplay = () => {
      for (const player of players) void player.then((mounted) => mounted?.unmount());
      players = [];
    };
    owner?.own?.(unplay);
    const group = el("div", { class: "choices choices-options", role: "group", tabindex: "-1", "data-n": choice.options.length, ...stacked ? { "data-stack": "" } : {}, style: { "--n": String(choice.options.length) } }, buttons.map((button, i) => [button, soundsAt[i], tiles[i]]), sent, foot, comment.said);
    node.append(...choice.q ? [el("p", { class: "choices-ask" }, choice.q)] : [], group, line2, error);
    paint = () => {
      const now = derived(), sign = JSON.stringify([now, sending, draftPick, commentText(comment.note) !== ""]);
      if (sign === drawn) return;
      drawn = sign;
      showNotes(sent, now);
      const open = now.state === "open", picked = open ? draftPick : now.state === "answered" ? choice.options.indexOf(now.picks?.[0]) : -1;
      const media = JSON.stringify(now.options?.map((o) => shownMedia(o).map((m) => m.url)) ?? []);
      if (media !== served) {
        served = media;
        const drawnTiles = choice.options.map((option2, i) => mediaTiles(group, now.options?.[i], option2));
        tiles.forEach((holder, i) => {
          holder.replaceChildren(...drawnTiles[i] ? [drawnTiles[i]] : []);
          holder.hidden = !drawnTiles[i];
        });
        unplay();
        const heard = choice.options.map((option2, i) => soundsOf(now.options?.[i])), sounding = heard.some((list) => list.length);
        soundsAt.forEach((holder, i) => {
          holder.hidden = !sounding;
          holder.replaceChildren(...heard[i].map((m) => {
            const host = el("span", { class: "choices-sound" }), name = String(m.path ?? "").split("/").pop() || l10n(`${choice.options[i]} 소리`, `${choice.options[i]} sound`);
            players.push(island("audio-player", host, { src: m.url, name, compact: true }).catch((error2) => {
              console.error("choices: the sound player did not load", error2);
              host.remove();
              return null;
            }));
            return host;
          }));
        });
        if (drawnTiles.some(Boolean) || sounding) group.dataset.stack = "";
        else if (!stacked) delete group.dataset.stack;
      }
      group.dataset.state = now.state;
      if (open && picked !== null) group.dataset.picked = "";
      else delete group.dataset.picked;
      comment.show(now.comment, open, sending !== null);
      foot.hidden = !open;
      send.disabled = sending !== null || draftPick === null && !(notesOk && commentText(comment.note));
      line2.textContent = note(now);
      line2.hidden = !line2.textContent;
      buttons.forEach((button, i) => {
        button.disabled = !open || sending !== null;
        button.setAttribute("aria-pressed", String(picked === i));
        button.querySelector(".choices-tick")?.remove();
        if (picked === i) button.firstChild.after(tick());
      });
    };
  } else {
    const permit = choice.permission && questions?.authorizes ? permitBand(choice.permission) : null;
    const decided = (now) => `${now.picks?.[0] === YES ? APPROVED() : DENIED()} · ${clock(now.at)}`, decides = !!permit || !!choice.decides;
    const elsewhere = choice.approveHere === false ? l10n("휴대폰에서 승인할 수 있어요.", "Approve this on your paired phone.") : "";
    const picks = choice.rows.map(() => null), guessed = choice.rows.every((row) => row.guess != null);
    const rows = choice.rows.map((row, i) => {
      const comment2 = commentField(l10n(`${row.q} 코멘트`, `${row.q} comment`), true);
      const rec = el("span", { class: "choices-rec" }, `${RECOMMENDED()} ${say(row.guess)}`), marks = el("span", { class: "choices-changed" }, CHANGED());
      const toggles = (choice.approveHere === false ? [NO] : [YES, NO]).map((value) => control(say(value), { class: "choices-v", "data-value": value, "aria-pressed": "false", onclick: () => {
        if (derived().state === "open" && sending === null) {
          picks[i] = value;
          drawn = "";
          paint();
        }
      } }));
      return { rec, marks, toggles, comment: comment2, node: el("div", { class: "choices-row" }, el("span", { class: "choices-q" }, row.q, rec, marks), comment2.host, el("span", { class: "choices-yn", role: "group", "aria-label": row.q }, toggles), comment2.said) };
    });
    const comment = commentField(l10n("전체 코멘트", "Comment on all"));
    const state = el("span", { class: "choices-state", "aria-live": "polite" });
    const worded = () => rows.some((row) => commentText(row.comment.note)) || !!commentText(comment.note);
    const send = control(SEND(), { class: "choices-send", onclick: () => {
      const notes = rows.map((row) => commentText(row.comment.note)), whole = commentText(comment.note);
      const words = { ...notes.some(Boolean) ? { comments: notes } : {}, ...whole ? { comment: whole } : {} };
      if (!picks.includes(null)) go({ picks: [...picks], ...words });
      else if (notesOk && worded()) go({ picks: [], ...words }, () => {
        rows.forEach((row) => row.comment.clear());
        comment.clear();
      });
    } });
    const sent = el("div", { class: "choices-sent", hidden: true });
    node.append(el("div", { class: "choices choices-rows", role: "group", tabindex: "-1", ...permit ? { "data-permit": choice.permission.kind } : {} }, permit, rows.map((row) => row.node), comment.host, comment.said, sent, el("div", { class: "choices-foot" }, state, send)), error);
    paint = () => {
      const now = derived(), open = now.state === "open";
      const shown2 = open ? picks : now.state === "answered" ? now.picks ?? null : null, sign = JSON.stringify([now, shown2, sending, worded()]);
      if (sign === drawn) return;
      drawn = sign;
      showNotes(sent, now, choice.rows);
      node.firstChild.dataset.state = now.state;
      rows.forEach((row, i) => {
        row.comment.show(now.comments?.[i], open, sending !== null);
        row.marks.hidden = !shown2?.[i] || choice.rows[i].guess == null || shown2[i] === choice.rows[i].guess;
        row.rec.hidden = !open || choice.rows[i].guess == null || !row.marks.hidden;
        row.toggles.forEach((toggle) => {
          toggle.disabled = !open || sending !== null;
          toggle.setAttribute("aria-pressed", String(shown2?.[i] === toggle.dataset.value));
        });
      });
      comment.show(now.comment, open, sending !== null);
      const complete = !!shown2 && !shown2.includes(null), changed = complete && guessed ? shown2.filter((pick, i) => pick !== choice.rows[i].guess).length : 0;
      state.textContent = open ? complete && guessed ? changed ? l10n(`${changed}개 ${CHANGED()}`, `${changed} ${CHANGED()}`) : say(SAME) : note(now) || elsewhere : decides && now.state === "answered" ? decided(now) : note(now);
      if (decides) node.firstChild.dataset.verdict = now.state === "answered" ? now.picks?.[0] === YES ? "approved" : "denied" : "";
      send.hidden = !open;
      send.disabled = sending !== null || picks.includes(null) && !(notesOk && worded());
    };
  }
  const drawQuestion = paint;
  paint = () => {
    if (derived().state !== REFUSED) return drawQuestion();
    if (!node.querySelector(".choices-unreadable")) node.replaceChildren(...unreadable(text2, questions?.tells));
  };
  paint();
  for (const off of [questions?.subscribe(() => paint()), subscribe?.(() => paint())]) if (off) owner?.own?.(off);
  return node;
}
