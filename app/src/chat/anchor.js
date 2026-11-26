import { segmentsOf } from "./segments.js";
import { parseChoices } from "./choices.js";
import { ownSecretId } from "./secret-card.js";
import { itemAway, itemLine } from "../item-route.js";
import { leadKo, l10n } from "../names.js";
export const PAGES = 3, GLOW = 1600;
export const missedLine = () => l10n(`이 항목이 있던 대화를 ${leadKo()} 채팅에서 찾지 못했어요`, `This item's conversation is no longer in the ${leadKo()} chat`);
export function matches(segment, { kind, id } = {}) {
  if (kind === "step") return segment?.type === "step" ? segment.id === String(id) : segment?.type === "choices" && String(parseChoices(segment.text)?.step ?? "") === String(id);
  if (kind === "secret") return segment?.type === "secret" && segment.id === String(id);
  return false;
}
export function findAnchor(items, anchor, questions = null) {
  const list = Array.isArray(items) ? items : [];
  if (anchor?.kind === "notify") return list.find((item) => item.role === "assistant" && item.key === `notify:${anchor.id}`)?.key ?? null;
  if (anchor?.kind === "question") return questions?.where(anchor.id) ?? null;
  if (anchor?.kind === "secret") {
    const own = list.find((item) => item?.savedPin && ownSecretId(item) === String(anchor.id));
    if (own) return own.key;
  }
  const holds = (item) => segmentsOf(item).some((segment) => matches(segment, anchor));
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.role === "assistant" && holds(list[i])) return list[i].key;
  return null;
}
export const anchorSelector = ({ kind, id }) => kind === "notify" ? `[data-key="notify:${id}"]` : kind === "question" ? `[data-segment="choices"][data-question="${id}"]` : kind === "step" ? `[data-segment="choices"][data-step="${id}"], [data-segment="step"][data-step="${id}"]` : `[data-segment="secret"][data-secret="${id}"]`;
export const pinnedSelector = ({ kind, id }) => kind === "secret" ? `.chat-secrets [data-secret="${id}"]` : null;
const glow = (node, wait) => {
  node.classList.remove("is-anchored");
  void node.offsetWidth;
  node.classList.add("is-anchored");
  void wait(GLOW).then(() => node.classList.remove("is-anchored"));
};
export async function seekAnchor(anchor, { store, reveal, root, questions = null, ready = async () => {
}, away = () => false, frame = () => null, state = async () => null, wait = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  if (anchor?.kind === "notify") await store.loadNotification?.(anchor.id);
  if (anchor?.kind === "question") await questions?.load();
  await ready();
  const pinned = pinnedSelector(anchor) && root.querySelector(pinnedSelector(anchor));
  if (pinned) {
    pinned.scrollIntoView?.({ block: "center", behavior: "smooth" });
    glow(pinned.querySelector(".sa") ?? pinned, wait);
    return true;
  }
  let key = findAnchor(store.items, anchor, questions);
  for (let page = 0; !key && page < PAGES; page++) {
    if (!await store.loadOlder()) break;
    key = findAnchor(store.items, anchor, questions);
  }
  if (!key) {
    const to = itemAway(anchor, frame());
    return to ? away(to) !== false : itemLine(anchor, await state(anchor)) ?? false;
  }
  const find = () => root.querySelector(anchorSelector(anchor));
  if (!reveal(key, find)) return false;
  const found = find(), node = found?.querySelector(".choices, .sa") ?? found;
  if (!node) return false;
  glow(node, wait);
  return true;
}
