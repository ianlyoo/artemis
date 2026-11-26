const figure = (value) => Number.isFinite(value) && value >= 0 ? value : null;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
export const seatWord = (seat) => seat?.label_text ?? "—";
export function seatFigures(seatData = {}) {
  const d = seatData || {};
  const legacyWeeklyZero = d.weekly === 0 && !Object.hasOwn(d, "fable_weekly");
  return { five_hour: figure(d.five_hour), five_hour_resets_at: timestamp(d.five_hour_resets_at), fable_weekly: figure(d.fable_weekly), fable_weekly_resets_at: timestamp(d.fable_weekly_resets_at), weekly: legacyWeeklyZero ? null : figure(d.weekly), weekly_resets_at: timestamp(d.weekly_resets_at) };
}
