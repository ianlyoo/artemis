import { el } from "../boards/dom.js";
import { registerKind } from "./extensions.js";
import { mountIsland } from "../islands/island.js";
import { newTerminal } from "./terms.js";
import { homeApi, postJSON } from "./api.js";
import { feed } from "../chat/feed.js";
import { leadKo } from "../names.js";
export const LEARNING = "/learning";
export const TARGET = Object.freeze({ kind: "learn", id: "board" });
export const TUTOR_WAIT_MS = 12e4;
async function answer(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${response.status}`);
  return body;
}
export const loadLearning = ({ fetch: get = globalThis.fetch } = {}) => get(LEARNING, { cache: "no-store" }).then(answer);
export const sendLearning = (action, body, { fetch: post = globalThis.fetch } = {}) => post(`${LEARNING}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(answer);
export const tutorOf = (agents) => agents?.roster?.find?.((agent) => agent?.pinned === "tutor") ?? null;
export async function openTutor({ agents = feed.agents, start = () => sendLearning("tutor", {}), wait = TUTOR_WAIT_MS, every = 3e3, signal } = {}) {
  let row = tutorOf(agents);
  if (!row) {
    await start();
    signal?.throwIfAborted();
    row = await new Promise((resolve, reject) => {
      const done = (fn, value) => {
        off();
        clearInterval(poll);
        clearTimeout(limit);
        signal?.removeEventListener("abort", gone);
        fn(value);
      };
      const gone = () => done(reject, signal.reason);
      const off = agents.subscribe(() => {
        const found = tutorOf(agents);
        if (found) done(resolve, found);
      });
      const poll = setInterval(() => void agents.refreshRoster?.(), every);
      const limit = setTimeout(() => done(reject, new Error("tutor_timeout")), wait);
      signal?.addEventListener("abort", gone, { once: true });
      void agents.refreshRoster?.();
    });
  }
  signal?.throwIfAborted();
  await agents.select(row.id);
  return row;
}
export function mountLearning({ api = homeApi, open = () => {
}, leave = () => {
}, agents = feed.agents } = {}) {
  const host = el("div", { class: "learn-island" });
  const node = el("section", { class: "learn", "aria-label": "Learn", style: { flex: "1", "min-height": "0", overflow: "auto", "overscroll-behavior": "contain" } }, host);
  const life = new AbortController();
  let island = null, gone = false;
  const toLead = async (text, id) => {
    const sent = await postJSON(api, "/chat/send", { id, text, sentAt: (new Date()).toISOString() });
    if (!sent.ok || !sent.body?.ok) throw new Error(sent.body?.error ?? (sent.status ? `HTTP ${sent.status}` : "offline"));
  };
  const openLead = () => {
    if (agents.lead) void agents.select(agents.lead.key);
    leave();
  };
  const askTutor = async () => {
    await openTutor({ agents, signal: life.signal });
    leave();
  };
  const openLab = async (slug) => {
    const opened = await newTerminal({ api, cwd: `work/learning-labs/${slug}` });
    if (!opened.ok) throw Object.assign(new Error(opened.line), { code: opened.error });
    await open({ kind: "terminal", id: opened.terminal.id });
  };
  mountIsland("learning", host, { load: () => loadLearning(), send: (action, body) => sendLearning(action, body), toLead, openLead, openLab, askTutor, lead: leadKo() }).then((mounted) => {
    if (gone) mounted.unmount();
    else island = mounted;
  }).catch((err) => {
    console.error("Home learning:", err);
    if (!gone) host.replaceChildren(el("p", { class: "learn-failed" }, "Learn didn't load. Reload Home to try again."));
  });
  return { node, dispose() {
    gone = true;
    life.abort();
    island?.unmount();
    island = null;
  } };
}
export const showLearn = (open) => open({ ...TARGET });
const headings = (node) => [...node.querySelectorAll("h1, h2")].map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim(), el: h }));
registerKind("learn", { key: () => "learn:board", toTarget: (raw) => raw?.kind === "learn" ? { ...TARGET } : null, label: () => "Learn", title: () => "Learn: cards, sparring, labs", kept: true, render: ({ api, open, changed }) => {
  const view = mountLearning({ api, open: (target) => open(target) });
  let said = "";
  const watch = new MutationObserver(() => {
    const now = headings(view.node).map((h) => h.text).join("\n");
    if (now !== said) {
      said = now;
      changed();
    }
  });
  watch.observe(view.node, { childList: true, subtree: true, characterData: true });
  return { node: view.node, head: false, get outline() {
    return headings(view.node);
  }, dispose: () => {
    watch.disconnect();
    view.dispose();
  } };
} });
