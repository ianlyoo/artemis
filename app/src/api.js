const money = (v, cents) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
const monthDay = (v) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(v ?? ""));
  return m ? Number(m[1]) + "/" + Number(m[2]) : "";
};
export function apiCredit(sample) {
  const fresh = sample?.fresh === true, d = sample?.data || {}, valid = fresh && sample?.valid === true;
  const cost = d.period_cost_usd, monthly = d.monthly_usd, once = d.one_time_usd;
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(String(d.one_time_expires ?? "")) ? "~" + d.one_time_expires : "expiry unknown";
  const detail = [Number.isFinite(once) ? "Reserve " + money(once) + " (" + expiry + ")" : null, d.limit === "owner-set" ? "Limit: owner-set" : null, d.metered === true ? "Self-computed" : null].filter(Boolean);
  const reason = !sample ? "no API sample" : !fresh ? "sample older than 2 hours" : d.reason || (valid ? "" : "no period cost");
  return { figure: valid ? money(cost, true) + " / " + money(monthly) : "—", value: valid ? Math.min(100, cost / monthly * 100) : 0, renews: monthDay(d.renews), detail, reason, state: valid ? "idle" : "warning" };
}
export function apiRowHTML(r, esc, phone = false) {
  const figure = phone ? "b" : "span";
  return '<div class="' + (phone ? "m-seat" : "seat") + ' api-seat" data-state="' + r.state + '"><div class="' + (phone ? "m-top" : "seat-top") + '"><b>API</b></div><div class="api-meter"' + (r.reason ? ' title="' + esc(r.reason) + '"' : "") + '><div class="' + (phone ? "m-meter-cap" : "api-caption") + '"><span>Monthly' + (r.renews ? ' <small class="api-reset">↻ ' + r.renews + "</small>" : "") + "</span><" + figure + ' class="api-figure">' + r.figure + "</" + figure + '></div><div class="' + (phone ? "m-meter" : "meter") + '"><i style="--value:' + r.value + '%"></i></div></div>' + (r.detail.length ? '<div class="api-detail">' + r.detail.map(esc).join(" · ") + "</div>" : "") + "</div>";
}
