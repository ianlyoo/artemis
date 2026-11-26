export const FILE_LIMITS = { count: 5, bytes: 25 * 1024 * 1024, total: 50 * 1024 * 1024 };
export const FILE_LINES = { file_too_large: "Files can be up to 25 MB", too_many_attachments: "Up to 5 files a message", attachments_too_large: "Up to 50 MB of files in all", empty_file: "Empty files can't be uploaded", invalid_name: "A file with this name can't be uploaded", invalid_type: "This file type can't be uploaded", upload_failed: "Couldn't upload the file. Try again", upload_timeout: "Couldn't upload the file. Try again", upload_incomplete: "Couldn't upload the file. Try again", not_allowed: "This chat can't take files right now", forbidden: "Uploads aren't allowed from this device", offline: "Disconnected. Reconnecting…", no_target: "Can't reach this chat right now", version_mismatch: "This chat is under maintenance" };
const STATUS = { 403: "forbidden", 408: "upload_failed", 413: "file_too_large" };
export function fileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
  const mb = value / 1024 / 1024;
  return (mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)) + " MB";
}
export function uploadName(name) {
  let clean = String(name ?? "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean) clean = "file";
  const chars = [...clean];
  if (chars.length <= 255) return clean;
  const dot = clean.lastIndexOf("."), ext = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : "";
  return [...ext ? clean.slice(0, dot) : clean].slice(0, 255 - [...ext].length).join("") + ext;
}
export const uploadType = (type) => /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(String(type ?? "")) ? type : "application/octet-stream";
export function transferFiles(transfer) {
  const items = transfer?.items ? Array.from(transfer.items).filter((item) => item.kind === "file").map((item) => item.getAsFile?.()).filter(Boolean) : [];
  return items.length ? items : Array.from(transfer?.files ?? []).filter(Boolean);
}
const NAMES_A_FILE = /^(?:[a-z][a-z0-9+.-]*:\S+|\S+\.(?:png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?))$/i;
export function pastedFiles(transfer) {
  const files = transferFiles(transfer);
  if (!files.length) return [];
  let text = "";
  try {
    text = String(transfer.getData?.("text/plain") ?? "").trim();
  } catch {
    text = "";
  }
  return !text || NAMES_A_FILE.test(text) ? files : [];
}
let serial = 0, arrived = 0;
export function createAttachments({ upload, limits = FILE_LIMITS, onChange = () => {
}, release = (url) => URL.revokeObjectURL(url) } = {}) {
  let entries = [];
  const changed = () => {
    try {
      onChange();
    } catch (error) {
      console.error(error);
    }
  };
  const letGo = (entry) => {
    if (entry.preview?.startsWith("blob:")) {
      try {
        release(entry.preview);
      } catch {
      }
    }
    entry.preview = null;
  };
  const counted = () => entries.filter((entry) => entry.status !== "failed");
  async function start(entry) {
    const control = new AbortController();
    Object.assign(entry, { status: "uploading", progress: 0, line: null, control, arrived: 0 });
    changed();
    let answer;
    try {
      answer = await upload(entry.file, { name: uploadName(entry.file.name), type: uploadType(entry.file.type), signal: control.signal, onProgress: (share) => {
        if (entry.control !== control || entry.status !== "uploading") return;
        entry.progress = Math.max(0, Math.min(1, share));
        if (entry.progress >= 1 && !entry.arrived) entry.arrived = ++arrived;
        changed();
      } });
    } catch {
      answer = { status: 0, body: null };
    }
    if (entry.control !== control || !entries.includes(entry)) return;
    entry.control = null;
    const body = answer?.body, file = body?.file;
    if (answer?.status === 200 && body?.ok && typeof file?.id === "string") {
      Object.assign(entry, { status: "ready", progress: 1, upload: { id: file.id, name: file.name || entry.name, size: Number(file.size) || entry.size, mimeType: file.mimeType || entry.mimeType } });
      if (entry.preview) entry.upload.preview = entry.preview;
      entry.name = entry.upload.name;
    } else {
      const error = typeof body?.error === "string" ? body.error : STATUS[answer?.status] ?? "upload_failed";
      Object.assign(entry, { status: "failed", line: FILE_LINES[error] ?? (typeof body?.line === "string" ? body.line : FILE_LINES.upload_failed) });
    }
    changed();
  }
  return { get entries() {
    const first = Math.min(...entries.filter((entry) => entry.status === "uploading" && entry.arrived).map((entry) => entry.arrived));
    return entries.map(({ key, name, size, mimeType, status, progress, line, preview, arrived: at }) => ({ key, name, size, mimeType, status, progress, queued: status === "uploading" && !!at && at !== first, line, preview: preview ?? null }));
  }, get uploading() {
    return entries.some((entry) => entry.status === "uploading");
  }, get failed() {
    return entries.some((entry) => entry.status === "failed");
  }, get ready() {
    return entries.filter((entry) => entry.status === "ready").map((entry) => entry.upload);
  }, add(files, { preview = () => null } = {}) {
    const refused = [];
    for (const file of files) {
      const size = Number(file?.size) || 0, name = uploadName(file?.name);
      const total = counted().reduce((sum, entry2) => sum + entry2.size, 0);
      const error = !size ? "empty_file" : size > limits.bytes ? "file_too_large" : counted().length >= limits.count ? "too_many_attachments" : total + size > limits.total ? "attachments_too_large" : null;
      if (error) {
        refused.push({ name, mimeType: uploadType(file?.type), error, line: FILE_LINES[error] });
        continue;
      }
      const entry = { key: "f" + ++serial, file, name, size, mimeType: uploadType(file.type), status: "uploading", progress: 0, line: null, upload: null, control: null, arrived: 0, preview: null };
      try {
        entry.preview = preview(file) ?? null;
      } catch {
        entry.preview = null;
      }
      entries.push(entry);
      start(entry);
    }
    if (refused.length) changed();
    return refused;
  }, retry(key) {
    const entry = entries.find((item) => item.key === key);
    if (!entry?.file || entry.status !== "failed") return false;
    start(entry);
    return true;
  }, remove(key) {
    const entry = entries.find((item) => item.key === key);
    if (!entry) return false;
    entry.control?.abort();
    entry.control = null;
    letGo(entry);
    entries = entries.filter((item) => item !== entry);
    changed();
    return true;
  }, clear({ keep = false } = {}) {
    for (const entry of entries) {
      entry.control?.abort();
      if (!keep) letGo(entry);
    }
    entries = [];
    changed();
  }, restore(uploads = []) {
    for (const upload2 of uploads) if (typeof upload2?.id === "string" && !entries.some((entry) => entry.upload?.id === upload2.id)) {
      const { preview: shown, ...rest } = upload2, preview = typeof shown === "string" ? shown : null;
      entries.push({ key: "f" + ++serial, file: null, name: upload2.name, size: Number(upload2.size) || 0, mimeType: upload2.mimeType ?? null, status: "ready", progress: 1, line: null, upload: preview ? { ...rest, preview } : rest, control: null, preview });
    }
    changed();
  } };
}
export function uploadFault(status, size = 0) {
  return status === 0 || status >= 500 || status === 411 || status === 413 && size <= FILE_LIMITS.bytes;
}
export function xhrUpload(file, { name, type, signal, onProgress, url } = {}) {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", url ?? "/chat/upload?name=" + encodeURIComponent(name ?? uploadName(file.name)));
    request.setRequestHeader("Content-Type", type ?? uploadType(file.type));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total) onProgress?.(event.loaded / event.total);
    });
    const done = (status, body, why) => {
      if (uploadFault(status, file.size) && !signal?.aborted) globalThis.homeHealth?.note("POST", request.responseURL || url || "/chat/upload", { status, body, why });
      resolve({ status, body });
    };
    request.addEventListener("load", () => {
      let body = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
      }
      done(request.status, body);
    });
    request.addEventListener("abort", () => resolve({ status: 0, body: null }));
    for (const kind of ["error", "timeout"]) request.addEventListener(kind, () => done(0, null, "upload " + kind));
    if (signal?.aborted) {
      resolve({ status: 0, body: null });
      return;
    }
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });
}
