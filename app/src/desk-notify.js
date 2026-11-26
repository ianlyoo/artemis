import { withKeepWarm, withoutNoReply } from "./chat/view.js";
import { isPost } from "./chat/turns.js";
import { leadKo, leadRole, userKo, l10n } from "./names.js";
export const PREFS_KEY = "home-desk-alerts", SEEN_KEY = "home-desk-seen";
const FRESH = 10 * 60 * 1e3, SEEN_KEEP = 60, SEEN_FOR = 10 * 60 * 1e3;
export const COPY = { get approval() {
  return l10n("답하실 질문이 있어요", "A question for you");
}, get prompt() {
  return l10n(userKo("이") + " 하실 일이 있어요", "Something for you to do");
}, get step() {
  return l10n(userKo("이") + " 하실 일이 있어요", "Something for you to do");
}, get question() {
  return l10n("답하실 질문이 있어요", "A question for you");
} };
const GOTO = () => RegExp(`^/#/(?:${leadRole()}|admin|step/[0-9]{1,12}|${leadRole()}/question/[1-9][0-9]{0,11}|approvals/[1-9][0-9]{0,11}|${leadRole()}/notify/[1-9][0-9]{0,15})$`);
const PATHS = { approval: "#/admin", prompt: "#/admin", step: "#/admin", get notify() {
  return "#/" + leadRole();
}, get message() {
  return "#/" + leadRole();
} };
const clip = (text, n = 90) => {
  const t = String(text ?? "").replace(/[`*_#>~[\]]/gu, "").replace(/\s+/gu, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
export const deskMode = (prefs) => !prefs.notify ? "off" : prefs.sound ? "on" : "sound-off";
export const permissionLine = (permission) => permission === "denied" ? l10n("브라우저에서 알림이 막혀 있어요", "The browser blocks notifications") : permission === "unsupported" ? l10n("이 브라우저는 알림을 지원하지 않아요", "This browser doesn't do notifications") : "";
export function readPrefs(storage) {
  try {
    const v = JSON.parse(storage?.getItem(PREFS_KEY) ?? "null");
    return { notify: v?.notify !== false, sound: v?.sound !== false };
  } catch {
    return { notify: true, sound: true };
  }
}
export const NOTES = [{ hz: 880, at: 0, len: 0.22 }, { hz: 1318.51, at: 0.14, len: 0.42 }];
export function createChime(win = globalThis) {
  let ctx = null;
  const context = () => {
    if (ctx) return ctx;
    const Audio = win.AudioContext || win.webkitAudioContext;
    return Audio ? ctx = new Audio() : null;
  };
  return { unlock() {
    try {
      const c = context();
      if (c?.state === "suspended") void c.resume();
    } catch {
    }
  }, play() {
    const c = context();
    if (!c) return false;
    if (c.state === "suspended") {
      try {
        void c.resume();
      } catch {
      }
      return false;
    }
    const t0 = c.currentTime + 0.02, master = c.createGain();
    master.gain.value = 0.18;
    master.connect(c.destination);
    for (const note of NOTES) {
      const osc = c.createOscillator(), gain = c.createGain(), start = t0 + note.at;
      osc.type = "sine";
      osc.frequency.value = note.hz;
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.exponentialRampToValueAtTime(1, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + note.len);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + note.len + 0.05);
    }
    return true;
  } };
}
export function createDesk({ win = globalThis, doc = globalThis.document, storage = (() => {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
})(), Notification: Note = win.Notification, chime = createChime(win), now = Date.now, presence = () => null, chatVisible = () => false, open = (path) => {
  try {
    win.focus?.();
    if (win.location) win.location.hash = path;
  } catch {
  }
}, registration = (() => {
  let reg = null;
  try {
    win.navigator?.serviceWorker?.ready?.then((r) => {
      reg = r;
    }, () => {
    });
  } catch {
  }
  return () => reg;
})() } = {}) {
  const claimed = /* @__PURE__ */ new Set(), told = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
  const prefs = () => readPrefs(storage);
  const emit = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (error) {
        console.error(error);
      }
    }
  };
  const onStorage = (event) => {
    if (!event || event.key === null || event.key === PREFS_KEY) emit();
  };
  const permission = () => Note?.permission ?? "unsupported";
  const focused = () => !!doc && doc.visibilityState !== "hidden" && doc.hasFocus?.() !== false;
  function claim(id) {
    if (claimed.has(id)) return false;
    claimed.add(id);
    try {
      const at = now(), seen = (JSON.parse(storage?.getItem(SEEN_KEY) ?? "[]") || []).filter((e) => at - e[1] < SEEN_FOR);
      if (seen.some((e) => e[0] === id)) return false;
      storage?.setItem(SEEN_KEY, JSON.stringify([...seen, [id, at]].slice(-SEEN_KEEP)));
    } catch {
    }
    return true;
  }
  function raise({ id, title, body, path, quiet = false }) {
    if (quiet && focused()) return { shown: false, sounded: false, why: "focused" };
    if (id && !claim(id)) return { shown: false, sounded: false, why: "claimed" };
    const p = prefs(), asleep = presence() === "asleep", out = { shown: false, sounded: false, why: null };
    if (p.notify && permission() === "granted") {
      const options = { body, tag: "home-desk-" + (id ?? title), icon: "/icon-v6-192.png", silent: true };
      const byPage = () => {
        try {
          const n = new Note(title, { ...options, data: { path } });
          n.onclick = () => {
            try {
              n.close?.();
            } catch {
            }
            open(path);
          };
          return true;
        } catch {
          return false;
        }
      };
      const reg = registration();
      if (typeof reg?.showNotification === "function") {
        try {
          Promise.resolve(reg.showNotification(title, { ...options, data: { path: "/" + path, role: leadRole() } })).catch(byPage);
          out.shown = true;
        } catch {
          out.shown = byPage();
        }
      } else out.shown = byPage();
    }
    if (p.notify && p.sound && !asleep) {
      try {
        out.sounded = chime.play() !== false;
      } catch {
      }
    } else if (p.notify && p.sound) out.why = "asleep";
    return out;
  }
  const api = { prefs, permission, focused, subscribe(fn) {
    if (!listeners.size) {
      try {
        win.addEventListener?.("storage", onStorage);
      } catch {
      }
    }
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
      if (!listeners.size) {
        try {
          win.removeEventListener?.("storage", onStorage);
        } catch {
        }
      }
    };
  }, async set(key, on) {
    if (!["notify", "sound"].includes(key)) return prefs();
    const next = { ...prefs(), [key]: !!on };
    try {
      storage?.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
    }
    if (on) chime.unlock();
    const asking = key === "notify" && on && permission() === "default" ? (async () => {
      try {
        await Note.requestPermission();
      } catch {
      }
    })() : null;
    emit();
    if (asking) {
      await asking;
      emit();
    }
    return next;
  }, arm() {
    if (!doc?.addEventListener) return () => {
    };
    const first = () => {
      off();
      chime.unlock();
      if (prefs().notify && permission() === "default") {
        try {
          void Note.requestPermission();
        } catch {
        }
      }
    };
    const off = () => {
      for (const type of ["pointerdown", "keydown"]) doc.removeEventListener(type, first, true);
    };
    for (const type of ["pointerdown", "keydown"]) doc.addEventListener(type, first, true);
    return off;
  }, notice(payload) {
    const k = payload?.k, id = typeof payload?.i === "string" ? payload.i.slice(0, 80) : null;
    if (!id) return null;
    if (k === "notify") {
      const line = clip(payload.t, 60);
      return line ? raise({ id: "notice:" + id, title: leadKo(), body: line, path: PATHS.notify }) : null;
    }
    if (k === "question") return /^[1-9][0-9]{0,11}$/.test(payload.s ?? "") ? raise({ id: "notice:" + id, title: "ARTEMIS", body: COPY.question, path: "#/" + leadRole() + "/question/" + payload.s }) : null;
    if (k === "approval" && /^[1-9][0-9]{0,11}$/.test(payload.s ?? "")) return raise({ id: "notice:" + id, title: "ARTEMIS", body: COPY.approval, path: "#/approvals/" + payload.s });
    const body = COPY[k];
    return typeof body === "string" && PATHS[k] ? raise({ id: "notice:" + id, title: "ARTEMIS", body, path: PATHS[k] }) : null;
  }, turn(event, items) {
    if (event?.type !== "turn" || event.turn?.phase !== "completed") return null;
    const key = event.turn.turnKey ?? null;
    let last = null;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.role === "user" && !isPost(item)) break;
      if (item.role === "assistant" && !isPost(item) && !item.streaming && (item.turnKey ?? null) === key && String(item.text ?? "").trim()) {
        last = item;
        break;
      }
    }
    if (!last || told.has(last.key)) return null;
    const at = Date.parse(last.at);
    if (Number.isFinite(at) && now() - at > FRESH) return null;
    if (!withoutNoReply(withKeepWarm(items)).some((item) => item.key === last.key)) return null;
    told.add(last.key);
    if (told.size > 200) told.delete(told.values().next().value);
    return raise({ id: "chat:" + last.key, title: leadKo(), body: clip(last.text), path: PATHS.message, quiet: chatVisible() });
  }, attach(store) {
    const offs = [store.subscribe((event) => api.turn(event, store.items)), api.arm(), api.listen()];
    return () => {
      for (const off of offs) off();
    };
  }, listen() {
    const sw = win.navigator?.serviceWorker;
    if (!sw?.addEventListener) return () => {
    };
    const onMessage = (event) => {
      const path = event?.data?.path;
      if (event?.data?.t === "goto" && typeof path === "string" && GOTO().test(path)) open(path.slice(1));
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener?.("message", onMessage);
  } };
  return api;
}
const deps = { enabled: false, presence: () => null, chatVisible: () => false };
export const configureDesk = (options) => Object.assign(deps, options);
let shared = null;
export const getDesk = () => shared ??= (() => {
  const desk = createDesk({ presence: () => deps.presence(), chatVisible: () => deps.chatVisible() }), { notice, turn } = desk;
  return Object.assign(desk, { notice: (payload) => deps.enabled ? notice(payload) : null, turn: (event, items) => deps.enabled ? turn(event, items) : null });
})();
