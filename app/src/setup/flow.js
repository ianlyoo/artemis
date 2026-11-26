export const KINDS = [["money out", "Money going out", "Payments, purchases, subscriptions and trades."], ["irreversible delete", "Deleting for good", "Files, data or accounts that cannot be brought back."], ["send as you", "Sending as you", "Emails, messages and posts in your name."]];
const ORDER = KINDS.map(([kind]) => kind);
export const kindLabel = (kind) => KINDS.find(([id]) => id === kind)?.[1] ?? kind;
export const STEPS = [["names", "Names"], ["lead", "Lead"], ["key", "Key"], ["ask", "Ask first"], ["phone", "Phone only"], ["pair", "Phone"], ["done", "Finish"]];
const AT = STEPS.map(([id]) => id);
export const SKIPPABLE = new Set(["lead", "key", "ask", "phone"]);
export const stepAfter = (id, list) => list.find((step) => AT.indexOf(step) > AT.indexOf(id)) ?? list[list.length - 1];
export const stepBefore = (id, list) => list.findLast((step) => AT.indexOf(step) < AT.indexOf(id)) ?? list[0];
export const needsKey = (setup) => Boolean(setup?.vault) && setup?.lead?.provider === "mock" && setup?.lead?.chosen !== "mock";
export const wizardSteps = (setup, ask = setup?.ask ?? [], key = needsKey(setup)) => STEPS.map(([id]) => id).filter((id) => id === "key" ? key : id === "phone" ? ask.length > 0 : true);
export const fitPhoneOnly = (phoneOnly, ask) => ORDER.filter((kind) => phoneOnly.includes(kind) && ask.includes(kind));
export const firstChoices = (setup) => {
  const ask = ORDER.filter((kind) => (setup?.ask ?? []).includes(kind));
  return { ask, phoneOnly: fitPhoneOnly(setup?.phone_only ?? [], ask) };
};
export const onThisComputer = (url) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
export const pairToken = (hash) => String(hash ?? "").match(/^#pair=([\w-]{8,200})$/)?.[1] ?? null;
export async function standing(home, token = null) {
  let expired = false;
  if (token) await home.pair(token).catch((error) => {
    if (error.status === 401) expired = true;
    else throw error;
  });
  const me = await home.me().catch((error) => {
    if (error.status === 401) return null;
    throw error;
  });
  if (!me) return { screen: expired ? "expired" : "unpaired" };
  if (me.device && me.device.state !== "allowed") return { screen: "waiting", code: me.device.code ?? null };
  const setup = await home.setup();
  return setup.done ? { screen: "app" } : setup.here ? { screen: "wizard", setup } : { screen: "elsewhere" };
}
export function homeApi(get = (...args) => globalThis.fetch(...args)) {
  async function call(path, body) {
    const init = body === void 0 ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const response = await get(path, { ...init, credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(data?.error ?? `Artemis answered ${response.status}.`), { status: response.status, waiting: data?.waiting === true });
    return data;
  }
  return { me: () => call("/api/me"), pair: (token) => call("/api/pair", { token }), setup: () => call("/api/setup"), save: (changes) => call("/api/setup", changes), lead: () => call("/chat/settings"), chooseLead: (model) => call("/chat/settings", { model }).then((answer) => answer.settings), secrets: () => call("/api/secrets"), addSecret: (entry) => call("/api/secrets", entry), removeSecret: (name) => call(`/api/secrets/${encodeURIComponent(name)}/remove`, {}), unlock: (passphrase) => call("/api/vault/unlock", { passphrase }), devices: () => call("/api/devices"), device: (id, action) => call(`/api/devices/${Number(id)}/${action === "allow" ? "allow" : "revoke"}`, {}), pairLink: () => call("/api/pair/new", {}), standing: () => call("/api/settings").then((answer) => answer.standing ?? []), revokeStanding: (id) => call(`/api/standing/${Number(id)}/revoke`, {}), signout: () => call("/api/signout", {}), stop: () => call("/api/stop", {}), resume: () => call("/api/resume", {}) };
}
