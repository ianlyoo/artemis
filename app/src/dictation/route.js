import { el } from "../boards/dom.js";
import { mountIsland } from "../islands/island.js";
import { onDeviceAnswer, readTakes, sendTake, sessionId, startTake } from "./take.js";
import { leadKo } from "../names.js";
const named = (text) => text.replace(/\{lead(?::([^}]+))?\}/g, (_, particle) => leadKo(particle));
export function mountDictationRoute() {
  const host = el("div");
  const root = el("main", { style: { position: "fixed", inset: "0", "z-index": "1000", overflow: "auto", background: "var(--ground)" } }, host);
  const siblings = [...document.body.children].filter((n) => n instanceof HTMLElement && !["SCRIPT", "LINK"].includes(n.tagName));
  const inert = siblings.map((n) => [n, n.inert]);
  for (const [n] of inert) n.inert = true;
  const title = document.title;
  document.title = "받아쓰기 채점 · Artemis";
  document.body.append(root);
  let island = null, gone = false;
  const session = sessionId();
  mountIsland("dictation-scoring", host, { session, onDevice: onDeviceAnswer(), startTake, sendTake, readTakes, named }).then((mounted) => {
    if (gone) mounted.unmount();
    else island = mounted;
  }).catch((err) => {
    console.error("Home dictation:", err);
    host.textContent = `받아쓰기 채점 화면을 열지 못했습니다: ${err.message}`;
  });
  return () => {
    gone = true;
    island?.unmount();
    root.remove();
    for (const [n, value] of inert) n.inert = value;
    document.title = title;
  };
}
