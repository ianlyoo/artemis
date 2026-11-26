import { el } from "../boards/dom.js";
import { iconButton } from "./icons.js";
import { offsetOf } from "./core.js";
import { comments, plainTarget, canComment, looksSecret, sectionLabel, COMMENT_SECRET_LINE, elementLine } from "./feedback.js";
export const VIEWS = [[".ide-docs", "Document"], [".ide-dochead", "Document"], [".ide-explorer", "Explorer"], [".ide-rail", "Explorer"], [".ide-tabs", "Tabs"], [".ide-chat", "Chat"]];
const NEVER = "iframe, frame, object, embed, .dv-stage, .ide-term, .term-screen, .term-line-field, [data-ep-own]";
const MEANING = "button, a[href], input, textarea, select, [role=button], [role=tab], [role=treeitem], [role=option], [role=menuitem], [role=link], li, tr, th, td, h1, h2, h3, h4, h5, h6, p, pre, blockquote, figure, img, .pane-block, .ex-row, .ide-row, .ide-tab, .msg";
const TEXT_MAX = 120;
export const viewOf = (node) => VIEWS.find(([selector]) => node?.closest?.(selector))?.[1] ?? null;
export const scopeOf = (node) => {
  for (const [selector] of VIEWS) {
    const scope = node?.closest?.(selector);
    if (scope) return scope;
  }
  return null;
};
export function pickable(node) {
  if (!node || node.nodeType !== 1) node = node?.parentElement ?? null;
  if (!node || node.closest(NEVER)) return null;
  const scope = scopeOf(node);
  if (!scope) return null;
  const meant = node.closest(MEANING);
  return meant && scope.contains(meant) ? meant : node;
}
const IMPLIED = { button: "button", a: "link", input: "textbox", textarea: "textbox", select: "combobox", li: "listitem", tr: "row", th: "columnheader", td: "cell", img: "img", p: "paragraph", pre: "code", blockquote: "blockquote", figure: "figure", nav: "navigation", header: "banner", section: "region", aside: "complementary", table: "table", ul: "list", ol: "list" };
export function roleOf(node) {
  const said = node.getAttribute?.("role");
  if (said) return said;
  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "input") {
    const type = (node.getAttribute("type") || "text").toLowerCase();
    return ["checkbox", "radio", "range"].includes(type) ? type : type === "button" || type === "submit" ? "button" : "textbox";
  }
  return IMPLIED[tag] ?? tag;
}
export function textOf(node) {
  const label = node.getAttribute?.("aria-label") || (node.tagName === "IMG" ? node.getAttribute("alt") : "") || "";
  const shown = /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) ? node.getAttribute("placeholder") ?? "" : node.textContent ?? "";
  const line = String(label || shown).replace(/\s+/g, " ").trim(), points = [...line];
  return points.length > TEXT_MAX ? points.slice(0, TEXT_MAX - 1).join("").trimEnd() + "…" : line;
}
const WORD = /^[A-Za-z][\w-]{0,39}$/;
const classesOf = (node) => String(node.getAttribute?.("class") ?? "").split(/\s+/).filter(Boolean);
function step(node) {
  const tag = node.tagName.toLowerCase();
  if (node.id && WORD.test(node.id) && !/\d{4,}/.test(node.id)) return "#" + node.id;
  const classes = classesOf(node).filter((name) => WORD.test(name) && !/^is-|^has-/.test(name)).slice(0, 2);
  let part = classes.length ? (["div", "span"].includes(tag) ? "" : tag) + "." + classes.join(".") : tag;
  const parent = node.parentElement;
  if (parent) {
    const like = [...parent.children].filter((other) => other.tagName === node.tagName && classes.every((name) => classesOf(other).includes(name)));
    if (like.length > 1) part += `:nth-of-type(${[...parent.children].filter((other) => other.tagName === node.tagName).indexOf(node) + 1})`;
  }
  return part;
}
export function cssPath(node, scope = scopeOf(node)) {
  const steps = [];
  for (let at = node; at && at !== scope && steps.length < 4; at = at.parentElement) {
    steps.unshift(step(at));
    if (at.id && steps[0].startsWith("#")) break;
  }
  const root = scope ? "." + classesOf(scope).find((name) => name.startsWith("ide-")) : "";
  return [root, steps.join(" > ")].filter(Boolean).join(" ");
}
export function describe(node, { ref = "", section = null } = {}) {
  const box = node.getBoundingClientRect?.() ?? { x: 0, y: 0, width: 0, height: 0 };
  return { view: viewOf(node) ?? "Workspace", ref: String(ref ?? ""), section: section || null, role: roleOf(node), text: textOf(node), path: cssPath(node), box: { x: Math.round(box.x ?? box.left ?? 0), y: Math.round(box.y ?? box.top ?? 0), width: Math.round(box.width ?? 0), height: Math.round(box.height ?? 0) } };
}
const explorerSection = (node) => node.closest(".ex-sec")?.querySelector(".ex-sec-title")?.textContent?.trim() || null;
export function createElementPick({ root, where, onAdded = () => {
}, markup = null }) {
  let armed = false, hovered = null, picked = null, frame = 0;
  const tag = el("span", { class: "ep-tag" });
  const outline = el("div", { class: "ep-outline", hidden: true, "aria-hidden": "true", "data-ep-own": "" }, tag);
  const hint = el("div", { class: "ep-hint", hidden: true, role: "status", "data-ep-own": "" }, "Pick an element to comment on · Esc cancels");
  const what = el("p", { class: "ep-what" }), place = el("p", { class: "ep-where" });
  const field = el("textarea", { class: "ep-field", rows: "3", placeholder: "What about it? (optional)", "aria-label": "Comment", spellcheck: "false" });
  const state = el("span", { class: "ep-state", role: "status" });
  const add = iconButton("comment", "Add to review", { key: "⌘Enter", class: "ep-add" });
  const mark = iconButton("capture", "Mark up", { class: "ep-markup" });
  const cancel = iconButton("close", "Cancel", { key: "Esc", class: "ep-cancel" });
  const box = el("div", { class: "ep-box", role: "dialog", "aria-label": "Comment on an element", hidden: true, "data-ep-own": "" }, el("div", { class: "ep-box-head" }, el("div", { class: "ep-box-text" }, what, place), cancel), field, el("div", { class: "ep-box-foot" }, state, el("span", { class: "ep-gap" }), markup ? mark : null, add));
  root.append(outline, hint, box);
  const buttons = new Set();
  function paintButtons() {
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(armed));
      button.classList.toggle("is-on", armed);
    }
  }
  function draw(node) {
    if (!node?.isConnected) {
      outline.hidden = true;
      return;
    }
    const at = node.getBoundingClientRect();
    if (!at.width && !at.height) {
      outline.hidden = true;
      return;
    }
    outline.hidden = false;
    for (const [name, value] of [["left", at.left - 3], ["top", at.top - 3], ["width", at.width + 6], ["height", at.height + 6]]) outline.style.setProperty(name, Math.round(value) + "px");
    tag.textContent = roleOf(node) + " · " + (viewOf(node) ?? "");
    outline.classList.toggle("is-low", at.top < 28);
  }
  function arm(next = !armed) {
    next = !!next;
    if (next === armed && !picked) return;
    if (picked) closeBox();
    armed = next;
    hovered = null;
    outline.hidden = true;
    hint.hidden = !armed;
    root.classList.toggle("is-picking", armed);
    paintButtons();
  }
  const own = (target) => !!target?.closest?.("[data-ep-own], .ide-pickbtn");
  const swallow = (event) => {
    if (!armed || picked || own(event.target)) return;
    if (!pickable(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const moved = (event) => {
    if (!armed || picked) return;
    const node = own(event.target) ? null : pickable(event.target);
    if (node === hovered) return;
    hovered = node;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(hovered));
  };
  const clicked = (event) => {
    if (!armed || picked || own(event.target)) return;
    const node = pickable(event.target);
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openBox(node);
  };
  const keyed = (event) => {
    if (event.key !== "Escape" || event.isComposing || !armed && !picked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    arm(false);
  };
  const scrolled = () => {
    if (picked) {
      draw(picked.node);
      placeBox();
    } else if (hovered) draw(hovered);
  };
  const away = (event) => {
    if (picked && !box.contains(event.target) && !own(event.target)) arm(false);
  };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "contextmenu", "dragstart", "auxclick"]) window.addEventListener(type, swallow, true);
  window.addEventListener("pointermove", moved, true);
  window.addEventListener("click", clicked, true);
  window.addEventListener("keydown", keyed, true);
  window.addEventListener("scroll", scrolled, true);
  window.addEventListener("resize", scrolled);
  document.addEventListener("pointerdown", away, true);
  function placeBox() {
    if (!picked) return;
    const at = picked.node.isConnected ? picked.node.getBoundingClientRect() : picked.box, width = box.offsetWidth, height = box.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - width - 8, at.left));
    const top = at.bottom + 10 + height < innerHeight - 8 ? at.bottom + 10 : Math.max(8, at.top - height - 10);
    box.style.setProperty("left", Math.round(left) + "px");
    box.style.setProperty("top", Math.round(top) + "px");
  }
  function openBox(node) {
    const here = where(node) ?? {}, doc = here.doc && here.doc.article?.contains(node) ? here.doc : null;
    const headings = doc ? [...doc.sectionOf(node) ?? []] : [];
    const section = doc ? sectionLabel(headings) || null : viewOf(node) === "Explorer" ? explorerSection(node) : null;
    const element = describe(node, { ref: here.ref, section });
    const block = doc ? node.closest(".pane-block") : null;
    picked = { node, box: node.getBoundingClientRect(), element, target: here.target ?? null, doc, headings, blockId: block?.dataset.blockId ?? null, pos: block && doc ? offsetOf(doc.index(), block, 0) ?? 0 : 0 };
    hovered = null;
    hint.hidden = true;
    draw(node);
    outline.classList.add("is-picked");
    what.textContent = "Element · " + element.role + (element.text ? " “" + element.text + "”" : "");
    place.textContent = [element.view, section, element.ref].filter(Boolean).join(" · ");
    field.value = "";
    say("");
    add.disabled = false;
    box.hidden = false;
    placeBox();
    requestAnimationFrame(() => field.focus({ preventScroll: true }));
  }
  function closeBox() {
    picked = null;
    box.hidden = true;
    outline.hidden = true;
    outline.classList.remove("is-picked");
    field.value = "";
    say("");
  }
  function say(text, kind = "") {
    state.textContent = text;
    state.dataset.state = kind;
  }
  function keep() {
    if (!picked || add.disabled) return;
    const said = field.value.trim();
    if (looksSecret(said)) {
      say(COMMENT_SECRET_LINE + " · nothing was kept", "failed");
      return;
    }
    if (looksSecret(elementLine(picked.element))) {
      say("This element's text looks like a secret · nothing was kept", "failed");
      return;
    }
    add.disabled = true;
    const item = comments.add({ kind: "element", target: canComment(picked.target) ? plainTarget(picked.target) : null, section: picked.headings, blockId: picked.blockId, pos: picked.pos, text: said, element: picked.element });
    arm(false);
    onAdded(item);
  }
  add.addEventListener("click", keep);
  field.addEventListener("keydown", (event) => {
    if (!event.isComposing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      keep();
    }
  });
  cancel.addEventListener("click", () => arm(false));
  mark.addEventListener("click", () => {
    if (!picked || !markup) return;
    const { box: at, element } = picked, said = field.value.trim();
    arm(false);
    void markup({ box: { x: at.left, y: at.top, width: at.width, height: at.height }, text: elementLine(element) + (said ? "\n" + said : "") });
  });
  return { get armed() {
    return armed;
  }, get picked() {
    return picked;
  }, arm, cancel: () => arm(false), button(node) {
    buttons.add(node);
    node.addEventListener("click", () => arm());
    paintButtons();
    return node;
  }, destroy() {
    arm(false);
    cancelAnimationFrame(frame);
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "contextmenu", "dragstart", "auxclick"]) window.removeEventListener(type, swallow, true);
    window.removeEventListener("pointermove", moved, true);
    window.removeEventListener("click", clicked, true);
    window.removeEventListener("keydown", keyed, true);
    window.removeEventListener("scroll", scrolled, true);
    window.removeEventListener("resize", scrolled);
    document.removeEventListener("pointerdown", away, true);
    outline.remove();
    hint.remove();
    box.remove();
  } };
}
