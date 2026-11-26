import { createStudioEntry } from "./studio.js";
import { el } from "../boards/dom.js";
import { feed } from "./feed.js";
import { createAgentPicker } from "./agent-picker.js";
import { SECRETARY, findAgent } from "./agents.js";
import { mountThread } from "./chat.js";
import { mountMeeting } from "./meeting-view.js";
import { mountCqo } from "./cqo-view.js";
import { CQO } from "./cqo.js";
import { isMeetingKey, meetingKey } from "./meetings.js";
import { onAnchor, peekAnchor, takeAnchor } from "../routing.js";
import { has } from "../names.js";
export async function mountCompanyChat(container, options) {
  const agents = feed.agents, views = new Map();
  let gone = false, selected = null, preferred = options.selectedAgent;
  if (peekAnchor()?.kind === "meeting") preferred = meetingKey(takeAnchor().id);
  const phone = options.layout === "phone";
  const studio = has("studio") ? createStudioEntry({ agents, select: async (...args) => {
    if (phone) picker.close();
    await select(...args);
  }, onOpen: () => {
    if (phone) picker.close();
  }, restoreFocus: phone ? () => picker.button.focus({ preventScroll: true }) : null }) : null;
  const picker = createAgentPicker({ agents, phone, select, studio });
  options.agentTitle.replaceChildren(el("div", { class: "studio-agent-bar" }, picker.node, studio?.node));
  container.replaceChildren();
  const off = agents.subscribe(() => {
    for (const [id, view] of views) if (!agents.has(id)) {
      view.disposed = true;
      view.unmount?.();
      view.host.remove();
      views.delete(id);
    }
    const entry = agents.get(selected);
    if (entry) container.setAttribute("aria-label", "Conversation with " + entry.agent.displayName);
    if (agents.error) preferred = null;
    const current = agents.get(agents.selected);
    if (!gone && current && selected !== current.key) void select(current.key, { activate: false });
  });
  async function select(id, { remember = true, activate = true, focus = false } = {}) {
    const entry = agents.get(id);
    if (!entry || gone) return;
    id = entry.key;
    selected = id;
    if (remember) {
      preferred = null;
      options.rememberAgent?.(entry.agent.pinned === "secretary" ? SECRETARY : entry.agent.id);
    }
    for (const [key2, view2] of views) {
      if (key2 !== id && !view2.host.hidden) view2.unmount?.park?.();
      view2.host.hidden = key2 !== id;
      view2.unmount?.visibility?.();
    }
    let view = views.get(id);
    if (!view) {
      view = { host: el("div", { class: "g151-thread" }), unmount: null };
      views.set(id, view);
      container.append(view.host);
      view.ready = (entry.record ? mountCqo : entry.meeting ? mountMeeting : mountThread)(view.host, { ...options, agentEntry: entry, active: () => !gone && selected === id, head: (node) => {
        view.head = node;
        if (selected === id) options.head?.(node);
      } }).then((unmount) => {
        view.unmount = unmount;
        if (gone || view.disposed) unmount();
        else {
          view.host.hidden = selected !== id;
          unmount.visibility?.();
        }
      });
    } else if (view.head) options.head?.(view.head);
    if (activate) void agents.select(id);
    await view.ready;
    if (!gone && selected === id && focus) view.unmount?.focus?.();
    if (!gone && selected === id) options.onAgent?.(entry.agent, view.host);
  }
  const ready = select(agents.lead.key, { remember: false });
  void agents.refreshRoster().then(async () => {
    if (gone || agents.error) return;
    if ((isMeetingKey(preferred) || preferred === CQO) && !findAgent(agents.roster, preferred)) {
      await (preferred === CQO ? agents.refreshThread(CQO) : agents.refreshMeetings());
      if (gone || agents.get(agents.selected) !== agents.lead) return;
    }
    const initial = findAgent(agents.roster, preferred);
    preferred = null;
    if (initial) void select(initial.id);
    else void agents.refreshThread(agents.selected);
  });
  async function meetingPlace() {
    const held = peekAnchor();
    if (gone || held?.kind !== "meeting") return;
    takeAnchor();
    const id = meetingKey(held.id);
    if (!agents.get(id)) await agents.refreshMeetings();
    if (!gone && agents.get(id)) await select(id);
  }
  const unanchor = onAnchor(() => void meetingPlace());
  await ready;
  const key = (event) => {
    if (gone || !container.getClientRects().length) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "k" && (container.contains(event.target) || options.agentTitle.contains(event.target))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.button.click();
    }
  };
  document.addEventListener("keydown", key, true);
  return function unmount() {
    gone = true;
    off();
    unanchor();
    picker.destroy();
    studio?.destroy();
    document.removeEventListener("keydown", key, true);
    for (const view of views.values()) {
      view.unmount?.();
      view.host.remove();
    }
  };
}
