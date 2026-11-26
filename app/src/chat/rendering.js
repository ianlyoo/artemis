import { mountIsland } from "../islands/island.js";
export function mountRendering(host, name, props, own) {
  let current = props, mounted = null, gone = false;
  let fallback;
  if (name === "render-code") {
    const pre = document.createElement("pre");
    fallback = document.createElement("code");
    pre.append(fallback);
    host.replaceChildren(pre);
  } else fallback = host;
  fallback.textContent = props.code ?? props.value ?? "";
  const ready = mountIsland(name, host, current).then((handle2) => {
    if (gone) {
      handle2.unmount();
      return;
    }
    mounted = handle2;
    mounted.update(current);
  }).catch(() => {
    if (!gone) host.setAttribute("data-render-error", name);
  });
  const handle = { ready, update(next) {
    current = { ...current, ...next };
    if (mounted) mounted.update(current);
    else fallback.textContent = current.code ?? current.value ?? "";
  }, destroy() {
    gone = true;
    mounted?.unmount();
  } };
  own?.(() => handle.destroy());
  return handle;
}
export function mountCode(host, { text = "", lang = "", loading = false }, own) {
  return mountRendering(host, "render-code", { code: text, infostring: lang, loading }, own);
}
export function mountMath(host, { value = "", inline = false }, own) {
  return mountRendering(host, "render-math", { value, inline }, own);
}
export function mountMermaid(host, { code = "", loading = false }, own) {
  return mountRendering(host, "render-mermaid", { code, loading }, own);
}
export function mountFence(host, props, own) {
  return String(props.lang ?? "").toLowerCase() === "mermaid" ? mountMermaid(host, { code: props.text, loading: props.loading }, own) : mountCode(host, props, own);
}
