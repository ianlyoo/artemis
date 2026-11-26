export const isPost = (item) => !!item?.key?.startsWith("notify:");
export const inTurn = (item) => !!item && item.role !== "user" && item.kind !== "notice";
export const sameTurn = (a, b) => inTurn(a) && inTurn(b) && (a.turnKey ?? null) === (b.turnKey ?? null);
export function turnPlaces(items) {
  items = items.filter((item) => item.kind !== "notice");
  const places = new Map();
  items.forEach((item, n) => {
    if (!inTurn(item)) return;
    const head = !sameTurn(items[n - 1], item), tail = !sameTurn(item, items[n + 1]);
    places.set(item.key, head && tail ? "only" : head ? "first" : tail ? "last" : "mid");
  });
  return places;
}
