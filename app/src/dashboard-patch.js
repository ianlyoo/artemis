const plain = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const put = (node, key, value) => Object.defineProperty(node, key, { value, writable: true, enumerable: true, configurable: true });
export function applyPatch(payload, ops) {
  if (!plain(payload) || !Array.isArray(ops)) throw Error("dashboard patch: no base");
  const fresh = new Set(), root = { ...payload };
  fresh.add(root);
  const at = (p) => {
    let node = root;
    for (const key of p) {
      const child = node[key];
      if (!plain(child)) throw Error("dashboard patch: no object at " + p.join("."));
      if (!fresh.has(child)) {
        put(node, key, { ...child });
        fresh.add(node[key]);
      }
      node = node[key];
    }
    return node;
  };
  for (const op of ops) {
    if (!Array.isArray(op?.p) || !op.p.length) throw Error("dashboard patch: no path");
    const parent = at(op.p.slice(0, -1)), key = op.p.at(-1);
    if (op.d) {
      delete parent[key];
      continue;
    }
    if (!op.up) {
      put(parent, key, op.v);
      continue;
    }
    const list = parent[key];
    if (!Array.isArray(list)) throw Error("dashboard patch: no list at " + op.p.join("."));
    const up = new Map(op.up.map((item) => [item.id, item]));
    if (!op.order) {
      put(parent, key, list.map((item) => up.get(item.id) ?? item));
      continue;
    }
    const old = new Map(list.map((item) => [item.id, item]));
    put(parent, key, op.order.map((id) => {
      const item = up.get(id) ?? old.get(id);
      if (!item) throw Error("dashboard patch: no item " + id);
      return item;
    }));
  }
  return root;
}
