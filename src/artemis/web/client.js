// How the App reaches its Artemis home: same-origin JSON paths and one live stream of frames (GET /events).
export const mux = null;   // no terminal connection in this release

export async function api(path, options = {}) {
  const {expected, ...init} = options;
  const target = new URL(path, location.origin);
  if (target.origin !== location.origin) throw new Error('The App only talks to its own home.');
  const pending = fetch(target, {...init, headers: new Headers(init.headers), credentials: 'same-origin', cache: 'no-store'});
  globalThis.homeHealth?.watch(init.method, target.pathname + target.search, pending, expected);
  return pending;
}

export async function streamEvents(onEvent, signal, options = {}) {
  const {progress = () => {}} = options;
  const response = await api('/events', {signal});
  if (!response.ok) throw new Error(`The live stream answered ${response.status}.`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      progress();
      pending += decoder.decode(part.value, {stream: true});
      if (pending.length > 8 * 1024 * 1024) throw new Error('The live stream sent more than it should.');
      for (let cut = pending.indexOf('\n\n'); cut !== -1; cut = pending.indexOf('\n\n')) {
        const lines = pending.slice(0, cut).split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6));
        pending = pending.slice(cut + 2);
        if (lines.length) onEvent(JSON.parse(lines.join('\n')));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
