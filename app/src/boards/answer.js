import { el, scope } from "./dom.js";
import { ARCHIVED } from "./reports.js";
import { has, userKo } from "../names.js";
const SAVE_AFTER = 700, RETRY = [2e3, 5e3, 15e3, 3e4];
const composing = new Set(), held = new Set();
export const answerComposing = () => composing.size > 0;
export function afterComposing(fn) {
  if (composing.size) held.add(fn);
  else fn();
}
const sent = new Map(), SENT_KEPT = 5;
export function remember(board, slot, text) {
  const key = board + "\n" + slot, list = (sent.get(key) ?? []).filter((t) => t !== text);
  list.push(text);
  sent.set(key, list.slice(-SENT_KEPT));
}
export function ownEcho(before, after, board) {
  const a = before?.blocks, b = after?.blocks;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || before.title !== after.title) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x?.type === "answer" && y?.type === "answer" && x.id === y.id && x.slot === y.slot) {
      if (x.text === y.text) continue;
      if (!sent.get(board + "\n" + y.slot)?.includes(y.text)) return false;
      continue;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
function release() {
  if (composing.size) return;
  const list = [...held];
  held.clear();
  for (const fn of list) {
    try {
      fn();
    } catch {
    }
  }
}
const fits = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
export function answerFor(board) {
  const id = board?.id;
  if (typeof id !== "string" || !id || board.archived || id.startsWith(ARCHIVED)) return null;
  if (board.source) return board.source.kind === "md" ? { board: id } : null;
  return !Array.isArray(board.blocks) || has("answers") ? { board: id } : null;
}
export function keptSlots() {
  const slots = new Map();
  return { get size() {
    return slots.size;
  }, node(key, block, draw) {
    let slot = slots.get(key);
    if (slot) slot.refresh(block);
    else {
      const owner = scope(), made = draw(owner);
      if (typeof made?.refresh !== "function") {
        owner.destroy();
        return made?.node;
      }
      slot = { owner, node: made.node, refresh: made.refresh };
      slots.set(key, slot);
    }
    slot.seen = true;
    return slot.node;
  }, sweep() {
    for (const [key, slot] of slots) {
      if (!slot.seen) {
        slot.owner.destroy();
        slots.delete(key);
      }
      slot.seen = false;
    }
  }, place(parent, nodes) {
    const held2 = nodes.find((node) => node.parentNode === parent && node.contains(document.activeElement));
    if (!held2) {
      parent.replaceChildren(...nodes);
      return;
    }
    for (const child of [...parent.childNodes]) if (child !== held2) child.remove();
    const at = nodes.indexOf(held2);
    held2.before(...nodes.slice(0, at));
    held2.after(...nodes.slice(at + 1));
  }, destroy() {
    for (const slot of slots.values()) slot.owner.destroy();
    slots.clear();
  } };
}
export function answerSlot(block, node, env) {
  const state = el("span", { class: "bv-answer-state", role: "status", "aria-live": "polite" });
  const head = el("div", { class: "bv-answer-head" }, el("span", { class: "bv-answer-who" }, userKo()), state);
  const root = el("div", { class: "bv-answer" }, head);
  node.append(root);
  if (!env?.answer?.board) {
    if (!block.text) node.hidden = true;
    root.append(el("div", { class: "bv-answer-body bv-prose bv-answer-read" }, block.text));
    return null;
  }
  const board = env.answer.board, slot = block.slot;
  const field = el("textarea", { class: "bv-answer-text", rows: "1", "aria-label": `${userKo()} · ${slot}`, spellcheck: "false", autocomplete: "off", autocapitalize: "off" });
  root.append(el("div", { class: "bv-answer-body bv-prose" }, field));
  field.value = block.text ?? "";
  root.addEventListener("mousedown", (event) => {
    if (event.target === field || event.button) return;
    event.preventDefault();
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  });
  let saved = field.value, latest = null, timer = 0, sending = null, failures = 0, gone = false, closed = false;
  const say = (words) => {
    if (state.textContent !== words) state.textContent = words;
  };
  const dirty = () => field.value !== saved;
  const owned = () => document.activeElement === field || composing.has(field) || dirty() || !!sending;
  const resize = () => {
    if (fits) return;
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  };
  say(saved ? "Saved" : "");
  function schedule() {
    clearTimeout(timer);
    if (!gone) timer = setTimeout(flush, SAVE_AFTER);
  }
  async function flush(keepalive = false) {
    clearTimeout(timer);
    if (gone || composing.has(field)) return;
    if (!dirty()) {
      if (!sending) say(saved ? "Saved" : "");
      return;
    }
    if (sending) return;
    const text = field.value;
    say("Saving…");
    sending = (async () => {
      try {
        const result = await env.api("/canvas/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board, slot, text }), keepalive: keepalive && text.length < 3e4 });
        if (result.status === 401) {
          location.assign("/login");
          return;
        }
        if (result.status === 404) {
          gone = true;
          say("This slot left the document; copy your text");
          return;
        }
        if (result.status === 400 && (await result.json().catch(() => null))?.error === "not_answerable") {
          gone = true;
          say("This board doesn’t take answers; copy your text");
          return;
        }
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        saved = text;
        failures = 0;
        remember(board, slot, text);
      } catch {
        if (closed) return;
        say("Not saved yet · retrying");
        timer = setTimeout(flush, RETRY[Math.min(failures++, RETRY.length - 1)]);
        return;
      } finally {
        sending = null;
      }
      if (closed) return;
      if (dirty()) schedule();
      else {
        say(saved ? "Saved" : "");
        settle();
      }
    })();
  }
  function settle() {
    if (latest === null || owned()) return;
    const next = latest;
    latest = null;
    if (next !== field.value) {
      field.value = next;
      resize();
    }
    saved = next;
    say(saved ? "Saved" : "");
  }
  field.addEventListener("compositionstart", () => {
    composing.add(field);
    clearTimeout(timer);
    say("Saving…");
  });
  field.addEventListener("compositionend", () => {
    composing.delete(field);
    resize();
    schedule();
    setTimeout(release);
  });
  field.addEventListener("input", (event) => {
    resize();
    if (event.isComposing || composing.has(field)) return;
    if (dirty()) say("Saving…");
    schedule();
  });
  field.addEventListener("blur", () => {
    composing.delete(field);
    setTimeout(release);
    void flush();
    setTimeout(settle);
  });
  const away = (event) => {
    if (event.type === "pagehide" || document.visibilityState === "hidden") void flush(true);
  };
  addEventListener("pagehide", away);
  document.addEventListener("visibilitychange", away);
  let observer = null;
  if (!fits && typeof ResizeObserver === "function") {
    let width = 0;
    observer = new ResizeObserver((entries) => {
      const now = entries[0]?.contentRect.width;
      if (now && now !== width) {
        width = now;
        resize();
      }
    });
    observer.observe(field);
  }
  env.own?.(() => {
    removeEventListener("pagehide", away);
    document.removeEventListener("visibilitychange", away);
    observer?.disconnect();
    composing.delete(field);
    setTimeout(release);
    if (dirty() && !gone) void flush(true);
    closed = true;
    clearTimeout(timer);
  });
  requestAnimationFrame(resize);
  return (next) => {
    if (typeof next?.text !== "string") return;
    if (next.text === field.value && !composing.has(field)) {
      latest = null;
      if (!sending) {
        saved = next.text;
        say(saved ? "Saved" : "");
      }
      return;
    }
    latest = next.text;
    settle();
  };
}
