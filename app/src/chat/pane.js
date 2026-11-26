import { el, when, shortId, assetPath, response, scope } from "../boards/dom.js";
import { classifyLink, markLinks, wireLinks, chatHref, targetKey, WORK } from "./links.js";
import { control, problem } from "./visuals.js";
import { reduced } from "./motion.js";
import { boardNotes } from "../boards/notes.js";
import { fileDownload } from "./file-download.js";
import { lead } from "../names.js";
const FILE_ERRORS = { forbidden: "Home can't open this file", not_found: "Couldn't find the file", too_large: "Too large to preview", unsupported: "This format can't be previewed" };
const FILE_KIND = { md: "Document", html: "Document", sheet: "Sheet", pdf: "PDF", docx: "Document", xlsx: "Sheet", pptx: "Slides", image: "Image", text: "File" };
const fileName = (path) => String(path).split("/").filter(Boolean).at(-1) || String(path);
const remembered = (target) => target?.kind === "board" ? typeof target.id === "string" && !!target.id : target?.kind === "file" && typeof target.path === "string" && !!target.path;
function memory(storage) {
  const read = (key, fallback) => {
    try {
      const value = storage?.getItem("chat-pane-" + key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      if (value == null) storage?.removeItem("chat-pane-" + key);
      else storage?.setItem("chat-pane-" + key, JSON.stringify(value));
    } catch {
    }
  };
  return { read, write };
}
export function createPane({ host, api, render, origin = location.origin, phone = false, flip = () => null, onChange = () => {
}, storage = globalThis.localStorage }) {
  const saved = memory(storage);
  const kind = el("span", { class: "pane-kind" }), title = el("h2", { class: "pane-title" }), meta = el("p", { class: "pane-meta" });
  const names = el("div", { class: "pane-names" }, el("div", { class: "pane-line" }, kind, title), meta);
  const close = control(phone ? "‹ Chat" : "Close", { class: phone ? "pane-back" : "pane-close", title: phone ? "Back to the chat" : "Close the side pane · Esc" });
  const doc = el("article", { class: "pane-doc" }), body = el("div", { class: "pane-body", tabindex: "-1" }, doc);
  let head, recent = null, recentList = null, field = null, note = null, out = null, edge = null;
  if (phone) head = el("header", { class: "pane-head" }, close, names);
  else {
    recentList = el("ol", { class: "pane-recent-list" });
    field = el("input", { class: "pane-ask", type: "text", placeholder: "File path or board address", "aria-label": "File path or board address", autocomplete: "off", spellcheck: "false" });
    note = el("p", { class: "pane-note", role: "status" });
    recent = el("details", { class: "pane-recent" }, el("summary", { class: "text-control" }, el("span", { class: "control-label" }, "Recent")), el("div", { class: "pane-recent-pop" }, recentList, field, note));
    out = el("a", { class: "text-control pane-out", href: "#" }, el("span", { class: "control-label" }, ""));
    head = el("header", { class: "pane-head" }, names, el("div", { class: "pane-controls" }, recent, out, close));
    edge = el("div", { class: "pane-edge", role: "separator", "aria-orientation": "vertical", "aria-label": "Side pane width", tabindex: "0", title: "Drag to resize · double-click to reset" });
  }
  const pane = el("aside", { class: "pane" + (phone ? " pane-sheet" : ""), "aria-label": phone ? "Board and file" : "Side pane", hidden: true }, edge, head, body);
  host.append(pane);
  let current = null, shown = false, load = null, owner = null, stale = null;
  const paneApi = async (path, init) => {
    const result = await api(path, init);
    if (result.status === 404 && String(path).startsWith("/chat/doc/assets/")) stale?.();
    return result;
  };
  const env = (scoped) => {
    const env2 = { api: paneApi, signal: scoped.signal, own: (fn) => scoped.own(fn), phone, open: (id) => open({ kind: "board", id }, { from: "link" }) };
    env2.link = (raw) => chatHref(raw, origin);
    env2.image = async (image, source) => {
      const path = assetPath(source);
      if (!path) return;
      try {
        const blob = await (await response(paneApi, path, scoped.signal)).blob();
        if (scoped.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        scoped.own(() => URL.revokeObjectURL(url));
        image.src = url;
      } catch {
        if (!scoped.signal.aborted) image.replaceWith(problem("Couldn't load the image."));
      }
    };
    return env2;
  };
  const unwire = wireLinks(body, { origin, open: (target) => open(target, { from: "link" }) });
  const bounds = () => {
    const width = host.clientWidth;
    return [Math.min(440, width * 0.5), Math.max(440, width - 520)];
  };
  const fit = (value) => {
    const [min, max] = bounds();
    return Math.round(Math.max(min, Math.min(max, value)));
  };
  const setWidth = (value) => host.style.setProperty("--pane-w", fit(value) + "px");
  const sized = () => {
    if (!phone) setWidth(saved.read("width", null) ?? host.clientWidth * 0.5);
  };
  function heading(target, item) {
    if (target.kind === "image") {
      kind.textContent = "";
      kind.hidden = true;
      title.textContent = target.title || "Image";
      meta.replaceChildren(el("span", { class: "pane-where" }, target.from || "From the chat"), target.at ? el("span", {}, when(target.at)) : "");
      if (out) {
        out.firstChild.textContent = "Download";
        out.title = "Download the image";
      }
      return;
    }
    const file = target.kind === "file", block = target.kind === "block";
    kind.hidden = block;
    kind.textContent = file ? FILE_KIND[item?.kind] ?? "File" : block ? "" : "Board";
    title.textContent = item?.title || target.title || (file ? fileName(target.path) : block ? target.block?.title || "" : shortId(target.id));
    const where = file ? target.path.startsWith(WORK + "/") ? target.path.slice(WORK.length + 1) : target.path : block ? `From ${lead()}'s reply` : shortId(item?.id ?? target.id);
    const time = file ? item?.mtime : item?.updatedAt;
    meta.replaceChildren(el("span", { class: "pane-where" }, where), time ? el("span", {}, (file ? "Edited " : "") + when(time)) : "");
    if (out) {
      out.hidden = block || file;
      out.firstChild.textContent = file ? "Download" : "Open in Reports";
      out.href = file ? item?.download ?? "#" : "#/boards/" + encodeURIComponent(target.id);
      out.title = file ? "Download the file" : "Open it large in Reports";
      if (file) out.setAttribute("download", "");
      else out.removeAttribute("download");
    }
  }
  function viewer(target, scoped) {
    const list = target.images, img = el("img", { class: "viewer-img", alt: "", draggable: "false" });
    const stage = el("div", { class: "viewer-stage", tabindex: "0", "aria-label": "Image · zoom with the wheel or two fingers, drag to move" }, img);
    const count = el("span", { class: "viewer-count" }), level = el("span", { class: "viewer-level", "aria-live": "polite" });
    const prev = control("‹", { class: "viewer-prev", "aria-label": "Previous image", title: "Previous image · ←", onclick: () => show(at - 1) });
    const next = control("›", { class: "viewer-next", "aria-label": "Next image", title: "Next image · →", onclick: () => show(at + 1) });
    const less = control("−", { class: "viewer-zoom", "aria-label": "Zoom out", title: "Zoom out · -", onclick: () => zoomTo(z / 1.25) });
    const more = control("+", { class: "viewer-zoom", "aria-label": "Zoom in", title: "Zoom in · +", onclick: () => zoomTo(z * 1.25) });
    const whole = control("Fit", { class: "viewer-fit", title: "Fit to the pane · 0", onclick: () => fit2(true) });
    const real = control("Actual size", { class: "viewer-real", title: "View at actual size · 1", onclick: () => zoomTo(1) });
    const bar = el("div", { class: "viewer-bar" }, list.length > 1 ? el("span", { class: "viewer-pages" }, prev, count, next) : null, el("span", { class: "viewer-gap" }), el("span", { class: "viewer-zooms" }, less, level, more), whole, phone ? null : real);
    let at = 0, z = 1, fitZ = 1, x = 0, y = 0, natural = null;
    const box = () => stage.getBoundingClientRect();
    const paint = (smooth = false) => {
      img.classList.toggle("is-gliding", smooth && !reduced());
      img.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      level.textContent = Math.round(z * 100) + "%";
      stage.classList.toggle("is-zoomed", z > fitZ + 1e-3);
      whole.disabled = Math.abs(z - fitZ) < 1e-3 && !x && !y;
      real.disabled = Math.abs(z - 1) < 1e-3;
      less.disabled = z <= fitZ + 1e-3;
      more.disabled = z >= 8 - 1e-3;
    };
    const clamp = () => {
      const frame = box(), mx = Math.max(0, (natural.w * z - frame.width) / 2 + 24), my = Math.max(0, (natural.h * z - frame.height) / 2 + 24);
      x = Math.max(-mx, Math.min(mx, x));
      y = Math.max(-my, Math.min(my, y));
    };
    const measure = () => {
      const frame = box();
      fitZ = Math.min(1, (frame.width - 48) / natural.w, (frame.height - 48) / natural.h);
      if (!(fitZ > 0)) fitZ = 1;
    };
    function fit2(smooth = false) {
      if (!natural) return;
      measure();
      z = fitZ;
      x = 0;
      y = 0;
      paint(smooth);
    }
    function zoomTo(value, cx = 0, cy = 0, smooth = true) {
      if (!natural) return;
      const to = Math.max(fitZ, Math.min(8, value)), k = to / z;
      x = cx - (cx - x) * k;
      y = cy - (cy - y) * k;
      z = to;
      clamp();
      paint(smooth);
    }
    function show(n) {
      at = (n + list.length) % list.length;
      natural = null;
      img.classList.remove("is-ready");
      img.src = list[at].url;
      count.textContent = `${at + 1} / ${list.length}`;
      title.textContent = list.length > 1 ? `Image ${at + 1} / ${list.length}` : target.title || "Image";
      if (out) {
        out.hidden = false;
        out.href = list[at].url;
        out.setAttribute("download", list[at].name || `image-${at + 1}`);
      }
    }
    img.addEventListener("load", () => {
      natural = { w: img.naturalWidth, h: img.naturalHeight };
      img.style.width = natural.w + "px";
      img.style.height = natural.h + "px";
      img.style.marginLeft = -natural.w / 2 + "px";
      img.style.marginTop = -natural.h / 2 + "px";
      fit2();
      img.classList.add("is-ready");
    });
    img.addEventListener("error", () => {
      natural = null;
      stage.replaceChildren(problem("Image expired"));
    });
    const local = (event) => {
      const frame = box();
      return [event.clientX - frame.left - frame.width / 2, event.clientY - frame.top - frame.height / 2];
    };
    stage.addEventListener("wheel", (event) => {
      if (!natural) return;
      event.preventDefault();
      zoomTo(z * Math.exp(-event.deltaY * 16e-4), ...local(event), false);
    }, { passive: false });
    stage.addEventListener("dblclick", (event) => {
      if (z > fitZ + 1e-3) fit2(true);
      else zoomTo(Math.max(1, fitZ * 2), ...local(event));
    });
    const pointers = new Map();
    let pinch = null;
    stage.addEventListener("pointerdown", (event) => {
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      stage.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z };
      }
    });
    stage.addEventListener("pointermove", (event) => {
      const was = pointers.get(event.pointerId);
      if (!was || !natural) return;
      const now = [event.clientX, event.clientY];
      pointers.set(event.pointerId, now);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomTo(pinch.z * d / (pinch.d || 1), ...local({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }), false);
      } else if (pointers.size === 1 && z > fitZ + 1e-3) {
        x += now[0] - was[0];
        y += now[1] - was[1];
        clamp();
        paint();
      }
    });
    const lift = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    stage.addEventListener("pointerup", lift);
    stage.addEventListener("pointercancel", lift);
    stage.addEventListener("keydown", (event) => {
      const keys = { ArrowLeft: () => list.length > 1 && show(at - 1), ArrowRight: () => list.length > 1 && show(at + 1), "+": () => zoomTo(z * 1.25), "=": () => zoomTo(z * 1.25), "-": () => zoomTo(z / 1.25), "0": () => fit2(true), "1": () => zoomTo(1) };
      if (keys[event.key]) {
        event.preventDefault();
        keys[event.key]();
      }
    });
    if (typeof ResizeObserver === "function") {
      const watch = new ResizeObserver(() => {
        if (!natural) return;
        const fitted = Math.abs(z - fitZ) < 1e-3;
        measure();
        if (fitted) {
          z = fitZ;
          x = 0;
          y = 0;
        } else z = Math.max(z, fitZ);
        clamp();
        paint();
      });
      watch.observe(stage);
      scoped.own(() => watch.disconnect());
    }
    show(target.index ?? 0);
    requestAnimationFrame(() => stage.focus({ preventScroll: true }));
    return el("div", { class: "viewer" }, stage, bar);
  }
  function draw(blocks, board = null) {
    owner?.destroy();
    owner = scope();
    const notes = boardNotes(blocks), drawEnv = { ...env(owner), notes, board }, list = blocks.filter((block, n) => !(n === 0 && block?.type === "heading" && Number(block.level) === 1));
    if (notes) list.push({ id: "pane-notes", type: "notes", title: "Notes", items: notes.items });
    doc.replaceChildren(...list.map((block) => {
      const node = el("section", { class: "bv-block pane-block" });
      try {
        render(block, node, owner, drawEnv);
      } catch {
        node.replaceChildren(problem("Couldn't show this block."));
      }
      markLinks(node, origin);
      return node;
    }));
    if (!list.length) doc.append(el("p", { class: "pane-muted" }, "Nothing to show"));
    if (!reduced()) {
      doc.classList.remove("is-in");
      void doc.offsetWidth;
      doc.classList.add("is-in");
    }
  }
  async function fetchTarget(target, { keepPlace = false } = {}) {
    load?.abort();
    load = new AbortController();
    const signal = load.signal, top = body.scrollTop;
    stale = null;
    heading(target, null);
    pane.classList.toggle("is-image", target.kind === "image");
    if (target.kind === "image") {
      owner?.destroy();
      owner = scope();
      doc.replaceChildren(viewer(target, owner));
      if (!reduced()) {
        doc.classList.remove("is-in");
        void doc.offsetWidth;
        doc.classList.add("is-in");
      }
      return;
    }
    if (target.kind === "block") {
      draw([{ ...target.block, id: target.block.id ?? "pane" }]);
      body.scrollTop = 0;
      return;
    }
    if (!keepPlace) {
      owner?.destroy();
      owner = null;
      doc.replaceChildren(el("p", { class: "pane-loading" }, "Loading…"));
      body.scrollTop = 0;
    }
    let status = 0, item = null;
    try {
      const path = target.kind === "file" ? "/chat/doc?path=" + encodeURIComponent(target.path) : "/canvas/boards/" + encodeURIComponent(target.id);
      const result = await api(path, { signal });
      status = result.status;
      try {
        item = await result.json();
      } catch {
        item = null;
      }
    } catch {
      if (signal.aborted) return;
    }
    if (signal.aborted) return;
    if (status === 401) {
      location.assign("/login");
      return;
    }
    if (status !== 200 || !item || item.ok === false || !Array.isArray(item.blocks)) {
      owner?.destroy();
      owner = null;
      const line = target.kind === "file" ? FILE_ERRORS[item?.error] ?? (status === 404 ? FILE_ERRORS.not_found : "Couldn't load it") : status === 404 ? "Couldn't find the board" : "Couldn't load the board";
      doc.replaceChildren(problem(line, status && status < 500 && status !== 0 ? void 0 : () => fetchTarget(target)));
      return;
    }
    heading(target, item);
    draw(item.blocks, { path: (target.kind === "file" ? item.path : item.source?.path) ?? null, blocks: item.blocks, questions: item.questions });
    if (target.kind === "file" && item.download) doc.append(fileDownload(api, item.download, fileName(target.path)));
    body.scrollTop = keepPlace ? top : 0;
    if (target.kind === "file") {
      let again = true;
      stale = () => {
        if (!again) return;
        again = false;
        queueMicrotask(() => {
          if (current === target) fetchTarget(target, { keepPlace: true });
        });
      };
    }
  }
  function remember(target, label) {
    if (!remembered(target)) return;
    const key = targetKey(target), list = saved.read("recent", []).filter((entry) => remembered(entry?.target) && targetKey(entry.target) !== key);
    list.unshift({ target: target.kind === "file" ? { kind: "file", path: target.path } : { kind: "board", id: target.id }, title: label ?? null });
    saved.write("recent", list.slice(0, 8));
    saved.write("last", list[0]);
  }
  function paintRecent() {
    const list = saved.read("recent", []).filter((entry) => remembered(entry?.target));
    recentList.replaceChildren(...list.map((entry) => el("li", {}, control(el("span", {}, el("span", { class: "pane-recent-kind" }, entry.target.kind === "file" ? "File" : "Board"), " ", entry.title || (entry.target.kind === "file" ? fileName(entry.target.path) : shortId(entry.target.id))), { class: "pane-recent-item", onclick: () => {
      recent.open = false;
      open(entry.target, { title: entry.title, from: "recent" });
    } }))));
    if (!list.length) recentList.append(el("li", { class: "pane-muted" }, "Nothing opened yet"));
  }
  async function reveal(instant) {
    shown = true;
    sized();
    const play = instant || reduced() ? null : flip();
    pane.hidden = false;
    host.toggleAttribute("data-pane-open", true);
    play?.();
    if (instant || reduced()) return;
    const from = phone ? "translateX(100%)" : "translateX(48px)";
    await pane.animate([{ transform: from, opacity: phone ? 1 : 0 }, { transform: "none", opacity: 1 }], { duration: phone ? 300 : 380, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {
    });
  }
  async function hide() {
    if (!shown) return;
    shown = false;
    if (recent) recent.open = false;
    load?.abort();
    load = null;
    if (!reduced()) {
      const to = phone ? "translateX(100%)" : "translateX(48px)";
      await pane.animate([{ transform: "none", opacity: 1 }, { transform: to, opacity: phone ? 1 : 0 }], { duration: 220, easing: "cubic-bezier(.4,0,.6,1)" }).finished.catch(() => {
      });
      if (shown) return;
    }
    const play = reduced() ? null : flip();
    pane.hidden = true;
    host.toggleAttribute("data-pane-open", false);
    play?.();
    owner?.destroy();
    owner = null;
    doc.replaceChildren();
    saved.write("open", false);
    onChange({ open: false, target: current });
  }
  const accepts = (target) => !!target && ["board", "file", "block", "image"].includes(target.kind) && !(target.kind === "image" && !target.images?.length);
  async function open(target, { title: label = null, instant = false } = {}) {
    if (!accepts(target)) return false;
    const same = current && shown && targetKey(current) === targetKey(target) && doc.childElementCount;
    current = label && !target.title ? { ...target, title: label } : target;
    remember(target, label ?? target.title ?? null);
    if (!shown) await reveal(instant);
    if (!same) await fetchTarget(current);
    saved.write("open", remembered(target));
    onChange({ open: true, target: current });
    return true;
  }
  close.addEventListener("click", () => hide());
  const escape = (event) => {
    if (event.key !== "Escape" || !shown || event.isComposing || event.defaultPrevented) return;
    if (recent?.open) {
      recent.open = false;
      recent.querySelector("summary").focus();
      return;
    }
    event.preventDefault();
    hide();
  };
  document.addEventListener("keydown", escape);
  if (!phone) {
    recent.addEventListener("toggle", () => {
      if (recent.open) {
        paintRecent();
        note.textContent = "";
        requestAnimationFrame(() => field.focus({ preventScroll: true }));
      }
    });
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const value = field.value.trim();
      if (!value) return;
      const target = classifyLink(/^([a-z]+:|\/|#)/i.test(value) ? value : WORK + "/" + value.replace(/^\.\//, ""), origin);
      if (target.kind === "other") {
        note.textContent = /^https?:/i.test(value) ? "Web pages open from their link in a new tab" : "This address can't be opened";
        return;
      }
      field.value = "";
      note.textContent = "";
      recent.open = false;
      open(target, { from: "ask" });
    });
    let drag = null;
    edge.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, width: pane.getBoundingClientRect().width };
      edge.setPointerCapture(event.pointerId);
      host.classList.add("is-resizing");
    });
    edge.addEventListener("pointermove", (event) => {
      if (drag) setWidth(drag.width + drag.x - event.clientX);
    });
    const done = () => {
      if (!drag) return;
      drag = null;
      host.classList.remove("is-resizing");
      saved.write("width", Math.round(pane.getBoundingClientRect().width));
    };
    edge.addEventListener("pointerup", done);
    edge.addEventListener("pointercancel", done);
    edge.addEventListener("dblclick", () => {
      saved.write("width", null);
      setWidth(host.clientWidth * 0.5);
    });
    edge.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowLeft" ? 32 : event.key === "ArrowRight" ? -32 : 0;
      if (!step) return;
      event.preventDefault();
      setWidth(pane.getBoundingClientRect().width + step);
      saved.write("width", Math.round(pane.getBoundingClientRect().width));
    });
  }
  const resized = typeof ResizeObserver === "function" && !phone ? new ResizeObserver(() => {
    if (shown) sized();
  }) : null;
  resized?.observe(host);
  return { node: pane, open, close: hide, accepts, get current() {
    return shown ? current : null;
  }, get shown() {
    return shown;
  }, restore() {
    const last = saved.read("last", null);
    if (saved.read("open", false) && remembered(last?.target)) open(last.target, { title: last.title, instant: true, from: "restore" });
  }, destroy() {
    document.removeEventListener("keydown", escape);
    resized?.disconnect();
    unwire();
    load?.abort();
    owner?.destroy();
    pane.remove();
  } };
}
