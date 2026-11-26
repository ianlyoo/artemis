export const stepId = (hash) => {
  const m = /^#\/step\/([1-9]\d{0,11})\/?$/.exec(String(hash ?? ""));
  return m ? Number(m[1]) : null;
};
export function stepLink(link) {
  const s = typeof link === "string" ? link.trim() : "";
  if (/^\/#\/[^\s"'<>\\]*$/.test(s)) return stepId(s.slice(1)) == null ? { route: s.slice(1) } : null;
  if (!/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? { url: u.href } : null;
  } catch {
    return null;
  }
}
export const terminalId = (hash) => /^#\/terminal\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/?$/.exec(String(hash ?? ""))?.[1] ?? null;
export const stepHref = (id, link) => link?.route ?? (link?.url ? "#/step/" + id : null);
export const findStep = (d, id) => (Array.isArray(d?.owner_turn) ? d.owner_turn : []).find((r) => r?.kind === "step" && Number(r.id) === id) ?? null;
