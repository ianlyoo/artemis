import { fileSize, FILE_LIMITS, FILE_LINES } from "./attach.js";
import { IMAGE_LIMITS } from "./images.js";
export const IMAGE = /^image\/(png|jpeg|webp|gif|heic|heif|avif|bmp)$/i;
export const isImage = (type) => IMAGE.test(String(type ?? ""));
export const tipOf = (name, bytes) => [name, bytes == null ? "" : fileSize(bytes)].filter(Boolean).join(" · ");
export function trayOf(images = [], entries = []) {
  const thumbs = images.map((image) => {
    const name = image.name || "Pasted image", bytes = image.bytes ?? (image.data ? Math.floor(image.data.length * 3 / 4) : null);
    return { key: image.key, kind: "image", name, bytes, preview: image.preview, tip: tipOf(name, bytes), status: "ready", progress: 1, line: null };
  });
  const files = [];
  for (const entry of entries) {
    if (!entry.preview || !isImage(entry.mimeType)) {
      files.push(entry);
      continue;
    }
    thumbs.push({ key: entry.key, kind: "file", name: entry.name, bytes: entry.size, preview: entry.preview, tip: tipOf(entry.name, entry.size), status: entry.queued ? "queued" : entry.status, progress: entry.progress ?? 0, line: entry.line ?? null });
  }
  return { thumbs, files };
}
export function viewOf(thumbs, key) {
  return { images: thumbs.map((thumb) => ({ url: thumb.preview, alt: thumb.name })), index: Math.max(0, thumbs.findIndex((thumb) => thumb.key === key)) };
}
export function sentOf(item) {
  const thumbs = (item?.images ?? []).filter((image) => image?.url).map((image, n) => ({ key: "i" + n, url: image.url, src: image.url, alt: "Sent image", file: null }));
  const files = [];
  (item?.attachments ?? []).forEach((file, n) => {
    const url = file?.preview ?? file?.url;
    if (url && isImage(file.mimeType)) thumbs.push({ key: "f" + n, url, src: file.url ?? null, alt: file.name || "Sent image", file });
    else files.push(file);
  });
  return { thumbs, files };
}
export const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
export const SOUND = /\.(wav|mp3|m4a|ogg)$/i;
export const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
export function repliedOf(attachments = []) {
  const pictures = [], sounds = [], videos = [], files = [];
  for (const file of attachments) {
    const name = String(file?.name ?? "");
    (!file?.url ? files : PICTURE.test(name) ? pictures : SOUND.test(name) ? sounds : VIDEO.test(name) ? videos : files).push(file);
  }
  return { pictures, sounds, videos, files };
}
export const columns = (n, max) => n <= max ? Math.max(1, n) : Math.ceil(n / Math.ceil(n / max));
export const COLUMNS = Object.freeze({ pc: 4, phone: 3 });
export const MOST_IMAGES = IMAGE_LIMITS.count + FILE_LIMITS.count;
export function refusedLine(refused, { other = 0 } = {}) {
  const capped = refused.length > 0 && refused.every((no) => no.error === "too_many_attachments" && isImage(no.mimeType));
  const line = capped && !other ? `Up to ${MOST_IMAGES} images a message` : null;
  const lines = refused.map((no) => line && no.error === "too_many_attachments" ? line : no.line ?? FILE_LINES[no.error] ?? FILE_LINES.upload_failed);
  return refused.length === 1 ? `${refused[0].name}: ${lines[0]}` : refused.length ? `${lines[0]} (${refused.length} files)` : null;
}
