import { createChatStore } from "./store.js";
import { createAgents } from "./agents.js";
import { getDesk } from "../desk-notify.js";
import { quietReads } from "./quiet-reads.js";
import { statusLabels } from "./visual-labels.js";
import { setOwnerFrame } from "../owner-steps.js";
import { applySettings } from "../names.js";
const homeApi = async (path, init) => (await import("/client.js")).api(path, init);
export function createFeed({ api = homeApi } = {}) {
  const store = createChatStore({ api: (path, init) => agents.leadApi(path, init), company: true, ownerCards: true, ledger: true });
  const agents = createAgents({ api, leadStore: store }), dashboards = new Set();
  let last = null;
  return { agents, store, get dashboard() {
    return last;
  }, frame(frame) {
    if (frame?.kind === "home.settings") {
      applySettings(frame.payload);
      return true;
    }
    if (frame?.kind === "chat.notices") {
      store.setNotices(frame.payload?.notices);
      return true;
    }
    if (frame?.kind === "status.labels") {
      statusLabels(frame.payload);
      return true;
    }
    if (frame?.kind === "desk.notice") {
      try {
        getDesk().notice(frame.payload);
      } catch (error) {
        console.error(error);
      }
      return true;
    }
    const chat = typeof frame?.kind === "string" && frame.kind.startsWith("chat.");
    if (chat && !frame.kind.startsWith("chat.agent.") && !["chat.message", "chat.roster", "chat.queue"].includes(frame.kind)) store.handle(frame);
    agents.frame(frame ?? {});
    if (frame?.kind === "dashboard" && frame.payload?.ok !== false) {
      last = frame.payload;
      setOwnerFrame(frame.payload?.dashboard);
      store.addNotifications(frame.payload?.dashboard?.notifications);
      void store.refreshOwnerCards();
    }
    if (frame?.kind === "dashboard" && frame.payload?.ok !== false) for (const listener of [...dashboards]) {
      try {
        listener(frame.payload);
      } catch (error) {
        console.error(error);
      }
    }
    return chat;
  }, onDashboard(listener) {
    dashboards.add(listener);
    return () => dashboards.delete(listener);
  }, connection(up) {
    store.connection(up);
    agents.connection(up);
  }, refresh() {
    agents.refresh();
  } };
}
export const feed = createFeed({ api: quietReads(homeApi) });
