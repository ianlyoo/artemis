import { glyph } from "./icons.js";
import { termSocket } from "./mux.js";
import { terminalHTTP } from "./term-http.js";
import { lead } from "../names.js";
export const HINT = "Agents can read this screen. Type secrets only into prompts that hide them.";
const CODE_REASONS = { 4410: "lead_changed" };
export const LINES = Object.freeze({ connecting: "Connecting…", retrying: "Disconnected · reconnecting…", exited: "The terminal ended", get not_found() {
  return `Not one of ${lead()}'s terminals, or already closed`;
}, get lead_changed() {
  return lead() + " changed, so this terminal closed";
}, forbidden: "This device can't open it", too_many: "Too many terminals open · close another one", get offline() {
  return "Can't reach " + lead();
}, idle: "Disconnected after a long idle", rate: "Disconnected: input came too fast", closed: "Disconnected" });
export const LINE_WAIT = "Connecting…";
const RETRY = new Set(["offline", "no_target", "version_mismatch", "attach_failed", "observe_failed", "slow", "shutdown", ""]);
const BACKOFF = [1e3, 2e3, 5e3, 1e4, 3e4];
export const PIECE = 4096;
export function holdKey(held, { key = "", ctrlKey, metaKey, altKey, isComposing } = {}, line = false) {
  if (ctrlKey || metaKey || altKey || isComposing) return null;
  if (line && key === "Backspace") return held.slice(0, -1);
  const text = [...key].length === 1 ? key : line ? void 0 : { Enter: "\r", Backspace: "", Tab: "	" }[key];
  if (text === void 0) return null;
  return held.length + text.length <= PIECE ? held + text : held;
}
const OP = { output: 1, restore: 5 };
export function restoreSize(bytes) {
  const lines = new TextDecoder().decode(bytes).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[^[\]]|\r/g, "").split("\n");
  return { rows: Math.min(500, lines.length), cols: Math.min(1e3, Math.max(...lines.map((line) => [...line].length))) };
}
export const PROMPT_ENDS = Object.freeze(["$ ", "# ", "% ", "> ", "❯ "]);
export const atPrompt = (before, own = []) => typeof before === "string" && [...PROMPT_ENDS, ...own].some((end) => before.endsWith(end));
export const QUIET = 3e3;
const seen = new Set(), SEEN_MOST = 4, LEARN_QUIET = 1e3, OWN_END = /([^\p{L}\p{N}\s:?.,;!'"\x60)\]}] )$/u;
export const seenEnds = () => [...seen];
export function clipKey({ key = "", code = "", ctrlKey = false, metaKey = false, shiftKey = false, altKey = false } = {}, { mac = false, selection = false } = {}) {
  if (altKey) return null;
  const letter = /^[a-z]$/i.test(key) ? key.toLowerCase() : /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : "";
  if (letter === "v" && (mac ? metaKey && !ctrlKey : ctrlKey && !metaKey)) return "paste";
  if (letter === "v" && mac && ctrlKey && shiftKey && !metaKey) return "read";
  if (letter === "c" && !mac && ctrlKey && !metaKey && selection) return "copy";
  return null;
}
const MAC = /Mac|iPhone|iPad|iPod/;
export const KEYS = Object.freeze(["Esc", "Tab", "Ctrl", "Ctrl-C", "←", "↑", "↓", "→"]);
const KEY_TEXT = { "Ctrl-C": "^C" };
const ARROW = { "↑": "A", "↓": "B", "→": "C", "←": "D" };
export function keySequence(name, applicationCursor = false, ctrl = false) {
  if (name in ARROW) return ctrl ? `\x1B[1;5${ARROW[name]}` : `\x1B${applicationCursor ? "O" : "["}${ARROW[name]}`;
  return { Esc: "\x1B", Tab: "	", "Ctrl-C": "" }[name] ?? null;
}
const JAMO = "ㅁㅠㅊㅇㄷㄹㅎㅗㅑㅓㅏㅣㅡㅜㅐㅔㅂㄱㄴㅅㅕㅍㅈㅌㅛㅋ";
export function ctrlChar(text) {
  if (typeof text !== "string" || [...text].length !== 1) return null;
  const at = JAMO.indexOf(text), char = at >= 0 ? String.fromCharCode(97 + at) : text;
  if (char === " ") return "\0";
  if (char === "?") return "";
  const code = char.toUpperCase().charCodeAt(0);
  return code >= 64 && code <= 95 ? String.fromCharCode(code - 64) : null;
}
export const SECRET_PROMPT = /(?:pass(?:word|phrase|code)?|secret|token|\b(?:keys?|pin|otp)\b|암호|비밀번호)[^\n]{0,120}?[:：]\s*$/i;
export const secretPrompt = (before) => typeof before === "string" && SECRET_PROMPT.test(before);
export const SIZE_RANGE = Object.freeze([10, 24]);
const sized = (px) => Math.round(Math.min(SIZE_RANGE[1], Math.max(SIZE_RANGE[0], px)));
const PASTE_GLYPH = "M9.5 4h5a1 1 0 0 1 1 1v1.5h-7V5a1 1 0 0 1 1-1z M8.5 5.5H7A1.5 1.5 0 0 0 5.5 7v12A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 17 5.5h-1.5 M9 12h6 M9 15.5h4";
export const CATCH_LINE = "Long-press here, then Paste";
export function pieces(text, max = PIECE) {
  const out = [];
  let piece = "", size = 0;
  for (const char of text) {
    const point = char.codePointAt(0), bytes = point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    if (size + bytes > max && piece) {
      out.push(piece);
      piece = "";
      size = 0;
    }
    piece += char;
    size += bytes;
  }
  if (piece) out.push(piece);
  return out;
}
let styles = null;
export function loadTerminalStyles(doc = document) {
  if (styles) return styles;
  styles = Promise.all(["../vendor/xterm/xterm.css", "./terminal.css"].map((path) => new Promise((resolve) => {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(path, import.meta.url).href;
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => resolve(false), { once: true });
    doc.head.append(link);
  })));
  return styles;
}
async function loadXterm() {
  const [{ Terminal }, { FitAddon }, { Unicode11Addon }, { SearchAddon }] = await Promise.all([import("../vendor/xterm/xterm.js"), import("../vendor/xterm/addon-fit.js"), import("../vendor/xterm/addon-unicode11.js"), import("../vendor/xterm/addon-search.js")]);
  return { Terminal, FitAddon, Unicode11Addon, SearchAddon };
}
export function mountTerminal(el, { id, input = "xterm", readOnly = false, onExit = () => {
}, theme = null, typed = "", hint = false, fresh = false, size: px = null, deps = {} } = {}) {
  const doc = deps.doc ?? document, win = deps.win ?? globalThis.window, loc = deps.location ?? location, clock = deps.now ?? Date.now;
  const Socket = deps.WebSocket ?? WebSocket, Observer = deps.ResizeObserver ?? globalThis.ResizeObserver;
  const Watch = deps.MutationObserver ?? win?.MutationObserver;
  const mode = input === "line" ? "line" : "xterm";
  const nav = win?.navigator ?? globalThis.navigator, mac = deps.mac ?? MAC.test(nav?.userAgentData?.platform || nav?.platform || "");
  const sheets = deps.styles ?? (deps.doc ? null : loadTerminalStyles(doc));
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  };
  const root = make("div", "term");
  root.dataset.mode = mode;
  root.dataset.state = "connecting";
  const screen = make("div", "term-screen");
  const status = make("p", "term-status", LINES.connecting);
  status.setAttribute("aria-live", "polite");
  if (hint) {
    const note = make("div", "term-hint"), away = make("button", "ide-icon is-small term-hint-x");
    note.setAttribute("role", "note");
    away.type = "button";
    away.setAttribute("aria-label", "Dismiss");
    away.title = "Dismiss";
    away.append(glyph("close"));
    away.addEventListener("click", () => {
      const back = doc.activeElement === away;
      note.remove();
      if (back) (field ?? term)?.focus?.();
    });
    note.append(make("p", "term-hint-text", HINT), away);
    root.append(note);
  }
  root.append(screen, status);
  let line = null, field = null, sendButton = null;
  if (mode === "line") {
    line = make("div", "term-line");
    field = make("input", "term-line-field");
    Object.assign(field, { type: "text", autocomplete: "off", spellcheck: false, enterKeyHint: "send" });
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocorrect", "off");
    field.setAttribute("aria-label", "Line to send to the terminal");
    sendButton = make("button", "term-line-send", "Send");
    sendButton.type = "button";
    line.append(field, sendButton);
    root.append(line);
  }
  const lineReady = (on) => {
    if (!field) return;
    field.disabled = !on;
    sendButton.disabled = !on;
    field.placeholder = on || ended ? "" : LINE_WAIT;
  };
  el.append(root);
  let term = null, fit = null, search = null, socket = null, ready = false, ended = false, disposed = false;
  let attempt = 0, retryTimer = null, observer = null, themeWatch = null, sent = { rows: 0, cols: 0, claim: false }, copying = false, drawing = false;
  let chosen = Number.isFinite(px) ? sized(px) : null, ctrl = false;
  const ctrlWatch = /* @__PURE__ */ new Set();
  const latch = (on) => {
    if (ctrl === on) return;
    ctrl = on;
    for (const fn of ctrlWatch) fn(on);
  };
  const withCtrl = (data) => {
    if (!ctrl) return data;
    latch(false);
    return ctrlChar(data) ?? data;
  };
  let heard = 0, typedAny = false, learning = fresh ? 0 : null;
  let wanted = false, early = typeof typed === "string" ? typed.slice(0, PIECE) : "", everReady = false;
  screen.setAttribute("tabindex", "-1");
  const hold = (text) => {
    if (!everReady && !ended && !disposed && early.length + text.length <= PIECE) early += text;
  };
  const settle = () => {
    const next = field ? field.disabled ? null : field : term;
    if (readOnly || !next || !screen.hasAttribute("tabindex")) return;
    const at = doc.activeElement;
    if (at === screen || wanted && (!at || at === doc.body)) next.focus?.();
    wanted = false;
    screen.removeAttribute("tabindex");
  };
  screen.addEventListener("keydown", (event) => {
    if (event.target !== screen || everReady || ended || disposed) return;
    const next = holdKey(early, event, mode === "line");
    if (next === null) return;
    event.preventDefault();
    early = next;
  });
  const show = (state, text) => {
    root.dataset.state = state;
    status.textContent = text ?? "";
    status.hidden = !text;
  };
  const owner = () => (doc.hasFocus?.() ?? false) && doc.visibilityState !== "hidden";
  const transmit = (message) => {
    if (!ready || socket?.readyState !== 1) return false;
    socket.send(JSON.stringify(message));
    return true;
  };
  const type = (text) => {
    if (!ready || socket?.readyState !== 1) return false;
    typedAny = true;
    for (const piece of pieces(text)) transmit({ t: "i", d: piece });
    return true;
  };
  const size = (claim2 = owner(), again = false) => {
    if (!term || !ready || drawing) return;
    const rows = term.rows, cols = term.cols;
    if (!again && rows === sent.rows && cols === sent.cols && (!claim2 || sent.claim)) return;
    sent = { rows, cols, claim: claim2 };
    transmit({ t: "r", rows, cols, claim: claim2 });
  };
  const claim = () => {
    const was = sent;
    fit?.fit();
    if (sent === was) size(true, true);
  };
  const intoField = (text) => {
    const from = field.selectionStart ?? field.value.length, to = field.selectionEnd ?? from;
    field.value = field.value.slice(0, from) + text + field.value.slice(to);
    const at = Math.min(from + text.length, field.value.length);
    field.selectionStart = field.selectionEnd = at;
    if (!field.disabled) field.focus?.();
  };
  const pasteText = (text) => {
    if (typeof text !== "string" || !text || disposed || readOnly) return;
    if (field) intoField(text);
    else term?.paste(text);
  };
  let catcher = null;
  const dropCatcher = () => {
    const was = catcher;
    catcher = null;
    was?.remove();
  };
  const catchPaste = () => {
    if (disposed) return;
    if (!catcher) {
      const node = catcher = make("textarea", "term-catch");
      Object.assign(node, { rows: 1, placeholder: CATCH_LINE, autocomplete: "off", spellcheck: false });
      for (const [name, value] of [["aria-label", "Paste here"], ["autocapitalize", "off"], ["autocorrect", "off"]]) node.setAttribute(name, value);
      const hand = (text) => {
        dropCatcher();
        pasteText(text);
        (field ?? term)?.focus?.();
      };
      node.addEventListener("paste", (event) => {
        event.preventDefault();
        hand(event.clipboardData?.getData?.("text/plain") ?? "");
      });
      node.addEventListener("beforeinput", (event) => {
        event.preventDefault();
        const text = event.data ?? event.dataTransfer?.getData?.("text/plain") ?? "";
        if (/^insert(Text|ReplacementText|FromPaste)$/.test(event.inputType ?? "") && [...text].length > 1) hand(text);
      });
      node.addEventListener("input", () => {
        node.value = "";
      });
      node.addEventListener("blur", () => {
        if (catcher === node) dropCatcher();
      });
      root.insertBefore(node, line);
    }
    catcher.focus?.();
  };
  const clipboard = (event) => {
    const what = clipKey(event, { mac, selection: !!term?.hasSelection?.() });
    if (readOnly && what !== "copy") return false;
    if (event.type === "keydown") copying = what === "copy";
    if (!what) return true;
    if (event.type === "keydown" && what === "read") {
      event.preventDefault?.();
      nav?.clipboard?.readText?.().then(pasteText, () => {
      });
    }
    return false;
  };
  screen.addEventListener("copy", () => {
    if (copying) {
      copying = false;
      term?.clearSelection?.();
    }
  });
  if (line) {
    lineReady(false);
    const submit = () => {
      if (!ready) return;
      const text = field.value;
      if (type(`${text}\r`)) field.value = "";
    };
    sendButton.addEventListener("click", () => submit());
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      submit();
    });
    field.addEventListener("beforeinput", (event) => {
      if (!ctrl || event.isComposing || event.inputType !== "insertText") return;
      const code = ctrlChar(event.data ?? "");
      latch(false);
      if (code === null) return;
      event.preventDefault();
      type(code);
    });
    field.addEventListener("focus", claim);
  }
  if (field) screen.addEventListener("paste", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    pasteText(event.clipboardData?.getData?.("text/plain") ?? "");
  }, true);
  const beforeCursor = () => {
    const buffer = term?.buffer?.active;
    if (!buffer || buffer.type !== "normal") return null;
    return buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(false, 0, buffer.cursorX) ?? null;
  };
  const guard = () => {
    if (!term) return;
    const hidden = secretPrompt(beforeCursor());
    if (root.dataset.hidden === "true" === hidden) return;
    root.dataset.hidden = String(hidden);
    field?.setAttribute("aria-label", hidden ? "Hidden line to send to the terminal" : "Line to send to the terminal");
  };
  const learn = () => {
    learning = null;
    const end = typedAny || !ready ? null : beforeCursor()?.match(OWN_END)?.[1];
    if (end && !PROMPT_ENDS.includes(end) && seen.size < SEEN_MOST) seen.add(end);
  };
  const printed = () => {
    heard = clock();
    if (learning !== null) {
      clearTimeout(learning);
      learning = setTimeout(learn, LEARN_QUIET);
    }
  };
  const finish = (code, reason) => {
    if (ended) return;
    ended = true;
    ready = false;
    early = "";
    lineReady(false);
    show("closed", LINES[reason] ?? LINES.closed);
    try {
      onExit({ code, reason });
    } catch {
    }
  };
  const freeze = () => {
    readOnly = true;
    ended = true;
    ready = false;
    early = "";
    wanted = false;
    clearTimeout(retryTimer);
    clearTimeout(learning ?? void 0);
    learning = null;
    lineReady(false);
    if (line) line.hidden = true;
    dropCatcher();
    latch(false);
    if (term) term.options.disableStdin = true;
    screen.setAttribute("tabindex", "-1");
    const ws = socket;
    socket = null;
    ws?.close(1e3);
    show("closed", everReady ? "Closed · read-only history" : "Closed · no saved screen");
  };
  const connect = () => {
    if (disposed || ended || readOnly) return;
    const url = new URL(`/term/${encodeURIComponent(id)}/ws`, loc.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const relay = doc.documentElement?.hasAttribute?.("data-relay-state") === true;
    const ws = deps.WebSocket ? new Socket(url.href) : relay ? terminalHTTP(url.href) : termSocket(url.href);
    socket = ws;
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
      if (typeof event.data === "string") {
        let message = null;
        try {
          message = JSON.parse(event.data);
        } catch {
        }
        if (message?.t !== "ready") return;
        ready = true;
        attempt = 0;
        sent = { rows: 0, cols: 0, claim: false };
        if (term) term.options.disableStdin = mode === "line";
        lineReady(true);
        show("ready", "");
        fit?.fit();
        size();
        settle();
        if (!everReady) {
          everReady = true;
          const held = early;
          early = "";
          if (held && field) field.value += held;
          else if (held) type(held);
        }
        return;
      }
      const bytes = new Uint8Array(event.data);
      if (!term || bytes.length < 1) return;
      if (bytes[0] === OP.restore) {
        const data = bytes.subarray(1), need = restoreSize(data), was = { rows: term.rows, cols: term.cols };
        term.reset();
        if (need.rows > was.rows || need.cols > was.cols) {
          drawing = true;
          term.resize(Math.max(was.cols, need.cols), Math.max(was.rows, need.rows));
          term.write(data, () => {
            drawing = false;
            if (!disposed) {
              term.resize(was.cols, was.rows);
              fit?.fit();
              size();
              guard();
            }
          });
        } else term.write(data, guard);
        printed();
      } else if (bytes[0] === OP.output) {
        term.write(bytes.subarray(1), guard);
        printed();
      }
    });
    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      ready = false;
      if (term) term.options.disableStdin = true;
      lineReady(false);
      if (disposed) return;
      const reason = event.reason ?? "";
      if (RETRY.has(reason) && event.code !== 4e3 && attempt < BACKOFF.length) {
        show("connecting", LINES.retrying);
        retryTimer = setTimeout(connect, BACKOFF[attempt++]);
        return;
      }
      finish(event.code, CODE_REASONS[event.code] ?? (reason || (event.code === 1e3 ? "closed" : "offline")));
    });
  };
  const probe = (property, value) => {
    const node = make("i");
    node.style.cssText = `position:absolute;width:0;height:0;${property}:${value}`;
    screen.append(node);
    const resolved = win.getComputedStyle(node).getPropertyValue(property);
    node.remove();
    return resolved;
  };
  const tone = (name) => {
    const value = probe("color", `var(${name})`), ctx = doc.createElement("canvas").getContext?.("2d");
    if (!ctx) return value;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("") : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  };
  const TONES = { background: "--term-bg", foreground: "--term-fg", cursor: "--term-cursor", selectionBackground: "--term-sel" };
  const { minimumContrastRatio: contrast, fontSize: textSize, ...colours } = theme ?? {};
  const paint = () => {
    if (!term || disposed) return;
    const style = win?.getComputedStyle?.(screen), has = (name) => !!style?.getPropertyValue(name).trim();
    const next = {};
    for (const [key, name] of Object.entries(TONES)) if (has(name)) next[key] = tone(name);
    Object.assign(next, colours);
    if (next.background && !colours.cursorAccent) next.cursorAccent = next.background;
    if (Object.keys(next).length) term.options.theme = next;
    const ratio = contrast ?? (has("--term-contrast") ? Number(style.getPropertyValue("--term-contrast")) || 1 : null);
    if (ratio !== null) term.options.minimumContrastRatio = ratio;
    const px2 = textSize ?? (has("--term-size") ? parseFloat(probe("font-size", "var(--term-size)")) : NaN);
    const want = chosen ?? (Number.isFinite(px2) ? Math.max(13, px2) : null);
    if (want !== null && want !== term.options.fontSize) {
      term.options.fontSize = want;
      fit?.fit();
    }
  };
  const start = ({ Terminal, FitAddon, Unicode11Addon, SearchAddon }) => {
    if (disposed) return;
    term = new Terminal({ cursorBlink: true, scrollback: 5e3, allowProposedApi: true, disableStdin: true, fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" });
    fit = new FitAddon();
    search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.loadAddon(search);
    term.unicode.activeVersion = "11";
    term.open(screen);
    term.textarea?.setAttribute("autocomplete", "off");
    paint();
    void sheets?.then(paint);
    if (Watch && doc.documentElement) {
      themeWatch = new Watch(paint);
      themeWatch.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
    term.attachCustomKeyEventHandler?.(clipboard);
    term.onData((data) => {
      if (mode !== "xterm") return;
      const out = withCtrl(data);
      if (!type(out)) hold(out);
    });
    term.onResize(() => size());
    term.textarea?.addEventListener("focus", claim);
    if (Observer) {
      observer = new Observer(() => {
        fit.fit();
      });
      observer.observe(screen);
    }
    win?.addEventListener?.("focus", onFocus);
    fit.fit();
    settle();
    if (readOnly) freeze();
    else connect();
  };
  const onFocus = claim;
  Promise.resolve(deps.xterm ?? loadXterm()).then(start, () => finish(0, "offline"));
  return { element: root, mode, freeze, get state() {
    return root.dataset.state;
  }, send(text) {
    return type(text);
  }, key(name) {
    if (readOnly) return false;
    if (name === "Ctrl") {
      latch(!ctrl);
      return true;
    }
    const sequence = keySequence(name, term?.modes?.applicationCursorKeysMode, ctrl);
    latch(false);
    return sequence ? type(sequence) : false;
  }, get ctrl() {
    return ctrl;
  }, onCtrl(fn) {
    ctrlWatch.add(fn);
    return () => ctrlWatch.delete(fn);
  }, async paste() {
    if (disposed || readOnly) return "refused";
    let text;
    try {
      text = await nav?.clipboard?.readText?.();
    } catch {
      text = void 0;
    }
    if (disposed || readOnly) return "refused";
    if (typeof text !== "string") {
      catchPaste();
      return "refused";
    }
    if (!text) return "empty";
    pasteText(text);
    return "pasted";
  }, textSize(px2) {
    if (Number.isFinite(px2) && sized(px2) !== chosen) {
      chosen = sized(px2);
      if (term) {
        term.options.fontSize = chosen;
        fit?.fit();
      }
    }
    return chosen ?? term?.options?.fontSize ?? null;
  }, focus() {
    if (screen.hasAttribute("tabindex")) {
      wanted = true;
      screen.focus?.();
    } else (field ?? term)?.focus?.();
  }, find(text, { previous = false } = {}) {
    return previous ? search?.findPrevious(text) : search?.findNext(text);
  }, atPrompt() {
    return !!term && ready && clock() - heard >= QUIET && atPrompt(beforeCursor(), seenEnds());
  }, fit() {
    fit?.fit();
  }, dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    early = "";
    clearTimeout(retryTimer);
    clearTimeout(learning ?? void 0);
    observer?.disconnect();
    themeWatch?.disconnect();
    win?.removeEventListener?.("focus", onFocus);
    dropCatcher();
    ctrlWatch.clear();
    const ws = socket;
    socket = null;
    ws?.close(1e3);
    term?.dispose();
    root.remove();
  } };
}
export function keyRow(handle, { doc = document } = {}) {
  const row = doc.createElement("div");
  row.className = "term-keys";
  row.setAttribute("role", "toolbar");
  row.setAttribute("aria-label", "Terminal keys");
  const button = (name, press) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "term-key";
    node.dataset.key = name;
    node.addEventListener("mousedown", (event) => event.preventDefault());
    node.addEventListener("click", press);
    row.append(node);
    return node;
  };
  for (const name of KEYS) {
    const key = button(name, () => handle.key(name));
    key.textContent = KEY_TEXT[name] ?? name;
    if (KEY_TEXT[name]) key.setAttribute("aria-label", name);
    if (name === "Ctrl") {
      key.setAttribute("aria-pressed", String(!!handle.ctrl));
      handle.onCtrl?.((held) => key.setAttribute("aria-pressed", String(held)));
    }
  }
  const paste = button("Paste", () => void handle.paste?.());
  paste.classList.add("term-paste");
  paste.setAttribute("aria-label", "Paste");
  paste.title = "Paste";
  paste.append(glyph(PASTE_GLYPH));
  return row;
}
export async function closeTerminal(id, { fetch: request = fetch } = {}) {
  const response = await request(`/term/${encodeURIComponent(id)}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
  return response.ok || response.status === 404;
}
