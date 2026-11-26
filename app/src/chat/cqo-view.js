import { mountIsland } from "../islands/island.js";
import { caseLine } from "./cqo.js";
import { lead } from "../names.js";
export async function mountCqo(container, { layout = "pc", agentEntry: entry, active = () => true } = {}) {
  const record = entry.record;
  let open = null;
  const props = () => ({ phone: layout === "phone", lead: lead(), cases: record.cases, loaded: record.loaded, problem: record.problem, more: record.next !== null, paging: record.paging, open, detail: open === null ? null : record.detail(open) });
  const island = await mountIsland("cqo-record", container, { ...props(), onOpen: (id) => {
    open = id;
    void record.open(id);
    paint();
  }, onBack: () => {
    open = null;
    paint();
  }, onMore: () => void record.more(), onSend: (item, text) => entry.toLead(caseLine(item) + "\n" + text), onLead: () => entry.openLead() });
  const paint = () => island.update(props());
  const off = record.subscribe(paint);
  let shown = false;
  const visible = () => active() && container.isConnected && container.getClientRects().length > 0;
  function check() {
    const now = visible();
    if (now !== shown) {
      shown = now;
      record.watch(now);
    }
  }
  const seen = typeof IntersectionObserver === "function" ? new IntersectionObserver(check) : null;
  seen?.observe(container);
  const panel = container.closest("[data-panel]");
  const toggled = panel && typeof MutationObserver === "function" ? new MutationObserver(check) : null;
  toggled?.observe(panel, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
  check();
  function unmount() {
    off();
    record.watch(false);
    seen?.disconnect();
    toggled?.disconnect();
    island.unmount();
  }
  unmount.visibility = check;
  unmount.park = () => {
    shown = false;
    record.watch(false);
  };
  unmount.focus = () => container.querySelector("button, textarea")?.focus({ preventScroll: true });
  return unmount;
}
