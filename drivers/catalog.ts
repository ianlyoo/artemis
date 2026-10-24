import type { ModelInfo } from '../core/types.ts';

/** Share in-flight discovery and cache successful provider lists for five minutes. Failures can retry. */
export function modelCatalog(read: () => Promise<ModelInfo[]>, age = 300_000): () => Promise<ModelInfo[]> {
  let held: Promise<ModelInfo[]> | undefined, until = 0;
  return async () => {
    if (!held || Date.now() >= until) {
      until = Infinity;
      held = read().then(rows => {
        if (!rows.length) throw new Error('Provider model catalog is empty');
        until = Date.now() + age; return rows;
      }).catch(() => { held = undefined; until = 0; throw new Error('Provider model catalog unavailable'); });
    }
    return structuredClone(await held);
  };
}
