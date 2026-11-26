const PREFIX = "home.cindy-ui.values.v1:";
export function localValues(identity, { account = "owner", storage } = {}) {
  if (storage === void 0) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  const key = identity ? PREFIX + JSON.stringify([account, identity]) : null;
  const valid = (value) => typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 4096;
  const clean = (input) => {
    const values2 = Object.create(null);
    if (input && typeof input === "object" && !Array.isArray(input)) for (const [bind, value] of Object.entries(input).slice(0, 2048)) {
      if (bind.length <= 80 && valid(value)) values2[bind] = value;
    }
    return values2;
  };
  const read = () => {
    try {
      const raw = key && storage?.getItem(key);
      return raw && raw.length <= 65536 ? clean(JSON.parse(raw)) : Object.create(null);
    } catch {
      return Object.create(null);
    }
  };
  let values = read();
  return { get: () => values, set(patch) {
    values = Object.assign(read(), values, clean(patch));
    if (!key || !storage) return values;
    try {
      const serialized = JSON.stringify(values);
      if (serialized.length > 65536 || Object.keys(values).length > 2048) return values;
      let count = 0, size = serialized.length;
      for (let i = 0; i < storage.length; i++) {
        const existing = storage.key(i);
        if (existing?.startsWith(PREFIX) && existing !== key) {
          count++;
          size += (storage.getItem(existing) || "").length;
        }
      }
      if (count < 256 && size <= 524288) storage.setItem(key, serialized);
    } catch {
    }
    return values;
  } };
}
