export const PRELOAD_AT_ONCE = 24;
export function createPreloader({ doc = globalThis.document, limit = PRELOAD_AT_ONCE } = {}) {
  const waiting = [], asked = new Set();
  let flying = 0;
  function pump() {
    while (flying < limit && waiting.length) {
      const link = doc.createElement("link");
      link.rel = "modulepreload";
      link.href = waiting.shift();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        flying--;
        pump();
      };
      link.addEventListener("load", done);
      link.addEventListener("error", done);
      flying++;
      doc.head.append(link);
    }
  }
  return { add(href) {
    if (asked.has(href)) return;
    asked.add(href);
    waiting.push(href);
    pump();
  }, get flying() {
    return flying;
  }, get waiting() {
    return waiting.length;
  } };
}
