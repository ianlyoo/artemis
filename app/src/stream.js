import { feed } from "./chat/feed.js";
import { hold, settling } from "./motion-gate.js";
import { applyPatch } from "./dashboard-patch.js";
import { RECOVERED, RESUME, STARTED, recoverPage } from "./stale.js";
export const BEAT_STALE = 45e3;
export const BACKLOG = 1500;
export const RETRY = { first: 250, most: 4e3 };
export const CONNECT_WAIT = 8e3;
const jitter = (ms) => Math.round(ms * (0.85 + Math.random() * 0.3));
export function startStream({ streamEvents, onFrame, onConnection: shellConnection, onUnauthorized, onStale = () => {
}, signal, staleAfter = 18e4, connectWait = CONNECT_WAIT, lifecycle = true, recoveryWait = RESUME.wait, recover = () => recoverPage({ doc }), chat = feed, quiet = hold, resumed = settling(), doc = globalThis.document, win = globalThis.window }) {
  let live = false, wasLive = false, rescue = null;
  const settle = () => {
    clearTimeout(rescue);
    rescue = null;
  };
  const deadline = (ms = recoveryWait) => {
    settle();
    if (lifecycle && !live && !signal.aborted && doc?.visibilityState !== "hidden") rescue = setTimeout(save, ms);
  };
  async function save() {
    rescue = null;
    if (live || signal.aborted || doc?.visibilityState === "hidden") return;
    let offered = false;
    try {
      offered = await recover();
    } catch {
    }
    if (!offered && rescue === null) deadline(RESUME.again);
  }
  const onConnection = (on, delay2) => {
    if (on) {
      settle();
      if (!live) try {
        win?.dispatchEvent?.(new Event(wasLive ? RECOVERED : STARTED));
      } catch {
      }
      live = wasLive = true;
    } else {
      live = false;
      if (rescue === null) deadline();
    }
    try {
      chat.connection(on);
    } catch {
    }
    shellConnection(on, delay2);
  };
  const loop = { kick: () => {
  } };
  let wake = () => {
  }, kicked = false, delay = RETRY.first, again = resumed, returning = null, ownerReset = false;
  const reconnect = () => {
    if (signal.aborted || doc?.visibilityState === "hidden" || returning !== null) return;
    returning = setTimeout(() => {
      returning = null;
      if (signal.aborted) return;
      delay = RETRY.first;
      again = true;
      if (doc?.documentElement?.dataset?.relayState) void import("/relay/session.js").then(({ currentTunnel }) => currentTunnel()?.wake()).catch(() => {
      });
      settle();
      onConnection(false, 0);
      loop.kick();
    }, 0);
  };
  const visible = () => {
    if (doc?.visibilityState !== "hidden") reconnect();
    else settle();
  };
  if (lifecycle) {
    doc?.addEventListener?.("visibilitychange", visible);
    doc?.addEventListener?.("resume", reconnect);
    win?.addEventListener?.("online", reconnect);
  } else connectWait = staleAfter;
  const pause = (ms) => new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      wake = () => {
      };
      resolve();
    };
    const timer = setTimeout(finish, ms);
    wake = finish;
    signal.addEventListener("abort", finish, { once: true });
  });
  deadline();
  return (async () => {
    while (!signal.aborted) {
      const attempt = new AbortController();
      const abort = () => attempt.abort();
      loop.kick = () => {
        kicked = true;
        attempt.abort();
      };
      signal.addEventListener("abort", abort, { once: true });
      let watchdog, abandoned, beating = false;
      const arm = (wait2 = beating ? Math.min(staleAfter, BEAT_STALE) : staleAfter) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          try {
            onStale();
          } finally {
            attempt.abort();
          }
        }, wait2);
      };
      arm(connectWait);
      const cancelled = new Promise((resolve) => {
        abandoned = resolve;
        attempt.signal.addEventListener("abort", abandoned, { once: true });
      });
      let heard = false, held = null, owner = null;
      try {
        await Promise.race([cancelled, streamEvents((frame) => {
          if (signal.aborted || attempt.signal.aborted) return;
          if (frame?.kind === "heartbeat") {
            beating = true;
            arm();
            return;
          }
          arm();
          if (frame?.kind === "dashboard.patch") {
            let payload = null;
            try {
              if (held && frame.base === held.rev) payload = applyPatch(held.payload, frame.ops);
            } catch {
            }
            if (!payload) {
              held = null;
              loop.kick();
              return;
            }
            held = { rev: frame.rev, payload };
            frame = { kind: "dashboard", rev: frame.rev, payload };
          } else if (frame?.kind === "dashboard") held = typeof frame.rev === "number" ? { rev: frame.rev, payload: frame.payload } : null;
          if (frame?.kind === "owner_views.patch") {
            let payload = null;
            try {
              if (owner && frame.epoch === owner.epoch && frame.base === owner.revision) payload = applyPatch(owner, frame.ops);
            } catch {
            }
            if (!payload) {
              owner = null;
              ownerReset = true;
              loop.kick();
              return;
            }
            owner = payload;
            frame = { kind: "owner_views", payload };
          } else if (frame?.kind === "owner_views") {
            owner = frame.payload;
            ownerReset = false;
          } else if (frame?.kind === "owner_views.fresh" && owner && frame.payload?.epoch === owner.epoch && frame.payload.revision === owner.revision) {
            owner = { ...owner, ...frame.payload };
          }
          if (!heard) {
            heard = true;
            if (again) try {
              quiet(BACKLOG);
            } catch {
            }
          }
          let result = false, mine = false;
          try {
            mine = chat.frame(frame);
          } catch {
          }
          try {
            result = mine || onFrame(frame);
          } catch {
          }
          if (result === false) {
            attempt.abort();
            return;
          }
          if (result !== "deferred") {
            delay = RETRY.first;
            onConnection(true);
          }
        }, attempt.signal, { patch: true, ownerReset, ownerSeed: (payload) => {
          owner = payload;
        }, progress: () => {
          if (heard && !signal.aborted && !attempt.signal.aborted) arm();
        } })]);
      } catch (error) {
        if (signal.aborted) break;
        if (String(error?.message || error).includes("HTTP 401")) {
          try {
            chat.connection(false);
          } catch {
          }
          onUnauthorized();
          return;
        }
      } finally {
        clearTimeout(watchdog);
        signal.removeEventListener("abort", abort);
        attempt.signal.removeEventListener("abort", abandoned);
        attempt.abort();
      }
      if (signal.aborted) break;
      again = true;
      if (kicked) {
        kicked = false;
        continue;
      }
      const wait = jitter(delay);
      loop.kick = () => wake();
      onConnection(false, wait);
      await pause(wait);
      delay = Math.min(RETRY.most, delay * 2);
    }
  })().finally(() => {
    clearTimeout(returning);
    settle();
    doc?.removeEventListener?.("visibilitychange", visible);
    doc?.removeEventListener?.("resume", reconnect);
    win?.removeEventListener?.("online", reconnect);
  });
}
export let currentPageStream = null;
export function createPageStream({ start, read, onFrame, onConnection, onStale, onUnauthorized, lifecycle = true }) {
  let rider = null, runtime = null, life = null, held = false, snapshot = null;
  const observers = new Set();
  const publish = (payload) => {
    snapshot = payload;
    for (const fn of observers) {
      try {
        fn(payload);
      } catch {
      }
    }
  };
  function open() {
    life?.abort();
    life = null;
    if (!runtime || runtime.aborted || held) return;
    const now = life = new AbortController();
    void start({ streamEvents: (onEvent, signal, options) => (rider?.read ?? read)(onEvent, signal, options), signal: now.signal, onFrame: (frame) => {
      if (frame?.kind === "dashboard") publish(frame.payload);
      try {
        rider?.frame(frame);
      } catch {
      }
      return onFrame(frame);
    }, onConnection: (live, delay) => {
      if (!live) publish(null);
      try {
        rider?.connection(live);
      } catch {
      }
      onConnection(live, delay);
    }, onStale: () => {
      publish(null);
      try {
        rider?.stale?.();
      } catch {
      }
      onStale();
    }, onUnauthorized, lifecycle });
  }
  return currentPageStream = { observe(fn) {
    observers.add(fn);
    fn(snapshot);
    return () => observers.delete(fn);
  }, start(signal, { wait = null } = {}) {
    runtime = signal;
    held = !!wait && !rider;
    signal.addEventListener("abort", () => {
      if (runtime === signal) {
        runtime = null;
        held = false;
        life?.abort();
        life = null;
      }
    }, { once: true });
    if (held) void Promise.resolve(wait).catch(() => {
    }).finally(() => {
      if (runtime === signal && held) {
        held = false;
        open();
      }
    });
    open();
  }, ride(next) {
    rider = next;
    held = false;
    open();
    return () => {
      if (rider !== next) return;
      rider = null;
      open();
    };
  } };
}
