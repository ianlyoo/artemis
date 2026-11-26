import { el } from "../boards/dom.js";
import { registerKind } from "./extensions.js";
import { stylesheet } from "./core.js";
import { hosts } from "../names.js";
const byId = (id) => hosts().computers.find((computer) => computer.id === id);
const OFF = new Set(["off", "draining"]);
export const OFF_LINE = "꺼져 있어요. 켜면 열 수 있어요";
export const RELAY_LINE = "Tailscale을 켜면 열려요";
export const computerChoices = (rows) => hosts().computers.map(({ id, host }) => {
  const row = (rows ?? []).find((row2) => row2.kind === "host" && row2.key === host);
  return { id, name: row?.label || host, off: host === hosts().main && OFF.has(row?.state) };
});
export function mountComputer(id, name = byId(id)?.host ?? id) {
  void stylesheet("computer.css");
  const path = byId(id)?.path, home = hosts().home;
  const node = el("div", { class: "computer" }), life = new AbortController();
  let frame = null;
  const say = (text) => node.replaceChildren(el("p", { class: "computer-line", role: "status" }, text));
  const show = () => {
    frame = el("iframe", { class: "computer-frame", title: name, allow: id === "pc" ? "fullscreen; clipboard-read; clipboard-write" : "fullscreen", src: path });
    node.replaceChildren(frame);
  };
  if (!path) say(name);
  else if (home && document.documentElement.hasAttribute("data-relay-state")) {
    const retry = () => {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 3e3);
      life.signal.addEventListener("abort", () => timeout.abort(), { once: true });
      fetch(home + path, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: timeout.signal }).then(() => {
        if (life.signal.aborted) return;
        const link = el("a", { href: home + path, target: "_blank", rel: "noopener noreferrer" }, name);
        node.replaceChildren(link);
        link.click();
      }).catch(() => {
        if (life.signal.aborted) return;
        const button = el("button", { type: "button" }, "다시 시도");
        button.addEventListener("click", retry);
        node.replaceChildren(el("p", { class: "computer-line", role: "status" }, RELAY_LINE), button);
      }).finally(() => clearTimeout(timer));
    };
    retry();
  } else fetch(path, { cache: "no-store", signal: life.signal }).then(async (reply) => {
    if (life.signal.aborted) return;
    if (reply.ok && /^text\/html/.test(reply.headers.get("content-type") ?? "")) {
      reply.body?.cancel();
      show();
    } else say((await reply.text()).trim() || String(reply.status));
  }).catch(() => {
    if (!life.signal.aborted) show();
  });
  return { node, dispose() {
    life.abort();
    if (frame) {
      frame.src = "about:blank";
      frame.remove();
    }
  } };
}
registerKind("computer", { key: (target) => "computer:" + target.id, toTarget: (raw) => raw?.kind === "computer" && byId(raw.id) ? { kind: "computer", id: raw.id, ...typeof raw.name === "string" && raw.name ? { name: raw.name } : {} } : null, label: (target) => target.name ?? byId(target.id)?.host ?? target.id, render: ({ target }) => {
  const view = mountComputer(target.id, target.name);
  return { node: view.node, head: false, dispose: view.dispose };
} });
