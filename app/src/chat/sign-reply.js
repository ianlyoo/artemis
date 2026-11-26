import { el, scope } from "../boards/dom.js";
import { signSlot } from "../boards/sign.js";
export const KEEP = 6;
const kept = new Map();
export function chatTarget({ agentId = null, key }) {
  const named = agentId ? { agentId } : {};
  return { post: "/chat/sign", names: { ...named, key }, gone: "이 서명 칸을 찾을 수 없어요", async read(api, slot2, signal) {
    const result = await api("/chat/sign?" + new URLSearchParams({ key, slot: slot2, ...named }), { signal });
    if (result.status === 401) return { login: true };
    if (result.status === 404) return { gone: true };
    if (!result.ok) return {};
    const body = await result.json().catch(() => null);
    return body?.block?.type === "sign" && body.block.slot === slot2 ? { block: body.block } : {};
  } };
}
export function signReply(segment, node, owner, { api, agentId = null, draw = signSlot }) {
  if (typeof segment?.reply !== "string" || !segment.reply) {
    node.append(el("p", { class: "bv-sign-loading" }, "지난 대화의 서명 칸이라 여기서는 열 수 없어요"));
    return node;
  }
  const id = JSON.stringify([agentId ?? "", segment.reply, segment.slot, segment.sha256]);
  let entry = kept.get(id);
  if (entry) {
    kept.delete(id);
    kept.set(id, entry);
    void entry.again();
  } else {
    entry = slot(id, segment.slot, chatTarget({ agentId, key: segment.reply }), { api, draw });
    kept.set(id, entry);
  }
  entry.holder = owner;
  node.append(entry.host);
  owner.own(() => {
    if (entry.holder !== owner) return;
    entry.holder = null;
    entry.host.remove();
    if (entry.host.querySelector(".bv-sign")?.dataset.state !== "open") drop(entry);
    else trim();
  });
  return node;
}
function slot(id, name, target, { api, draw }) {
  const life = scope(), host = el("div", { class: "chat-sign" });
  const entry = { id, host, life, holder: null, refresh: null };
  const env = { api, signal: life.signal, own: (fn) => life.own(fn), signTo: target };
  async function load() {
    host.replaceChildren(el("p", { class: "bv-sign-loading" }, "서류를 불러오는 중…"));
    let read = {};
    try {
      read = await target.read(api, name, life.signal);
    } catch {
    }
    if (life.signal.aborted) return;
    if (read.login) {
      location.assign("/login");
      return;
    }
    if (read.block) {
      host.replaceChildren();
      entry.refresh = draw(read.block, host, env);
      return;
    }
    host.replaceChildren(read.gone ? el("p", { class: "bv-sign-problem" }, target.gone) : el("p", { class: "bv-sign-problem" }, "서류를 불러오지 못했어요 ", el("button", { type: "button", class: "bv-sign-again", onclick: load }, "다시 불러오기")));
  }
  entry.again = async () => {
    if (!entry.refresh) {
      if (!host.querySelector(".bv-sign-loading")) return load();
      return;
    }
    try {
      const read = await target.read(api, name, life.signal);
      if (read.block && !life.signal.aborted) entry.refresh(read.block);
    } catch {
    }
  };
  void load();
  return entry;
}
function drop(entry) {
  if (kept.get(entry.id) === entry) kept.delete(entry.id);
  entry.life.destroy();
}
function trim() {
  const unseen = [...kept.values()].filter((entry) => !entry.holder);
  for (const entry of unseen.slice(0, Math.max(0, unseen.length - KEEP))) drop(entry);
}
export const keptSlots = () => kept.size;
