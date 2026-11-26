export function terminalHTTP(href, { fetch: request = globalThis.fetch } = {}) {
  const events = new EventTarget(), abort = new AbortController();
  let state = 0, stream = null, ended = false, bytes = 0, queued = Promise.resolve();
  const emit = (type, fields) => {
    const event = new Event(type);
    Object.assign(event, fields);
    events.dispatchEvent(event);
  };
  const finish = (code = 4503, reason = "offline") => {
    if (ended) return;
    ended = true;
    state = 3;
    abort.abort();
    emit("close", { code, reason });
  };
  const post = (body, signal = abort.signal) => request("/term/input", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body), signal });
  const socket = { binaryType: "arraybuffer", get readyState() {
    return state;
  }, get bufferedAmount() {
    return bytes;
  }, addEventListener: (...args) => events.addEventListener(...args), send(data) {
    if (state !== 1 || !stream) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      finish(4400, "bad_message");
      return;
    }
    const id = stream, size = new TextEncoder().encode(data).length;
    if (bytes + size > 256 * 1024) {
      finish(4429, "slow");
      return;
    }
    bytes += size;
    queued = queued.then(async () => {
      if (ended) return;
      const res = await post({ stream: id, m: [message] });
      await res.body?.cancel();
      if (!res.ok) finish(res.status === 403 ? 4403 : 4503, res.status === 403 ? "forbidden" : "offline");
    }).catch(() => finish()).finally(() => {
      bytes -= size;
    });
  }, close(code = 1e3) {
    if (ended) return;
    const id = stream;
    finish(code, "closed");
    if (id) void post({ stream: id, close: true }, null).then((res) => res.body?.cancel()).catch(() => {
    });
  } };
  void (async () => {
    try {
      const id = new URL(href).pathname.split("/")[2];
      const res = await request("/term/stream", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id }), signal: abort.signal });
      if (!res.ok || !res.body) {
        finish(res.status === 403 ? 4403 : 4503, res.status === 403 ? "forbidden" : "offline");
        return;
      }
      await readRecords(res.body, (kind, body) => {
        if (kind === 1) return emit("message", { data: body });
        const message = JSON.parse(body);
        if (message.t === "stream") {
          stream = message.id;
          state = 1;
          emit("open", {});
        } else if (message.t === "close") finish(message.code, message.reason);
        else emit("message", { data: body });
      }, () => ended);
      finish();
    } catch {
      if (!ended) finish();
    }
  })();
  return socket;
}
export async function readRecords(body, onRecord, stop) {
  const reader = body.getReader();
  let pending = new Uint8Array(0);
  try {
    while (!stop()) {
      const { value, done } = await reader.read();
      if (done) break;
      const next = new Uint8Array(pending.length + value.length);
      next.set(pending);
      next.set(value, pending.length);
      pending = next;
      while (!stop() && pending.length >= 4) {
        const size = new DataView(pending.buffer, pending.byteOffset, 4).getUint32(0);
        if (size < 1 || size > 4 * 1024 * 1024) throw Error("record");
        if (pending.length < size + 4) break;
        const kind = pending[4], payload = pending.slice(5, size + 4);
        pending = pending.slice(size + 4);
        if (kind === 1) onRecord(1, payload.buffer);
        else if (kind === 0) onRecord(0, new TextDecoder().decode(payload));
        else throw Error("record");
      }
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
}
