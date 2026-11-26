import { deliveryCapabilities } from "./delivery-capabilities.js";
import { SAVE_DRAFT } from "../update.js";
import { el, svg } from "../boards/dom.js";
import { control } from "./visuals.js";
import { sendMode, fieldHeight } from "./controls.js";
import { prepareImage, IMAGE_LIMITS } from "./images.js";
import { createAttachments, xhrUpload, transferFiles, pastedFiles, fileSize } from "./attach.js";
import { IMAGE, isImage, trayOf, viewOf, refusedLine } from "./thumbs.js";
import { createContext, ACTS, busyLine, NOT_SENT } from "./context.js";
import { createDraftKeeper, DRAFT_LIMITS } from "./draft.js";
import { QUOTE_EVENT, withQuote, takeQuoteFocus } from "./quote.js";
import { agentName } from "./agents.js";
import { parseReply, withReply, withoutQuote } from "./reply.js";
import { replyGlyph } from "./reply-view.js";
import { holdReload } from "../stale.js";
import { createSendTrigger } from "./send-trigger.js";
import { createSecretPins, KEY_GLYPH } from "./secret-card.js";
import { createDictation } from "./dictation.js";
import { createSlashMenu } from "./slash.js";
import { lead, isLead, has, l10n } from "../names.js";
const PREFILLED = "Question added · edit it before you send";
const QUOTED = "Quoted · write your comment under it";
const LINES = { preparing: "Preparing the image…", uploading: "Uploading files… you can send once they are up", failed: "Some files didn't upload. Retry or remove them", drop: "Drop to attach", finishing: "Finishing…", queued: "Waiting its turn…", recording: "Listening… press again to stop", transcribing: "Transcribing…", unavailable: "Dictation isn't available in this browser" };
let serial = 0;
const glyph = (d, extra = {}) => svg("svg", { viewBox: "0 0 24 24", class: "composer-glyph", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", ...extra }, svg("path", { d }));
const GLYPHS = { plus: "M12 5v14 M5 12h14", up: "M12 19V5 M6 11l6-6 6 6", down: "m7 10 5 5 5-5", x: "M7.5 7.5l9 9 M16.5 7.5l-9 9", fold: "M8 4l4 4 4-4 M8 20l4-4 4 4", photo: "M6.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z M4.5 16l4.2-4.2a1 1 0 0 1 1.4 0L15 16.7 M13.5 15.2l1.7-1.7a1 1 0 0 1 1.4 0l2.9 2.9 M14.2 9a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0", camera: "M4.5 9a2 2 0 0 1 2-2h1.7l1.4-2h4.8l1.4 2h1.7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z M9 12.8a3 3 0 1 0 6 0a3 3 0 1 0-6 0", clip: "M19.5 11.6l-7.1 7.1a4.6 4.6 0 0 1-6.5-6.5l7.4-7.4a3.1 3.1 0 0 1 4.4 4.4l-7.4 7.4a1.5 1.5 0 0 1-2.2-2.2l6.8-6.8" };
const restart = (node, name) => {
  node.classList.remove(name);
  void node.offsetWidth;
  node.classList.add(name);
};
const SETTINGS = [{ key: "model", name: "Model", options: (settings) => settings.models, current: (settings) => settings.model }, { key: "thinking", name: "Thinking", options: (settings) => settings.models.find((model) => model.id === settings.model?.id)?.thinking ?? [], current: (settings) => settings.thinking }, { key: "mode", name: "Mode", options: (settings) => settings.modes, current: (settings) => settings.mode }];
const fixed = (setting, settings, id) => !settings.loading && !!id && !setting.options(settings).some((option) => option.id !== id);
function settingsBar({ store, say }) {
  const node = el("div", { class: "composer-settings" });
  let open = null;
  const pending = new Map();
  const close = () => {
    if (!open) return;
    open.menu.remove();
    open.button.setAttribute("aria-expanded", "false");
    open = null;
    removeEventListener("pointerdown", outside, true);
  };
  const outside = (event) => {
    if (open && !open.menu.contains(event.target) && !open.button.contains(event.target)) close();
  };
  const pickers = SETTINGS.map((setting) => {
    const label = el("span", { class: "pick-label" });
    const button = el("button", { type: "button", class: "composer-pick", "aria-haspopup": "listbox", "aria-expanded": "false", "data-key": setting.key }, label, glyph(GLYPHS.down, { class: "composer-glyph pick-chev" }));
    const picker = { setting, button, label };
    button.addEventListener("click", () => {
      if (open?.picker === picker) close();
      else show(picker);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        show(picker, true);
      }
    });
    return picker;
  });
  function show(picker, focus = false) {
    close();
    const settings = store.settings;
    if (!settings || settings.loading || settings.canChange === false) {
      say(settings?.loading ? "Loading the settings. Try again in a moment" : "Can't change this right now");
      return;
    }
    const { setting } = picker, now = pending.get(setting.key) ?? setting.current(settings)?.id;
    if (fixed(setting, settings, now)) {
      say(`${setting.name} can't be changed for this agent's provider`);
      return;
    }
    const options = setting.options(settings);
    const menu = el("div", { class: "pick-menu", role: "listbox", "aria-label": setting.name }, el("p", { class: "pick-name" }, setting.name), options.map((option) => {
      const on = option.id === now;
      const item = el("button", { type: "button", class: "pick-option" + (on ? " is-on" : ""), role: "option", "aria-selected": String(on), "data-id": option.id }, el("i", { class: "pick-dot", "aria-hidden": "true" }), el("span", {}, option.label ?? option.id));
      item.addEventListener("click", () => {
        close();
        choose(picker, option);
        picker.button.focus({ preventScroll: true });
      });
      return item;
    }));
    menu.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll(".pick-option")], at = items.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        picker.button.focus({ preventScroll: true });
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    });
    picker.button.parentElement.append(menu);
    const box = node.closest(".composer-box") ?? node, left = picker.button.offsetLeft;
    menu.style.left = Math.max(0, Math.min(left, box.clientWidth - menu.offsetWidth - 8)) + "px";
    picker.button.setAttribute("aria-expanded", "true");
    open = { picker, menu, button: picker.button };
    addEventListener("pointerdown", outside, true);
    if (focus) (menu.querySelector(".is-on") ?? menu.querySelector(".pick-option"))?.focus();
  }
  async function choose(picker, option) {
    const { setting } = picker, settings = store.settings;
    if (!settings || option.id === setting.current(settings)?.id) return;
    pending.set(setting.key, option.id);
    paint();
    const result = await store.changeSettings(setting.key, option.id);
    pending.delete(setting.key);
    paint();
    if (result.ok) restart(picker.button, "is-confirmed");
    else {
      say(result.line);
      restart(picker.button, "is-refused");
    }
  }
  function labelOf(setting, settings, id) {
    const hit = setting.options(settings).find((option) => option.id === id), current = setting.current(settings);
    return hit?.label ?? (current?.id === id ? current.label : null) ?? id ?? "";
  }
  function paint() {
    const settings = store.settings;
    node.hidden = !settings || store.agent?.state === "ended";
    if (!settings) {
      close();
      return;
    }
    for (const { setting, button, label } of pickers) {
      const wait = pending.get(setting.key), id = wait ?? setting.current(settings)?.id ?? null, text = labelOf(setting, settings, id);
      button.hidden = !setting.options(settings).length && !id;
      if (label.textContent !== text) label.textContent = text;
      button.toggleAttribute("aria-busy", !!wait);
      const readonly = fixed(setting, settings, id);
      button.classList.toggle("is-off", !!settings.loading || settings.canChange === false);
      button.classList.toggle("is-readonly", readonly);
      button.setAttribute("aria-haspopup", readonly ? "false" : "listbox");
      button.title = `${setting.name}: ${text}` + (settings.loading ? " · loading…" : readonly ? " · read-only for this provider" : settings.canChange === false ? " · can't change right now" : " · click to change");
    }
  }
  node.append(...pickers.map((picker) => el("span", { class: "pick" }, picker.button)));
  paint();
  return { node, paint, close, get open() {
    return !!open;
  } };
}
export function createComposer({ store, phone = false, canSend = () => null, onBlocked = () => {
}, onSent = () => {
}, onView = null, upload = xhrUpload, prepare = prepareImage, storage = globalThis.localStorage ?? null, peek = null, identity = null, name = () => identity ? agentName(identity) : lead(), draftKey, active = () => true }) {
  const field = el("textarea", { class: "composer-field", rows: "1", enterkeyhint: phone ? "enter" : "send", autocomplete: "off" });
  const slash = createSlashMenu({ field, store, phone });
  const sizer = el("textarea", { class: "composer-sizer", rows: "1", tabindex: "-1", readonly: true, "aria-hidden": "true" });
  const tray = el("div", { class: "composer-tray", hidden: true });
  const line = el("p", { class: "composer-line", role: "status", "aria-live": "polite" });
  const input = el("input", { type: "file", multiple: true, hidden: true, tabindex: "-1" });
  const photos = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true, tabindex: "-1" });
  const camera = el("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, tabindex: "-1" });
  const secrets = identity && !isLead(identity.role) ? null : createSecretPins({ store });
  const pick = el("button", { type: "button", class: "composer-icon composer-attach", "aria-label": "Attach", title: phone ? "Attach photos or files" : secrets ? "Attach files or a secret · paste or drop files too" : "Attach files or images · paste or drop them too" }, glyph(GLYPHS.plus));
  let attachMenu = null;
  const closeAttach = () => {
    if (!attachMenu) return;
    attachMenu.remove();
    attachMenu = null;
    pick.setAttribute("aria-expanded", "false");
    removeEventListener("pointerdown", outsideAttach, true);
  };
  const outsideAttach = (event) => {
    if (attachMenu && !attachMenu.contains(event.target) && !pick.contains(event.target)) closeAttach();
  };
  const ATTACH = [...phone ? [{ key: "photos", label: "Photos", d: GLYPHS.photo, input: photos }, { key: "camera", label: "Camera", d: GLYPHS.camera, input: camera }] : [], { key: "files", label: "Files", d: GLYPHS.clip, input }, ...secrets ? [{ key: "secret", label: l10n("비밀값", "Secret"), d: KEY_GLYPH, run: () => {
    placePins();
    secrets.start();
  } }] : []];
  const placePins = () => {
    const end = form.closest?.(".chat")?.querySelector?.(".chat-scroll");
    if (end) secrets.place(end);
    else if (!secrets.node.parentNode) form.parentNode?.insertBefore(secrets.node, form);
  };
  if (secrets) queueMicrotask(() => {
    if (!secrets.node.hidden && form.parentNode) placePins();
  });
  function openAttach() {
    settings.close();
    attachMenu = el("div", { class: "pick-menu attach-menu", role: "menu", "aria-label": "Attach" }, ATTACH.map((item) => {
      const option = el("button", { type: "button", class: "pick-option attach-option", role: "menuitem", "data-key": item.key }, glyph(item.d, { class: "composer-glyph attach-glyph" }), el("span", {}, item.label));
      option.addEventListener("click", () => {
        closeAttach();
        if (item.input) item.input.click();
        else item.run();
      });
      return option;
    }));
    attachMenu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAttach();
        pick.focus({ preventScroll: true });
      }
    });
    bar.append(attachMenu);
    pick.setAttribute("aria-expanded", "true");
    addEventListener("pointerdown", outsideAttach, true);
  }
  if (phone || secrets) {
    pick.setAttribute("aria-haspopup", "menu");
    pick.setAttribute("aria-expanded", "false");
  }
  pick.addEventListener("click", () => {
    if (!phone && !secrets) input.click();
    else if (attachMenu) closeAttach();
    else openAttach();
  });
  const send = el("button", { type: "submit", class: "composer-send", "aria-label": "Send", title: phone ? "Send" : "Enter to send · Shift+Enter for a new line" }, glyph(GLYPHS.up, { "stroke-width": 2.1 }));
  const stop = el("button", { type: "button", class: "composer-stop", "aria-label": "Stop", hidden: true }, el("i", { class: "composer-stop-mark", "aria-hidden": "true" }));
  const fold = el("button", { type: "button", class: "composer-collapse", "aria-label": "Collapse", title: "Collapse · click the message to open it again", hidden: true }, glyph(GLYPHS.fold));
  const drop = el("div", { class: "composer-drop", "aria-hidden": "true" }, LINES.drop);
  const say = (text) => {
    told = text;
    clearTimeout(toldTimer);
    if (text) toldTimer = setTimeout(() => {
      told = null;
      paint();
    }, 6e3);
    paint();
  };
  const settings = settingsBar({ store, say: (text) => say(text) });
  async function act(kind) {
    const state = canSend();
    if (state) return state;
    if (kind === "restart") {
      const result2 = await store.renew();
      return result2.ok ? ACTS.restart.told : result2.line ?? NOT_SENT;
    }
    if (kind === "compact" && store.turn?.running) return busyLine(name());
    const sending = track(store.send({ text: ACTS[kind].text }));
    onSent();
    const result = await sending;
    return result.ok ? ACTS[kind].told : result.line ?? NOT_SENT;
  }
  const context = createContext({ store, phone, act, name });
  const mic = !has("dictation") ? null : createDictation({ field, label: "Dictate", title: "Speak to type · hold while you talk, or press again to stop", onText: () => paint(), onState: (state) => {
    if (state !== "stopped") say(LINES[state]);
    else if (told === LINES.recording || told === LINES.transcribing) say(null);
  } });
  const no = control("Cancel", { class: "composer-ask-no", onclick: () => closeAsk(true) }), yes = control("Stop", { class: "composer-ask-yes", onclick: () => confirmStop() });
  const question = el("span", { class: "composer-ask-q" });
  const ask = el("div", { class: "composer-ask", role: "alertdialog", hidden: true }, question, el("span", { class: "composer-ask-answer" }, no, yes));
  const bar = el("div", { class: "composer-bar" }, pick, input, ...phone ? [photos, camera] : [], settings.node, el("span", { class: "composer-gap" }), context.node, mic?.node, send, stop);
  const box = el("div", { class: "composer-box" }, tray, slash.hint, el("div", { class: "composer-text" }, field, sizer, ...phone ? [] : [fold]), bar, ask, slash.menu);
  let pendingReply = null;
  const replyMeta = el("span", { class: "reply-meta" }), replyCopy = el("span", { class: "composer-reply-copy" });
  const removeReply = el("button", { type: "button", class: "composer-reply-remove", "aria-label": "Remove quote", title: "Remove quote", onclick: () => {
    pendingReply = null;
    paintReply();
    keep();
    field.focus({ preventScroll: true });
  } }, glyph(GLYPHS.x));
  const replyBar = el("div", { class: "composer-reply", hidden: true }, replyGlyph(), el("div", { class: "composer-reply-text" }, replyMeta, replyCopy), removeReply);
  const form = el("form", { class: "composer" }, replyBar, box, line);
  let named = null;
  function paintName() {
    const now = name();
    if (now === named) return;
    named = now;
    field.setAttribute("placeholder", "Message " + now);
    field.setAttribute("aria-label", "Message " + now);
    form.setAttribute("aria-label", "Message " + now);
    stop.setAttribute("title", `Stop ${now}'s turn`);
    question.textContent = `Stop ${now}'s turn?`;
    ask.setAttribute("aria-label", question.textContent);
  }
  paintName();
  function paintReply() {
    replyBar.hidden = !pendingReply;
    replyMeta.textContent = pendingReply ? `${pendingReply.who} · ${pendingReply.time}` : "";
    replyCopy.textContent = pendingReply?.text ?? "";
  }
  const outgoing = () => withReply(pendingReply, field.value);
  function loadWords(text) {
    const reply = parseReply(text);
    pendingReply = reply;
    field.value = reply ? reply.body : text;
    paintReply();
  }
  paintReply();
  const images = [];
  let preparing = 0, told = null, toldTimer = 0, collapsed = false, stopping = 0, declined = null, keepTimer = 0, gone = false, queueing = false;
  const heard = (run) => () => {
    const words = mic?.finish();
    if (words) void words.then(() => {
      if (!gone) run();
    });
    else run();
  };
  const trigger = createSendTrigger({ send, form, busy: () => deliveryCapabilities(store.agent?.role).queue && leadChat && !!store.turn?.running, canNow: () => !queueing && !empty() && !blocked() && !canSend(), canQueue: () => !queueing && !!field.value.trim() && !blocked() && !canSend(), now: heard(submitNow), queue: heard(submitQueue) });
  const keeper = createDraftKeeper({ storage, key: draftKey });
  const keep = () => {
    if (gone) return;
    clearTimeout(keepTimer);
    keepTimer = setTimeout(flush, 300);
  };
  const flush = () => {
    clearTimeout(keepTimer);
    keepTimer = 0;
    keeper.save({ text: outgoing(), uploads: files.ready });
  };
  const hidden = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const files = createAttachments({ upload, onChange: () => paint() });
  let sends = 0;
  const track = (sending) => {
    sends++;
    const done = () => {
      sends--;
    };
    Promise.resolve(sending).then(done, done);
    return sending;
  };
  const unhold = holdReload(() => images.length > 0 || preparing > 0 || !!files.uploading || !!files.failed || sends > 0);
  const blocked = () => preparing ? LINES.preparing : files.uploading ? LINES.uploading : files.failed ? LINES.failed : null;
  const shown = new Map(), broken = new Set();
  const entries = () => files.entries.map((entry) => entry.preview && broken.has(entry.key) ? { ...entry, preview: null } : entry);
  const remover = (name2, onclick) => el("button", { type: "button", class: "composer-x", "aria-label": "Remove " + name2, title: "Remove", onclick }, glyph(GLYPHS.x, { "stroke-width": 2.4 }));
  function thumb(item) {
    const img = el("img", { src: item.preview, alt: item.name, draggable: "false" });
    if (item.kind === "file") img.addEventListener("error", () => {
      broken.add(item.key);
      shown.delete(item.key);
      paint();
    }, { once: true });
    const button = el("button", { type: "button", class: "composer-view", "aria-label": "View " + item.name, "data-peek-plain": "", onclick: () => view(item.key, img) }, img);
    const retry = item.kind === "file" ? control("Retry", { class: "composer-thumb-retry", "aria-label": "Upload again " + item.name, onclick: () => files.retry(item.key) }) : null;
    const node = el("figure", { class: "composer-image" }, button, retry, remover(item.name, () => {
      if (item.kind === "file") files.remove(item.key);
      else take(item.key);
      field.focus({ preventScroll: true });
    }));
    return { node, set(next) {
      node.dataset.status = next.status;
      node.style.setProperty("--progress", next.status === "uploading" ? next.progress : 1);
      if (retry) retry.hidden = next.status !== "failed";
      const tip = next.status === "failed" && next.line ? `${next.tip} · ${next.line}` : next.tip;
      button.setAttribute("data-peek-line", tip);
      if (!peek) button.title = tip;
    } };
  }
  function view(key, img) {
    if (!onView || !shown.has(key)) return;
    const { images: list, index } = viewOf(trayOf(images, entries()).thumbs, key);
    onView(list, index, img);
  }
  function fileLine(entry) {
    const meta = el("span", { class: "composer-file-meta" }), retry = control("Retry", { class: "composer-remove", "aria-label": "Upload again " + entry.name, onclick: () => files.retry(entry.key) });
    const node = el("div", { class: "composer-file" }, el("span", { class: "composer-file-name" }, entry.name), meta, retry, remover(entry.name, () => {
      files.remove(entry.key);
      field.focus({ preventScroll: true });
    }));
    return { node, set(next) {
      node.dataset.status = next.queued ? "queued" : next.status;
      const share = next.queued ? LINES.queued : next.progress >= 1 ? LINES.finishing : Math.min(99, Math.round(next.progress * 100)) + "%";
      meta.textContent = next.status === "uploading" ? share : next.status === "failed" ? next.line : fileSize(next.size);
      node.style.setProperty("--progress", next.status === "uploading" ? next.progress : 1);
      retry.hidden = next.status !== "failed";
    } };
  }
  const strip = el("div", { class: "composer-images" }), busy = el("figure", { class: "composer-image is-busy", "aria-label": LINES.preparing });
  const place = (parent, nodes) => {
    const now = parent.children;
    if (now.length !== nodes.length || nodes.some((node, n) => now[n] !== node)) parent.replaceChildren(...nodes);
  };
  function paint() {
    const wanted = [], parts = trayOf(images, entries());
    for (const item of parts.thumbs) {
      let node = shown.get(item.key);
      if (!node) shown.set(item.key, node = thumb(item));
      node.set(item);
      wanted.push(node.node);
    }
    if (preparing) wanted.push(busy);
    place(strip, wanted);
    const lines = parts.files.map((entry) => {
      let line2 = shown.get(entry.key);
      if (!line2) shown.set(entry.key, line2 = fileLine(entry));
      line2.set(entry);
      return line2.node;
    });
    const keys = new Set([...parts.thumbs.map((item) => item.key), ...parts.files.map((entry) => entry.key)]);
    for (const key of [...shown.keys()]) if (!keys.has(key)) shown.delete(key);
    for (const key of [...broken]) if (!keys.has(key)) broken.delete(key);
    place(tray, [...wanted.length ? [strip] : [], ...lines]);
    tray.hidden = !wanted.length && !lines.length;
    const stop2 = blocked();
    line.textContent = told ?? stop2 ?? "";
    line.classList.toggle("is-problem", !!told && told !== PREFILLED && told !== QUOTED && told !== LINES.recording && told !== LINES.transcribing || stop2 === LINES.failed);
    form.toggleAttribute("data-blocked", !!(stop2 || canSend()));
    form.toggleAttribute("data-empty", empty());
    field.disabled = queueing || store.agent?.state === "ended";
    pick.disabled = field.disabled;
    send.disabled = field.disabled;
    for (const button of tray.querySelectorAll("button")) button.disabled = field.disabled;
    settings.paint();
    slash.paint();
    grow();
    paintMode();
    keep();
  }
  const empty = () => !field.value.trim() && !images.length && !files.entries.length;
  const turnId = (turn) => String(turn?.turnKey ?? turn?.at ?? "");
  function paintMode() {
    const turn = store.turn ?? {};
    if (stopping && !turn.running) {
      clearTimeout(stopping);
      stopping = 0;
    }
    if (declined !== null && (!turn.running || turnId(turn) !== declined)) declined = null;
    const mode = stopping ? "stop" : sendMode({ running: !!turn.running, cancel: !!store.controls?.cancel, empty: empty(), declined: declined !== null });
    if (mode === "stop" && !send.hidden && document.activeElement === send) stop.focus({ preventScroll: true });
    send.hidden = mode === "stop";
    stop.hidden = mode !== "stop";
    send.toggleAttribute("aria-busy", queueing);
    trigger.paint();
    stop.disabled = !!stopping;
    stop.toggleAttribute("aria-busy", !!stopping);
    form.dataset.mode = mode;
    if (mode !== "stop" || stopping) closeAsk();
  }
  function openAsk() {
    if (stopping) return;
    ask.hidden = false;
    stop.setAttribute("aria-expanded", "true");
    yes.focus({ preventScroll: true });
  }
  function closeAsk(back = false) {
    if (ask.hidden) return;
    const inside = ask.contains(document.activeElement);
    ask.hidden = true;
    stop.setAttribute("aria-expanded", "false");
    if (back || inside) (stop.hidden ? field : stop).focus({ preventScroll: true });
  }
  async function confirmStop() {
    closeAsk();
    stopping = setTimeout(() => {
      stopping = 0;
      paintMode();
    }, 15e3);
    paintMode();
    const result = await store.cancel();
    if (result.ok) return;
    clearTimeout(stopping);
    stopping = 0;
    if (result.error === "idle") declined = turnId(store.turn);
    else say(result.line);
    paintMode();
  }
  stop.addEventListener("click", () => {
    if (ask.hidden) openAsk();
    else closeAsk(true);
  });
  ask.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAsk(true);
    }
  });
  function take(key) {
    const at = images.findIndex((image2) => image2.key === key);
    if (at < 0) return;
    const [image] = images.splice(at, 1);
    if (image.preview?.startsWith("blob:")) URL.revokeObjectURL(image.preview);
    paint();
  }
  async function add(list) {
    if (queueing) return;
    const asFiles = [], pictured = new Set();
    for (const file of list) {
      if (!IMAGE.test(file.type)) {
        asFiles.push(file);
        continue;
      }
      if (images.length + preparing >= IMAGE_LIMITS.count) {
        asFiles.push(file);
        pictured.add(file);
        continue;
      }
      preparing++;
      paint();
      try {
        const fitted = await prepare(file);
        images.push({ key: "i" + ++serial, data: fitted.data, mimeType: fitted.mimeType, bytes: fitted.bytes, preview: URL.createObjectURL(file), name: file.name });
      } catch {
        asFiles.push(file);
      } finally {
        preparing--;
      }
    }
    const refused = files.add(asFiles, { preview: (file) => pictured.has(file) ? URL.createObjectURL(file) : null });
    if (refused.length) say(refusedLine(refused, { other: files.entries.filter((entry) => !isImage(entry.mimeType)).length }));
    else paint();
  }
  function grow() {
    if (field.clientWidth === 0) return;
    const max = (parseFloat(getComputedStyle(field).lineHeight) || 24) * (phone ? 5 : 7) + 4;
    let next = null;
    for (let pass = 0; pass < 2; pass++) {
      sizer.value = "";
      const base = Math.min(sizer.scrollHeight, max);
      sizer.value = field.value;
      const want = Math.min(sizer.scrollHeight, max);
      next = fieldHeight({ want, base, collapsed });
      const tall = !phone && want > base + 1;
      if (form.hasAttribute("data-tall") === tall) break;
      form.toggleAttribute("data-tall", tall);
    }
    collapsed = next.collapsed;
    const height = next.height + "px";
    if (field.style.height !== height) field.style.height = height;
    fold.hidden = !next.collapsible;
    form.toggleAttribute("data-collapsed", collapsed);
  }
  fold.addEventListener("click", () => {
    collapsed = true;
    grow();
    field.blur();
    field.scrollTop = 0;
  });
  const unfold = () => {
    collapsed = false;
    grow();
  };
  field.addEventListener("focus", unfold);
  field.addEventListener("pointerdown", unfold);
  let width = 0;
  const widthWatch = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const now = field.clientWidth;
    if (now === width) return;
    const back = width === 0;
    width = now;
    if (!now) return;
    if (back) collapsed = false;
    grow();
  }) : null;
  widthWatch?.observe(field);
  const rest = () => {
    if (collapsed || !field.value) return;
    collapsed = true;
    grow();
    field.scrollTop = 0;
  };
  const viewport = phone ? globalThis.visualViewport ?? null : null;
  let seen = viewport ? { width: viewport.width, height: viewport.height } : null;
  const keyboard = () => {
    const now = { width: viewport.width, height: viewport.height }, away = now.width === seen.width && now.height > seen.height + 120;
    seen = now;
    if (away && document.activeElement === field) rest();
  };
  if (phone) form.addEventListener("focusout", (event) => {
    if (!form.contains(event.relatedTarget)) rest();
  });
  viewport?.addEventListener("resize", keyboard);
  const working = () => leadChat && !!store.turn?.running && !!field.value.trim();
  const submit = heard(() => {
    if (working()) void submitQueue();
    else deliver();
  });
  function deliver() {
    if (queueing || empty()) return;
    trigger.close();
    const text = outgoing(), stop2 = blocked(), state = stop2 ? null : canSend();
    if (stop2) {
      say(stop2);
      return;
    }
    if (state) {
      onBlocked(state);
      return;
    }
    const message = { text, images: images.map(({ data, mimeType, preview }) => ({ data, mimeType, preview })), attachments: files.ready };
    const refused = store.check(message);
    if (refused) {
      if (refused.error !== "empty_message") say(refused.line);
      field.focus();
      return;
    }
    void track(store.send(message));
    images.length = 0;
    files.clear({ keep: true });
    field.value = "";
    pendingReply = null;
    paintReply();
    told = null;
    collapsed = false;
    paint();
    flush();
    onSent();
  }
  async function submitQueue() {
    if (queueing || !working()) return null;
    trigger.close();
    const stop2 = blocked(), state = stop2 ? null : canSend();
    if (stop2) {
      say(stop2);
      return null;
    }
    if (state) {
      onBlocked(state);
      return null;
    }
    const message = { text: outgoing(), images: images.map(({ data, mimeType }) => ({ data, mimeType })), attachments: files.ready };
    const refused = store.check(message);
    if (refused) {
      say(refused.line);
      return null;
    }
    queueing = true;
    paint();
    const result = await track(store.addQueue(message));
    queueing = false;
    if (gone) return null;
    if (!result.ok) {
      say(result.line);
      paint();
      return null;
    }
    for (const image of images) if (image.preview?.startsWith("blob:")) URL.revokeObjectURL(image.preview);
    images.length = 0;
    files.clear();
    field.value = "";
    pendingReply = null;
    paintReply();
    told = null;
    collapsed = false;
    paint();
    flush();
    onSent();
    return result;
  }
  async function submitNow() {
    if (!working()) {
      deliver();
      return;
    }
    const result = await submitQueue();
    if (!result) return;
    const sent = await store.sendQueueNow(result.id);
    if (!gone && !sent.ok) say(sent.line);
  }
  for (const from of [input, photos, camera]) from.addEventListener("change", () => {
    const list = [...from.files];
    from.value = "";
    if (list.length) add(list);
  });
  const pasted = (transfer) => {
    const list = pastedFiles(transfer);
    if (list.length) add(list);
    return list.length > 0;
  };
  field.addEventListener("paste", (event) => {
    if (pasted(event.clipboardData)) event.preventDefault();
  });
  field.addEventListener("beforeinput", (event) => {
    if (event.inputType === "insertFromPaste" && pasted(event.dataTransfer)) event.preventDefault();
  });
  field.addEventListener("input", () => {
    if (told) {
      told = null;
      paint();
      return;
    }
    collapsed = false;
    form.toggleAttribute("data-empty", empty());
    grow();
    paintMode();
    keep();
  });
  field.addEventListener("keydown", (event) => {
    if (phone || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && working()) {
      event.preventDefault();
      heard(submitQueue)();
    } else if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  function dropOn(target) {
    let depth = 0;
    const carries = (event) => [...event.dataTransfer?.types ?? []].includes("Files");
    const off = () => {
      depth = 0;
      target.classList.remove("is-dropping");
      drop.remove();
    };
    target.addEventListener("dragenter", (event) => {
      if (!carries(event)) return;
      event.preventDefault();
      if (depth++ === 0) {
        target.classList.add("is-dropping");
        target.append(drop);
      }
    });
    target.addEventListener("dragover", (event) => {
      if (carries(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    target.addEventListener("dragleave", (event) => {
      if (carries(event) && --depth <= 0) off();
    });
    target.addEventListener("drop", (event) => {
      if (!carries(event)) return;
      event.preventDefault();
      off();
      add(transferFiles(event.dataTransfer));
    });
  }
  const prefill = (event) => {
    if (!active()) return;
    const text = typeof event.detail === "string" ? event.detail : event.detail?.text;
    if (typeof text !== "string" || !text.trim()) return;
    if (!field.value.includes(text)) field.value = field.value.trim() ? field.value.replace(/\s*$/, "") + "\n" + text : text;
    say(PREFILLED);
    restart(box, "is-prefilled");
    if (!phone) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
    field.scrollTop = field.scrollHeight;
  };
  addEventListener("lead:prefill", prefill);
  const leadChat = !identity || isLead(identity.role);
  let caretFrame = 0;
  const caretAt = (at, tries = 60) => {
    if (caretFrame) cancelAnimationFrame(caretFrame);
    caretFrame = 0;
    if (gone) return;
    if (!field.getClientRects().length) {
      if (tries > 0) caretFrame = requestAnimationFrame(() => caretAt(at, tries - 1));
      return;
    }
    field.focus({ preventScroll: true });
    field.setSelectionRange(at, at);
  };
  const quote = (event) => {
    const text = event.detail?.text;
    if (!leadChat || event.detail?.taken || typeof text !== "string" || !text.trim()) return;
    event.detail.taken = true;
    pendingReply = null;
    paintReply();
    field.value = withQuote(text, field.value);
    say(QUOTED);
    restart(box, "is-prefilled");
    keep();
    grow();
    caretAt(text.length);
  };
  addEventListener(QUOTE_EVENT, quote);
  const unsubscribe = store.subscribe?.((event) => {
    if (event.type === "state") {
      paintName();
      slash.refresh();
    }
    if (event.type === "settings") settings.paint();
    if (["context", "settings", "turn"].includes(event.type)) context.paint();
    if (["turn", "state", "snapshot"].includes(event.type)) paintMode();
  }) ?? (() => {
  });
  const unpeek = peek?.wire(tray) ?? (() => {
  });
  const kept = keeper.load();
  if (kept) {
    loadWords(kept.text);
    if (kept.files.length) files.restore(kept.files);
  }
  addEventListener(SAVE_DRAFT, flush);
  addEventListener("pagehide", flush);
  document.addEventListener?.("visibilitychange", hidden);
  paint();
  slash.refresh();
  requestAnimationFrame(grow);
  const quoted = leadChat ? takeQuoteFocus() : null;
  if (quoted !== null) caretAt(Math.min(quoted, field.value.length));
  return { node: form, field, dropOn, reply(value) {
    if (!value || !active() || queueing || field.disabled) return;
    if (withReply(value, field.value).length > DRAFT_LIMITS.text) {
      say("This quote is too long. Select a shorter passage.");
      return;
    }
    field.value = withoutQuote(field.value);
    pendingReply = value;
    paintReply();
    collapsed = false;
    paint();
    flush();
    if (!phone) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }, restore(draft, why = null) {
    if (!draft) return;
    const restored = parseReply(draft.text);
    if (restored) {
      pendingReply = restored;
      field.value = restored.body + (field.value ? "\n" + withoutQuote(field.value) : "");
      paintReply();
    } else {
      pendingReply = null;
      paintReply();
      field.value = field.value ? draft.text + (draft.text ? "\n" : "") + withoutQuote(field.value) : draft.text;
    }
    draft.images.forEach((image) => images.push({ key: "i" + ++serial, data: image.data, mimeType: image.mimeType, preview: image.preview ?? `data:${image.mimeType};base64,${image.data}`, name: "" }));
    files.restore(draft.attachments);
    if (why) say(why);
    else paint();
    keep();
    grow();
    field.focus();
  }, focus() {
    field.focus({ preventScroll: true });
  }, answer(text, key) {
    const state = canSend();
    if (state) {
      onBlocked(state);
      return Promise.resolve({ ok: false, line: state });
    }
    const sending = track(store.send({ text, answers: key }));
    onSent();
    return sending;
  }, refresh() {
    paint();
  }, destroy() {
    flush();
    gone = true;
    widthWatch?.disconnect();
    unhold();
    trigger.destroy();
    removeEventListener(SAVE_DRAFT, flush);
    removeEventListener("pagehide", flush);
    document.removeEventListener?.("visibilitychange", hidden);
    viewport?.removeEventListener("resize", keyboard);
    removeEventListener("lead:prefill", prefill);
    removeEventListener(QUOTE_EVENT, quote);
    if (caretFrame) cancelAnimationFrame(caretFrame);
    unsubscribe();
    unpeek();
    mic?.destroy();
    settings.close();
    closeAttach();
    secrets?.destroy();
    context.close();
    clearTimeout(toldTimer);
    clearTimeout(stopping);
    for (const image of images) if (image.preview?.startsWith("blob:")) URL.revokeObjectURL(image.preview);
    images.length = 0;
    files.clear();
  } };
}
