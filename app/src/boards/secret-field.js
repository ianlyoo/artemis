import { el } from "./dom.js";
import { iconNode } from "./icons.js";
import { l10n } from "../names.js";
export const WORDS = Object.freeze({ ready: "", get copying() {
  return l10n("복사 중", "Copying");
}, get copied() {
  return l10n("복사됨", "Copied");
}, get failed() {
  return l10n("복사 못 했어요", "Didn't copy");
}, get none() {
  return l10n("없음", "None");
}, get refused() {
  return l10n("열 수 없음", "Can't open");
}, get opening() {
  return l10n("여는 중", "Opening");
}, get openfail() {
  return l10n("열지 못했어요", "Didn't open");
}, get revealing() {
  return l10n("불러오는 중", "Loading");
}, get shown() {
  return l10n("잠시 뒤 가려요", "Hides in a moment");
}, get revealfail() {
  return l10n("불러오지 못했어요", "Didn't load");
} });
export const EXPECTED = Object.freeze(["404 not_found", "404 missing", "403 template_refused", "403 forbidden"]);
const SHUT = Object.freeze({ 404: "none", 403: "refused" });
export const COPIED_FOR = 2e3, OPEN_WAIT = 2500, SHOWN_FOR = 2e4;
export const APP_TEMPLATES = Object.freeze(["owntracks:///config?inline={value}"]);
const VALUE = /^[A-Za-z0-9%+/=_-]+$/;
export const appTemplate = (template) => APP_TEMPLATES.includes(template);
export const appLink = (link) => typeof link === "string" && APP_TEMPLATES.some((template) => {
  const [head, tail] = template.split("{value}");
  return link.startsWith(head) && link.endsWith(tail) && VALUE.test(link.slice(head.length, link.length - tail.length));
});
const mask = (n) => "•".repeat(n);
const plain = (template) => template.split("{value}")[0].replace(/\/+(?!$)/g, "$&\0").replace(/\?/g, "\0?").split("\0").flatMap((part, n) => n ? [el("wbr"), part] : [part]);
const icon = (name) => iconNode(name, `lib-ico sf-ico sf-ico-${name}`);
export const secretPath = (board, block) => `/api/boards/${encodeURIComponent(board)}/secrets/${encodeURIComponent(block)}`;
export const chatSecretPath = (reply, block) => `/api/chat/secrets/${encodeURIComponent(reply)}/${encodeURIComponent(block)}`;
export function secretField(block, node, env) {
  const label = String(block.label ?? ""), template = typeof block.template === "string" ? block.template : void 0;
  const state = el("span", { class: "sf-state", role: "status", "aria-live": "polite" });
  const head = el("p", { class: "sf-head" }, el("span", { class: "sf-label" }, label), el("code", { class: "sf-key" }, String(block.key ?? "")), state);
  const root = el("div", { class: "sf", "data-state": "ready" }, head);
  node.append(root);
  let timer = 0, left = false, shut = false, shown = null, hideTimer = 0, asked = 0, hide = () => {
  };
  const close = (s, word2 = WORDS[s]) => {
    shut = true;
    clearTimeout(timer);
    hide();
    root.className = "sf sf-none";
    root.dataset.state = s;
    state.textContent = word2;
    root.replaceChildren(head);
  };
  const chat = env.secretReply !== void 0, where = chat ? env.secretReply : env.boardId;
  if (chat && where === null) {
    close("refused");
    return;
  }
  if (typeof where !== "string" || !where || typeof block.id !== "string" || !block.id) {
    close("none", "");
    return;
  }
  const path = chat ? chatSecretPath(where, block.id) : secretPath(where, block.id), signal = env.signal;
  const copyAttrs = { type: "button", "data-act": "copy", "aria-label": l10n(`${label} 복사`, `Copy ${label}`), title: l10n("복사", "Copy") };
  const masked = template !== void 0 ? [el("span", { class: "sf-plain" }, plain(template)), el("span", { class: "sf-mask" }, mask(8))] : [el("span", { class: "sf-mask" }, mask(12))];
  const value = el("span", { class: "sf-value", "aria-hidden": "true" }, masked);
  const inner = [value, el("span", { class: "sf-glyph", "aria-hidden": "true" }, el("span", { class: "lib-lbl" }, icon("copy"), icon("check"), icon("retry")))];
  const two = appTemplate(template) && env.phone === true;
  const copyButton = el("button", { class: two || chat ? "lib-ctl sf-copy" : "lib-ctl sf-box sf-copy", ...copyAttrs }, inner);
  const openButton = two ? el("button", { type: "button", class: "lib-ctl sf-open", "data-act": "open", "aria-label": l10n(`${label} 열기`, `Open ${label}`) }, el("span", { class: "lib-lbl" }, el("span", { class: "sf-oglyph" }, icon("external"), icon("retry")), l10n("열기", "Open"))) : null;
  const word = el("span", { class: "sf-rword" }, l10n("보기", "Show"));
  const revealButton = chat ? el("button", { type: "button", class: "lib-ctl sf-reveal", "data-act": "reveal", "aria-pressed": "false", "aria-label": l10n(`${label} 보기`, `Show ${label}`) }, el("span", { class: "lib-lbl" }, el("span", { class: "sf-rglyph" }, icon("eye"), icon("eyeOff")), word)) : null;
  root.append(two || chat ? el("div", { class: "sf-box sf-two" }, copyButton, revealButton, openButton) : copyButton);
  const set = (s) => {
    if (shut) return;
    root.dataset.state = s;
    state.textContent = WORDS[s];
    copyButton.setAttribute("aria-busy", String(s === "copying"));
    openButton?.setAttribute("aria-busy", String(s === "opening"));
    revealButton?.setAttribute("aria-busy", String(s === "revealing"));
    root.classList.remove("sf-just");
    if (["copied", "failed", "openfail", "revealfail"].includes(s)) {
      void root.offsetWidth;
      root.classList.add("sf-just");
    }
  };
  const busy = () => shut || ["copying", "opening", "revealing"].includes(root.dataset.state);
  env.own(() => clearTimeout(timer));
  const away = () => {
    if (document.visibilityState === "hidden") left = true;
  };
  document.addEventListener?.("visibilitychange", away);
  env.own(() => document.removeEventListener?.("visibilitychange", away));
  env.api(path, { signal, expected: EXPECTED }).then(async (result) => {
    if (signal.aborted) return;
    if (SHUT[result.status]) return close(SHUT[result.status]);
    if (result.ok && (await result.json())?.present === false && !signal.aborted) close("none");
  }).catch(() => {
  });
  const take = async (action = "copy") => {
    const result = await env.api(path + "/" + action, { method: "POST", signal, expected: EXPECTED });
    if (result.status === 401) {
      location.assign("/login");
      throw new Error("HTTP 401");
    }
    if (SHUT[result.status]) {
      if (!signal.aborted) close(SHUT[result.status]);
      return null;
    }
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const answer = (await result.json())?.value;
    if (typeof answer !== "string") throw new Error("no value");
    return answer;
  };
  const write = async (value2) => {
    try {
      await navigator.clipboard.writeText(value2);
      return true;
    } catch {
    }
    const area = el("textarea", { readonly: true, "aria-hidden": "true", tabindex: "-1", style: { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", "pointer-events": "none" } });
    let done = false;
    try {
      area.value = value2;
      document.body.append(area);
      area.select();
      done = document.execCommand("copy") === true;
    } catch {
    }
    area.value = "";
    area.remove();
    return done;
  };
  copyButton.addEventListener("click", async () => {
    if (busy()) return;
    clearTimeout(timer);
    set("copying");
    try {
      let value2 = await take();
      if (value2 === null || signal.aborted) return;
      const done = await write(value2);
      value2 = void 0;
      if (signal.aborted) return;
      if (!done) throw new Error("clipboard");
      set("copied");
      timer = setTimeout(() => set(shown ? "shown" : "ready"), COPIED_FOR);
    } catch {
      if (!signal.aborted) set("failed");
    }
  });
  openButton?.addEventListener("click", async () => {
    if (busy() || !appTemplate(template)) return;
    clearTimeout(timer);
    set("opening");
    left = false;
    try {
      let link = await take();
      if (link === null || signal.aborted) return;
      if (!appLink(link)) {
        link = void 0;
        throw new Error("not an app link");
      }
      location.href = link;
      link = void 0;
      timer = setTimeout(() => set(left || document.visibilityState === "hidden" ? "ready" : "openfail"), OPEN_WAIT);
    } catch {
      if (!signal.aborted) set("openfail");
    }
  });
  if (!revealButton) return;
  hide = () => {
    asked++;
    clearTimeout(hideTimer);
    if (!shown) return;
    shown.nodeValue = "";
    shown.remove();
    shown = null;
    value.replaceChildren(...masked);
    root.classList.remove("sf-shown");
    revealButton.setAttribute("aria-pressed", "false");
    revealButton.setAttribute("aria-label", l10n(`${label} 보기`, `Show ${label}`));
    word.textContent = l10n("보기", "Show");
    if (root.dataset.state === "shown") set("ready");
  };
  const show = (text) => {
    shown = document.createTextNode(text);
    value.replaceChildren(el("span", { class: "sf-revealed" }, shown));
    root.classList.add("sf-shown");
    revealButton.setAttribute("aria-pressed", "true");
    revealButton.setAttribute("aria-label", l10n(`${label} 가리기`, `Hide ${label}`));
    word.textContent = l10n("가리기", "Hide");
    hideTimer = setTimeout(hide, SHOWN_FOR);
  };
  revealButton.addEventListener("click", async () => {
    if (shown) {
      hide();
      return;
    }
    if (busy() || document.visibilityState === "hidden") return;
    clearTimeout(timer);
    set("revealing");
    const mine = ++asked;
    try {
      let answer = await take("reveal");
      if (answer === null || signal.aborted) return;
      if (mine !== asked) {
        answer = void 0;
        set("ready");
        return;
      }
      show(answer);
      answer = void 0;
      set("shown");
    } catch {
      if (!signal.aborted) set(mine === asked ? "revealfail" : "ready");
    }
  });
  const blurred = () => hide(), unseen = () => {
    if (document.visibilityState === "hidden") hide();
  };
  globalThis.addEventListener?.("blur", blurred);
  globalThis.addEventListener?.("pagehide", blurred);
  document.addEventListener?.("visibilitychange", unseen);
  env.own(() => {
    hide();
    globalThis.removeEventListener?.("blur", blurred);
    globalThis.removeEventListener?.("pagehide", blurred);
    document.removeEventListener?.("visibilitychange", unseen);
  });
}
