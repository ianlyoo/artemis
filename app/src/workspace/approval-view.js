import { createApprovals, approvalTitle, approvalLineHTML, approvalDetailHTML } from "../approvals.js";
import { createApprovalCards } from "../chat/approval-card.js";
import { loadStyles } from "../chat/entry.js";
import { feed } from "../chat/feed.js";
export function approvalView(node, id, { api, changed = () => {
} } = {}) {
  id = String(id);
  let gone = false;
  const ui = createApprovals(api, () => paint());
  void loadStyles();
  const head = document.createElement("div"), ask = document.createElement("div"), detail = document.createElement("div");
  ask.className = "chat ide-approval-ask" + (document.documentElement.dataset.layout === "phone" ? " chat-phone" : "");
  node.replaceChildren(head, ask, detail);
  const asks = createApprovalCards({ api, more: false });
  asks.frame(feed.dashboard?.dashboard);
  asks.attach(ask, "#/approvals/" + id, null, { placed: true });
  const unhear = feed.onDashboard?.((payload) => asks.frame(payload?.dashboard)) ?? (() => {
  });
  function paint() {
    if (gone) return;
    const state = ui.state(id);
    head.innerHTML = approvalLineHTML(state.card ?? { id });
    detail.innerHTML = approvalDetailHTML(state.card ?? { id }, state);
    changed(state);
  }
  return { ui, ready: ui.open(id), title: () => {
    const card = ui.state(id).card;
    return card ? approvalTitle(card).text : "Approval #" + id;
  }, reload() {
    return ui.reload(id);
  }, destroy() {
    gone = true;
    unhear();
    asks.destroy();
  } };
}
