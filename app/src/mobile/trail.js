import { esc } from "./format.js";
import { icon } from "./icons.js";
import { l10n } from "../names.js";
export function trailAt(heads, line) {
  let at = -1;
  for (let i = 0; i < heads.length; i++) if (heads[i].top <= line) at = i;
  else break;
  return at;
}
export function trailParts(heads, at, { title = "", past = false } = {}) {
  if (at < 0) return { section: past ? title : "", sub: "" };
  const here = heads[at];
  if (here.level <= 2) return { section: here.text, sub: "" };
  for (let i = at - 1; i >= 0; i--) if (heads[i].level <= 2) return { section: heads[i].text, sub: here.text };
  return { section: here.text, sub: "" };
}
export function trailHTML({ section, sub }) {
  if (!section) return '<span class="m-trail-text" data-empty>' + l10n("목차", "Contents") + "</span>";
  return '<span class="m-trail-text"><span class="m-trail-sec">' + esc(section) + "</span>" + (sub ? '<span class="m-trail-sep" aria-hidden="true">›</span><span class="m-trail-sub">' + esc(sub) + "</span>" : "") + "</span>";
}
export function outlineHTML(heads, at) {
  return heads.map((h, i) => '<button type="button" class="m-trail-item" data-at="' + i + '" data-level="' + (h.level <= 2 ? 2 : 3) + '"' + (i === at ? ' aria-current="location"' : "") + ">" + esc(h.text) + "</button>").join("");
}
export function reportHeadings(blocks) {
  if (!blocks) return [];
  return [...blocks.querySelectorAll(".bv-section-heading,.bv-html-host")].flatMap((node) => node.classList.contains("bv-html-host") ? [...node.shadowRoot?.querySelectorAll("h2,h3") ?? []].map((heading) => ({ node: heading, level: heading.tagName === "H3" ? 3 : 2 })) : [{ node, level: Number(node.dataset.level) || 2 }]);
}
const trailLabel = (parts) => parts.section ? l10n("목차, ", "Contents, ") + [parts.section, parts.sub].filter(Boolean).join(", ") : l10n("목차", "Contents");
function dropOutline(host, id, go) {
  const dim = Object.assign(document.createElement("div"), { className: "m-trail-dim", hidden: true });
  const list = Object.assign(document.createElement("nav"), { className: "m-trail-ol", id, hidden: true });
  list.setAttribute("aria-label", l10n("목차", "Contents"));
  let open = false, button = null;
  const escape = (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    if (!list.getClientRects().length) {
      drop.close(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    drop.close();
  };
  const drop = { dim, list, get isOpen() {
    return open;
  }, show(by, heads, at) {
    button = by;
    list.innerHTML = outlineHTML(heads, at);
    if (!open) document.addEventListener("keydown", escape, true);
    open = true;
    dim.hidden = list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const current = list.querySelector("[aria-current]");
    if (current) list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
    (current || list.firstElementChild)?.focus({ preventScroll: true });
  }, close(back = true) {
    if (!open) return;
    open = false;
    document.removeEventListener("keydown", escape, true);
    dim.hidden = list.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    if (back && button?.isConnected) button.focus({ preventScroll: true });
  }, light(at) {
    if (open) for (const item of list.children) if (Number(item.dataset.at) === at) item.setAttribute("aria-current", "location");
    else item.removeAttribute("aria-current");
  } };
  host.addEventListener("click", (e) => {
    const item = e.target.closest(".m-trail-item");
    if (item && list.contains(item)) {
      drop.close(false);
      go(Number(item.dataset.at));
      button?.focus({ preventScroll: true });
      return;
    }
    if (e.target === dim) drop.close();
  });
  return drop;
}
function sayer(button) {
  let said = "";
  return { say(parts) {
    const html = trailHTML(parts);
    if (html !== said) {
      said = html;
      button.innerHTML = html + icon("more", "m-trail-caret");
      button.setAttribute("aria-label", trailLabel(parts));
    }
  }, reset() {
    said = "";
  } };
}
const TRAIL = '<button type="button" class="m-trail" aria-haspopup="true" aria-expanded="false" aria-controls="m-trail-ol"></button>';
export function createTrail(panel, { reduced = () => false } = {}) {
  let room = null, bar = null, scroller = null, button = null, words = null, heads = [], nodes = [], at = -1, frame = 0;
  const reading = () => room?.dataset.mode === "read" && !room.querySelector(".lib-raw:not([hidden])");
  const foot = () => bar.getBoundingClientRect().bottom, line = () => foot() + 40;
  const drop = dropOutline(panel, "m-trail-ol", (i) => {
    const node = nodes[i]?.node;
    if (node && scroller) scroller.scrollTo({ top: scroller.scrollTop + node.getBoundingClientRect().top - foot() - 8, behavior: reduced() ? "auto" : "smooth" });
  });
  function find() {
    const next = panel.querySelector(".lib-room.is-phone");
    if (next !== room) {
      room = next;
      drop.close(false);
    }
    bar = room?.querySelector(".lib-phone-bar") ?? null;
    const view = room?.querySelector(".lib-read") ?? null;
    if (view !== scroller) {
      scroller?.removeEventListener("scroll", soon);
      scroller = view;
      scroller?.addEventListener("scroll", soon, { passive: true });
    }
    if (bar && !bar.contains(button)) {
      bar.querySelector(".lib-back")?.insertAdjacentHTML("afterend", TRAIL);
      button = bar.querySelector(".m-trail");
      words = button && sayer(button);
    }
    for (const part of [drop.dim, drop.list]) if (part.parentNode !== panel) panel.append(part);
    if (!reading()) drop.close(false);
  }
  function paint() {
    frame = 0;
    if (!button) return;
    nodes = reading() ? reportHeadings(room.querySelector(".lib-doc:not([hidden]) .lib-blocks")) : [];
    const none = !nodes.length;
    if (button.hidden !== none) button.hidden = none;
    if (none) return;
    const edge = line(), head = room.querySelector(".lib-doc:not([hidden]) .lib-doc-head h1");
    heads = nodes.map(({ node, level }) => ({ level, text: node.textContent.trim(), top: node.getBoundingClientRect().top }));
    at = trailAt(heads, edge);
    words.say(trailParts(heads, at, { title: head?.textContent.trim() ?? "", past: !!head && head.getBoundingClientRect().bottom < edge }));
    drop.light(at);
  }
  function soon() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function sync() {
    find();
    soon();
  }
  panel.addEventListener("click", (e) => {
    if (!e.target.closest(".m-trail")) return;
    e.preventDefault();
    if (drop.isOpen) {
      drop.close();
      return;
    }
    if (!button || button.hidden) return;
    paint();
    panel.style.setProperty("--m-trail-top", bar.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + "px");
    drop.show(button, heads, at);
  });
  const watch = new MutationObserver(sync);
  watch.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-mode", "hidden"] });
  sync();
  return { sync, close: () => drop.close(false), get isOpen() {
    return drop.isOpen;
  } };
}
export function docTrail({ scroller, headings, go }) {
  const node = Object.assign(document.createElement("div"), { className: "m-doc-trail", hidden: true });
  node.innerHTML = '<button type="button" class="m-trail" aria-haspopup="true" aria-expanded="false" aria-controls="m-doc-ol"></button>';
  const button = node.firstElementChild, words = sayer(button), drop = dropOutline(node, "m-doc-ol", go);
  node.append(drop.dim, drop.list);
  let heads = [], at = -1, frame = 0;
  function paint() {
    frame = 0;
    const all = headings(), none = !all.length;
    if (node.hidden !== none) node.hidden = none;
    if (none) {
      drop.close(false);
      return;
    }
    const line = node.getBoundingClientRect().bottom + 40;
    heads = all.map((h) => ({ level: h.level, text: h.text.replace(/`/g, "").trim(), top: h.node.getBoundingClientRect().top, away: h.node.classList.contains("is-folded-away") }));
    const shown = heads.map((h, i) => ({ ...h, i })).filter((h) => !h.away), k = trailAt(shown, line);
    at = k < 0 ? -1 : shown[k].i;
    words.say(trailParts(heads, at));
    drop.light(at);
  }
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  scroller.addEventListener("scroll", soon, { passive: true });
  button.addEventListener("click", (e) => {
    e.preventDefault();
    if (drop.isOpen) {
      drop.close();
      return;
    }
    paint();
    if (!node.hidden) drop.show(button, heads, at);
  });
  return { node, sync: soon, close: () => drop.close(false), height: () => node.hidden ? 0 : node.getBoundingClientRect().height, stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    drop.close(false);
  } };
}
