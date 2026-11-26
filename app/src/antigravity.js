import { windowsHTML } from "./seat-usage.js";
import { esc, when } from "./mobile/format.js";
const WINDOWS = [["five_hour", "5H"], ["weekly", "주간"]];
const WORDS = { TOS_VIOLATION: "Blocked by Google", UNREADABLE: "Unavailable" };
export const poolName = (name) => String(name || "").replace(/\s+models$/i, "") || "—";
export function antigravityRows(samples, now = Date.now()) {
  return (samples || []).map((s) => {
    const ok = s.status === "OK" && s.fresh === true, at = s.at ? when(s.at, now) + " 기준" : "";
    return { key: s.key, at: s.at, state: ok ? "idle" : s.status === "TOS_VIOLATION" ? "stuck" : "warning", status: ok ? at : [WORDS[s.status] || "Unavailable", at].filter(Boolean).join(" · "), pools: (s.pools || []).map((p) => ({ name: String(p.name || "—"), ...Object.fromEntries(WINDOWS.flatMap(([k]) => [[k, p[k] ?? null], [k + "_resets_at", p[k + "_resets_at"] ?? null]])) })) };
  });
}
export function antigravityHTML(r, phone = false) {
  return '<div class="' + (phone ? "m-seat" : "seat") + ' agy-seat" data-key="antigravity:' + esc(r.key) + '" data-state="' + r.state + '" title="Antigravity · ' + esc(r.key) + '"><div class="' + (phone ? "m-top" : "seat-top") + '"><b' + (phone ? ' class="m-name"' : "") + '>antigravity</b><span class="' + (phone ? "m-state m-seat-status" : "seat-status " + r.state) + ' agy-status" data-state="' + r.state + '">' + esc(r.status) + "</span></div>" + r.pools.map((p) => '<div class="agy-pool" data-pool="' + esc(p.name) + '"><small class="agy-pool-name">' + esc(p.name) + "</small>" + windowsHTML(p, WINDOWS) + "</div>").join("") + "</div>";
}
