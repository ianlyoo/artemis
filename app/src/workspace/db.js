import { el } from "../boards/dom.js";
import { registerKind } from "./extensions.js";
import { stylesheet } from "./core.js";
import { homeApi, getJSON } from "./api.js";
import { feed } from "../chat/feed.js";
import { mountIsland } from "../islands/island.js";
import { MEETINGS, MEETING_STATUS, TARGET, meetingPath, recapPath, threadKey, LEAD_THREAD } from "./db-model.js";
import { meetingKey, meetingRow } from "../chat/meetings.js";
import { lead, leadRole, ledgerName, ledgerRef } from "../names.js";
export function mountDb({ api = homeApi, open = () => {
}, touch = false, now = () => Date.now(), agents = feed.agents, leave = null } = {}) {
  void stylesheet("db.css");
  const host = el("div", { class: "db-island" });
  const tools = touch ? null : el("span", { class: "db-ide" });
  const node = el("div", { class: "db" + (touch ? " is-touch" : "") }, host, tools);
  const handle = {};
  const chatOf = (thread) => threadKey(thread, leadRole()) === LEAD_THREAD ? agents?.lead?.key ?? null : agents?.get?.(thread?.agent_id)?.key ?? null;
  const chat = { get lead() {
    return lead();
  }, get role() {
    return leadRole();
  }, can: (thread) => !!chatOf(thread), open: (thread) => {
    const key = chatOf(thread);
    if (!key) return;
    void agents.select(key);
    leave?.();
  } };
  const meetings = { list: (signal) => getJSON(api, MEETINGS, { signal }), read: (id, signal) => getJSON(api, meetingPath(id), { signal }), word: (meeting) => MEETING_STATUS[meeting.status] ?? meeting.status, at: (meeting) => meetingRow(meeting).lastActivityAt, can: (meeting) => !!agents?.roster?.some((a) => a.id === meetingKey(meeting.id)), open: (meeting) => {
    void agents.select(meetingKey(meeting.id));
    leave?.();
  } };
  const props = { recap: (asked, signal) => getJSON(api, recapPath(asked), { signal }), meetings, open, chat, touch, now, handle, ledger: { name: ledgerName(), ref: ledgerRef() } };
  let island = null, gone = false, sized = null;
  const ready = mountIsland("db", host, props).then((mounted) => {
    if (gone) {
      mounted.unmount();
      return;
    }
    island = mounted;
    if (tools) {
      sized = new ResizeObserver(() => island?.update({ tools: Math.ceil(tools.getBoundingClientRect().width) }));
      sized.observe(tools);
    }
  }, () => {
    if (!gone) host.replaceChildren(el("p", { class: "db-failed" }, "The DB view didn't load. Reload Home to try again."));
  });
  return { node, controls: tools, focus: () => void ready.then(() => handle.focus?.()), dispose: () => {
    gone = true;
    sized?.disconnect();
    island?.unmount();
    island = null;
  } };
}
let focusNext = false;
export function showDb(open) {
  focusNext = true;
  return open({ ...TARGET });
}
registerKind("db", { key: () => "db:search", toTarget: (raw) => raw?.kind === "db" ? { ...TARGET } : null, label: () => "DB", title: () => "DB: chat recap", kept: true, render: ({ open }) => {
  const view = mountDb({ open: (target) => open(target) });
  if (focusNext) {
    focusNext = false;
    requestAnimationFrame(() => view.focus());
  }
  return { node: view.node, head: false, controls: view.controls, dispose: () => view.dispose() };
} });
