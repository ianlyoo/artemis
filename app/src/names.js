import HOME from "./home-settings.js";
const ROLE = /^[a-z][a-z0-9_]{0,31}$/, PATH = /^(?!\/\/)(?!.*\.\.)[\w./-]{1,200}$/, HOST = /^[\w.-]{1,64}$/, ROUTE = /^\/(?!\/)(?!.*\.\.)[\w.\/-]{0,200}$/;
const text = (value) => typeof value === "string" && value.trim() && value.trim().length <= 40 ? value.trim() : null;
const portraitOf = (p) => {
  const sizes = Array.isArray(p?.sizes) && p.sizes.length && p.sizes.every((s) => PATH.test(String(s))) ? p.sizes : null;
  return sizes && { sizes, full: PATH.test(String(p.full ?? "")) ? p.full : sizes[sizes.length - 1] };
};
const KINDS = ["file", "board", "terminal", "term", "image", "block", "archive", "other", "computer", "draft", "preview", "sysmap", "db", "commit", "compare", "since"];
const ledgerOf = (l) => ({ name: text(l?.name) ?? "Ledger", ref: ROLE.test(String(l?.ref ?? "")) && !KINDS.includes(l.ref) ? l.ref : "ledger" });
const hostOf = (value) => HOST.test(String(value ?? "")) ? value : null;
const originOf = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.origin === value ? value : null;
  } catch {
    return null;
  }
};
function hostsOf(h) {
  const computers = (Array.isArray(h?.computers) ? h.computers : []).filter((c) => ROLE.test(String(c?.id ?? "")) && ROUTE.test(String(c?.path ?? "")) && hostOf(c?.host)).map(({ id, path, host }) => ({ id, path, host }));
  const mic = Object.fromEntries(Object.entries(h?.mic && typeof h.mic === "object" ? h.mic : {}).filter(([host, how]) => hostOf(host) && (text(how?.key) || text(how?.typed))).map(([host, how]) => [host, text(how.key) ? { key: text(how.key) } : { typed: text(how.typed) }]));
  return { main: hostOf(h?.main), status: hostOf(h?.status), studio: hostOf(h?.studio), computers, screen: computers.some((c) => c.id === h?.screen) ? h.screen : null, home: originOf(h?.home), mic };
}
function read(raw) {
  const name = text(raw?.lead?.name), role = ROLE.test(String(raw?.lead?.role ?? "")) ? raw.lead.role : null, user2 = text(raw?.user?.name);
  if (!name || !role || !user2 || !Array.isArray(raw?.capabilities)) return null;
  return { lead: { name, ko: text(raw.lead.name_ko) ?? name, role, portrait: portraitOf(raw.lead.portrait) }, user: user2, ledger: ledgerOf(raw.ledger), hosts: hostsOf(raw.hosts), capabilities: raw.capabilities.filter((c) => typeof c === "string"), lang: raw.lang === "en" ? "en" : "ko" };
}
const markLang = () => globalThis.document?.documentElement?.setAttribute("lang", now.lang);
let now = read(HOME), sign = JSON.stringify(now), offered = new Set(now.capabilities);
markLang();
const watchers = new Set();
export function applySettings(raw) {
  const next = read(raw), nextSign = JSON.stringify(next);
  if (!next || nextSign === sign) return false;
  now = next;
  sign = nextSign;
  offered = new Set(next.capabilities);
  markLang();
  for (const fn of [...watchers]) try {
    fn();
  } catch (err) {
    console.error("Home settings:", err);
  }
  return true;
}
export const onSettings = (fn) => {
  watchers.add(fn);
  return () => watchers.delete(fn);
};
export const lead = () => now.lead.name;
export const leadKo = (particle) => l10n(particle ? josa(now.lead.ko, particle) : now.lead.ko, now.lead.name);
export const leadRole = () => now.lead.role;
export const isLead = (role) => role === now.lead.role;
export const leadPortrait = () => {
  const portrait = now.lead.portrait, at = (path) => new URL(path, import.meta.url).href;
  return portrait && { sizes: portrait.sizes.map(at), full: at(portrait.full) };
};
export const user = () => now.user;
export const userKo = (particle) => l10n(particle ? josa(now.user + " 님", particle) : now.user + " 님", now.user);
export const myTurn = () => l10n(userKo() + " 차례", "My turn");
export const has = (capability) => offered.has(capability);
export const lang = () => now.lang;
export const l10n = (ko, en) => now.lang === "en" ? en : ko;
export const ledgerName = () => now.ledger.name;
export const ledgerRef = () => now.ledger.ref;
export const isLedger = (kind) => kind === now.ledger.ref;
export const hosts = () => now.hosts;
const PAIRS = [["을", "를"], ["이", "가"], ["은", "는"], ["과", "와"], ["으로", "로"], ["아", "야"]];
const PAIR = new Map(PAIRS.flatMap((pair) => pair.map((form) => [form, pair])));
const DIGIT = { 0: "n", 1: "l", 3: "n", 6: "n", 7: "l", 8: "l" };
function ending(word) {
  const m = String(word).match(/([가-힣]|[A-Za-z]+|\d)[^가-힣A-Za-z\d]*$/);
  if (!m) return "";
  const end = m[1];
  if (/[가-힣]/.test(end)) {
    const jong = (end.charCodeAt(0) - 44032) % 28;
    return jong === 0 ? "" : jong === 8 ? "l" : "n";
  }
  if (/\d/.test(end)) return DIGIT[end] ?? "";
  const lower = end.toLowerCase();
  return lower.endsWith("l") ? "l" : /(?:m|n|ng)$/.test(lower) ? "n" : "";
}
export function josa(word, particle) {
  const pair = PAIR.get(particle);
  if (!pair) throw Error("josa: unknown particle " + particle);
  const end = ending(word);
  return word + (pair[0] === "으로" ? end === "n" ? "으로" : "로" : end ? pair[0] : pair[1]);
}
