import { el } from "../boards/dom.js";
import { l10n } from "../names.js";
export async function saveDownload(api, path, name, expected, progress = null) {
  const result = await api(path, expected ? { expected } : void 0);
  if (!result.ok) throw new Error((await result.json?.().catch(() => null))?.error ?? "download_failed");
  const url = URL.createObjectURL(progress ? await counted(result, progress) : await result.blob());
  const link = el("a", { href: url, download: servedName(result.headers?.get("content-disposition")) ?? name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 6e4);
}
export async function counted(result, progress) {
  const total = Number(result.headers?.get("content-length"));
  if (!(total > 0) || !result.body?.getReader) return result.blob();
  const reader = result.body.getReader();
  const parts = [];
  let got = 0, told = -1;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.byteLength;
    const now = Math.floor(got / total * 100);
    if (now !== told) {
      told = now;
      progress(Math.min(1, got / total));
    }
  }
  return new Blob(parts, { type: result.headers.get("content-type") ?? "" });
}
export function servedName(disposition) {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "");
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
    }
  }
  return /filename="([^"]*)"/i.exec(disposition ?? "")?.[1] || null;
}
export function fileDownload(api, path, name) {
  const button = el("button", { type: "button", class: "bv-button pane-download" }, el("span", { "aria-hidden": "true" }, "↓"), l10n("다운로드", "Download"));
  const status = el("span", { role: "status" });
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "";
    try {
      await saveDownload(api, path, name);
    } catch {
      status.textContent = l10n("다운로드하지 못했습니다.", "Didn't download.");
    } finally {
      button.disabled = false;
    }
  });
  return el("div", { class: "pane-download-row" }, button, status);
}
