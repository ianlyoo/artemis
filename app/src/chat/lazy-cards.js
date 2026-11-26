export function lazyApprovalCards(options, load = () => import("./approval-card.js")) {
  let cards = null, loading = null, dashboard = null, gone = false;
  const waiting = new Map();
  function ensure() {
    return loading ??= load().then(async ({ createApprovalCards, styled }) => {
      if (gone) return;
      const made = createApprovalCards(options), given = dashboard;
      if (given) made.frame(given);
      await Promise.all([styled?.(), made.settled?.()]);
      if (gone) {
        made.destroy?.();
        return;
      }
      cards = made;
      if (dashboard !== given) cards.frame(dashboard);
      for (const [node, [text, key, how]] of waiting) cards.attach(node, text, key, how);
      waiting.clear();
    }).catch((err) => {
      loading = null;
      console.error("Chat cards:", String(err?.message || err));
    });
  }
  return { attach(node, text, key, how) {
    if (cards) return cards.attach(node, text, key, how);
    if (!String(text ?? "").includes("approval")) {
      waiting.delete(node);
      return;
    }
    waiting.set(node, [text, key, how]);
    void ensure();
  }, detach(node) {
    if (cards) cards.detach(node);
    else waiting.delete(node);
  }, frame(next) {
    if (cards) cards.frame(next);
    else if (next && typeof next === "object") dashboard = next;
  }, destroy() {
    gone = true;
    waiting.clear();
    cards?.destroy();
  }, ready: ensure };
}
