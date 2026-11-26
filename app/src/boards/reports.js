import { rememberCardBoardTitles } from "../card-md.js";
import { esc, when, time, date, weekday, byDay, dayKey } from "./format.js";
import { shortId, textOriginal } from "./dom.js";
import { unwall, withZone } from "../zone.js";
import { iconHTML, iconButtonHTML } from "./icons.js";
import { byMonth, kindName, itemDay } from "../workspace/archive.js";
export const headingText = (value) => String(value ?? "").replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
export const sourceName = (source) => String(source?.path || "").split("/").pop();
export function boardListing(canvas) {
  if (!Array.isArray(canvas?.boards)) return null;
  return { rev: canvas.rev ?? null, active_id: Object.hasOwn(canvas, "active_id") ? canvas.active_id : canvas.active?.id ?? null, boards: canvas.boards };
}
export const BOARD_SLICES = { published: (listing) => listing.boards, newest: (listing) => listing.boards };
export const boardSlice = (listing, name) => listing ? BOARD_SLICES[name](listing) : [];
const bodies = /* @__PURE__ */ new WeakMap();
export async function catalogBody(api, path, kind, key) {
  const page = globalThis.document ?? api;
  let state = bodies.get(page);
  if (!state) bodies.set(page, state = { items: /* @__PURE__ */ new Map(), reading: null });
  state.reading ??= (async () => {
    try {
      const response = await api("/ide/catalog?archived=1");
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  })().finally(() => {
    state.reading = null;
  });
  const catalog = await state.reading, id = kind + ":" + key;
  if (catalog?.schema_version !== 1 || !Array.isArray(catalog.boards) || !Array.isArray(catalog.reports)) {
    state.items.clear();
    return api(path);
  }
  rememberCardBoardTitles(catalog.boards);
  const rows = new Map([...catalog.boards, ...catalog.reports].map((row2) => [row2.id, row2]));
  for (const [held, value] of state.items) if (rows.get(held)?.visibility_revision !== value.revision) state.items.delete(held);
  const row = rows.get(id);
  if (row?.archived || !row && kind === "board") {
    state.items.delete(id);
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }
  if (!row) return api(path);
  let kept = state.items.get(id);
  if (kept?.file) {
    kept.retired = true;
    state.items.delete(id);
    kept = void 0;
  }
  if (!kept) {
    kept = { revision: row.visibility_revision, response: api(path).then(async (result2) => {
      if (!result2.ok && state.items.get(id) === kept) state.items.delete(id);
      const text = await result2.text();
      if (kind === "board" && result2.ok) try {
        kept.file = !!JSON.parse(text)?.source;
      } catch {
      }
      return { text, status: result2.status, headers: result2.headers };
    }).catch((error) => {
      if (state.items.get(id) === kept) state.items.delete(id);
      throw error;
    }) };
    state.items.set(id, kept);
  }
  const result = await kept.response;
  if (result.status === 200 && state.items.get(id) !== kept && !kept.retired) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  return new Response(result.text, { status: result.status, headers: result.headers });
}
export const RECENT_SHOWN = 8;
const targetKey = (target) => target.kind === "file" ? "file:" + target.path : "board:" + target.id;
export function recentSlice({ reports = [], boards = [], seen = [], limit = RECENT_SHOWN } = {}) {
  const newer = [...reports.map((report) => ({ target: { kind: "file", path: report.path }, at: report.mtime })), ...boards.map((board) => ({ target: { kind: "board", id: board.id }, at: board.updatedAt }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const picked = /* @__PURE__ */ new Map();
  for (const target of [...seen.filter((target2) => target2.kind === "file" || target2.kind === "board" && boards.some((board) => board.id === target2.id)), ...newer.map((item) => item.target)]) {
    if (picked.size >= limit) break;
    if (!picked.has(targetKey(target))) picked.set(targetKey(target), target);
  }
  return [...picked.values()];
}
const DAILY_ID = /^daily-(\d{4}-\d\d-\d\d)$/;
export function reportDay(board) {
  const file = String(board?.id || "").match(DAILY_ID) || sourceName(board?.source).match(/^(\d{4}-\d\d-\d\d)\.md$/);
  if (file) return file[1];
  const title = String(board?.title || "").match(/^\s*(\d{1,2})\/(\d{1,2})(?!\d)/), year = dayKey(board?.updatedAt).slice(0, 4);
  return title && year ? year + "-" + title[1].padStart(2, "0") + "-" + title[2].padStart(2, "0") : dayKey(board?.updatedAt);
}
export const REPORT_DUE = "10:00";
export const isMorningReport = (board) => DAILY_ID.test(board?.id || "") || /아침 보고/.test(board?.title || "") || /\/daily\/\d{4}-\d\d-\d\d\.md$/.test(board?.source?.path || "");
export function lateReportHTML(boards, now = Date.now()) {
  const reports = (boards || []).filter(isMorningReport);
  if (!reports.length || time(now) < REPORT_DUE || reports.some((b) => reportDay(b) === dayKey(now))) return "";
  return '<p class="lib-note is-late" role="status">No report for today (' + date(now) + ") yet · due " + withZone(REPORT_DUE) + "</p>";
}
export function reportDayHTML(board, now = Date.now()) {
  const day = reportDay(board), at = day ? unwall(Date.parse(day + "T12:00:00Z")) : NaN;
  if (!Number.isFinite(at)) return "";
  const ago = Math.round((unwall(Date.parse(dayKey(now) + "T12:00:00Z")) - at) / 864e5);
  return '<span class="lib-report-day"><time datetime="' + esc(day) + '">' + date(at) + " " + esc(weekday(at)) + "</time>" + (ago === 0 ? " (Today)" : ago === 1 ? " (Yesterday)" : "") + "</span>";
}
export const boardSummaries = (canvas) => boardSlice(boardListing(canvas), "published");
export const matches = (board, filter) => !filter || ((board.title || "") + " " + board.id).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
export function boardRowHTML(board, { open = false, live = false, i = 0 } = {}) {
  const title = board.title || "Untitled";
  return '<a class="lib-ctl lib-row' + (open ? " is-open" : "") + '" role="listitem" href="#/boards/' + encodeURIComponent(board.id) + '" data-board-id="' + esc(board.id) + '"' + (open ? ' aria-current="page"' : "") + ' title="' + esc(title + "\n" + board.id + "\n" + withZone(when(board.updatedAt))) + '" style="--i:' + i + '"><span class="lib-row-title lib-lbl">' + esc(title) + '</span><time class="lib-row-time" datetime="' + esc(board.updatedAt || "") + '">' + (live ? when(board.updatedAt) : time(board.updatedAt)) + '</time><span class="lib-row-id lib-mono">' + esc(shortId(board.id)) + "</span></a>";
}
export function boardListHTML(canvas, { openId = null, filter = "", state = "", found = false, now = Date.now() } = {}) {
  if (!canvas) return state === "failed" ? '<p class="lib-note is-bad" role="status">Couldn’t load the list ' + iconButtonHTML("retry", "Retry", { attrs: 'data-act="list-retry"' }) + "</p>" : '<p class="lib-note is-wait" role="status">Loading…</p>';
  const listing = boardListing(canvas), all = boardSlice(listing, "published"), activeId = listing?.active_id, shown = all.filter((b) => matches(b, filter));
  if (!shown.length) return found ? "" : '<p class="lib-note" role="status">' + (all.length ? "No match" : "No reports yet") + "</p>";
  let i = 0;
  const row = (b) => boardRowHTML(b, { open: b.id === openId, live: b.id === activeId, i: i++ });
  const live = shown.find((b) => b.id === activeId), rest = shown.filter((b) => b !== live);
  return (filter.trim() ? "" : lateReportHTML(all, now)) + (live ? '<section class="lib-group is-live"><h3 class="lib-day"><span class="lib-live">Published</span></h3>' + row(live) + "</section>" : "") + byDay(rest, (b) => b.updatedAt).map((g) => '<section class="lib-group"><h3 class="lib-day"><time datetime="' + esc(g.key) + '">' + date(g.at) + "</time><span>" + esc(weekday(g.at)) + "</span></h3>" + g.items.map(row).join("") + "</section>").join("");
}
export const ARCHIVED = "archive:", ARCHIVE_SHOWN = 12;
const foldHTML = (key, depth, name, count, open, attrs) => '<button type="button" class="lib-ctl lib-fold" ' + attrs + ' data-depth="' + depth + '" data-board-id="folder:' + esc(key) + '" aria-expanded="' + open + '"><span class="lib-lbl">' + iconHTML("expand") + name + '</span><span class="lib-fold-n lib-num">' + esc(count) + "</span></button>";
export function archivedRowHTML(item, { open = false, i = 0 } = {}) {
  const id = ARCHIVED + item.id, kind = kindName(item);
  return '<a class="lib-ctl lib-row is-archived' + (open ? " is-open" : "") + '" role="listitem" href="#/boards/' + encodeURIComponent(id) + '" data-board-id="' + esc(id) + '"' + (open ? ' aria-current="page"' : "") + ' title="' + esc(item.title + "\n" + kind + " · " + item.date + "\nArchive · " + item.month) + '" style="--i:' + i + '"><span class="lib-row-title lib-lbl">' + esc(item.title || item.id) + '</span><time class="lib-row-time" datetime="' + esc(item.date) + '">' + esc(itemDay(item)) + '</time><span class="lib-row-id">' + esc(kind) + "</span></a>";
}
export function archiveListHTML(archive, { open = false, months = /* @__PURE__ */ new Set(), more = /* @__PURE__ */ new Set(), filter = "", openId = null } = {}) {
  const items = archive.items.filter((item) => matches(item, filter)), searching = !!filter.trim(), shown = open || searching && items.length > 0;
  const section = (html2) => '<section class="lib-group lib-archive" aria-label="Archive">' + html2 + "</section>";
  let html = foldHTML("archive", 0, "Archive", archive.state === "ready" ? items.length : "—", shown, 'data-act="archive"');
  const note = (text, cls = "") => '<p class="lib-note lib-archive-note' + cls + '" role="status">' + text + "</p>";
  const line = !shown ? "" : archive.state === "failed" ? note("Couldn’t load the archive " + iconButtonHTML("retry", "Retry", { attrs: 'data-act="archive-retry"' }), " is-bad") : archive.state !== "ready" ? note("Loading the archive…") : archive.index === "invalid" ? note("Couldn’t read the archive’s list") : !archive.items.length ? note("Nothing archived yet") : !items.length ? note("No match") : null;
  if (line !== null) return { html: section(html + line), found: false };
  let i = 0;
  for (const { month, items: monthItems } of byMonth(items)) {
    const opened = months.has(month) || searching, whole = more.has(month) || searching;
    html += foldHTML("archive:" + month, 1, '<span class="lib-mono">' + esc(month) + "</span>", monthItems.length, opened, 'data-act="archive-month" data-month="' + esc(month) + '"');
    if (!opened) continue;
    for (const item of whole ? monthItems : monthItems.slice(0, ARCHIVE_SHOWN)) html += archivedRowHTML(item, { open: ARCHIVED + item.id === openId, i: i++ });
    if (!whole && monthItems.length > ARCHIVE_SHOWN) html += '<button type="button" class="lib-ctl lib-fold-more" data-act="archive-more" data-month="' + esc(month) + '" data-board-id="more:' + esc(month) + '"><span class="lib-lbl">' + (monthItems.length - ARCHIVE_SHOWN) + " more</span></button>";
  }
  return { html: section(html), found: true };
}
export const SEARCH_HTML = '<label class="lib-find">' + iconHTML("search") + '<input type="search" placeholder="Search title or ID" aria-label="Search reports" autocomplete="off" spellcheck="false"><span class="lib-find-count lib-num"></span></label>';
export function promotedHeading(board) {
  const first = board?.blocks?.[0];
  return first?.type === "heading" && Number(first.level) === 1 && headingText(first.text).startsWith(headingText(board.title) || "\0") ? first : null;
}
export function boardHeadHTML(board, { activeId = null, notice = "", now = Date.now() } = {}) {
  const promoted = promotedHeading(board);
  return '<p class="lib-meta">' + (board.id === activeId ? '<span class="lib-live">Published</span>' : "<span>Board</span>") + reportDayHTML(board, now) + '<time title="Last updated" datetime="' + esc(board.updatedAt || "") + '">' + when(board.updatedAt) + '</time><span class="lib-mono" title="' + esc(board.id) + '">' + esc(shortId(board.id)) + '</span><span class="lib-notice" role="status" aria-live="polite">' + esc(notice) + '</span></p><h1 tabindex="-1">' + esc(headingText(promoted ? promoted.text : board.title || "Untitled")) + "</h1>";
}
export function archivedHeadHTML(item) {
  const archived = item.archived, promoted = promotedHeading(item);
  return '<p class="lib-meta"><span class="lib-archive-label">Archive · ' + esc(archived.month) + "</span><span>" + esc(kindName(archived)) + ' · <time datetime="' + esc(archived.date) + '">' + esc(archived.date) + '</time></span><span class="lib-readonly">Read-only</span></p><h1 tabindex="-1">' + esc(headingText(promoted ? promoted.text : item.title || "Untitled")) + "</h1>";
}
export function boardWaitHTML(summary, message, { problem = false, retry = false } = {}) {
  return '<header class="lib-doc-head"><p class="lib-meta">' + (summary ? '<time datetime="' + esc(summary.updatedAt || "") + '">' + when(summary.updatedAt) + '</time><span class="lib-mono">' + esc(shortId(summary.id)) + "</span>" : "") + '</p><h1 tabindex="-1">' + esc(summary?.title || "Reports") + '</h1></header><p class="' + (problem ? "lib-problem" : "lib-wait") + '" role="status">' + esc(message) + (retry ? " " + iconButtonHTML("retry", "Retry", { attrs: 'data-act="retry"' }) : "") + "</p>";
}
export function boardToolsHTML(board, { rawOn = false, busy = false } = {}) {
  if (!board) return "";
  const name = sourceName(board.source);
  return (name ? '<p class="lib-rail-file lib-mono" title="' + esc(name) + '">' + esc(name) + "</p>" : "") + '<div class="lib-rail-acts">' + (board.source ? iconButtonHTML("download", "Download original", { tag: "a", attrs: 'href="/canvas/boards/' + encodeURIComponent(board.id) + '/source" data-act="source"' + (busy ? ' aria-disabled="true"' : "") }) : "") + (textOriginal(board.source) ? iconButtonHTML("raw", rawOn ? "Back to the report" : "Raw text", { attrs: 'data-act="raw" aria-pressed="' + rawOn + '"' }) : "") + iconButtonHTML("top", "Back to top", { attrs: 'data-act="top"', cls: "lib-to-top" }) + "</div>";
}
export function rawHeadHTML(name, { status = "", copy = false } = {}) {
  return '<span class="lib-mono lib-raw-name">' + esc(name) + '</span><span class="lib-raw-status" role="status" aria-live="polite">' + esc(status) + "</span>" + (copy ? iconButtonHTML("copy", "Copy text", { attrs: 'data-act="raw-copy"' }) : "");
}
