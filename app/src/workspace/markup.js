import { el } from "../boards/dom.js";
import { prepareImage, transferImages } from "../chat/images.js";
import { iconButton, glyph } from "./icons.js";
import { createSender } from "./send.js";
import { looksSecret } from "./core.js";
import { lead, l10n } from "../names.js";
export const TOOLS = [["pen", "pen", "Pen"], ["box", "box", "Box"], ["arrow", "arrow", "Arrow"], ["text", "text", "Text"]];
export const COLOURS = [["glow", "White glow"], ["owner", "Amber"]];
export const COMMENT_SECRET = "The comment looks like it holds a secret · nothing was sent";
export const markupText = (ref, comment = "") => {
  const said = String(comment ?? "").trim();
  return l10n("마크업 · ", "Markup · ") + ref + (said ? "\n" + said : "");
};
export async function sendMarkup({ canvas, ref, comment = "", texts = [], prepare = prepareImage, sender, onState = () => {
} }) {
  const each = [comment, ...texts].map((text) => String(text ?? "")), said = each.join("\n");
  if (each.some((text) => looksSecret(text)) || looksSecret(said)) return { ok: false, error: "secret", line: COMMENT_SECRET };
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return { ok: false, error: "no_png", line: "Couldn't draw the picture" };
  let fitted;
  try {
    fitted = await prepare(new File([blob], "markup.png", { type: "image/png" }));
  } catch (error) {
    return { ok: false, error: error?.code ?? "image", line: error?.line ?? "This picture can't be sent" };
  }
  return sender.send({ text: markupText(ref, comment), images: [{ data: fitted.data, mimeType: fitted.mimeType }] }, { secret: said, secretLine: COMMENT_SECRET, onState });
}
export async function captureFrame({ media = globalThis.navigator?.mediaDevices, wait = 4e3 } = {}) {
  if (typeof media?.getDisplayMedia !== "function") throw Object.assign(new Error("no capture"), { line: "This browser can't capture the tab · paste, drop or attach an image" });
  let stream;
  try {
    stream = await media.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", monitorTypeSurfaces: "exclude" });
  } catch (error) {
    throw Object.assign(new Error("refused"), { line: error?.name === "NotAllowedError" ? "Capture was cancelled" : "Couldn't capture the tab", cause: error });
  }
  const video = typeof document === "object" ? document.createElement("video") : null;
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw Object.assign(new Error("no track"), { line: "Couldn't capture the tab" });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { line: "Couldn't capture the tab" })), wait));
    return await Promise.race([firstFrame(stream, track, video), timeout]);
  } finally {
    for (const track of stream.getTracks()) track.stop();
    if (video) {
      video.pause?.();
      video.srcObject = null;
    }
  }
}
async function firstFrame(stream, track, video) {
  if (typeof ImageCapture === "function") {
    try {
      return await new ImageCapture(track).grabFrame();
    } catch {
    }
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
  await new Promise((resolve) => video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => resolve()) : requestAnimationFrame(() => resolve()));
  return createImageBitmap(video);
}
export function drawMarks(context, marks, { width = 4, colours }) {
  for (const mark of marks) {
    const colour = colours[mark.colour] ?? colours.glow, glow = mark.colour === "glow";
    const stroke = (path) => {
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(0,0,0,.5)";
      context.lineWidth = width + Math.max(2, width * 0.6);
      path();
      context.stroke();
      context.strokeStyle = colour;
      context.lineWidth = width;
      if (glow) {
        context.shadowColor = "rgba(255,255,255,.85)";
        context.shadowBlur = width * 3;
      }
      path();
      context.stroke();
      context.restore();
    };
    if (mark.tool === "pen" && mark.points.length) stroke(() => {
      context.beginPath();
      context.moveTo(...mark.points[0]);
      for (const point of mark.points.slice(1)) context.lineTo(...point);
      if (mark.points.length === 1) context.lineTo(mark.points[0][0] + 0.1, mark.points[0][1]);
    });
    else if (mark.tool === "box" && mark.points.length) {
      const [[x0, y0], [x1, y1] = mark.points[0]] = [mark.points[0], mark.points.at(-1)];
      stroke(() => {
        context.beginPath();
        roundRect(context, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), width * 2);
      });
    } else if (mark.tool === "arrow" && mark.points.length) {
      const [x0, y0] = mark.points[0], [x1, y1] = mark.points.at(-1), angle = Math.atan2(y1 - y0, x1 - x0), head = width * 4.5;
      stroke(() => {
        context.beginPath();
        context.moveTo(x0, y0);
        context.lineTo(x1, y1);
        context.moveTo(x1 - head * Math.cos(angle - 0.45), y1 - head * Math.sin(angle - 0.45));
        context.lineTo(x1, y1);
        context.lineTo(x1 - head * Math.cos(angle + 0.45), y1 - head * Math.sin(angle + 0.45));
      });
    } else if (mark.tool === "text" && mark.text) {
      context.save();
      context.font = `600 ${Math.round(width * 6)}px system-ui, sans-serif`;
      context.textBaseline = "top";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(0,0,0,.6)";
      context.lineWidth = Math.max(3, width * 1.2);
      context.strokeText(mark.text, ...mark.at);
      context.fillStyle = colour;
      if (glow) {
        context.shadowColor = "rgba(255,255,255,.85)";
        context.shadowBlur = width * 2;
      }
      context.fillText(mark.text, ...mark.at);
      context.restore();
    }
  }
}
function roundRect(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}
export function createHistory() {
  let marks = [], past = [], future = [];
  return { get marks() {
    return marks;
  }, get canUndo() {
    return past.length > 0;
  }, get canRedo() {
    return future.length > 0;
  }, set(next) {
    past.push(marks);
    marks = next;
    future = [];
  }, add(mark) {
    this.set([...marks, mark]);
  }, clear() {
    if (marks.length) this.set([]);
  }, undo() {
    if (!past.length) return false;
    future.push(marks);
    marks = past.pop();
    return true;
  }, redo() {
    if (!future.length) return false;
    past.push(marks);
    marks = future.pop();
    return true;
  }, reset() {
    marks = [];
    past = [];
    future = [];
  } };
}
export function createMarkup({ host, ref, capture = captureFrame, prepare = prepareImage, sender = createSender(), onSent = () => {
} }) {
  const history = createHistory();
  let picture = null, tool = "pen", colour = "glow", drawing = null, typing = null, open = false;
  const canvas = el("canvas", { class: "mk-canvas", "aria-label": "The picture to mark up" });
  const toolButtons = TOOLS.map(([id, name, label]) => {
    const button = iconButton(name, label, { class: "mk-tool", "data-tool": id, "aria-pressed": String(id === tool) });
    button.addEventListener("click", () => pickTool(id));
    return button;
  });
  const colourButtons = COLOURS.map(([id, label]) => {
    const button = el("button", { type: "button", class: "mk-colour", "data-colour": id, "aria-label": label, title: label, "aria-pressed": String(id === colour) }, el("span", { class: "mk-swatch" }));
    button.addEventListener("click", () => pickColour(id));
    return button;
  });
  const undo = iconButton("undo", "Undo", { key: "⌘Z", class: "mk-undo" }), redo = iconButton("redo", "Redo", { key: "⇧⌘Z", class: "mk-redo" }), clear = iconButton("trash", "Clear the marks", { class: "mk-clear" });
  const again = iconButton("capture", "Capture this tab again", { class: "mk-again" });
  const close = iconButton("close", "Close", { key: "Esc", class: "mk-close" });
  const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", class: "mk-file", hidden: true, tabindex: "-1" });
  const attach = iconButton("attach", "Attach an image", { class: "mk-attach" });
  const captureNow = el("button", { type: "button", class: "mk-start" }, glyph("capture"), el("span", {}, "Capture this tab"));
  const attachNow = el("button", { type: "button", class: "mk-start" }, glyph("attach"), el("span", {}, "Attach an image"));
  const empty = el("div", { class: "mk-empty" }, el("div", { class: "mk-starts" }, captureNow, attachNow), el("p", { class: "mk-hint" }, "or paste or drop an image here"));
  const stage = el("div", { class: "mk-stage" }, empty, canvas);
  const comment = el("textarea", { class: "mk-comment", rows: "2", placeholder: `A comment for ${lead()} (optional)`, "aria-label": "Comment", spellcheck: "false" });
  const state = el("span", { class: "mk-state", role: "status" });
  const send = iconButton("send", "Send to " + lead(), { key: "⌘Enter", class: "mk-send" });
  const refLine = el("span", { class: "mk-ref" });
  const panel = el("div", { class: "mk-panel", role: "dialog", "aria-modal": "true", "aria-label": "Markup", tabindex: "-1" }, el("header", { class: "mk-head" }, el("h2", { class: "mk-title" }, "Markup"), refLine, el("div", { class: "mk-tools", role: "group", "aria-label": "Tools" }, ...toolButtons), el("div", { class: "mk-colours", role: "group", "aria-label": "Colour" }, ...colourButtons), el("div", { class: "mk-acts" }, undo, redo, clear), el("span", { class: "mk-gap" }), again, attach, close), stage, el("footer", { class: "mk-foot" }, comment, el("div", { class: "mk-send-row" }, state, send)), file);
  const node = el("div", { class: "mk", hidden: true }, panel);
  host.append(node);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const colours = () => ({ glow: "#f3f3ef", owner: css("--state-owner") || "#ffc247" });
  const width = () => picture ? Math.max(3, Math.round(Math.max(picture.width, picture.height) / 420)) : 4;
  function say(text = "", kind = "") {
    state.textContent = text;
    state.dataset.state = kind;
  }
  function paint() {
    const context = canvas.getContext("2d");
    if (!picture || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0);
    drawMarks(context, drawing ? [...history.marks, drawing] : history.marks, { width: width(), colours: colours() });
    undo.disabled = !history.canUndo;
    redo.disabled = !history.canRedo;
    clear.disabled = !history.marks.length;
  }
  function setPicture(bitmap, { marks = [] } = {}) {
    picture?.close?.();
    picture = bitmap;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    history.reset();
    if (marks.length) history.set(marks);
    node.dataset.has = "picture";
    empty.hidden = true;
    canvas.hidden = false;
    paint();
  }
  const pickTool = (id) => {
    tool = id;
    for (const button of toolButtons) button.setAttribute("aria-pressed", String(button.dataset.tool === id));
    node.dataset.tool = id;
  };
  const pickColour = (id) => {
    colour = id;
    for (const button of colourButtons) button.setAttribute("aria-pressed", String(button.dataset.colour === id));
  };
  const at = (event) => {
    const box = canvas.getBoundingClientRect();
    return [Math.round((event.clientX - box.left) * canvas.width / box.width), Math.round((event.clientY - box.top) * canvas.height / box.height)];
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!picture || event.button !== 0) return;
    event.preventDefault();
    if (typing && !commitText()) return;
    if (tool === "text") {
      startText(event);
      return;
    }
    canvas.setPointerCapture?.(event.pointerId);
    drawing = { tool, colour, points: [at(event)] };
    paint();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const point = at(event);
    if (drawing.tool === "pen") drawing.points.push(point);
    else drawing.points = [drawing.points[0], point];
    paint();
  });
  const finish = () => {
    if (!drawing) return;
    const done = drawing;
    drawing = null;
    if (done.points.length > 1 || done.tool === "pen") history.add(done);
    paint();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  function startText(event) {
    const point = at(event), box = canvas.getBoundingClientRect(), scale = box.width / canvas.width;
    const field = el("input", { type: "text", class: "mk-text", "aria-label": "Text on the picture", spellcheck: "false", style: { left: event.clientX - stage.getBoundingClientRect().left + "px", top: event.clientY - stage.getBoundingClientRect().top + "px", "font-size": Math.max(13, Math.round(width() * 6 * scale)) + "px" } });
    field.dataset.colour = colour;
    field.addEventListener("input", () => {
      if (field.classList.contains("is-problem")) {
        field.classList.remove("is-problem");
        say("");
      }
    });
    typing = { field, point, colour };
    field.addEventListener("keydown", (key) => {
      if (key.isComposing) return;
      if (key.key === "Enter") {
        key.preventDefault();
        commitText();
      } else if (key.key === "Escape") {
        key.preventDefault();
        key.stopPropagation();
        dropText();
      }
    });
    stage.append(field);
    setTimeout(() => field.focus({ preventScroll: true }), 0);
  }
  function commitText() {
    const now = typing;
    if (!now) return true;
    const text = now.field.value.trim();
    if (looksSecret(text)) {
      now.field.classList.add("is-problem");
      say(COMMENT_SECRET, "failed");
      now.field.focus({ preventScroll: true });
      return false;
    }
    typing = null;
    now.field.remove();
    if (text) history.add({ tool: "text", colour: now.colour, at: now.point, text: text.slice(0, 200) });
    paint();
    return true;
  }
  function dropText() {
    typing?.field.remove();
    typing = null;
  }
  undo.addEventListener("click", () => {
    history.undo();
    paint();
  });
  redo.addEventListener("click", () => {
    history.redo();
    paint();
  });
  clear.addEventListener("click", () => {
    history.clear();
    paint();
  });
  async function fromFile(blob) {
    if (!blob) return;
    try {
      setPicture(await createImageBitmap(blob));
      say("");
    } catch {
      say("This image can't be opened", "failed");
    }
  }
  attach.addEventListener("click", () => file.click());
  attachNow.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    void fromFile(file.files?.[0]);
    file.value = "";
  });
  panel.addEventListener("paste", (event) => {
    if (event.target === comment || event.target.classList?.contains("mk-text")) return;
    const [image] = transferImages(event.clipboardData);
    if (image) {
      event.preventDefault();
      void fromFile(image);
    }
  });
  stage.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer?.types ?? []].includes("Files")) {
      event.preventDefault();
      stage.classList.add("is-over");
    }
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("is-over"));
  stage.addEventListener("drop", (event) => {
    stage.classList.remove("is-over");
    const [image] = transferImages(event.dataTransfer);
    if (image) {
      event.preventDefault();
      void fromFile(image);
    }
  });
  async function take({ box = null } = {}) {
    node.hidden = true;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const bitmap = await capture();
      const scale = bitmap.width / Math.max(1, innerWidth);
      const marks = box ? [{ tool: "box", colour: "owner", points: [[Math.round(box.x * scale), Math.round(box.y * scale)], [Math.round((box.x + box.width) * scale), Math.round((box.y + box.height) * scale)]] }] : [];
      node.hidden = false;
      open = true;
      setPicture(bitmap, { marks });
      say("");
      panel.focus({ preventScroll: true });
      return true;
    } catch (error) {
      open = true;
      node.hidden = false;
      empty.hidden = !!picture;
      canvas.hidden = !picture;
      say(error?.line ?? "Couldn't capture the tab", "failed");
      return false;
    }
  }
  captureNow.addEventListener("click", () => {
    void take();
  });
  again.addEventListener("click", () => {
    void take();
  });
  async function go() {
    if (sender.busy || send.disabled) return;
    if (!picture) {
      say("Capture, paste or attach a picture first", "failed");
      return;
    }
    if (typing && !commitText()) return;
    send.disabled = true;
    try {
      const texts = history.marks.filter((mark) => mark.tool === "text").map((mark) => mark.text);
      const sent = await sendMarkup({ canvas, ref: ref(), comment: comment.value, texts, prepare, sender, onState: (now) => say(now.line, now.state) });
      say(sent.line, sent.ok ? "sent" : "failed");
      if (sent.ok) {
        onSent();
        setTimeout(() => {
          if (open) hide();
        }, 1200);
        return;
      }
    } catch (error) {
      say(error?.line ?? "Couldn't send", "failed");
    }
    send.disabled = false;
  }
  send.addEventListener("click", () => {
    void go();
  });
  comment.addEventListener("keydown", (event) => {
    if (!event.isComposing && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void go();
    }
  });
  const keyed = (event) => {
    if (!open || node.closest("[hidden]") || event.isComposing) return;
    const inText = !!event.target?.classList?.contains("mk-text");
    if (event.key === "Escape") {
      if (inText) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z" && event.target !== comment && !inText) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) history.redo();
      else history.undo();
      paint();
    }
  };
  window.addEventListener("keydown", keyed, true);
  close.addEventListener("click", () => hide());
  function hide() {
    if (!open && node.hidden) return;
    open = false;
    node.hidden = true;
    dropText();
    drawing = null;
    picture?.close?.();
    picture = null;
    history.reset();
    canvas.width = 0;
    canvas.height = 0;
    delete node.dataset.has;
    comment.value = "";
    say("");
    send.disabled = false;
    empty.hidden = false;
    canvas.hidden = true;
  }
  function show({ capture: now = false, box = null, text = "" } = {}) {
    refLine.textContent = ref();
    if (text) comment.value = text;
    pickTool(tool);
    pickColour(colour);
    send.disabled = false;
    if (now) return take({ box });
    open = true;
    node.hidden = false;
    empty.hidden = !!picture;
    canvas.hidden = !picture;
    paint();
    captureNow.focus({ preventScroll: true });
    return Promise.resolve(true);
  }
  canvas.hidden = true;
  return { node, show, hide, get shown() {
    return open;
  }, get picture() {
    return picture;
  }, get canvas() {
    return canvas;
  }, history, destroy() {
    hide();
    window.removeEventListener("keydown", keyed, true);
    node.remove();
  } };
}
