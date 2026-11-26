import { el } from "./boards/dom.js";
import { liveAide } from "./model.js";
import { iconButton } from "./workspace/icons.js";
import { popover } from "./desk-menu.js";
import { feed } from "./chat/feed.js";
import { roleWord } from "./chat/visual-labels.js";
import { time, koElapsed, elapsed } from "./mobile/format.js";
import { l10n } from "./names.js";
const JOB = /^(?:#\d+\s*·\s*)?(보좌관 · (\d+))$/;
export function aidesOf(dashboard) {
  const agents = dashboard?.agents ?? [], today = dashboard?.today ?? [];
  return agents.filter(liveAide).map((a) => {
    const [, name, job] = JOB.exec(String(a.title ?? "").trim()) ?? [];
    const queued = job && today.find((e) => e.kind === "aide.queued" && String(e.id) === job);
    const launcher = a.launcher_role ?? agents.find((p) => p.id === a.parent_id)?.role;
    return { id: a.id, task: queued?.summary || name || a.title || a.id, startedAt: a.created_at, busy: a.busy === true, by: roleWord(launcher) ?? "—" };
  }).sort((x, y) => (Date.parse(y.startedAt) || 0) - (Date.parse(x.startedAt) || 0));
}
export function createAideMenu({ phone = false, source = feed, now = () => Date.now() } = {}) {
  const id = "aide-menu-" + Math.random().toString(36).slice(2, 8);
  const count = el("span", { class: "aide-count", "aria-hidden": "true" });
  const button = iconButton("aide", "Aides", { class: "aide-button", "aria-expanded": "false", "aria-controls": id });
  button.append(count);
  const list = el("div", { class: "aide-items" });
  const panel = el("div", { class: "aide-panel turn-pop " + (phone ? "is-phone" : "desk-pop"), id, role: "region", "aria-label": "Aides", hidden: true }, el("h2", { class: "aide-title" }, l10n("보좌관", "Aides")), list);
  const pop = popover(button, panel);
  function paint(dashboard) {
    const aides = aidesOf(dashboard), at = now();
    count.textContent = aides.length ? String(aides.length) : "";
    button.classList.toggle("is-quiet", !aides.length);
    const label = aides.length ? `Aides · ${aides.length} running` : "Aides";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    list.replaceChildren(...aides.length ? aides.map((aide) => el("div", { class: "aide-row", "data-id": aide.id }, el("p", { class: "aide-task" }, aide.task), el("p", { class: "aide-meta" }, el("span", { class: "aide-state" + (aide.busy ? " is-busy" : "") }, aide.busy ? l10n("일하는 중", "Working") : l10n("대기", "Idle")), el("time", { datetime: aide.startedAt }, l10n(`${time(aide.startedAt)} 시작 · ${koElapsed(aide.startedAt, at)}`, `Started ${time(aide.startedAt)} · ${elapsed(aide.startedAt, at)}`)), el("span", {}, l10n("맡긴 쪽 ", "From ") + aide.by)))) : [el("p", { class: "aide-empty" }, l10n("지금 도는 보좌관이 없어요", "No aides running now"))]);
  }
  const off = source.onDashboard((payload) => paint(payload?.dashboard));
  paint(source.dashboard?.dashboard);
  return { button, panel, destroy() {
    off();
    pop.destroy();
    panel.remove();
    button.remove();
  } };
}
