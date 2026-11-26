import { esc, when, time, date, weekday, plainLines } from "./boards/format.js";
import { iconHTML, iconButtonHTML } from "./boards/icons.js";
import { hostName } from "./pc-data.js";
import { completedRequests, completedDays } from "./completed-items.js";
import { zoneName, withZone } from "./zone.js";
export const FILTERS = [["all", "All"], ["done", "Done"], ["dropped", "Dropped"]];
export const statusWord = (item) => item.status === "dropped" ? "Dropped" : "Done";
export function filtersHTML(counts, filter) {
  return '<div class="lib-filters" role="group" aria-label="Goal status">' + FILTERS.map(([value, label]) => '<button type="button" class="lib-ctl lib-filter" data-filter="' + value + '" aria-pressed="' + (filter === value) + '"><span class="lib-lbl">' + label + ' <span class="lib-n lib-n-' + value + '">' + esc(counts[value]) + "</span></span></button>").join("") + '</div><small class="lib-order">' + ["Newest", zoneName()].filter(Boolean).join(" · ") + "</small>";
}
export function recordTableHTML(rows, { selected = null, projects = new Map() } = {}) {
  return completedDays(rows).map((day) => '<section class="cp-day" data-lane="day:' + day.key + '"><h3><time datetime="' + day.key + '">' + date(day.at) + "</time><span>" + weekday(day.at) + "</span></h3>" + day.items.map((g) => {
    const open = selected === g.goal_id;
    return '<article class="cp-record" data-lane="record:' + g.goal_id + '"' + (open ? " data-open" : "") + '><button type="button" class="cp-row" data-goal="' + g.goal_id + '" aria-expanded="' + open + '" aria-controls="cp-detail-' + g.goal_id + '"><span class="cp-main"><span class="cp-title">' + esc(g.title || "Untitled") + '</span><span class="cp-preview"><span>#' + g.goal_id + "</span> " + esc(g.result?.split("\n").find((s) => s.trim()) || "No result recorded") + '</span></span><span class="cp-state" data-state="' + g.status + '">' + (g.status === "dropped" ? "Dropped" : "Done") + '</span><time datetime="' + esc(g.done_at) + '">' + time(g.done_at) + '</time><span class="cp-chevron" aria-hidden="true">' + iconHTML("expand") + "</span></button>" + (open ? '<div class="cp-detail" id="cp-detail-' + g.goal_id + '">' + recordDocHTML(g, projects.get(g.goal_id), { head: false }) + "</div>" : "") + "</article>";
  }).join("") + "</section>").join("");
}
export function loadHTML({ loaded, total, next, busy, error }) {
  return '<div class="lib-load"><span class="lib-num">' + loaded + " / " + esc(total) + "</span>" + (busy ? '<span class="lib-load-state" role="status">Loading…</span>' : error ? '<span class="lib-bad" role="status">Couldn’t load more</span>' : "") + (next ? iconButtonHTML(error && !busy ? "retry" : "more", error && !busy ? "Retry" : "Load more", { attrs: 'data-act="more"' + (busy ? " disabled" : "") }) : "") + "</div>";
}
const marker = (r) => ["attach", "merge"].includes(r.how) ? '<span class="lib-ask-mark" title="' + (r.how === "merge" ? "Merged request" : "Attached request") + '">+</span>' : "";
export function askHTML(r) {
  return '<div class="lib-ask" data-lane="completed-ask:' + esc(r.id ?? "") + '"><p class="lib-ask-meta"><span class="lib-ask-id lib-num">' + marker(r) + "R" + esc(r.id ?? "—") + "</span><time" + (r.at ? ' datetime="' + esc(r.at) + '"' : "") + ">" + when(r.at) + '</time></p><div class="lib-ask-bubble">' + (plainLines(r.request_text) || "<p>No request text</p>") + "</div></div>";
}
export function projectHTML(project) {
  return '<details class="lib-proj" data-lane="completed-project:' + esc(project.id) + '"><summary class="lib-ctl"><span class="lib-proj-title lib-lbl">' + esc(project.title || "Untitled") + '</span><span class="lib-proj-meta"><span class="lib-num">#' + esc(project.id) + "</span><span>" + esc(hostName(project.host) || "—") + "</span><span>" + (project.closed_at ? "Closed " + when(project.closed_at) : "Not closed") + '</span></span><span class="lib-chev" aria-hidden="true">' + iconHTML("expand") + '</span></summary><div class="lib-proj-body">' + (plainLines(project.result) || "<p>No result recorded</p>") + "</div></details>";
}
export function recordDocHTML(item, projects, { head = true } = {}) {
  const dropped = item.status === "dropped", asks = completedRequests(item);
  const asksHead = Array.isArray(item.requests) ? 'Requests <span class="lib-sec-count">' + asks.length + "</span>" : 'Request <span class="lib-sec-count">#' + esc(item.request_id ?? "—") + "</span>";
  return '<article class="lib-doc lib-rec" data-lane="completed-document:' + esc(item.goal_id) + '" data-goal="' + esc(item.goal_id) + '">' + (head ? '<header class="lib-doc-head"><p class="lib-meta"><span class="' + (dropped ? "lib-bad" : "lib-done") + '">' + statusWord(item) + '</span><span class="lib-num">#' + esc(item.goal_id) + '</span><time datetime="' + esc(item.done_at) + '">' + withZone(when(item.done_at)) + '</time></p><h1 tabindex="-1">' + esc(item.title || "Untitled") + "</h1></header>" : '<p class="lib-meta"><time datetime="' + esc(item.done_at) + '">' + withZone(when(item.done_at)) + "</time></p>") + '<section class="lib-rec-sec" data-sec="result"><h2 class="lib-sec-h">' + (dropped ? "Reason" : "Result") + '</h2><div class="lib-rec-text">' + (plainLines(item.result) || '<p class="lib-muted">No result recorded</p>') + '</div></section><section class="lib-rec-sec" data-sec="asks"><h2 class="lib-sec-h">' + asksHead + "</h2>" + (asks.length ? '<div class="lib-asks">' + asks.map(askHTML).join("") + "</div>" : '<p class="lib-muted">No requests recorded</p>') + '</section><section class="lib-rec-sec" data-sec="projects"><h2 class="lib-sec-h">Projects <span class="lib-sec-count">' + (projects ? projects.length : "—") + "</span></h2>" + (projects?.length ? '<div class="lib-projs">' + projects.map(projectHTML).join("") + "</div>" : '<p class="lib-muted">' + (projects ? "No linked projects" : "No project record") + "</p>") + "</section></article>";
}
export function recordMissingHTML(id) {
  return '<article class="lib-doc lib-rec" data-lane="completed-missing:' + esc(id) + '"><header class="lib-doc-head"><p class="lib-meta"><span class="lib-num">#' + esc(id) + '</span></p><h1 tabindex="-1">Record not found</h1></header><p class="lib-muted">This goal isn’t in the loaded records.</p></article>';
}
export function pagerHTML({ position, of, canPrev, canNext }) {
  return '<nav class="lib-pager" aria-label="Goals">' + iconButtonHTML("prev", "Previous goal", { attrs: 'data-act="prev"' + (canPrev ? "" : " disabled") }) + '<span class="lib-pager-at lib-num">' + (position >= 0 ? position + 1 : "—") + " <span>/ " + esc(of) + "</span></span>" + iconButtonHTML("next", "Next goal", { attrs: 'data-act="next"' + (canNext ? "" : " disabled") }) + "</nav>";
}
