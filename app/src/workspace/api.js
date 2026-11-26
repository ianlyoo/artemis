import { muxApi } from "./mux.js";
export const homeApi = async (path, init) => muxApi(await import("/client.js"), path, init);
export async function getJSON(api, path, init) {
  let status = 0, body = null;
  try {
    const response = await api(path, init);
    status = response.status;
    try {
      body = await response.json();
    } catch {
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }
  return { ok: status >= 200 && status < 300 && !!body && body.ok !== false, status, body };
}
export const postJSON = (api, path, value, init = {}) => getJSON(api, path, { ...init, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
export async function textOf(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { text: new TextDecoder().decode(bytes), bom: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 };
}
const q = (value) => encodeURIComponent(value);
export const paths = { tree: (path) => "/ide/tree" + (path ? "?path=" + q(path) : ""), reports: () => "/ide/reports", find: (text) => "/ide/find?q=" + q(text), search: (text, scope = "docs") => "/ide/search?q=" + q(text) + "&scope=" + q(scope), preview: (key) => "/ide/preview?target=" + q(key), watch: () => "/ide/watch", doc: (path) => "/chat/doc?path=" + q(path), boards: () => "/canvas/active", board: (id) => "/canvas/boards/" + q(id), terms: () => "/term/list", drafts: () => "/ide/drafts", previews: () => "/ide/previews", archive: () => "/archive/list", archiveItem: (id) => "/archive/item?id=" + q(id), restore: () => "/archive/restore", pins: () => "/archive/pins" };
