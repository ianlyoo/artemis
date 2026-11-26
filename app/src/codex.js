import { withZone } from "./zone.js";
export function codexCapacity(sample) {
  const fresh = sample?.fresh === true, data = sample?.data || {};
  const count = (v) => fresh && Number.isSafeInteger(v) && v >= 0 ? v : 0, busy = count(sample?.busy), active = count(sample?.active);
  const windows = [["five_hour", "5H"], ["weekly", "Weekly"]].map(([key, label]) => {
    const pct = sample?.[key + "_pct"], reset = data.windows?.[key]?.resets_at, valid = fresh && Number.isFinite(pct) && Number.isFinite(reset);
    return { key, label, percent: valid ? Math.round(pct) + " %" : "—", value: valid ? Math.min(100, pct) : 0, reset: valid ? reset * 1e3 : null };
  });
  const reason = [!fresh ? sample ? "sample older than 15 minutes" : "no Codex sample" : null, sample?.reason, fresh && !windows[1].reset && !sample?.reason ? "no current rate limits" : null].filter(Boolean).join("; ");
  const balance = sample?.credits_balance, known = fresh && Number.isFinite(balance), c = data.credits;
  const credits = { balance: known ? balance : null, text: known ? Math.floor(balance).toLocaleString("en-US") + " credits" : "— credits", at: known && Number.isFinite(c?.observed_at) ? c.observed_at * 1e3 : null };
  return { busy, active, windows, credits, reason, state: busy ? "running" : "idle", status: !fresh ? "Unavailable" : active ? busy + "/" + active + " busy" : "Idle" };
}
export function codexRowHTML(r, esc, date, time, phone = false) {
  const [five, week] = r.windows, stamp = (w) => date(w.reset) + " " + time(w.reset), figure = phone ? "b" : "span";
  return '<div class="' + (phone ? "m-seat" : "seat") + ' codex-seat" ' + (phone ? 'data-key="seat:codex"' : 'data-node="seat:codex" tabindex="0" role="button"') + ' data-state="' + r.state + '"><div class="' + (phone ? "m-top" : "seat-top") + '"><b>codex</b><span class="seat-status' + (phone ? " m-seat-status" : "") + '">' + r.status + '</span></div><div class="codex-weekly" data-window="weekly"' + (week.reset ? ' title="Reset ' + withZone(stamp(week)) + '"' : "") + '><div class="' + (phone ? "m-meter-cap" : "codex-caption") + '"><span>Weekly' + (week.reset ? ' <small class="codex-reset">↻ ' + stamp(week) + "</small>" : "") + "</span><" + figure + ' class="codex-percent">' + week.percent + "</" + figure + '></div><div class="' + (phone ? "m-meter" : "meter") + ' week"><i style="--value:' + week.value + '%"></i></div></div>' + (phone ? '<details class="m-seat-detail codex-detail"><summary>Detail</summary><p>5H ' + five.percent + (five.reset ? " · ↻ " + withZone(stamp(five)) : "") + "</p>" + (r.reason ? "<p>" + esc(r.reason) + "</p>" : "") + "</details>" : "") + "</div>";
}
