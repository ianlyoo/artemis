const HOUR = 36e5, DAY = 24 * HOUR;
const seoul = () => globalThis.document?.documentElement?.getAttribute?.("lang") !== "en";
export function zoned(locale, options) {
  let kst, own;
  const now = () => seoul() ? kst ??= new Intl.DateTimeFormat(locale, { ...options, timeZone: "Asia/Seoul" }) : own ??= new Intl.DateTimeFormat(locale, options);
  return { format: (value) => now().format(value), formatToParts: (value) => now().formatToParts(value) };
}
export const offset = (t) => seoul() ? 9 * HOUR : -new Date(t).getTimezoneOffset() * 6e4;
export const wall = (t) => t + offset(t);
export function unwall(w) {
  if (seoul()) return w - 9 * HOUR;
  const d = new Date(w);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()).getTime();
}
export const dayStart = (t) => unwall(Math.floor(wall(t) / DAY) * DAY);
export const dayOf = (t) => new Date(wall(t)).toISOString().slice(0, 10);
export const zoneName = () => seoul() ? "KST" : "";
export const withZone = (text) => seoul() ? text + " KST" : text;
