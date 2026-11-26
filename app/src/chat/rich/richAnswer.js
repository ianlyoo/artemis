import { RICH_COLOR_ROLES, richColor, richVisualStyle, richVector } from "./richAnswerVisual.js";
import { youtubeVideo } from "./youtubeVideo.js";
const RICH_ANSWER_LANGUAGE = "cindy-ui";
const RICH_ANSWER_KINDS = ["text", "markdown", "heading", "icon", "stack", "row", "grid", "group", "divider", "image", "video", "audio", "code", "math", "diagram", "stat", "chart", "badge", "alert", "progress", "svg", "range", "input", "check", "select", "button", "form", "details", "tabs"];
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const MAX_SOURCE = 2e6;
const MAX_NODES = 2048;
const MAX_DEPTH = 32;
const CONTAINER_KINDS = ["stack", "row", "grid", "group", "form", "details", "tabs"];
const TEXT_PROP_KINDS = ["text", "markdown", "heading", "code", "math", "diagram"];
const RICH_TONES = ["default", "primary", "success", "warning", "danger"];
const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const value = (v) => typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function splitRichAnswer(source) {
  const parts = [];
  let cursor = 0, start = 0, richStart = -1;
  let fence;
  for (const line of source.split(/(?<=\n)/)) {
    const body = line.replace(/\r?\n$/, "");
    if (!fence) {
      const open = body.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
      if (open) {
        fence = { char: open[1][0], count: open[1].length, rich: open[2].trim() === RICH_ANSWER_LANGUAGE };
        if (fence.rich) {
          if (cursor > start) parts.push({ kind: "markdown", key: start, source: source.slice(start, cursor), complete: true });
          richStart = cursor;
          start = cursor + line.length;
        }
      }
    } else if (new RegExp(`^ {0,3}${fence.char}{${fence.count},}\\s*$`).test(body)) {
      if (fence.rich && richStart >= 0) {
        parts.push({ kind: "rich", key: richStart, source: source.slice(start, cursor), complete: true });
        start = cursor + line.length;
        richStart = -1;
      }
      fence = void 0;
    }
    cursor += line.length;
  }
  if (richStart >= 0) parts.push({ kind: "rich", key: richStart, source: source.slice(start), complete: false });
  else if (start < source.length) parts.push({ kind: "markdown", key: start, source: source.slice(start), complete: false });
  return parts;
}
const hasRichAnswer = (source) => splitRichAnswer(source).some((p) => p.kind === "rich");
class RichAnswerStream {
  source = "";
  offset = 0;
  seq = 0;
  nodes = /* @__PURE__ */ new Map();
  roots = [];
  revision = 0;
  issues = 0;
  failedFinalLine = null;
  sourceTooLong = false;
  update(source, complete = false) {
    if (!source.startsWith(this.source)) {
      this.source = "";
      this.offset = 0;
      this.seq = 0;
      this.nodes = /* @__PURE__ */ new Map();
      this.roots = [];
      this.issues = 0;
      this.failedFinalLine = null;
      this.revision++;
    } else if (this.failedFinalLine && source.length > this.source.length && source.length <= MAX_SOURCE) {
      this.offset = this.failedFinalLine.offset;
      this.seq = this.failedFinalLine.seq;
      this.issues = this.failedFinalLine.issues;
      this.failedFinalLine = null;
    }
    if (source.length > MAX_SOURCE) {
      this.sourceTooLong = true;
      return this.snapshot();
    }
    this.sourceTooLong = false;
    this.source = source;
    this.nodes = new Map(this.nodes);
    let end;
    while ((end = source.indexOf("\n", this.offset)) !== -1) {
      this.line(source.slice(this.offset, end));
      this.failedFinalLine = null;
      this.offset = end + 1;
    }
    if (complete && this.offset < source.length) {
      const checkpoint = { offset: this.offset, seq: this.seq, issues: this.issues };
      const failed = !this.line(source.slice(this.offset));
      this.failedFinalLine = failed && (this.offset === 0 || source[this.offset - 1] === "\n") ? checkpoint : null;
      this.offset = source.length;
    }
    return this.snapshot();
  }
  snapshot() {
    return { nodes: this.nodes, roots: this.roots, revision: this.revision, issues: this.sourceTooLong ? Math.max(1, this.issues) : this.issues };
  }
  line(line) {
    if (!line.trim()) return true;
    try {
      const op = JSON.parse(line);
      if (!record(op) || !Number.isSafeInteger(op.seq) || Number(op.seq) < 1) throw Error("sequence");
      const seq = Number(op.seq);
      if (seq <= this.seq) return true;
      this.issues += Math.min(seq - this.seq - 1, MAX_NODES);
      this.seq = seq;
      if (op.version !== void 0 && op.version !== 1) throw Error("version");
      if (typeof op.id !== "string" || !ID.test(op.id)) throw Error("id");
      const current = this.nodes.get(op.id);
      const props = this.props(op.props, op.kind);
      if (record(op.style) && props.style === void 0) props.style = this.props(op.style);
      if (op.op === "create") {
        if (current || this.nodes.size >= MAX_NODES || !RICH_ANSWER_KINDS.includes(op.kind)) throw Error("component");
        const parent = op.parent === void 0 || op.parent === "root" ? null : this.nodes.get(String(op.parent));
        if (op.parent && op.parent !== "root" && !parent) throw Error("parent");
        if (parent && !CONTAINER_KINDS.includes(parent.kind)) throw Error("leaf");
        const node = { id: op.id, kind: op.kind, props, children: [] };
        if (parent && this.depth(parent.id) >= MAX_DEPTH) throw Error("depth");
        this.nodes.set(node.id, node);
        const index = Number.isInteger(op.index) ? Math.max(0, Number(op.index)) : Infinity;
        if (parent) {
          const children = [...parent.children];
          children.splice(index, 0, node.id);
          this.nodes.set(parent.id, { ...parent, children });
        } else {
          this.roots = [...this.roots];
          this.roots.splice(index, 0, node.id);
        }
        const inline = node.props.children;
        if (Array.isArray(inline) && CONTAINER_KINDS.includes(node.kind)) {
          delete node.props.children;
          this.attachInlineChildren(node.id, inline, this.depth(node.id) + 1);
        }
      } else if (op.op === "append") {
        if (!current || !["text", "markdown", "heading", "code", "math", "diagram"].includes(current.kind) || typeof op.text !== "string") throw Error("text");
        this.nodes.set(current.id, { ...current, props: { ...current.props, text: richString(current, "text") + op.text } });
      } else if (op.op === "patch") {
        if (!current) throw Error("target");
        this.nodes.set(current.id, { ...current, props: { ...current.props, ...props } });
      } else if (op.op === "remove") {
        if (!current) throw Error("target");
        const remove = (id) => {
          this.nodes.get(id)?.children.forEach(remove);
          this.nodes.delete(id);
        };
        remove(current.id);
        this.roots = this.roots.filter((id) => id !== current.id);
        for (const [id, node] of this.nodes) if (node.children.includes(current.id)) this.nodes.set(id, { ...node, children: node.children.filter((x) => x !== current.id) });
      } else if (op.op === "move") {
        if (!current) throw Error("target");
        const parent = op.parent === "root" ? null : this.nodes.get(String(op.parent));
        if (op.parent !== "root" && !parent) throw Error("parent");
        if (parent && (!["stack", "row", "grid", "group", "form", "details", "tabs"].includes(parent.kind) || this.descendant(current.id, parent.id))) throw Error("cycle");
        const height = (id) => 1 + Math.max(0, ...this.nodes.get(id)?.children.map(height) ?? []);
        if ((parent ? this.depth(parent.id) : 0) + height(current.id) > MAX_DEPTH) throw Error("depth");
        this.roots = this.roots.filter((id) => id !== current.id);
        for (const [id, node] of this.nodes) if (node.children.includes(current.id)) this.nodes.set(id, { ...node, children: node.children.filter((x) => x !== current.id) });
        const index = Number.isInteger(op.index) ? Math.max(0, Number(op.index)) : Infinity;
        if (parent) {
          const node = this.nodes.get(parent.id);
          const children = [...node.children];
          children.splice(index, 0, current.id);
          this.nodes.set(node.id, { ...node, children });
        } else {
          this.roots = [...this.roots];
          this.roots.splice(index, 0, current.id);
        }
      } else throw Error("operation");
      this.revision++;
      return true;
    } catch {
      this.issues++;
      return false;
    }
  }
  attachInlineChildren(parentId, drafts, childDepth) {
    const parent = this.nodes.get(parentId);
    if (!parent) return;
    const children = [...parent.children];
    drafts.forEach((draft, offset) => {
      const dropped = () => {
        this.issues++;
      };
      if (!record(draft) || !RICH_ANSWER_KINDS.includes(draft.kind) || childDepth > MAX_DEPTH || this.nodes.size >= MAX_NODES) {
        dropped();
        return;
      }
      let props;
      try {
        props = this.props(draft.props ?? (typeof draft.text === "string" ? { text: draft.text } : {}), draft.kind);
      } catch {
        dropped();
        return;
      }
      const declared = typeof draft.id === "string" && ID.test(draft.id) && !this.nodes.has(draft.id);
      const id = declared ? draft.id : this.inlineChildId(parentId, offset + 1);
      this.nodes.set(id, { id, kind: draft.kind, props, children: [] });
      children.push(id);
      const nested = Array.isArray(draft.children) ? draft.children : props.children;
      if (Array.isArray(nested) && CONTAINER_KINDS.includes(draft.kind)) {
        delete props.children;
        this.attachInlineChildren(id, nested, childDepth + 1);
      }
    });
    this.nodes.set(parentId, { ...parent, children });
  }
  inlineChildId(parentId, ordinal) {
    for (let attempt = 1; ; attempt++) {
      const suffix = attempt === 1 ? `-${ordinal}` : `-${ordinal}-${attempt}`;
      const id = `${parentId.slice(0, 80 - suffix.length)}${suffix}`;
      if (!this.nodes.has(id)) return id;
    }
  }
  props(v, kind) {
    if (v === void 0) return {};
    if (typeof v === "string") {
      if (kind && !TEXT_PROP_KINDS.includes(kind)) throw Error("props");
      const text = { text: v };
      if (JSON.stringify(text).length > 65536) throw Error("props");
      return text;
    }
    if (!record(v) || JSON.stringify(v).length > 65536) throw Error("props");
    return Object.fromEntries(Object.entries(v).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key)));
  }
  descendant(root, id) {
    return root === id || !!this.nodes.get(root)?.children.some((child) => this.descendant(child, id));
  }
  depth(id) {
    for (const node of this.nodes.values()) if (node.children.includes(id)) return 1 + this.depth(node.id);
    return 1;
  }
}
function richString(node, key, fallback = "") {
  return typeof node.props[key] === "string" ? node.props[key] : fallback;
}
function richNumber(node, key, fallback) {
  const v = node.props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function richOptions(node) {
  return Array.isArray(node.props.options) ? node.props.options.slice(0, 100).filter(record).filter((x) => typeof x.label === "string" && typeof x.value === "string").map((x) => ({ label: String(x.label), value: String(x.value) })) : [];
}
function richDefaults(document) {
  return Object.fromEntries([...document.nodes.values()].filter((n) => ["input", "range", "select", "check", "tabs", "details"].includes(n.kind)).map((n) => [richString(n, "bind", n.id), value(n.props.default) ? n.props.default : n.kind === "check" || n.kind === "details" ? false : n.kind === "range" ? richNumber(n, "min", 0) : ""]));
}
function richResolvedValues(document, edited = {}) {
  const values = { ...richDefaults(document), ...edited };
  const visiting = /* @__PURE__ */ new Set();
  const resolve = (id) => {
    if (own(values, id)) return values[id];
    if (visiting.has(id) || visiting.size >= MAX_DEPTH) return void 0;
    const node = document.nodes.get(id);
    if (!node || !["stat", "text", "heading"].includes(node.kind)) return void 0;
    visiting.add(id);
    const result = richEvaluate(node.props.value ?? node.props.text, values, 0, resolve);
    visiting.delete(id);
    Object.defineProperty(values, id, { value: result, enumerable: true, configurable: true });
    return result;
  };
  for (const node of document.nodes.values()) resolve(node.id);
  return values;
}
function richEvaluate(expr, values, depth = 0, resolve) {
  if (value(expr)) return expr;
  if (!record(expr) || depth > 16) return void 0;
  if (typeof expr.ref === "string") return own(values, expr.ref) ? values[expr.ref] : resolve?.(expr.ref);
  if (!Array.isArray(expr.args) || expr.args.length > 32) return void 0;
  const evaluate = (x) => richEvaluate(x, values, depth + 1, resolve);
  if (expr.op === "if") {
    if (expr.args.length !== 3) return void 0;
    const condition = evaluate(expr.args[0]);
    return condition === void 0 ? void 0 : evaluate(expr.args[condition ? 1 : 2]);
  }
  const args = expr.args.map(evaluate);
  if (args.some((x) => x === void 0)) return void 0;
  if (expr.op === "concat") {
    if (args.reduce((size, arg) => size + String(arg).length, 0) > 65536) return void 0;
    return args.join("");
  }
  if (["eq", "lt", "gt", "sub", "div"].includes(String(expr.op)) && args.length !== 2) return void 0;
  if (expr.op === "eq") return args[0] === args[1];
  if (args.length === 0 || args.some((x) => typeof x === "string" && !x.trim())) return void 0;
  const nums = args.map(Number);
  if (!nums.every(Number.isFinite)) return void 0;
  let result;
  switch (expr.op) {
    case "add":
      result = nums.reduce((a, b) => a + b, 0);
      break;
    case "mul":
      result = nums.reduce((a, b) => a * b, 1);
      break;
    case "sub":
      result = nums[0] - nums[1];
      break;
    case "div":
      result = nums[0] / nums[1];
      break;
    case "min":
      result = Math.min(...nums);
      break;
    case "max":
      result = Math.max(...nums);
      break;
    case "lt":
      return nums[0] < nums[1];
    case "gt":
      return nums[0] > nums[1];
    default:
      return void 0;
  }
  return Number.isFinite(result) ? result : void 0;
}
function richValue(node, values) {
  return richEvaluate(node.props.value ?? node.props.text ?? "", values);
}
function richLabel(node, values) {
  const result = richValue(node, values);
  return result === void 0 ? "—" : richString(node, "prefix") + String(result) + richString(node, "suffix");
}
function richCalculationUnavailable(node, values) {
  if (["stat", "text", "heading"].includes(node.kind)) return richValue(node, values) === void 0;
  if (node.kind === "progress") return richProgress(node, values) === void 0;
  return node.kind === "chart" && Array.isArray(node.props.data) && node.props.data.some((item) => {
    if (!record(item)) return true;
    const result = richEvaluate(item.value, values);
    return result === void 0 || typeof result === "string" && !result.trim() || !Number.isFinite(Number(result));
  });
}
function richTone(node) {
  const tone = node.props.tone;
  return typeof tone === "string" && RICH_TONES.includes(tone) ? tone : "default";
}
function richProgress(node, values) {
  const result = richEvaluate(node.props.value ?? 0, values);
  if (result === void 0 || typeof result === "boolean" || typeof result === "string" && !result.trim()) return void 0;
  const n = Number(result);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : void 0;
}
function richProgressLabel(node, values) {
  const n = richProgress(node, values);
  return n === void 0 ? "—" : String(Math.round(n * 10) / 10) + richString(node, "suffix", "%");
}
function richAction(node, values) {
  const action = node.props.set;
  if (!record(action)) return {};
  const changes = {};
  for (const [key, expr] of Object.entries(action).filter(([key2]) => ID.test(key2)).slice(0, 100)) {
    const result = richEvaluate(expr, values);
    if (result === void 0) return {};
    Object.defineProperty(changes, key, { value: result, enumerable: true, configurable: true });
  }
  return changes;
}
function richSendText(node, values) {
  if (node.kind !== "button" && node.kind !== "form") return void 0;
  const text = richEvaluate(node.props.send, values);
  return typeof text === "string" && text.trim() && text.length <= 16e3 ? text.trim() : void 0;
}
class RichSubmissionController {
  constructor(memory) {
    this.memory = memory;
  }
  memory;
  pending = /* @__PURE__ */ new Set();
  failed = /* @__PURE__ */ new Set();
  listeners = /* @__PURE__ */ new Set();
  subscribe = (listener) => {
    this.listeners.add(listener);
    const unsubscribe = this.memory.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      unsubscribe();
    };
  };
  notify() {
    this.listeners.forEach((listener) => listener());
  }
  status(key, text) {
    if (this.pending.has(key)) return "sending";
    if (text !== void 0 && this.memory.get(key).text === text) return "sent";
    return this.failed.has(key) ? "failed" : "idle";
  }
  async submit(key, text, send) {
    if (["sending", "sent"].includes(this.status(key, text))) return;
    this.pending.add(key);
    this.failed.delete(key);
    this.notify();
    try {
      await this.memory.load();
      if (this.memory.get(key).text === text) return;
      if (!await send(text)) throw new Error("message-not-accepted");
      this.memory.set(key, { text });
      this.memory.flushSync();
      await this.memory.flush();
    } catch {
      this.failed.add(key);
      if (this.failed.size > 256) this.failed.delete(this.failed.values().next().value);
    } finally {
      this.pending.delete(key);
      this.notify();
    }
  }
}
function richMarkdown(node) {
  const text = richString(node, "text");
  const fenced = (language) => {
    const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
    return `${fence}${language}
${text}
${fence}`;
  };
  if (node.kind === "markdown") return text;
  if (node.kind === "code") return fenced(richString(node, "language").replace(/[^\w+-]/g, ""));
  if (node.kind === "diagram") return fenced("mermaid");
  if (node.kind === "math") return `$$
${text}
$$`;
  if (["image", "video", "audio"].includes(node.kind)) {
    const src = richString(node, "src").replace(/[\n\r<>]/g, "");
    const alt = richString(node, "alt").replace(/[\[\]\\\n\r]/g, "");
    return src ? `![${alt}](<${src}>)` : "";
  }
  return null;
}
class RichInteractionMemory {
  constructor(storage) {
    this.storage = storage;
  }
  storage;
  entries = /* @__PURE__ */ new Map();
  empty = Object.freeze({});
  listeners = /* @__PURE__ */ new Set();
  loading;
  timer;
  writes = Promise.resolve();
  get(key) {
    return this.entries.get(key) ?? this.empty;
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  notify() {
    this.listeners.forEach((listener) => listener());
  }
  load() {
    return this.loading ??= (async () => {
      if (!this.storage) return;
      try {
        const raw = await this.storage.read();
        if (!raw || raw.length > 524288) return;
        const parsed = JSON.parse(raw);
        if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) return;
        const stored = /* @__PURE__ */ new Map();
        for (const pair of parsed.entries.slice(-256)) {
          if (!Array.isArray(pair) || typeof pair[0] !== "string" || !record(pair[1])) continue;
          const values = Object.fromEntries(Object.entries(pair[1]).filter(([key, v]) => ID.test(key) && value(v)));
          if (JSON.stringify(values).length <= 65536) stored.set(pair[0], values);
        }
        for (const [key, edited] of this.entries) stored.set(key, { ...stored.get(key), ...edited });
        this.entries = stored;
        this.trim();
        this.notify();
      } catch {
      }
    })();
  }
  set(key, patch) {
    const next = { ...this.get(key), ...patch };
    if (Object.keys(next).length > 2048 || JSON.stringify(next).length > 65536) return this.get(key);
    this.entries.delete(key);
    this.entries.set(key, next);
    this.trim();
    this.notify();
    if (this.storage) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.flush();
      }, 200);
    }
    return next;
  }
  serialize() {
    return JSON.stringify({ version: 1, entries: [...this.entries] });
  }
  trim() {
    while (this.entries.size > 256 || this.serialize().length > 524288) this.entries.delete(this.entries.keys().next().value);
  }
  flushSync() {
    clearTimeout(this.timer);
    try {
      this.storage?.writeSync?.(this.serialize());
    } catch {
    }
  }
  async flush() {
    clearTimeout(this.timer);
    await this.load();
    const serialized = this.serialize();
    this.writes = this.writes.then(() => this.storage?.write(serialized)).then(() => void 0).catch(() => void 0);
    return this.writes;
  }
  clear() {
    this.entries.clear();
    this.notify();
  }
}
function richChart(node, values) {
  return Array.isArray(node.props.data) ? node.props.data.slice(0, 100).filter(record).map((item) => ({ label: typeof item.label === "string" ? item.label : "", value: Number(richEvaluate(item.value, values)) })).filter((item) => Number.isFinite(item.value)) : [];
}
function richLinePlot(data, width, options = {}) {
  const number = (key, fallback) => typeof options[key] === "number" && Number.isFinite(options[key]) ? options[key] : fallback;
  const w = Math.max(180, width), height = Math.max(80, number("height", 220));
  const top = Math.max(0, number("top", 28)), bottom = height - Math.max(0, number("bottom", 28));
  let min = Math.min(...data.map((item) => item.value)), max = Math.max(...data.map((item) => item.value));
  if (!data.length) {
    min = 0;
    max = 1;
  }
  if (options.includeZero === true) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const pad = (max - min || Math.abs(max) * 0.05 || 1) * 0.1;
  min = number("yMin", min - pad);
  max = number("yMax", max + pad);
  if (max <= min) max = min + 1;
  const scale = Math.max(Math.abs(min), Math.abs(max), 1), span = max / scale - min / scale;
  const y = (v) => bottom - (v / scale - min / scale) / span * (bottom - top);
  const tickCount = Math.max(2, Math.min(50, Math.round(number("ticks", 4))));
  const tickStep = (max - min) / (tickCount - 1);
  const decimals = Math.max(0, Math.min(12, number("decimals", Math.ceil(-Math.log10(tickStep)) + 1)));
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const value2 = min + tickStep * i;
    return { value: value2, y: y(value2), label: Number(value2.toFixed(decimals)).toLocaleString(void 0, { maximumFractionDigits: decimals }) };
  });
  const left = Math.max(0, number("left", Math.max(...ticks.map((tick) => tick.label.length * 7)) + 12));
  const right = Math.max(0, number("right", 20));
  const pointSpace = (w - left - right) / Math.max(1, data.length);
  const longest = Math.max(1, ...data.map((item) => String(item.value).length));
  const labelWidth = Math.max(1, ...data.map((item) => Array.from(item.label).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 12 : 7), 0)));
  const labelStep = Math.max(1, Math.ceil((labelWidth + 12) / Math.max(1, pointSpace)));
  return { width: w, height, labelY: height - 6, labels: data.flatMap((item, i) => options.showLabels === false || i % labelStep !== 0 ? [] : [{ label: item.label, x: left + (i + 0.5) * pointSpace }]), left, right, min, max, ticks, points: data.map((item, i) => ({ ...item, x: left + (i + 0.5) * pointSpace, y: y(item.value) })), showValues: typeof options.showValues === "boolean" ? options.showValues : longest * 8 + 16 <= pointSpace };
}
function richRange(node, current) {
  const min = richNumber(node, "min", 0), max = Math.max(min + 1, richNumber(node, "max", 100));
  const step = Math.max(Number.EPSILON, richNumber(node, "step", 1));
  const n = Number(current);
  return { min, max, step, value: Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)) };
}
function richAnswerText(source) {
  return splitRichAnswer(source).map((part) => {
    if (part.kind === "markdown") return part.source;
    const doc = new RichAnswerStream().update(part.source, true);
    const values = richResolvedValues(doc);
    const visit = (id) => {
      const node = doc.nodes.get(id);
      if (!node) return "";
      const md = richMarkdown(node);
      if (md !== null) return md + (richString(node, "caption") ? `
${richString(node, "caption")}` : "");
      if (node.children.length) return [richString(node, "label"), ...node.children.map(visit)].filter(Boolean).join("\n\n");
      if (node.kind === "svg") return richString(node, "label", richString(node, "alt"));
      if (node.kind === "heading") return `### ${richLabel(node, values)}`;
      if (node.kind === "icon") return [richString(node, "label"), richString(node, "text")].filter(Boolean).join("\n");
      if (node.kind === "text") return richLabel(node, values);
      if (node.kind === "divider") return "---";
      if (node.kind === "badge") return `[${richString(node, "text", richString(node, "label"))}]`;
      if (node.kind === "alert") return "> " + [richString(node, "title"), richString(node, "text")].filter(Boolean).join(" · ");
      if (node.kind === "progress") return `${richString(node, "label")}: ${richProgressLabel(node, values)}`;
      if (node.kind === "stat") return `${richString(node, "label")}: ${richLabel(node, values)}`;
      if (node.kind === "chart") return [richString(node, "label"), ...richChart(node, values).map((item) => `${item.label}: ${item.value}`)].join("\n");
      const current = values[richString(node, "bind", node.id)];
      if (node.kind === "check") return `${current ? "☑" : "☐"} ${richString(node, "label", richString(node, "text"))}`;
      return richString(node, "label") + (current === void 0 ? "" : `: ${current}`);
    };
    return doc.roots.map(visit).filter(Boolean).join("\n\n");
  }).join("\n\n");
}
function compactRichAnswer(source) {
  return splitRichAnswer(source).map((part) => {
    if (part.kind === "markdown") return part.source;
    const doc = new RichAnswerStream().update(part.source, true);
    const events = [];
    const visit = (id, parent) => {
      const node = doc.nodes.get(id);
      if (!node) return;
      events.push(JSON.stringify({ version: 1, seq: events.length + 1, op: "create", id, kind: node.kind, ...parent ? { parent } : {}, props: node.props }));
      node.children.forEach((child) => visit(child, id));
    };
    doc.roots.forEach((id) => visit(id));
    return "```cindy-ui\n" + events.join("\n") + "\n```\n";
  }).join("");
}
function richMediaSource(node) {
  const src = richString(node, "src").trim();
  if (!src || /[\r\n]/.test(src)) return null;
  const allowed = /^(https?|file|xdt-(?:file|image|video|audio)|cindy-(?:remote-)?media):\/\//i.exec(src);
  if (/^[a-zA-Z][\w+.-]*:/.test(src) && !/^[a-zA-Z]:[\\/]/.test(src) && !allowed) return null;
  return allowed ? allowed[1].toLowerCase() + src.slice(allowed[1].length) : src;
}
export { RICH_ANSWER_KINDS, RICH_ANSWER_LANGUAGE, RICH_COLOR_ROLES, RICH_TONES, RichAnswerStream, RichInteractionMemory, RichSubmissionController, compactRichAnswer, hasRichAnswer, richAction, richAnswerText, richCalculationUnavailable, richChart, richColor, richDefaults, richEvaluate, richLabel, richLinePlot, richMarkdown, richMediaSource, richNumber, richOptions, richProgress, richProgressLabel, richRange, richResolvedValues, richSendText, richString, richTone, richValue, richVector, richVisualStyle, splitRichAnswer, youtubeVideo };
