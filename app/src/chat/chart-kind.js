import { unitOf } from "./visual-labels.js";
export const COLUMN_MAX = 8, LABEL_EMS = 6, BAR_MAX = 12, SERIES_MAX = 3;
export const WARN_AT = 60, STOP_AT = 80;
export const ems = (text) => [...String(text ?? "")].reduce((sum, c) => sum + (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(c) ? 1 : 0.62), 0);
export const COLUMN_ROOM = 24.5, COLUMN_SLOT = 1.8, COLUMN_GAP = 1;
const TIME = [/^\d{4}[-./]\d{1,2}([-./]\d{1,2})?([ T]\d{1,2}:\d{2}(:\d{2})?)?$/, /^\d{1,2}[-./]\d{1,2}( \d{1,2}:\d{2})?$/, /^\d{1,2}:\d{2}$/, /^\d{1,4}\s?(년|월|일|시|주|분기)$/, /^[월화수목금토일](요일)?$/, /^(\d{4}\s?)?Q[1-4]$/i, /^\d{1,2}\/\d{1,2}\s?\([월화수목금토일]\)$/];
export const isTimeLabel = (label) => TIME.some((pattern) => pattern.test(String(label ?? "").trim()));
const DAY = /^(?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})(\s?\([월화수목금토일]\))?$/, WEEKDAY = /^([월화수목금토일])요일$/;
export function columnLabels(labels) {
  const text = labels.map((label) => String(label ?? "").trim()), days = text.map((label) => DAY.exec(label));
  if (text.length > 1 && text.every((label) => WEEKDAY.test(label))) return text.map((label) => label[0]);
  if (text.length < 2 || days.some((day) => !day) || new Set(days.map((day) => day[1] ?? "")).size > 1) return text;
  return days.map((day, n) => {
    const month = Number(day[2]), date = Number(day[3]), weekday = day[4]?.trim() ?? "";
    return (n && Number(days[n - 1][2]) === month ? `${date}` : `${month}/${date}`) + weekday;
  });
}
export const columnsWidth = (labels) => labels.reduce((sum, label) => sum + Math.max(COLUMN_SLOT, ems(label)), 0) + COLUMN_GAP * Math.max(0, labels.length - 1);
export function labelStep(labels) {
  if (!labels.length || columnsWidth(labels) <= COLUMN_ROOM) return 1;
  const per = COLUMN_ROOM / labels.length, widest = Math.max(...labels.map(ems));
  return Math.max(2, Math.ceil((widest + COLUMN_GAP) / per));
}
export function chartKind(block) {
  const labels = block?.labels ?? [], series = block?.series ?? [], forced = block?.chart;
  const columnFits = (max) => series.length === 1 && labels.length > 0 && labels.length <= max;
  const barFits = series.length >= 1 && series.length <= SERIES_MAX && labels.length > 0 && labels.length <= BAR_MAX;
  if (forced === "column" && columnFits(COLUMN_MAX)) return "column";
  if (forced === "bar" && barFits) return "bar";
  if (block?.kind === "line") return "line";
  if (block?.kind !== "bar") return "full";
  if (columnFits(COLUMN_MAX) && (labels.every(isTimeLabel) || labels.every((label) => ems(label) <= LABEL_EMS) && labelStep(columnLabels(labels)) === 1)) return "column";
  return barFits ? "bar" : "full";
}
export const isShare = (block) => unitOf(block) === "%" || (block?.series ?? []).some((series) => /(^|_)pct$|percent|사용률|점유율/i.test(String(series?.name ?? "")));
export const levelOf = (value, share) => !share || !Number.isFinite(value) ? "go" : value >= STOP_AT ? "stop" : value >= WARN_AT ? "wait" : "go";
export function scaleTop(values, share) {
  const high = Math.max(0, ...values.filter(Number.isFinite));
  if (share) return Math.max(100, niceTop(high));
  return niceTop(high);
}
function niceTop(value) {
  if (!(value > 0)) return 1;
  const unit = 10 ** Math.floor(Math.log10(value));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => +(m * unit).toPrecision(12)).find((m) => m >= value);
}
