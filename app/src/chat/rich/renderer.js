import { mountCode, mountMath, mountMermaid } from "../rendering.js";
import { el, svg } from "../../boards/dom.js";
import { answerIcon } from "./icons.js";
import { RichAnswerStream, richVisualStyle, richColor, richVector, richAction, richSendText, richChart, richLinePlot, richResolvedValues, richCalculationUnavailable, richLabel, richNumber, richOptions, richRange, richString, richTone, richProgress, richProgressLabel } from "./richAnswer.js";
import { sourceAllowed, documentAllowed } from "./guard.js";
import { localValues } from "./state.js";
import { presentationStyle } from "./presentation.js";
import { l10n } from "../../names.js";
const palette = { primary: "var(--text-primary)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)", success: "var(--status-success)", warning: "var(--warning-fg)", danger: "var(--error-fg)", border: "var(--border-default)" };
function styles() {
  if (document.querySelector("link[data-rich-styles]")) return;
  const link = el("link", { rel: "stylesheet", href: new URL("./home.css", import.meta.url).href, "data-rich-styles": "" });
  document.head.append(link);
}
const label = (n, values) => richLabel(n, values);
const put = (node, text) => {
  const value = String(text ?? "");
  if (node.textContent !== value) node.textContent = value;
};
function order(parent, nodes) {
  let cursor = parent.firstChild;
  for (const node of nodes) {
    if (node !== cursor) parent.insertBefore(node, cursor);
    cursor = node.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}
const draft = (text) => {
  const event = new CustomEvent("lead:prefill", { detail: { text } });
  globalThis.dispatchEvent(event);
};
let mountSequence = 0;
export function mountRich(host, { source = "", complete = true, prefill = draft, prose = null, stateKey = null, account = "owner", storage } = {}) {
  const mountId = `cindy-tabs-${++mountSequence}`;
  let tabSequence = 0;
  styles();
  const root = el("div", { class: "rich-answer", "data-rich-answer": "" }), plain = el("pre", { class: "bv-code", tabindex: 0 });
  const kept = localValues(stateKey, { account, storage }), parser = new RichAnswerStream(), records = new Map();
  let doc, values = {}, edited = kept.get(), done = complete, gone = false, raw = source;
  const change = (key, value) => {
    edited = kept.set({ [key]: value });
    paint();
  };
  function record(n) {
    let r = records.get(n.id);
    if (r && r.kind === n.kind) return r;
    r?.rendering?.destroy();
    const kind = n.kind, node = el(kind === "heading" ? "h3" : kind === "text" ? "p" : kind === "divider" ? "hr" : kind === "chart" ? "figure" : "div", { "data-rich-node": n.id, class: `rich-answer-${kind === "tabs" ? "tabset" : kind}` });
    r = { node, kind, children: node };
    records.set(n.id, r);
    if (["stack", "row", "grid", "group", "form"].includes(kind)) node.classList.add("rich-answer-layout");
    if (kind === "form") node.classList.add("rich-answer-stack");
    if (["input", "range", "check", "select"].includes(kind)) {
      r.title = el("span");
      r.control = el(kind === "select" ? "select" : "input", kind === "select" ? {} : { type: kind === "check" ? "checkbox" : kind === "range" ? "range" : "text" });
      const field = el("label", { class: kind === "check" ? "rich-answer-check" : "rich-answer-control" });
      node.className = "rich-answer-field";
      r.output = el("output");
      if (kind === "range") field.append(el("div", { class: "rich-answer-control-label" }, r.title, r.output), r.control);
      else if (kind === "check") field.append(r.control, r.title);
      else field.append(r.title, r.control);
      node.append(field);
      if (kind === "select") r.control.className = "rich-answer-select";
      if (kind === "input") r.control.maxLength = 4096;
      r.control.addEventListener(kind === "range" || kind === "input" ? "input" : "change", () => {
        const current = doc.nodes.get(n.id);
        change(richString(current, "bind", n.id), kind === "check" ? r.control.checked : kind === "range" ? Number(r.control.value) : r.control.value);
      });
    } else if (kind === "stat") {
      r.title = el("div", { class: "rich-answer-caption" });
      r.output = el("output");
      node.append(r.title, r.output);
    } else if (kind === "tabs") {
      r.bar = el("div", { class: "rich-answer-tabs", role: "tablist" });
      r.children = el("div");
      r.tabs = new Map();
      node.append(r.bar, r.children);
    } else if (kind === "details") {
      r.details = el("details");
      r.title = el("summary");
      r.children = el("div", { class: "rich-answer-layout rich-answer-stack" });
      r.details.append(r.title, r.children);
      node.append(r.details);
      r.details.addEventListener("toggle", () => {
        const current = doc.nodes.get(n.id);
        const bind = richString(current, "bind", n.id);
        if (Boolean(values[bind]) !== r.details.open) change(bind, r.details.open);
      });
    } else if (kind === "chart") {
      r.title = el("figcaption");
      r.body = el("div");
      node.append(r.title, r.body);
    } else if (kind === "badge") {
      r.body = el("span", { class: "rich-answer-badge-text" });
      node.append(r.body);
    } else if (kind === "alert") {
      node.setAttribute("role", "status");
      r.title = el("strong");
      r.body = el("span", { class: "rich-answer-alert-text" });
      node.append(r.title, r.body);
    } else if (kind === "progress") {
      r.title = el("span");
      r.output = el("output");
      r.bar = el("div");
      r.track = el("div", { class: "rich-answer-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, r.bar);
      node.append(el("div", { class: "rich-answer-control-label" }, r.title, r.output), r.track);
    } else if (kind === "svg") {
      r.vector = svg("svg", { role: "img", style: "width:100%;height:auto;display:block;fill:currentColor" });
      node.append(r.vector);
    } else if (kind === "icon") {
      r.title = el("strong");
      r.body = el("p", { class: "rich-answer-text" });
      node.className = "rich-answer-icon-row";
      r.icon = answerIcon(richString(n, "name"));
      node.append(r.icon, el("div", {}, r.title, r.body));
    }
    if (kind === "button" || kind === "form") {
      if (kind === "form") {
        r.children = el("div", { class: "rich-answer-layout rich-answer-stack" });
        node.append(r.children);
      }
      r.preview = el("p", { class: "rich-answer-caption" });
      r.button = el("button", { type: "button", class: "rich-button" });
      r.status = el("span", { role: "status" });
      node.append(r.preview, r.button, r.status);
      r.button.addEventListener("click", () => {
        const current = doc.nodes.get(n.id);
        if (Object.hasOwn(current.props, "send")) {
          const text = richSendText(current, values);
          if (done && text) {
            prefill(text);
            put(r.status, l10n("입력창에 담았어요. 확인 후 보내 주세요.", "Put in the message box. Check it, then send."));
          }
        } else {
          edited = kept.set(richAction(current, values));
          paint();
        }
      });
    }
    return r;
  }
  function render(id) {
    const n = doc.nodes.get(id), r = record(n), p = n.props, bind = richString(n, "bind", id), text = richString(n, "label");
    if (richCalculationUnavailable(n, values)) {
      if (!r.unavailable) r.unavailable = el("p", { class: "rich-answer-caption", role: "status" });
      put(r.unavailable, done ? l10n("계산할 수 없어요", "Can't work this out") : "…");
      return r.unavailable;
    }
    const visual = presentationStyle(n, richVisualStyle(n, palette)), visualKey = JSON.stringify(visual);
    if (r.visualKey !== visualKey) {
      r.visualKey = visualKey;
      r.node.removeAttribute("style");
      for (const [key, value] of Object.entries(visual)) {
        const unit = typeof value === "number" && !["fontWeight", "opacity", "flexGrow", "flexShrink"].includes(key) && !(key === "lineHeight" && value <= 4) ? `${value}px` : String(value);
        r.node.style[key] = key === "fontFamily" ? unit.replace(/\bmonospace\b/g, "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, var(--font-sans), monospace") : unit;
        r.node.style.setProperty("--rich-" + key, unit);
      }
      if (typeof visual.width === "number" && !visual.maxWidth) r.node.style.maxWidth = "100%";
      if (typeof visual.minWidth === "number") r.node.style.minWidth = `min(${visual.minWidth}px, 100%)`;
    }
    switch (n.kind) {
      case "text":
      case "heading":
        put(r.node, label(n, values));
        break;
      case "markdown": {
        const content = richString(n, "text");
        if (r.last !== content) {
          r.node.replaceChildren(prose ? prose(content) : el("p", { class: "rich-answer-text" }, content));
          r.last = content;
        }
        break;
      }
      case "code": {
        const props = { text: richString(n, "text"), lang: richString(n, "language", "text"), loading: !done };
        if (r.rendering) r.rendering.update({ code: props.text, infostring: props.lang, loading: props.loading });
        else r.rendering = mountCode(r.node, props);
        break;
      }
      case "math": {
        const value = richString(n, "text");
        if (r.rendering) r.rendering.update({ value });
        else r.rendering = mountMath(r.node, { value });
        break;
      }
      case "diagram": {
        const props = { code: richString(n, "text"), loading: !done };
        if (r.rendering) r.rendering.update(props);
        else r.rendering = mountMermaid(r.node, props);
        break;
      }
      case "icon":
        if (r.iconName !== richString(n, "name")) {
          const icon = answerIcon(richString(n, "name"));
          r.icon.replaceWith(icon);
          r.icon = icon;
          r.iconName = richString(n, "name");
        }
        r.icon.setAttribute("width", richNumber(n, "size", 20));
        r.icon.setAttribute("height", richNumber(n, "size", 20));
        put(r.title, text || richString(n, "name"));
        put(r.body, richString(n, "text"));
        break;
      case "stack":
      case "row":
      case "grid":
      case "group":
        r.node.classList.toggle("rich-answer-grid", n.kind === "grid" || Array.isArray(p.weights));
        r.node.classList.toggle("rich-answer-aside", p.layout === "aside");
        r.node.style.setProperty("--rich-mobile-columns", richNumber(n, "mobileColumns", 1));
        r.node.style.setProperty("--rich-columns", Math.max(1, Math.round(richNumber(n, "columns", 2))));
        if (Array.isArray(p.weights)) r.node.style.setProperty("--rich-ratio", p.weights.filter((v) => typeof v === "number" && v > 0).map((v) => `minmax(0, ${v}fr)`).join(" "));
        order(r.children, n.children.map(render));
        break;
      case "stat":
        put(r.title, text);
        put(r.output, label(n, values));
        break;
      case "input":
      case "range":
      case "check":
      case "select": {
        put(r.title, text || richString(n, "text"));
        r.control.setAttribute("aria-label", text || richString(n, "text") || n.kind);
        if (n.kind === "range") {
          const range = richRange(n, values[bind]);
          for (const key of ["min", "max", "step"]) r.control[key] = range[key];
          if (Number(r.control.value) !== range.value) r.control.value = range.value;
          put(r.output, range.value + richString(n, "suffix"));
        } else if (n.kind === "check") r.control.checked = Boolean(values[bind]);
        else {
          if (n.kind === "select") {
            const options = richOptions(n), key = JSON.stringify(options);
            if (r.options !== key) {
              r.control.replaceChildren(el("option", { value: "", disabled: true }, richString(n, "placeholder", text)), ...options.map((o) => el("option", { value: o.value }, o.label)));
              r.options = key;
            }
          } else r.control.placeholder = richString(n, "placeholder");
          const value = String(values[bind] ?? "");
          if (r.control.value !== value) r.control.value = value;
        }
        break;
      }
      case "form":
        order(r.children, n.children.map(render));
      case "button": {
        const sending = Object.hasOwn(p, "send"), message = sending ? richSendText(n, values) : "";
        put(r.preview, message);
        r.preview.hidden = !message;
        put(r.button, sending ? l10n("입력창에 담기", "Put in the message box") : text || richString(n, "text") || l10n("적용", "Apply"));
        r.button.disabled = sending && (!done || !message);
        break;
      }
      case "details":
        put(r.title, text);
        r.details.open = Boolean(values[bind]);
        order(r.children, n.children.map(render));
        break;
      case "tabs": {
        const selected = n.children.includes(String(values[bind])) ? String(values[bind]) : n.children[0];
        r.bar.setAttribute("aria-label", text);
        const buttons = [], panels = [];
        for (const child of n.children) {
          let t = r.tabs.get(child);
          if (!t) {
            const pairId = `${mountId}-${++tabSequence}`, button = el("button", { type: "button", role: "tab", class: "rich-button", id: pairId + "-tab", "aria-controls": pairId + "-panel" }), panel = el("div", { role: "tabpanel", id: pairId + "-panel", "aria-labelledby": pairId + "-tab" });
            button.addEventListener("click", () => change(bind, child));
            button.addEventListener("keydown", (event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const ids = doc.nodes.get(id).children, at = event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : (ids.indexOf(child) + (event.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
              change(bind, ids[at]);
              r.tabs.get(ids[at]).button.focus();
            });
            t = { button, panel };
            r.tabs.set(child, t);
          }
          put(t.button, richString(doc.nodes.get(child), "label", child));
          t.button.setAttribute("aria-selected", String(child === selected));
          t.button.tabIndex = child === selected ? 0 : -1;
          t.panel.hidden = child !== selected;
          t.panel.tabIndex = child === selected ? 0 : -1;
          order(t.panel, [render(child)]);
          buttons.push(t.button);
          panels.push(t.panel);
        }
        order(r.bar, buttons);
        order(r.children, panels);
        break;
      }
      case "svg": {
        const vector = richVector(n, palette), key = JSON.stringify(vector);
        if (r.last !== key) {
          r.vector.setAttribute("viewBox", vector.viewBox);
          r.vector.setAttribute("aria-label", text || richString(n, "alt"));
          r.vector.replaceChildren(...vector.shapes.map(({ type, props, text: text2 }) => {
            const shape = svg(type, {}, text2);
            for (const [k, v] of Object.entries(props)) {
              if (k === "fill" || k === "stroke") shape.style[k] = v;
              else shape.setAttribute(k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()), v);
            }
            return shape;
          }));
          r.last = key;
        }
        break;
      }
      case "chart":
        put(r.title, text);
        drawChart(r, n);
        break;
      case "badge":
        r.node.dataset.tone = richTone(n);
        put(r.body, richString(n, "text", text));
        break;
      case "alert": {
        r.node.dataset.tone = richTone(n);
        const title = richString(n, "title");
        put(r.title, title);
        r.title.hidden = !title;
        put(r.body, richString(n, "text"));
        break;
      }
      case "progress": {
        const tone = richTone(n), percent = richProgress(n, values), shown = p.showValue !== false;
        r.node.dataset.tone = tone;
        put(r.title, text);
        put(r.output, shown ? richProgressLabel(n, values) : "");
        r.output.hidden = !shown;
        r.bar.style.width = `${percent}%`;
        r.track.setAttribute("aria-valuenow", String(percent));
        r.track.setAttribute("aria-label", text || l10n("진행률", "Progress"));
        break;
      }
    }
    return r.node;
  }
  function drawChart(r, n) {
    const data = richChart(n, values), width = Math.max(240, Math.round(r.node.clientWidth || 480)), key = JSON.stringify([n.props, data, width]);
    if (r.last === key) return;
    r.last = key;
    const color = richColor(n.props.color, palette) || "var(--rich-chart-color, currentColor)";
    if (richString(n, "variant") === "line") {
      const plot = richLinePlot(data, width, n.props), graph = svg("svg", { role: "img", "aria-label": richString(n, "label") + ". " + data.map((d) => `${d.label}: ${d.value}`).join(", "), viewBox: `0 0 ${plot.width} ${plot.height}`, style: `height:${plot.height}px;max-height:none` });
      for (const tick of plot.ticks) {
        if (n.props.showGrid !== false) graph.append(svg("line", { x1: plot.left, x2: plot.width - plot.right, y1: tick.y, y2: tick.y, class: "rich-answer-chart-guide" }));
        graph.append(svg("text", { x: plot.left - 6, y: tick.y + 4, "text-anchor": "end", class: "rich-answer-chart-axis" }, tick.label));
      }
      const line = svg("polyline", { "stroke-width": richNumber(n, "strokeWidth", 2), points: plot.points.map((p) => `${p.x},${p.y}`).join(" ") });
      line.style.fill = "none";
      line.style.stroke = color;
      graph.append(line);
      for (const tick of plot.labels) graph.append(svg("text", { x: tick.x, y: plot.labelY, "text-anchor": "middle", class: "rich-answer-chart-axis" }, tick.label));
      for (const point of plot.points) {
        if (n.props.showPoints !== false) {
          const dot = svg("circle", { cx: point.x, cy: point.y, r: richNumber(n, "pointRadius", 3) });
          dot.style.fill = color;
          graph.append(dot);
        }
        if (plot.showValues) graph.append(svg("text", { x: point.x, y: point.y - 10, "text-anchor": "middle", class: "rich-answer-chart-value" }, point.value));
      }
      r.body.replaceChildren(graph);
    } else {
      const min = Math.min(0, ...data.map((d) => d.value)), max = Math.max(0, ...data.map((d) => d.value)), span = max - min || 1;
      r.body.replaceChildren(el("dl", {}, ...data.map((item, i) => {
        const bar = el("div");
        bar.style.backgroundColor = richColor(n.props.colors?.[i], palette) || richColor(n.props.color, palette) || "var(--rich-chart-color, var(--text-secondary))";
        bar.style.marginLeft = `${(Math.min(0, item.value) - min) / span * 100}%`;
        bar.style.width = `${Math.abs(item.value) / span * 100}%`;
        return el("div", {}, el("div", { class: "rich-answer-control-label" }, el("dt", {}, item.label), el("dd", {}, item.value)), el("div", { class: "rich-answer-track" }, bar));
      })));
    }
  }
  function paint() {
    if (gone || !doc) return;
    values = richResolvedValues(doc, edited);
    order(root, doc.roots.map(render));
    for (const [id, r] of records) if (!doc.nodes.has(id)) {
      r.rendering?.destroy();
      r.node.remove();
      records.delete(id);
    }
  }
  function update(next, { complete: complete2 = true } = {}) {
    raw = String(next);
    done = complete2;
    if (!sourceAllowed(raw)) {
      put(plain, raw);
      order(host, [plain]);
      return;
    }
    doc = parser.update(raw, complete2);
    if (!documentAllowed(doc)) {
      put(plain, raw);
      order(host, [plain]);
      return;
    }
    order(host, [root]);
    paint();
  }
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (host.contains(root)) paint();
  }) : null;
  observer?.observe(root);
  update(source, { complete });
  return { update: (value, options) => update(typeof value === "object" ? value.text : value, options), destroy() {
    gone = true;
    observer?.disconnect();
    for (const r of records.values()) r.rendering?.destroy();
    records.clear();
  } };
}
