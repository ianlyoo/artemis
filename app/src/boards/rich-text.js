import { mathDelimiters } from "../vendor/deepseek-chat-demo/math-delimiters.js";
import { mountFence as mountCode, mountMath } from "../chat/rendering.js";
import createDOMPurify from "./vendor/purify.js";
import { Marked } from "./vendor/marked.js";
import { el, assetPath, linkURL } from "./dom.js";
import { chart } from "./graphics.js";
import { markRefs, refsHTML } from "./notes.js";
import { MD_OPTIONS, MD_TOKENIZER } from "../md.js";
export { splitNotes, boardNotes } from "./notes.js";
const purifier = createDOMPurify(window), markdown = new Marked({ ...MD_OPTIONS }).use(MD_TOKENIZER).use(mathDelimiters);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;
let hrefRule = linkURL;
purifier.addHook("uponSanitizeAttribute", (node, data) => {
  const name = data.attrName.toLowerCase();
  if (name.startsWith("data-") && name !== "data-board-widget") data.keepAttr = false;
  if (name === "src") {
    if (node.tagName !== "IMG" || !assetPath(data.attrValue) && !DATA_IMAGE.test(data.attrValue)) data.keepAttr = false;
  }
  if (name === "href" || name === "xlink:href") {
    const clean = hrefRule(data.attrValue);
    if (node.tagName.toLowerCase() !== "a" || !clean) data.keepAttr = false;
    else data.attrValue = clean;
  }
  if (["fill", "stroke", "filter", "clip-path", "mask"].includes(name) && /url\s*\(/i.test(data.attrValue) && !/^url\(#[a-z0-9_-]+\)$/i.test(data.attrValue)) data.keepAttr = false;
});
function fragment(source, env) {
  const normalized = String(source).replace(/<(\/?)a-(chart|table|timeline|checklist)(?=[\s>])/gi, (_, closing, kind) => closing ? "</div" : `<div data-board-widget="${kind.toLowerCase()}"`);
  hrefRule = typeof env?.link === "function" ? (value) => linkURL(env.link(value) ?? value) : linkURL;
  let clean;
  try {
    clean = purifier.sanitize(normalized, { RETURN_DOM_FRAGMENT: true, USE_PROFILES: { html: true, svg: true }, ADD_ATTR: ["kind", "unit"], FORBID_TAGS: ["script", "style", "link", "iframe", "object", "embed", "foreignObject", "form", "video", "audio", "source", "base", "meta", "template", "animate", "animateTransform", "set", "use"], FORBID_ATTR: ["id", "background", "poster", "ping", "style", "srcset", "srcdoc", "action", "formaction", "name", "autofocus", "contenteditable"] });
  } finally {
    hrefRule = linkURL;
  }
  for (const node of clean.querySelectorAll("[style]")) node.removeAttribute("style");
  return clean;
}
function prepare(root, env) {
  for (const anchor of root.querySelectorAll("a")) {
    const href = linkURL(anchor.getAttribute("href"));
    if (!href) {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    anchor.href = href;
    if (href.startsWith("#/boards/")) anchor.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
      try {
        event.preventDefault();
        env.open(decodeURIComponent(href.slice(9)));
      } catch {
      }
    });
    if (/^https?:/.test(href) && new URL(href).origin !== location.origin) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    if (/^#[^/]/.test(href)) anchor.addEventListener("click", (event) => {
      const target = [...root.querySelectorAll("[id]")].find((n) => n.id === href.slice(1));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ block: "start" });
      }
    });
  }
  for (const input of root.querySelectorAll("input,textarea,select,button")) {
    input.disabled = true;
    input.setAttribute("aria-disabled", "true");
  }
  for (const ref of root.querySelectorAll("sup.bv-ref")) {
    ref.setAttribute("role", "button");
    ref.setAttribute("tabindex", "0");
    ref.setAttribute("data-note", ref.textContent);
  }
  for (const image of root.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    image.removeAttribute("src");
    image.loading = "lazy";
    image.decoding = "async";
    if (source && DATA_IMAGE.test(source)) image.src = source;
    else if (assetPath(source)) env.image(image, source);
    else image.replaceWith(el("span", { class: "bv-muted" }, image.alt || "Image"));
  }
  for (const table of root.querySelectorAll("table")) {
    const wrapper = el("div", { class: "bv-table-scroll", tabindex: "0", role: "region", "aria-label": table.querySelector("caption")?.textContent || "Table" });
    table.replaceWith(wrapper);
    wrapper.append(table);
    table.classList.add("bv-table");
  }
  for (const widget of root.querySelectorAll("[data-board-widget]")) {
    const kind = widget.dataset.boardWidget, title = widget.getAttribute("title");
    if (!["chart", "table", "timeline", "checklist"].includes(kind)) {
      widget.removeAttribute("data-board-widget");
      continue;
    }
    if (kind === "chart") {
      const table = widget.querySelector("table"), rows = table ? [...table.querySelectorAll("tbody tr")] : [], heads = table ? [...table.querySelectorAll("thead th")].map((n) => n.textContent.trim()) : [];
      const values = rows.map((row) => [...row.querySelectorAll("td,th")].map((n) => n.textContent.trim()));
      if (values.length && heads.length > 1 && values.every((row) => row.slice(1).every((v) => Number.isFinite(Number(v.replace(/[,\s%]/g, "")))))) {
        const data = { title, kind: widget.getAttribute("kind") === "line" ? "line" : "bar", labels: values.map((row) => row[0]), series: heads.slice(1).map((name, i) => ({ name, values: values.map((row) => Number(row[i + 1].replace(/[,\s%]/g, ""))) })) };
        widget.replaceChildren(chart(data, { compact: env.phone }));
      }
    }
    if (title) widget.prepend(el("h3", { class: "bv-widget-title" }, title));
    widget.classList.add("bv-html-widget", "bv-html-" + kind);
  }
}
let listening = false;
function listenNotes() {
  if (listening) return;
  listening = true;
  const near = (from, selector) => {
    for (let at = from.parentElement; at; at = at.parentElement) {
      const found = at.querySelector(selector);
      if (found) return found;
    }
    return null;
  };
  const go = (event) => {
    if (event.defaultPrevented || event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    const control = event.target?.closest?.("sup.bv-ref[data-note], .bv-fn-back[data-note]");
    if (!control) return;
    const n = control.dataset.note, back = control.classList.contains("bv-fn-back");
    const target = near(control, back ? 'sup.bv-ref[data-note="' + n + '"]' : '.bv-fn > li[value="' + n + '"]');
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView?.({ block: back ? "center" : "nearest" });
    target.classList.add("is-target");
    setTimeout(() => target.classList.remove("is-target"), 1600);
    if (back) target.focus?.({ preventScroll: true });
  };
  document.addEventListener("click", go);
  document.addEventListener("keydown", go);
}
export function prose(text, env, inline = false) {
  listenNotes();
  const root = el(inline ? "span" : "div", { class: "bv-prose" }), notes = env?.notes, source = markRefs(text, notes, inline);
  root.append(fragment(refsHTML(inline ? markdown.parseInline(source) : markdown.parse(source), notes), env));
  prepare(root, env);
  for (const pre of root.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    if (!code) continue;
    const host = el("div");
    pre.replaceWith(host);
    mountCode(host, { text: code.textContent, lang: (code.className.match(/language-(\S+)/) || [])[1] ?? "" }, env?.own);
  }
  for (const host of root.querySelectorAll(".ds-math-inline,.ds-math-display")) {
    mountMath(host, { value: host.textContent, inline: host.classList.contains("ds-math-inline") }, env?.own);
  }
  return root;
}
export function htmlDocument(source, env) {
  const host = el("div", { class: "bv-html-host" }), shadow = host.attachShadow({ mode: "open" });
  const stylesheet = el("link", { rel: "stylesheet", href: new URL("./boards.css", import.meta.url).href });
  const root = el("div", { class: "bv-prose bv-html-document" });
  root.append(fragment(source, env));
  prepare(root, env);
  shadow.append(stylesheet, root);
  return host;
}
export const PAGE_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads";
const PAGE_ALLOW = "fullscreen; xr-spatial-tracking; accelerometer; gyroscope; clipboard-write";
const DESKTOP = 1280, WIDEST = 2560, TALLEST = 3e4;
export function pageDocument(block, env) {
  const box = el("div", { class: "bv-page-box" }), bar = el("div", { class: "bv-page-bar" }), root = el("div", { class: "bv-page" }, bar, box);
  const title = block.title || "Page";
  const direct = () => el("iframe", { src: block.page, sandbox: PAGE_SANDBOX, allow: PAGE_ALLOW, referrerpolicy: "no-referrer", title });
  void import("/client.js").then((client) => client.pageFrame ? client.pageFrame(block.page, { title, allow: PAGE_ALLOW }) : direct(), () => direct()).then((frame) => {
    if (env.signal?.aborted) return;
    if (!frame) {
      root.className = "bv-page bv-page-flat";
      root.replaceChildren(el("p", { class: "bv-page-note" }, "The live page opens on the PC (Tailscale); here it is shown as text."), htmlDocument(block.html, env));
      return;
    }
    if (frame.getAttribute("src") === block.page) bar.append(el("a", { class: "bv-page-open", href: block.page, target: "_blank", rel: "noopener noreferrer" }, "Open in a new tab"));
    else bar.remove();
    frame.classList.add("bv-page-frame");
    fitPage(box, frame, env);
  }, () => {
  });
  return root;
}
function fitPage(box, frame, env) {
  const phone = !!env.phone || matchMedia("(max-width: 767.98px)").matches;
  const first = () => Math.max(phone ? 360 : 480, Math.round(innerHeight * (phone ? 0.8 : 1) - (phone ? 0 : 160)));
  let width = 0, base = 0, height = 0, scaled = false, frozen = false, lastGrowth = 0, sameGrowth = 0;
  const apply = () => {
    const scale = width / base;
    frame.style.width = `${base}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = scale === 1 ? "" : `scale(${scale})`;
    box.style.height = `${Math.ceil(height * scale)}px`;
    box.dataset.scaled = scale === 1 ? "no" : "yes";
  };
  const resized = () => {
    const now = box.clientWidth;
    if (!now || now === width) return;
    width = now;
    base = now;
    scaled = false;
    frozen = false;
    sameGrowth = 0;
    lastGrowth = 0;
    height = first();
    apply();
  };
  const report = (event) => {
    if (!frame.isConnected) return stop();
    const data = event.data;
    if (event.source !== frame.contentWindow || data?.homePage !== 1) return;
    const { w, h, vw } = data;
    if (![w, h, vw].every((n) => Number.isFinite(n) && n >= 0 && n <= 1e6) || !width || Math.abs(vw - base) > 1) return;
    if (w > vw + 1 && base < WIDEST) {
      const wide = Math.min(WIDEST, phone || scaled || width >= DESKTOP ? Math.ceil(w) : DESKTOP);
      if (wide > base) {
        base = wide;
        scaled = true;
        height = Math.round(first() * base / width);
        sameGrowth = 0;
        lastGrowth = 0;
        apply();
        return;
      }
    }
    const next = Math.min(TALLEST, Math.max(1, Math.ceil(h)));
    if (next > height) {
      const growth = next - height;
      sameGrowth = Math.abs(growth - lastGrowth) <= 2 ? sameGrowth + 1 : 0;
      lastGrowth = growth;
      if (sameGrowth >= 3) frozen = true;
      if (frozen) return;
    }
    if (next !== height) {
      height = next;
      apply();
    }
  };
  const observer = new ResizeObserver(() => requestAnimationFrame(resized));
  const stop = () => {
    observer.disconnect();
    removeEventListener("message", report);
  };
  addEventListener("message", report);
  observer.observe(box);
  env.own?.(stop);
  box.append(frame);
  resized();
}
