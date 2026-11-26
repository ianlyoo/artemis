import { el } from "../boards/dom.js";
import { registerSection, registerKind } from "./extensions.js";
import { row } from "./explorer.js";
import { stylesheet } from "./core.js";
import { mountIsland } from "../islands/island.js";
import { PREVIEW_ID, followList, minutesSince, previewList, previewOf, readList } from "./preview-list.js";
export const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
export const SIZES = [{ id: "390", w: 390, h: 844 }, { id: "1920", w: 1920, h: 1080 }];
const SIZE = Object.fromEntries(SIZES.map((size) => [size.id, size]));
export const STOPPED = "This preview stopped. When an agent starts it again, a new card in the chat says so.";
export const NONE = "No preview running";
export function since(at, now = Date.now()) {
  const minutes = minutesSince(at, now);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export const previewTarget = (raw) => raw && PREVIEW_ID.test(String(raw.id)) ? { kind: "preview", id: String(raw.id) } : null;
export const frameSrc = (preview) => preview.origin + "/";
const sizes = new Map();
let following = null;
function section({ open, api, refresh }) {
  const now = previewList();
  following?.();
  const rows = now.state === "ready" && now.previews.length ? now.previews.map((p) => row({ name: p.title || p.id, note: since(p.startedAt), target: { kind: "preview", id: p.id }, title: `${p.title || p.id} · ${p.agent} · ${p.origin}`, onClick: () => void open({ kind: "preview", id: p.id }) })) : [el("p", { class: "ex-quiet" }, now.state === "failed" ? "Couldn't read the previews" : now.state === "ready" ? NONE : "Loading…")];
  following = followList(api, rows[0], () => refresh());
  return rows;
}
async function view({ target, api, signal }) {
  void stylesheet("preview.css");
  const id = target.id;
  if (previewList().state !== "ready") await readList(api);
  let preview = previewOf(id), size = sizes.get(id) ?? "1920", scale = 100, frame = null, bar = null, gone = false;
  const holder = el("div", { class: "pv-frame" }), box = el("div", { class: "pv-box" }, holder);
  const line = el("p", { class: "pv-line", role: "status", hidden: true });
  const stage = el("div", { class: "pv-stage" }, box, line);
  const barHost = el("div", { class: "pv-bar" }), controls = el("span", { class: "pv-controls" });
  const node = el("div", { class: "pv", "data-preview": id }, el("div", { class: "pv-head" }, barHost, controls), stage);
  const refused = (event) => {
    if (preview && event.effectiveDirective === "frame-src" && String(event.blockedURI).startsWith(preview.origin)) showLine("Home's page policy doesn't let it frame this preview (frame-src)");
  };
  document.addEventListener("securitypolicyviolation", refused);
  function showLine(text) {
    line.textContent = text;
    line.hidden = !text;
    box.hidden = !!text;
  }
  function make() {
    if (!preview) return;
    const made = el("iframe", { sandbox: SANDBOX, src: frameSrc(preview), title: `Live preview ${preview.title || id}`, allow: "clipboard-write; fullscreen", referrerpolicy: "no-referrer" });
    holder.replaceChildren(made);
    frame = made;
  }
  function fit() {
    const want = SIZE[size], room = stage.getBoundingClientRect(), pad = 24;
    scale = room.width > 0 && room.height > 0 ? Math.min(1, (room.width - pad) / want.w, (room.height - pad) / want.h) : 1;
    holder.style.width = want.w + "px";
    holder.style.height = want.h + "px";
    holder.style.transform = `scale(${scale})`;
    box.style.width = Math.round(want.w * scale) + "px";
    box.style.height = Math.round(want.h * scale) + "px";
    node.dataset.size = size;
    paint();
  }
  const state = () => preview ? "live" : previewList().state === "failed" ? "failed" : "stopped";
  function paint() {
    bar?.update({ state: state(), preview, size, scale: Math.round(scale * 100), session: preview?.session ? since(preview.session.startedAt) : "" });
  }
  function setSize(next) {
    if (!SIZE[next]) return;
    size = next;
    sizes.set(id, next);
    fit();
  }
  const stop = followList(api, node, () => {
    const now = previewOf(id), was = preview;
    preview = now;
    if (!now && was) {
      frame?.remove();
      frame = null;
      showLine(STOPPED);
    } else if (now && (!was || was.origin !== now.origin)) {
      showLine("");
      make();
    }
    paint();
  });
  const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  watcher?.observe(stage);
  mountIsland("preview-bar", barHost, { state: state(), preview, size, scale: 100, onSize: setSize, onReload: make }).then((mounted) => {
    if (gone) {
      mounted.unmount();
      return;
    }
    bar = mounted;
    paint();
  }, () => {
    barHost.textContent = preview ? `작업 중 · 검수 전 · ${preview.title || id}` : STOPPED;
  });
  if (preview) make();
  else showLine(previewList().state === "failed" ? "Couldn't read the previews" : STOPPED);
  fit();
  const dispose = () => {
    gone = true;
    stop();
    document.removeEventListener("securitypolicyviolation", refused);
    watcher?.disconnect();
    bar?.unmount();
    bar = null;
    frame?.remove();
    frame = null;
  };
  signal?.addEventListener("abort", dispose, { once: true });
  return { node, head: false, outline: [], controls, tools: false, refresh() {
    if (preview?.reload === "watch") make();
  }, dispose };
}
export const undo = [registerSection({ id: "previews", title: "Previews", glyph: "screen", order: 11, render: section, count: () => previewList().state === "ready" && previewList().previews.length ? previewList().previews.length : null }), registerKind("preview", { key: (target) => target.id, toTarget: previewTarget, label: (target) => previewOf(target.id)?.title || `Preview ${target.id}`, title: (target) => {
  const p = previewOf(target.id);
  return p ? `Live preview · ${p.title} · ${p.agent}` : `Live preview ${target.id}`;
}, crumbs: (target) => ["Previews", previewOf(target.id)?.title || target.id], watch: (target) => "preview:" + target.id, kept: true, render: view })];
export function resetPreviewSizes() {
  sizes.clear();
}
