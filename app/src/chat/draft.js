export const DRAFT_KEY = "chat-draft";
export const DRAFT_LIMITS = Object.freeze({ text: 2e4, files: 5, age: 55 * 6e4 });
const text = (value) => typeof value === "string" ? value : "";
function fileOf(value, at) {
  if (!value || typeof value.id !== "string" || !value.id || value.id.length > 200) return null;
  const size = Number(value.size);
  return { id: value.id, name: text(value.name) || "file", size: Number.isFinite(size) && size >= 0 ? size : 0, mimeType: typeof value.mimeType === "string" ? value.mimeType : null, at: Number.isFinite(value.at) ? value.at : at };
}
export function draftValue({ text: words = "", uploads = [] } = {}, before = null, now = Date.now()) {
  const held = new Map((before?.files ?? []).map((file) => [file.id, file.at]));
  const files = (Array.isArray(uploads) ? uploads : []).map((upload) => fileOf(upload, now)).filter(Boolean).slice(0, DRAFT_LIMITS.files).map((file) => ({ ...file, at: held.get(file.id) ?? now }));
  const kept = [...text(words)].slice(0, DRAFT_LIMITS.text).join("");
  return kept.trim() || files.length ? { v: 1, text: kept, files } : null;
}
export function readDraft(raw, now = Date.now()) {
  let value = null;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!value || value.v !== 1) return null;
  const files = (Array.isArray(value.files) ? value.files : []).map((file) => fileOf(file, NaN)).filter((file) => file && Number.isFinite(file.at) && now - file.at < DRAFT_LIMITS.age && file.at <= now + 6e4).slice(0, DRAFT_LIMITS.files);
  const words = [...text(value.text)].slice(0, DRAFT_LIMITS.text).join("");
  return words.trim() || files.length ? { text: words, files: files.map(({ id, name, size, mimeType }) => ({ id, name, size, mimeType })) } : null;
}
export function createDraftKeeper({ storage = null, key = DRAFT_KEY, now = () => Date.now() } = {}) {
  let last = null;
  const get = () => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  return { load() {
    const raw = get();
    try {
      last = raw ? JSON.parse(raw) : null;
    } catch {
      last = null;
    }
    const draft = readDraft(raw, now());
    if (!draft && raw) this.clear();
    return draft;
  }, save(draft) {
    const value = draftValue(draft, last, now());
    const raw = value ? JSON.stringify(value) : null;
    if (raw === (last ? JSON.stringify(last) : null)) return;
    last = value;
    try {
      if (raw) storage?.setItem(key, raw);
      else storage?.removeItem(key);
    } catch {
    }
  }, clear() {
    last = null;
    try {
      storage?.removeItem(key);
    } catch {
    }
  } };
}
