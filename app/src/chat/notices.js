export const isNotice = (item) => item?.kind === "notice";
const goalOf = (g) => Number.isSafeInteger(g?.id) && g.id > 0 && typeof g.name === "string" && g.name.trim() ? { id: g.id, name: g.name.trim() } : void 0;
export function noticeItems(list) {
  return (Array.isArray(list) ? list : []).filter((n) => n?.kind === "notice" && typeof n.id === "string" && typeof n.text === "string" && Number.isFinite(Date.parse(n.at))).map(({ goal, goals, ...n }) => {
    const named = (Array.isArray(goals) ? goals : [goal]).map(goalOf).filter(Boolean);
    return { ...n, ...named.length ? { goals: named } : {}, key: `notice:${n.id}`, role: "notice" };
  });
}
export function interleaveNotices(items, notices) {
  const pending = [...notices].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), out = [];
  let n = 0;
  for (const item of items) {
    while (n < pending.length && Date.parse(pending[n].at) <= Date.parse(item.at)) out.push(pending[n++]);
    out.push(item);
  }
  return [...out, ...pending.slice(n)];
}
