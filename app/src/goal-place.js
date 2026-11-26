export function goalPlace(g, now = Date.now()) {
  if (typeof g?.state !== "string" || g.state === "done") return null;
  if (g.state !== "owner" && g.current_move?.kind === "paused" && Date.parse(g.next_check_at) > now) return "later";
  return g.is_running === true && (g.active_worker_count ?? 0) > 0 ? "live" : "waiting";
}
