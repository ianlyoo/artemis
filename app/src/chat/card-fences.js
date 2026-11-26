export const TYPED = ["cindy-ui", "chart", "table", "timeline", "diagram", "sketch", "open"];
export const STEP = /^step\s+#?([1-9]\d{0,11})$/;
const STEP_ID = /^#?([1-9]\d{0,11})$/, SECRET_REQUEST_ID = /^([a-f0-9]{32})$/;
export function fenceId(lang, info = "", body = "") {
  const id = lang === "step" ? STEP_ID : lang === "secret" ? SECRET_REQUEST_ID : null;
  if (!id) return null;
  const head = String(info).trim();
  if (head !== lang) return head.startsWith(lang) ? head.slice(lang.length).match(/^\s+(.*)$/)?.[1].match(id)?.[1] ?? null : null;
  return String(body).trim().match(id)?.[1] ?? null;
}
