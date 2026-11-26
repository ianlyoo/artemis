export const MUX = { keepAlive: 5e3, timeout: 2e4, ackTime: 2e3, ackBytes: 256 * 1024, hidden: 6e4, grace: 5 * 6e4, retry: [0, 5e3, 5e3, 1e4, 1e4, 1e4, 1e4, 1e4, 3e4], wait: 2e3, channels: 32, body: 8 * 1024 * 1024, hold: 1e4 };
export const FRAME = Object.freeze({ regular: 1, control: 2, ack: 3, disconnect: 5, keepAlive: 9 });
export const KIND = Object.freeze({ request: 1, abort: 2, termOpen: 3, termText: 4, termClose: 5, termBinary: 6, head: 16, data: 17, end: 18, fail: 19 });
const encoder = new TextEncoder(), decoder = new TextDecoder();
export function frame(type, id, ack, data) {
  const out = new Uint8Array(9 + (data?.length ?? 0)), view = new DataView(out.buffer);
  out[0] = type;
  view.setUint32(1, id);
  view.setUint32(5, ack);
  if (data) out.set(data, 9);
  return out;
}
export function message(kind, channel, rest) {
  const body = typeof rest === "string" ? encoder.encode(rest) : rest;
  const out = new Uint8Array(5 + (body?.length ?? 0));
  out[0] = kind;
  new DataView(out.buffer).setUint32(1, channel);
  if (body) out.set(body, 5);
  return out;
}
const failed = () => new TypeError("Failed to fetch");
const event = (type, fields) => Object.assign(new Event(type), fields);
function bytesOf(body) {
  if (body === void 0 || body === null) return new Uint8Array(0);
  if (typeof body === "string") return encoder.encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return encoder.encode(body.toString());
  return null;
}
export function createMux({ path, WebSocket: Socket = globalThis.WebSocket, location: loc = globalThis.location, document: doc = globalThis.document, window: win = globalThis, timers = globalThis, now = () => Date.now(), times = {} } = {}) {
  const t = { ...MUX, ...times };
  let ws = null, state = "idle", token = null;
  let out = 0, taken = 0, ackedOut = 0, ackDue = 0, ackTimer = null, beat = null, heard = 0;
  let queue = [], attempt = 0, lostAt = 0, retryTimer = null, hiddenTimer = null, next = 1, refusals = 0, coolUntil = 0;
  const channels = new Map(), waiting = new Set(), backs = new Set();
  const hidden = () => doc?.visibilityState === "hidden";
  const transmit = (data) => {
    if (ws?.readyState === 1) {
      try {
        ws.send(data);
      } catch {
      }
    }
  };
  function send(kind, channel, rest) {
    const id = ++out, body = message(kind, channel, rest);
    queue.push({ id, body });
    if (state === "open") {
      transmit(frame(FRAME.regular, id, taken, body));
      ackedOut = taken;
    }
  }
  const ack = () => {
    timers.clearTimeout(ackTimer);
    ackTimer = null;
    ackDue = 0;
    if (ackedOut < taken && state === "open") {
      transmit(frame(FRAME.ack, 0, taken));
      ackedOut = taken;
    }
  };
  const released = (n) => {
    while (queue.length && queue[0].id <= n) queue.shift();
  };
  const settle = (open) => {
    for (const resolve of [...waiting]) resolve(open);
    waiting.clear();
  };
  function lose() {
    for (const channel of [...channels.values()]) channel.lost();
  }
  function fresh(nextToken) {
    lose();
    channels.clear();
    queue = [];
    out = 0;
    taken = 0;
    ackedOut = 0;
    token = nextToken;
  }
  function received(bytes) {
    heard = now();
    if (bytes.length < 9) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), type = bytes[0], id = view.getUint32(1);
    if (type === FRAME.control) {
      let hello = null;
      try {
        hello = JSON.parse(decoder.decode(bytes.subarray(9)));
      } catch {
      }
      if (hello?.t !== "hello") return;
      if (!hello.resumed) fresh(hello.token);
      released(view.getUint32(5));
      state = "open";
      attempt = 0;
      lostAt = 0;
      refusals = 0;
      ackedOut = taken;
      if (hidden()) idleWhenHidden();
      for (const item of queue) transmit(frame(FRAME.regular, item.id, taken, item.body));
      timers.clearInterval(beat);
      beat = timers.setInterval(() => {
        if (now() - heard > t.timeout) {
          ws?.close();
          return;
        }
        transmit(frame(FRAME.keepAlive, 0, taken));
        ackedOut = taken;
      }, t.keepAlive);
      settle(true);
      for (const done of [...backs]) done();
      return;
    }
    released(view.getUint32(5));
    if (type !== FRAME.regular || id <= taken) return;
    if (id !== taken + 1) {
      ws?.close();
      return;
    }
    taken = id;
    const channel = view.getUint32(10), kind = bytes[9];
    channels.get(channel)?.receive(kind, bytes.subarray(14));
    ackDue += bytes.length;
    if (ackDue >= t.ackBytes) ack();
    else ackTimer ??= timers.setTimeout(ack, t.ackTime);
  }
  function connect() {
    if (ws || !Socket || !path) return;
    timers.clearTimeout(retryTimer);
    retryTimer = null;
    state = "connecting";
    const url = new URL(path, loc.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (token) {
      url.searchParams.set("token", token);
      url.searchParams.set("ack", String(taken));
    }
    let socket;
    try {
      socket = new Socket(url.href);
    } catch {
      state = "idle";
      settle(false);
      return;
    }
    ws = socket;
    socket.binaryType = "arraybuffer";
    socket.addEventListener("message", (e) => {
      if (ws === socket && typeof e.data !== "string") received(new Uint8Array(e.data));
    });
    socket.addEventListener("close", () => {
      if (ws === socket) dropped();
    });
  }
  function dropped() {
    ws = null;
    timers.clearInterval(beat);
    beat = null;
    ack();
    const was = state;
    settle(false);
    for (const channel of [...channels.values()]) channel.dropped?.();
    if (hidden()) {
      state = "idle";
      return;
    }
    if (!token) {
      state = "idle";
      coolUntil = now() + Math.min(t.grace, 3e4 * 2 ** refusals++);
      return;
    }
    lostAt ||= now();
    if (attempt >= 2 || was !== "open" && attempt >= 1) lose();
    if (now() - lostAt > t.grace) {
      state = "idle";
      fresh(null);
      attempt = 0;
      lostAt = 0;
      return;
    }
    state = "waiting";
    retryTimer = timers.setTimeout(connect, t.retry[Math.min(attempt++, t.retry.length - 1)]);
  }
  function demand() {
    if (state === "idle" && !hidden() && now() >= coolUntil) connect();
  }
  function opened(ms) {
    if (state === "open") return Promise.resolve(true);
    demand();
    if (state !== "connecting" && state !== "waiting") return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (open) => {
        timers.clearTimeout(timer);
        waiting.delete(done);
        resolve(open);
      };
      const timer = timers.setTimeout(() => done(false), ms);
      waiting.add(done);
    });
  }
  function release(socket, last) {
    if (socket?.readyState !== 0) {
      socket?.close(1e3);
      return;
    }
    socket.addEventListener("open", () => {
      if (last) {
        try {
          socket.send(last);
        } catch {
        }
      }
      socket.close(1e3);
    }, { once: true });
  }
  function idleWhenHidden() {
    timers.clearTimeout(hiddenTimer);
    hiddenTimer = timers.setTimeout(() => {
      hiddenTimer = null;
      if (!hidden() || state !== "open" || ws?.readyState !== 1) return;
      const socket = ws;
      ws = null;
      timers.clearInterval(beat);
      ack();
      state = "idle";
      socket.close(1e3);
      for (const channel of [...channels.values()]) channel.dropped?.();
    }, t.hidden);
  }
  function back(ms, signal) {
    if (state === "open") return Promise.resolve();
    demand();
    return new Promise((resolve) => {
      const done = () => {
        timers.clearTimeout(timer);
        backs.delete(done);
        win?.removeEventListener?.("online", done);
        signal?.removeEventListener?.("abort", done);
        resolve();
      };
      const timer = timers.setTimeout(done, ms);
      backs.add(done);
      win?.addEventListener?.("online", done);
      signal?.addEventListener?.("abort", done);
    });
  }
  async function held(again, http, signal, deadline) {
    try {
      return await http();
    } catch (err) {
      const left = deadline - now();
      if (!(err instanceof TypeError) || signal?.aborted || left <= 0) throw err;
      await back(left, signal);
      if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
      return state === "open" ? again() : http();
    }
  }
  doc?.addEventListener?.("visibilitychange", () => {
    timers.clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (hidden()) {
      if (state === "open") idleWhenHidden();
    } else if (token && state === "idle") connect();
  });
  const self = { get state() {
    return state;
  }, get channels() {
    return channels.size;
  }, opened, async fetch(target, init = {}, http, deadline = now() + t.hold) {
    const method = String(init.method ?? "GET").toUpperCase(), signal = init.signal, body = bytesOf(init.body);
    const idempotent = method === "GET" || method === "HEAD";
    const viaHttp = () => idempotent ? held(() => self.fetch(target, init, http, deadline), http, signal, deadline) : http();
    if (signal?.aborted || body === null || body.length > t.body) return http();
    const url = new URL(target, loc.href);
    if (url.origin !== new URL(loc.href).origin) return http();
    if (state !== "open" && !(url.pathname === "/events" && await opened(t.wait))) {
      demand();
      return viaHttp();
    }
    if (channels.size >= t.channels) return viaHttp();
    const headers = {};
    new Headers(init.headers ?? {}).forEach((value, name) => {
      headers[name] = value;
    });
    if (typeof init.body === "string" && !headers["content-type"]) headers["content-type"] = "text/plain;charset=UTF-8";
    const meta = encoder.encode(JSON.stringify({ m: method, p: url.pathname + url.search, h: headers }));
    const rest = new Uint8Array(4 + meta.length + body.length);
    new DataView(rest.buffer).setUint32(0, meta.length);
    rest.set(meta, 4);
    rest.set(body, 4 + meta.length);
    const id = next++;
    return new Promise((resolve, reject) => {
      let begun = false, done = false, stream = null;
      const finish = () => {
        done = true;
        channels.delete(id);
        signal?.removeEventListener?.("abort", onAbort);
      };
      const overHttp = () => {
        finish();
        resolve(viaHttp());
      };
      const onAbort = () => {
        if (done) return;
        finish();
        send(KIND.abort, id);
        const reason = signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
        if (begun) stream?.error(reason);
        else reject(reason);
      };
      signal?.addEventListener?.("abort", onAbort, { once: true });
      channels.set(id, { receive(kind, data) {
        if (done) return;
        if (kind === KIND.head && !begun) {
          let head = null;
          try {
            head = JSON.parse(decoder.decode(data));
          } catch {
          }
          if (!head || !(head.s >= 200 && head.s <= 599)) {
            send(KIND.abort, id);
            return overHttp();
          }
          begun = true;
          const answer = new Headers();
          for (const [name, value] of Object.entries(head.h ?? {})) for (const one of [].concat(value)) {
            try {
              answer.append(name, String(one));
            } catch {
            }
          }
          const empty = method === "HEAD" || [204, 205, 304].includes(head.s);
          const readable = empty ? null : new ReadableStream({ start(controller) {
            stream = controller;
          }, cancel() {
            if (!done) {
              finish();
              send(KIND.abort, id);
            }
          } });
          resolve(new Response(readable, { status: head.s, headers: answer }));
        } else if (kind === KIND.data && begun) {
          try {
            stream?.enqueue(data.slice());
          } catch {
          }
        } else if (kind === KIND.end) {
          finish();
          if (!begun) return overHttp();
          try {
            stream?.close();
          } catch {
          }
        } else if (kind === KIND.fail) {
          if (!begun) return overHttp();
          finish();
          try {
            stream?.error(failed());
          } catch {
          }
        }
      }, dropped() {
        if (!done && !begun && idempotent) {
          send(KIND.abort, id);
          overHttp();
        }
      }, lost() {
        if (done) return;
        send(KIND.abort, id);
        if (!begun) {
          if (idempotent) return overHttp();
          finish();
          return reject(failed());
        }
        finish();
        try {
          stream?.error(failed());
        } catch {
        }
      } });
      send(KIND.request, id, rest);
    });
  }, terminal(href) {
    const url = new URL(href, loc.href), match = url.pathname.match(/^\/term\/([^/]+)\/ws$/);
    const target = new EventTarget(), own = Socket;
    let real = null, id = 0, readyState = 0, binaryType = "blob";
    const emit = (type, fields) => target.dispatchEvent(event(type, fields));
    const ended = (code, reason) => {
      if (readyState === 3) return;
      readyState = 3;
      if (id) channels.delete(id);
      emit("close", { code, reason, wasClean: code !== 1006 });
    };
    const viaOwn = () => {
      if (readyState === 3) return;
      try {
        real = new own(url.href);
      } catch {
        return ended(1006, "");
      }
      real.binaryType = binaryType;
      real.addEventListener("open", () => {
        readyState = 1;
        emit("open");
      });
      real.addEventListener("message", (e) => emit("message", { data: e.data }));
      real.addEventListener("close", (e) => {
        if (readyState !== 3) {
          readyState = 3;
          emit("close", { code: e.code, reason: e.reason, wasClean: e.wasClean });
        }
      });
      real.addEventListener("error", () => emit("error"));
    };
    const viaMux = () => {
      if (readyState === 3) return;
      id = next++;
      readyState = 1;
      channels.set(id, { receive(kind, data) {
        if (kind === KIND.termText) emit("message", { data: decoder.decode(data) });
        else if (kind === KIND.termBinary) {
          const copy = data.slice();
          emit("message", { data: binaryType === "arraybuffer" ? copy.buffer : new Blob([copy]) });
        } else if (kind === KIND.termClose) {
          let why = {};
          try {
            why = JSON.parse(decoder.decode(data));
          } catch {
          }
          ended(Number(why.code) || 1006, typeof why.reason === "string" ? why.reason : "");
        }
      }, lost() {
        if (readyState !== 3) {
          send(KIND.termClose, id);
          ended(1006, "");
        }
      } });
      send(KIND.termOpen, id, JSON.stringify({ id: decodeURIComponent(match[1]) }));
      timers.setTimeout(() => emit("open"), 0);
    };
    if (!match || !path) viaOwn();
    else void opened(t.wait).then((open) => open ? viaMux() : viaOwn());
    return Object.defineProperties(target, Object.getOwnPropertyDescriptors({ get readyState() {
      return real ? real.readyState : readyState;
    }, get binaryType() {
      return binaryType;
    }, set binaryType(value) {
      binaryType = value;
      if (real) real.binaryType = value;
    }, get viaMux() {
      return !!id;
    }, send(data) {
      if (real) return real.send(data);
      if (readyState !== 1) throw new DOMException("not open", "InvalidStateError");
      send(KIND.termText, id, String(data));
    }, close(code = 1e3) {
      if (real) return real.close(code);
      if (readyState === 3) return;
      if (id) send(KIND.termClose, id);
      const was = readyState;
      readyState = 3;
      if (id) channels.delete(id);
      if (was !== 3) timers.setTimeout(() => emit("close", { code: 1005, reason: "", wasClean: true }), 0);
    } }));
  }, disconnect() {
    const bye = frame(FRAME.disconnect, 0, taken);
    if (ws?.readyState === 1) transmit(bye);
    const socket = ws;
    ws = null;
    timers.clearInterval(beat);
    timers.clearTimeout(retryTimer);
    timers.clearTimeout(hiddenTimer);
    state = "idle";
    fresh(null);
    attempt = 0;
    lostAt = 0;
    release(socket, bye);
  } };
  return self;
}
let page = null, leaving = false;
const phoneLayout = () => !!globalThis.matchMedia?.("(max-width: 767.98px)").matches;
export function pageMux(path) {
  if (!page && path && typeof WebSocket !== "undefined" && !phoneLayout()) {
    page = createMux({ path });
    globalThis.addEventListener?.("pagehide", () => {
      leaving = true;
      page?.disconnect();
    });
    globalThis.addEventListener?.("pageshow", () => {
      leaving = false;
    });
  }
  return page;
}
export async function muxApi(client, target, init) {
  const http = () => leaving ? Promise.reject(new DOMException("The page is leaving.", "AbortError")) : client.api(target, init);
  if (leaving) return http();
  const mux = client.mux && pageMux(client.mux);
  if (!mux) return http();
  const answer = mux.fetch(target, init, http);
  globalThis.homeHealth?.watch(init?.method, target, answer, init?.expected);
  return answer;
}
export function termSocket(href, Socket = globalThis.WebSocket) {
  let inner = null, closedEarly = null;
  const target = new EventTarget(), listeners = [];
  let type = "blob";
  void import("/client.js").then((client) => client.mux ? pageMux(client.mux) : null, () => null).then((mux) => {
    if (closedEarly) {
      target.dispatchEvent(event("close", { code: closedEarly, reason: "", wasClean: true }));
      return;
    }
    inner = mux ? mux.terminal(href) : new Socket(href);
    inner.binaryType = type;
    for (const [name, fn] of listeners) inner.addEventListener(name, fn);
  });
  return Object.defineProperties(target, Object.getOwnPropertyDescriptors({ get readyState() {
    return inner ? inner.readyState : closedEarly ? 3 : 0;
  }, get binaryType() {
    return inner ? inner.binaryType : type;
  }, set binaryType(value) {
    type = value;
    if (inner) inner.binaryType = value;
  }, addEventListener(name, fn) {
    listeners.push([name, fn]);
    if (inner) inner.addEventListener(name, fn);
    else EventTarget.prototype.addEventListener.call(target, name, fn);
  }, send(data) {
    if (!inner) throw new DOMException("not open", "InvalidStateError");
    inner.send(data);
  }, close(code = 1e3) {
    if (inner) inner.close(code);
    else closedEarly = code;
  } }));
}
