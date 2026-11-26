import { esc } from "../mobile/format.js";
import { stepHref, stepLink } from "../step-route.js";
import { markStepDone, onOwnerTurn, stepState } from "../owner-steps.js";
import { loadStyles } from "../chat/entry.js";
import { l10n } from "../names.js";
const FINAL = { get cleared() {
  return l10n("완료함", "Done");
}, get expired() {
  return l10n("만료됨", "Expired");
}, get withdrawn() {
  return l10n("철회됨", "Withdrawn");
} };
const label = (text) => '<span class="control-label">' + esc(text) + "</span>";
export function stepHTML(id, row, state = {}) {
  if (!row) return '<p class="choices-unreadable">' + esc(l10n("할 일 #" + id + "를 찾을 수 없어요", "To-do #" + id + " is not here")) + "</p>";
  const status = row.status === "live" && state.done ? "cleared" : row.status, live = status === "live";
  const href = live ? stepHref(id, stepLink(row.link)) : null;
  const go = href ? '<a class="text-control choices-v step-go" href="' + esc(href) + '">' + label(l10n("열기", "Open")) + "</a>" : "";
  const foot = live ? (state.error ? '<span class="choices-state" data-error role="alert">' + esc(state.error) + "</span>" : '<span class="choices-state">' + l10n("내 차례", "My turn") + "</span>") + '<button type="button" class="text-control choices-send" data-step-done="' + esc(id) + '"' + (state.pending ? ' disabled aria-busy="true"' : "") + ">" + label(l10n("완료", "Done")) + "</button>" : '<span class="choices-state">' + esc(FINAL[status] ?? status) + "</span>";
  return '<div class="choices step-q" data-step-id="' + esc(id) + '"><div class="choices-rows" data-state="' + (live ? "open" : status === "cleared" ? "answered" : "closed") + '"><div class="choices-row"><span class="choices-q">' + esc(row.text) + "</span>" + (go ? '<span class="choices-yn">' + go + "</span>" : "") + '</div><div class="choices-foot">' + foot + "</div></div></div>";
}
export function mountStep(node, id, { api }) {
  let gone = false, row = null, version = 0, read = false, drawn = "";
  const host = document.createElement("div");
  host.className = node.closest?.(".chat") ? "step-host" : "chat step-host";
  node.replaceChildren(host);
  const paint = () => {
    if (gone || !read) return;
    const html = stepHTML(id, row, stepState(id));
    if (html !== drawn) host.innerHTML = drawn = html;
  };
  async function refresh() {
    const current = ++version;
    try {
      const response = await api("/db/read?kind=owner_steps&id=" + id);
      const body = response.ok ? await response.json() : null;
      if (gone || current !== version) return;
      row = body?.item ?? null;
    } catch {
      if (gone || current !== version) return;
      row = null;
    }
    read = true;
    paint();
  }
  const unhear = onOwnerTurn(paint);
  const click = async (event) => {
    if (event.target.closest?.("[data-step-done]") && row?.status === "live") {
      await markStepDone(api, id);
      await refresh();
    }
  };
  node.addEventListener("click", click);
  void loadStyles().then(refresh);
  return { refresh, destroy() {
    gone = true;
    unhear();
    node.removeEventListener("click", click);
  } };
}
