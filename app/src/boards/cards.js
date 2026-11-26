import { el, scope } from "./dom.js";
import { mountChoices } from "../chat/choices.js";
import { answerQuestion, notYetLine } from "../chat/questions.js";
import { loadStyles } from "../chat/entry.js";
import { still } from "../motion-gate.js";
const isChoices = (block) => block?.type === "code" && block.lang === "choices";
export const cardKey = (block, blocks) => block?.type === "step" ? "\nstep\nstep:" + block.step : isChoices(block) ? "\nchoices\n" + boardFence(block, blocks) + "\n" + block.text : null;
export function boardFence(block, blocks) {
  let n = 0;
  for (const each of Array.isArray(blocks) ? blocks : []) {
    if (isChoices(each)) n++;
    if (each === block || block?.id != null && each?.id === block.id) return isChoices(each) ? n : 0;
  }
  return 0;
}
function questionStore(api) {
  const placed = new Map(), listeners = new Set();
  const changed = () => {
    for (const fn of [...listeners]) fn();
  };
  const at = (path, fence) => path + "\n" + fence;
  const put = (path, fence, record) => {
    if (path == null || !(Number(fence) > 0) || record?.id == null) return false;
    const key = at(path, Number(fence)), was = placed.get(key);
    if (was && String(was.id) !== String(record.id) && Number(was.id) > Number(record.id)) return false;
    const next = { ...String(was?.id) === String(record.id) ? was : {}, ...record };
    if (JSON.stringify(next) === JSON.stringify(was)) return false;
    placed.set(key, next);
    return true;
  };
  const find = (path, fence) => placed.get(at(path, fence)) ?? null;
  const read = (board) => {
    let any = false;
    for (const entry of Array.isArray(board?.questions) ? board.questions : []) any = put(board.path, entry?.board_fence, entry) || any;
    if (any) changed();
  };
  const known = (id) => [...placed.entries()].find(([, record]) => String(record.id) === String(id))?.[0];
  const take = (items) => {
    let any = false;
    for (const record of Array.isArray(items) ? items : []) {
      const key = known(record?.id), [path, fence] = key ? key.split("\n") : [record?.action?.board, record?.board_fence];
      if (path != null) any = put(path, fence, record) || any;
    }
    if (any) changed();
  };
  const questions = (path, fence) => ({ find: () => {
    const record = find(path, fence);
    return record ? { record } : { loading: true };
  }, async answer(key, n, body) {
    const record = find(path, fence);
    if (record?.status !== "open") return record ? { ok: true, record } : { ok: false, line: notYetLine() };
    const sent = await answerQuestion(api, record.id, body);
    if (!sent.ok) return sent;
    const { status, answer, ended_at, notes } = sent.reply;
    if (put(path, fence, { ...record, status, answer, ended_at, notes })) changed();
    return { ok: true, record: find(path, fence) };
  }, subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, authorizes: true, tells: true, notes: true });
  return { find, read, take, questions, subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  } };
}
export function questionCard(node, block, { path = null, fence = 0, store = null, phone = false, island } = {}, owner) {
  const host = el("div", { class: "chat bv-question" + (phone ? " chat-phone" : "") });
  if (path != null && fence) {
    host.dataset.board = path;
    host.dataset.boardFence = String(fence);
  }
  node.replaceChildren(host);
  void loadStyles();
  let drawn = null, live = null;
  const draw = () => {
    const record = store?.find(path, fence) ?? null;
    if (drawn && live === !!record) return;
    drawn?.destroy();
    drawn = scope(owner?.signal);
    live = !!record;
    host.replaceChildren();
    mountChoices(host, { text: block.text, key: path ?? "", fence, questions: record ? store.questions(path, fence) : null, island }, drawn);
  };
  draw();
  if (store) owner?.own(store.subscribe(draw));
  owner?.own(() => drawn?.destroy());
  return host;
}
const REVEAL_MS = 15e3;
let wanted = null;
export function revealQuestion(path, fence, now = Date.now()) {
  wanted = { path: String(path), fence: String(fence), until: now + REVEAL_MS };
  seekQuestion();
}
export function seekQuestion(doc = globalThis.document) {
  if (!wanted || !doc) return false;
  if (Date.now() > wanted.until) {
    wanted = null;
    return false;
  }
  const shown = [...doc.querySelectorAll(".bv-question[data-board]")].find((node) => node.dataset.board === wanted.path && node.dataset.boardFence === wanted.fence && (typeof node.getClientRects !== "function" || node.getClientRects().length > 0));
  if (!shown) return false;
  wanted = null;
  shown.scrollIntoView?.({ block: "center", behavior: still() ? "auto" : "smooth" });
  shown.querySelector(".choices")?.focus?.({ preventScroll: true });
  return true;
}
export function boardCards({ api, frames = () => import("../chat/feed.js").then((module) => module.feed), island } = {}) {
  const steps = new Map(), asked = new Set(), store = questionStore(api);
  let gone = false, unhear = () => {
  }, lastEvent, reading = null;
  const waiting = () => [...asked].some(({ path, fence }) => {
    const record = store.find(path, fence);
    return !record || record.status === "open";
  });
  const readList = () => reading ??= (async () => {
    try {
      const response = await api("/questions");
      const body = response.ok ? await response.json() : null;
      if (!gone) store.take(body?.items);
    } catch {
    } finally {
      reading = null;
    }
  })();
  Promise.resolve().then(frames).then((feed) => {
    if (gone || !feed) return;
    lastEvent = feed.dashboard?.dashboard?.last_event_id;
    unhear = feed.onDashboard?.((payload) => {
      for (const step of steps.values()) step.refresh();
      const event = payload?.dashboard?.last_event_id;
      if (event === void 0 || event === lastEvent) return;
      lastEvent = event;
      if (waiting()) void readList();
    }) ?? unhear;
  }).catch(() => {
  });
  return { read: (board) => store.read(board), attach(block, node, owner, env = {}) {
    if (isChoices(block)) {
      const path = env.board?.path ?? null, fence = boardFence(block, env.board?.blocks), place = { path, fence };
      store.read(env.board);
      questionCard(node, block, { path, fence, store, phone: !!env.phone, island }, owner);
      if (path != null && fence) {
        asked.add(place);
        owner.own(() => asked.delete(place));
      }
      globalThis.requestAnimationFrame?.(() => seekQuestion());
      return true;
    }
    if (block?.type !== "step" || !/^[1-9]\d{0,11}$/.test(String(block.step ?? ""))) return false;
    let active = true, renderer;
    const step = { refresh: () => renderer?.refresh(), destroy: () => {
      active = false;
      renderer?.destroy();
    } };
    steps.set(node, step);
    import("./step-card.js").then(({ mountStep }) => {
      if (active) renderer = mountStep(node, block.step, { api });
    });
    owner.own(() => {
      steps.delete(node);
      step.destroy();
    });
    return true;
  }, destroy() {
    gone = true;
    unhear();
    for (const step of steps.values()) step.destroy();
    steps.clear();
  } };
}
