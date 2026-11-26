export const shownItems = (items) => (items ?? []).filter((item) => item && typeof item.id === "string");
export function byMonth(items) {
  const months = new Map();
  for (const item of shownItems(items)) {
    if (!months.has(item.month)) months.set(item.month, []);
    months.get(item.month).push(item);
  }
  return [...months].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([month, list]) => ({ month, items: list }));
}
const KIND = { board: "Board", report: "Report", draft: "Draft" }, MEDIA = { image: "Image", video: "Video" };
export const kindName = (item) => item?.kind === "asset" ? MEDIA[item.media] ?? "File" : KIND[item?.kind] ?? "Item";
export const itemDay = (item) => /^\d{4}-(\d{2})-(\d{2})$/.test(item?.date ?? "") ? Number(item.date.slice(5, 7)) + "/" + Number(item.date.slice(8)) : "";
export const archiveTarget = (item) => ({ kind: "archive", id: item.id, title: item.title, month: item.month });
export function archivePeek(target, items) {
  const item = (items ?? []).find((entry) => entry?.id === target.id), month = item?.month || target.month || "";
  return { kind: item ? kindName(item) : "Archive", title: item?.title || target.title || target.id, meta: [item?.date ?? "", month && "Archive · " + month].filter(Boolean) };
}
export const restorable = (item) => item?.kind === "report" ? !(item.restored_at && item.restored_at > item.archived_at) : !item?.live;
export const ARCHIVE_ERRORS = { not_found: "It isn't in the archive (or an asset it needs isn't)", mismatch: "The Drive copy doesn't match the index", too_large: "Too large to open here", timeout: "Drive didn't answer in time", unavailable: "Couldn't reach Drive", invalid_archive: "The archived copy can't be read", no_rev: "The index doesn't name this board's committed version, so it can't be restored" };
export const archiveError = (answer) => ARCHIVE_ERRORS[answer?.body?.error] ?? "Couldn't open it from the archive";
