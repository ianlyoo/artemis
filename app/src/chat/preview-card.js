import { mountIsland } from "../islands/island.js";
import { followList, minutesSince, previewList, previewOf, readList } from "../workspace/preview-list.js";
export const LINES = Object.freeze({ island: "미리보기 카드를 표시하지 못했어요." });
export function since(at, now = Date.now()) {
  const minutes = minutesSince(at, now);
  return minutes < 1 ? "방금" : minutes < 60 ? `${minutes}분째` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분째`;
}
export function mountPreviewCard(node, { api, id, open = () => false, phone = false, island = mountIsland }, owner) {
  let drawn = null, gone = false;
  const host = document.createElement("div");
  host.setAttribute("class", "preview-card");
  node.append(host);
  const props = () => {
    const list = previewList(), preview = previewOf(id);
    const phase = preview ? "live" : list.state === "ready" ? "stopped" : list.state === "failed" ? "failed" : "loading";
    return { phase, preview, started: preview ? since(preview.startedAt) : "", phone, onOpen: () => open({ kind: "preview", id }, { from: "card" }), onReload: () => void readList(api) };
  };
  const paint = () => {
    if (!gone) drawn?.update(props());
  };
  const stop = followList(api, node, paint);
  island("preview-card", host, props()).then((mounted) => {
    if (gone) {
      mounted.unmount();
      return;
    }
    drawn = mounted;
    paint();
  }, () => {
    if (!gone) host.replaceChildren(Object.assign(document.createElement("p"), { className: "preview-card-problem", textContent: LINES.island }));
  });
  const destroy = () => {
    gone = true;
    stop();
    drawn?.unmount();
    drawn = null;
    host.remove();
  };
  owner?.own?.(destroy);
  return { node, destroy };
}
