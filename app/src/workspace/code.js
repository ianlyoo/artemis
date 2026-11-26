import { reduced } from "../chat/motion.js";
import { stylesheet, saved, locate, rangeOf } from "./core.js";
import { iconButton, setIcon } from "./icons.js";
import { getJSON } from "./api.js";
import { EDIT_PATHS, pickSource, lineBreakOf, asLines, indentOf, createSession, noteReason } from "./edit.js";
import { has } from "../names.js";
export { bindSource } from "./edit.js";
export const FIND_MAX = 1e3, MAX_BLOCKS = 4e3;
const WRAP_KEY = "code-wrap";
export const LANGUAGES = [["javascript", "JavaScript", ["js", "mjs", "cjs"]], ["jsx", "JSX", ["jsx"]], ["typescript", "TypeScript", ["ts", "mts", "cts"]], ["tsx", "TSX", ["tsx"]], ["python", "Python", ["py", "pyi", "pyw"]], ["json", "JSON", ["json", "jsonc", "jsonl", "ndjson", "webmanifest"]], ["css", "CSS", ["css"]], ["html", "HTML", ["html", "htm", "xhtml"]], ["markdown", "Markdown", ["md", "markdown", "mdx", "mkd"]], ["sql", "SQL", ["sql"]], ["yaml", "YAML", ["yaml", "yml"]], ["go", "Go", ["go"]], ["rust", "Rust", ["rs"]], ["xml", "XML", ["xml", "svg", "plist", "xsd", "xsl", "rss"]], ["shell", "Shell", ["sh", "bash", "zsh", "ksh"]], ["toml", "TOML", ["toml"], ["cargo.lock", "poetry.lock", "uv.lock"]], ["diff", "Diff", ["diff", "patch"]], ["ini", "INI", ["ini", "cfg", "conf", "properties", "service", "timer", "socket", "desktop"]], ["dockerfile", "Dockerfile", ["dockerfile"], ["dockerfile", "containerfile"]], ["ruby", "Ruby", ["rb", "rake", "gemspec"], ["gemfile", "rakefile"]], ["lua", "Lua", ["lua"]], ["swift", "Swift", ["swift"]], ["perl", "Perl", ["pl", "pm"]], ["powershell", "PowerShell", ["ps1", "psm1", "psd1"]], ["r", "R", ["r"]], ["haskell", "Haskell", ["hs"]], ["cmake", "CMake", ["cmake"], ["cmakelists.txt"]], ["protobuf", "Protobuf", ["proto"]], ["c", "C", ["c", "h"]], ["cpp", "C++", ["cpp", "cc", "cxx", "hpp", "hh", "hxx"]], ["java", "Java", ["java"]], ["kotlin", "Kotlin", ["kt", "kts"]], ["scala", "Scala", ["scala"]], ["csharp", "C#", ["cs"]], ["dart", "Dart", ["dart"]], ["latex", "LaTeX", ["tex", "sty", "cls", "ltx"]]];
const PLAIN = { id: "text", label: "Plain text" };
const BANGS = [[/\b(python[0-9.]*)\b/, "python"], [/\b(node|deno|bun)\b/, "javascript"], [/\b(bash|sh|zsh|ksh|dash)\b/, "shell"], [/\bruby\b/, "ruby"], [/\bperl\b/, "perl"], [/\blua\b/, "lua"]];
export function languageOf(path, text = "") {
  const name = String(path ?? "").split("/").at(-1).toLowerCase(), dot = name.lastIndexOf("."), ext = dot > 0 ? name.slice(dot + 1) : "";
  const found = LANGUAGES.find(([, , exts, names = []]) => names.includes(name)) ?? (ext ? LANGUAGES.find(([, , exts]) => exts.includes(ext)) : null);
  if (found) return { id: found[0], label: found[1] };
  const first = String(text).slice(0, 200).split("\n")[0];
  if (!ext && first.startsWith("#!")) {
    const bang = BANGS.find(([shape]) => shape.test(first));
    if (bang) return languageOf("x." + LANGUAGES.find(([id]) => id === bang[1])[2][0]);
  }
  return { ...PLAIN };
}
const JS = new Set(["javascript", "jsx", "typescript", "tsx"]);
const streams = new Map();
export function support(cm, id) {
  switch (id) {
    case "javascript":
      return cm.javascript();
    case "jsx":
      return cm.javascript({ jsx: true });
    case "typescript":
      return cm.javascript({ typescript: true });
    case "tsx":
      return cm.javascript({ jsx: true, typescript: true });
    case "python":
      return cm.python();
    case "json":
      return cm.json();
    case "css":
      return cm.css();
    case "html":
      return cm.html();
    case "markdown":
      return cm.markdown();
    case "sql":
      return cm.sql();
    case "yaml":
      return cm.yaml();
    case "go":
      return cm.go();
    case "rust":
      return cm.rust();
    case "xml":
      return cm.xml();
  }
  const legacy = { shell: cm.shell, toml: cm.toml, diff: cm.diff, ini: cm.properties, dockerfile: cm.dockerFile, ruby: cm.ruby, lua: cm.lua, swift: cm.swift, perl: cm.perl, powershell: cm.powerShell, r: cm.r, haskell: cm.haskell, cmake: cm.cmake, protobuf: cm.protobuf, c: cm.c, cpp: cm.cpp, java: cm.java, kotlin: cm.kotlin, scala: cm.scala, csharp: cm.csharp, dart: cm.dart, latex: cm.stex }[id];
  if (!legacy) return [];
  if (!streams.has(id)) streams.set(id, cm.StreamLanguage.define(legacy));
  return streams.get(id);
}
const DATA = new Set(["json", "yaml", "toml"]), styles = new Map();
function palette(cm, data = false) {
  const t = cm.tags, color = (name) => `var(--code-${name})`;
  if (!styles.has(data)) styles.set(data, cm.HighlightStyle.define([{ tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self, t.special(t.variableName)], color: color("keyword") }, { tag: [t.string, t.docString, t.character, t.attributeValue, t.special(t.string)], color: color("string") }, { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.unit, t.constant(t.name), t.constant(t.variableName)], color: color("number") }, { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName)), t.macroName, t.labelName], color: color("function") }, { tag: [t.className, t.typeName, t.namespace, t.definition(t.className), t.definition(t.typeName), t.standard(t.variableName)], color: color("type") }, { tag: [t.propertyName, t.definition(t.propertyName), t.attributeName], color: color(data ? "function" : "property") }, { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: color("comment"), fontStyle: "italic" }, { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.angleBracket, t.derefOperator], color: color("punct") }, { tag: [t.tagName], color: color("tag") }, { tag: [t.regexp, t.escape, t.color], color: color("regexp") }, { tag: [t.meta, t.annotation, t.processingInstruction, t.documentMeta], color: color("meta") }, { tag: t.heading, color: color("keyword"), fontWeight: "650" }, { tag: t.strong, fontWeight: "650" }, { tag: t.emphasis, fontStyle: "italic" }, { tag: t.strikethrough, textDecoration: "line-through" }, { tag: [t.link, t.url], color: color("function"), textDecoration: "underline" }, { tag: t.inserted, color: color("inserted") }, { tag: t.deleted, color: color("deleted") }, { tag: t.changed, color: color("type") }, { tag: t.invalid, color: color("invalid") }]));
  return styles.get(data);
}
let fromDisk = null, parts = null;
const disk = (cm) => fromDisk ??= cm.Annotation.define();
const compartments = (cm) => parts ??= { edit: new cm.Compartment(), file: new cm.Compartment() };
const fileExtensions = (cm, lineBreak, unit) => [cm.EditorState.lineSeparator.of(lineBreak), cm.indentUnit.of(unit)];
export function stateExtensions(cm, lang, { editable = false, lineBreak = "\n", unit = "    " } = {}) {
  const { edit, file } = compartments(cm);
  return [support(cm, lang), cm.syntaxHighlighting(palette(cm, DATA.has(lang))), edit.of(cm.EditorState.readOnly.of(!editable)), cm.EditorState.changeFilter.of((tr) => !tr.startState.readOnly || !!tr.annotation(disk(cm))), file.of(fileExtensions(cm, lineBreak, unit)), cm.EditorState.tabSize.of(4)];
}
export const diskChange = (cm, state, text) => {
  const old = state.doc.toString();
  if (old === text) return null;
  let start = 0;
  const min = Math.min(old.length, text.length);
  while (start < min && old.charCodeAt(start) === text.charCodeAt(start)) start++;
  let a = old.length, b = text.length;
  while (a > start && b > start && old.charCodeAt(a - 1) === text.charCodeAt(b - 1)) {
    a--;
    b--;
  }
  return { changes: { from: start, to: a, insert: text.slice(start, b).split("\n").join(state.lineBreak) }, annotations: [disk(cm).of(true), cm.Transaction.addToHistory.of(false)] };
};
export const indentTab = (cm) => ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty)) return cm.indentMore({ state, dispatch });
  const unit = state.facet(cm.indentUnit);
  dispatch(state.update(state.changeByRange((range) => {
    const column = range.head - state.doc.lineAt(range.head).from, insert = unit === "	" ? "	" : " ".repeat(unit.length - column % unit.length);
    return { changes: { from: range.head, insert }, range: cm.EditorSelection.cursor(range.head + insert.length) };
  }), { scrollIntoView: true, userEvent: "input.indent" }));
  return true;
};
const nameOf = (state, node, ...names) => {
  for (const name of names) {
    const child = node.getChild(name);
    if (child) return state.sliceDoc(child.from, child.to);
  }
  return null;
};
export function outlineOf(state, tree, lang) {
  if (!tree || !(lang === "python" || JS.has(lang))) return [];
  const out = [], seen = new Map();
  const add = (level, text, node, nameNode, parent = "") => {
    const base = (parent ? parent + " / " : "") + text, count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    out.push({ id: count > 1 ? base + " #" + count : base, level, text, from: node.from, to: node.to, at: state.doc.lineAt((nameNode ?? node).from).from });
  };
  const python = (node, level, parent) => {
    let def = node;
    if (node.name === "DecoratedStatement") def = node.getChild("FunctionDefinition") ?? node.getChild("ClassDefinition");
    if (!def || !["FunctionDefinition", "ClassDefinition"].includes(def.name)) return;
    const name = nameOf(state, def, "VariableName");
    if (!name) return;
    const text = (def.name === "ClassDefinition" ? "class " : "def ") + name;
    add(level, text, node, def.getChild("VariableName"), parent);
    if (def.name === "ClassDefinition" && level === 1) for (let child = def.getChild("Body")?.firstChild; child; child = child.nextSibling) python(child, 2, text);
  };
  const DECL = { FunctionDeclaration: "function", ClassDeclaration: "class", InterfaceDeclaration: "interface", TypeAliasDeclaration: "type", EnumDeclaration: "enum" };
  const VALUES = new Set(["ArrowFunction", "FunctionExpression", "ClassExpression"]);
  const script = (node, level, parent, outer = node) => {
    if (node.name === "ExportDeclaration") {
      for (let child = node.firstChild; child; child = child.nextSibling) if (DECL[child.name] || child.name === "VariableDeclaration") script(child, level, parent, node);
      return;
    }
    if (DECL[node.name]) {
      const nameNode = node.getChild("VariableDefinition") ?? node.getChild("TypeDefinition");
      const name = nameNode ? state.sliceDoc(nameNode.from, nameNode.to) : node.name === "FunctionDeclaration" || node.name === "ClassDeclaration" ? "default" : null;
      if (!name) return;
      const text = DECL[node.name] + " " + name;
      add(level, text, outer, nameNode, parent);
      if (node.name === "ClassDeclaration" && level === 1) {
        for (let child = node.getChild("ClassBody")?.firstChild; child; child = child.nextSibling) {
          if (child.name !== "MethodDeclaration") continue;
          const method = nameOf(state, child, "PropertyDefinition", "PrivatePropertyDefinition");
          if (method) add(2, method + "()", child, child.getChild("PropertyDefinition") ?? child.getChild("PrivatePropertyDefinition"), text);
        }
      }
      return;
    }
    if (node.name === "VariableDeclaration") {
      const kind = state.sliceDoc(node.from, node.firstChild?.to ?? node.from).trim();
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "VariableDefinition") continue;
        let value = child.nextSibling;
        while (value && (value.name === "Equals" || value.name === "TypeAnnotation")) value = value.nextSibling;
        if (value && VALUES.has(value.name)) add(level, kind + " " + state.sliceDoc(child.from, child.to), outer, child, parent);
      }
    }
  };
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (lang === "python") python(node, 1, "");
    else script(node, 1, "");
  }
  return out;
}
const GLYPH = { wrap: "M4 6.5h16 M4 12h12.5a3.25 3.25 0 0 1 0 6.5H12 M14 16l-2.5 2.5L14 21 M4 18.5h4", line: "M9.5 4 8 20 M16 4l-1.5 16 M4.5 9h15 M4 15h15", copy: "M9.5 9h9A1.5 1.5 0 0 1 20 10.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 19.5v-9A1.5 1.5 0 0 1 9.5 9z M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" };
export const CHROME = { wrap: "Wrap lines", unwrap: "Don't wrap lines", line: "Go to line", copy: "Copy the file", copied: "Copied", field: "Line number", region: "Code", masked: "Masked by Home", unfold: "Unfold", fold: "Fold", folded: "Folded lines" };
const QUOTE_GONE = "The text changed · the quote isn't in this document anymore";
let loading = null;
const load = () => loading ??= import("../vendor/codemirror/codemirror.js");
export const isCode = (body) => body?.kind === "text" && Array.isArray(body.blocks) && body.blocks.length === 1 && body.blocks[0]?.type === "code";
const hold = new WeakMap();
const idle = (fn, wait = 400) => typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: wait }) : setTimeout(fn, 30);
const unidle = (id) => {
  if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
  else clearTimeout(id);
};
export async function showCode(view, { target, body, host, scroller, notice, phone = false, changed, base, api = null, source = false, reload = null }) {
  const masked = Number(body?.masked) || 0;
  const reading = !phone && api && has("edit") ? getJSON(api, EDIT_PATHS.source(target.path)) : Promise.resolve(null);
  let cm = null;
  if (!view || view.dead) {
    try {
      [cm] = await Promise.all([load(), stylesheet("code.css")]);
    } catch (error) {
      console.error("Code view:", error);
      loading = null;
      return null;
    }
  }
  const file = pickSource(body, await reading, { source, path: target.path });
  if (file.text == null) {
    if (view && !view.dead && view.dirty) {
      view.update(file, masked);
      return view;
    }
    view?.destroy();
    noteReason(base().head, file.reason);
    return null;
  }
  if (view && !view.dead) {
    view.attach();
    view.update(file, masked);
    return view;
  }
  const made = createView(cm, { target, file, masked, host, scroller, notice, phone, changed, base, api, source, reload });
  hold.set(host, made);
  return made;
}
function createView(cm, { target, file, masked, host, scroller, notice, phone, changed, base, api: gateway, source, reload }) {
  const text = file.text, lang = languageOf(target.path, text);
  const wrapping = new cm.Compartment(), editing = new cm.Compartment(), undoing = new cm.Compartment();
  let editable = !!file.editable && !phone, sha = file.sha, bom = file.bom, session = null;
  const setFind = cm.StateEffect.define(), setQuote = cm.StateEffect.define(), setSince = cm.StateEffect.define(), setLanded = cm.StateEffect.define();
  const marks = (effect, map) => cm.StateField.define({ create: () => cm.Decoration.none, update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) if (e.is(effect)) value = map(e.value);
    return value;
  }, provide: (field2) => cm.EditorView.decorations.from(field2) });
  const findMark = cm.Decoration.mark({ class: "cm-ide-find" }), nowMark = cm.Decoration.mark({ class: "cm-ide-find-now" }), quoteMark = cm.Decoration.mark({ class: "cm-ide-quote" });
  const landedLine = cm.Decoration.line({ class: "cm-ide-landed" });
  const findField = marks(setFind, ({ hits: hits2, now: now2 }) => cm.Decoration.set(hits2.map((hit, n) => (n === now2 ? nowMark : findMark).range(hit.from, hit.to))));
  const quoteField = marks(setQuote, (range) => range ? cm.Decoration.set([quoteMark.range(range.from, range.to)]) : cm.Decoration.none);
  const landedField = marks(setLanded, (pos) => pos == null ? cm.Decoration.none : cm.Decoration.set([landedLine.range(pos)]));
  const sinceField = cm.StateField.define({ create: () => ({ changed: new Set(), fresh: new Set() }), update(value, tr) {
    for (const e of tr.effects) if (e.is(setSince)) return e.value;
    return value;
  } });
  class SinceMark extends cm.GutterMarker {
    constructor(kind) {
      super();
      this.kind = kind;
    }
    eq(other) {
      return other.kind === this.kind;
    }
    toDOM() {
      const node = document.createElement("span");
      node.className = "cm-ide-since is-" + this.kind;
      return node;
    }
  }
  const changedMark = new SinceMark("changed"), freshMark = new SinceMark("new");
  const sinceGutter = cm.gutter({ class: "cm-ide-since-gutter", lineMarker(v, line2) {
    const at = v.state.doc.lineAt(line2.from).number, held = v.state.field(sinceField);
    return held.changed.has(at) ? changedMark : held.fresh.has(at) ? freshMark : null;
  }, lineMarkerChange: (update2) => update2.transactions.some((tr) => tr.effects.some((e) => e.is(setSince))) });
  const setHeld = cm.StateEffect.define();
  const heldField = marks(setHeld, (deco) => deco);
  const maskDeco = new cm.MatchDecorator({ regexp: /•{4,}/g, decoration: cm.Decoration.mark({ class: "cm-ide-mask", attributes: { title: CHROME.masked } }) });
  const maskPlugin = cm.ViewPlugin.fromClass(class {
    constructor(v) {
      this.decorations = maskDeco.createDeco(v);
    }
    update(u) {
      this.decorations = maskDeco.updateDeco(u, this.decorations);
    }
  }, { decorations: (v) => v.decorations });
  const chevron = (open) => {
    const node = document.createElement("span");
    node.className = "cm-ide-fold";
    node.setAttribute("aria-hidden", "true");
    node.dataset.open = String(open);
    return node;
  };
  const placeholder = (v, onclick, lines) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "cm-ide-folded";
    node.textContent = "⋯ " + lines + (lines === 1 ? " line" : " lines");
    node.title = CHROME.unfold;
    node.setAttribute("aria-label", CHROME.unfold + " " + node.textContent.slice(2));
    node.addEventListener("click", onclick);
    return node;
  };
  let quiet = false, dead = false, liveIndex = null, frame = 0, outlineTimer = 0, outlineIdle = 0, outlineFirst = true, blocksIdle = 0, afterBlocks = [], headings = [], foldMemo = {}, hits = [], now = -1, query = "", quote = null, masks = masked;
  let posOf = new WeakMap(), lastBlocks = [], blocksDoc = null, shown = true;
  let savedDoc = null, wasDirty = false, onDisk = false, removed = false, dropNext = false, saving = false, flashWord = "", flashTimer = 0, findStale = false, textTimer = 0;
  let rangeAt = new WeakMap();
  const KEPT = ["ide-comment", "ide-comment-now"];
  const marksNoted = cm.ViewPlugin.define(() => ({ update() {
    noteMarks();
  } }));
  let wrap = phone || lang.id === "text" ? true : saved.read(WRAP_KEY, false) === true;
  const status = document.createElement("span");
  status.className = "code-status";
  const updates = cm.EditorView.updateListener.of((update2) => {
    if (update2.docChanged && savedDoc) edited(update2);
    if (update2.docChanged || update2.selectionSet) paintStatus(update2.state);
    if (update2.docChanged || update2.viewportChanged || update2.geometryChanged || update2.transactions.length) {
      liveIndex = null;
      schedule();
    }
    if (update2.transactions.some((tr) => tr.effects.some((e) => e.is(cm.foldEffect) || e.is(cm.unfoldEffect)))) {
      if (!quiet) changed("folds");
    }
    if (cm.syntaxTree(update2.state) !== cm.syntaxTree(update2.startState)) planOutline();
  });
  const keys = cm.keymap.of([{ key: "Ctrl-g", run: () => {
    openLine();
    return true;
  } }, { key: "Mod-a", run: (v) => {
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
    return true;
  } }, ...cm.foldKeymap]);
  const editKeys = cm.keymap.of([{ key: "Tab", run: indentTab(cm), shift: cm.indentLess }, ...cm.defaultKeymap, ...cm.historyKeymap]);
  const editParts = (on) => [cm.EditorView.editable.of(on), on ? editKeys : [], cm.EditorView.contentAttributes.of({ tabindex: "0", "aria-label": CHROME.region + ", " + lang.label + (on ? "" : ", read-only"), spellcheck: "false", autocorrect: "off", autocapitalize: "off", translate: "no" })];
  const state = cm.EditorState.create({ doc: text, extensions: [stateExtensions(cm, lang.id, { editable, lineBreak: lineBreakOf(text), unit: indentOf(text, lang.id) }), sinceGutter, cm.lineNumbers(), cm.highlightActiveLineGutter(), cm.foldGutter({ markerDOM: chevron }), cm.codeFolding({ preparePlaceholder: (s, range) => s.doc.lineAt(range.to).number - s.doc.lineAt(range.from).number, placeholderDOM: placeholder }), cm.highlightActiveLine(), cm.highlightSpecialChars(), cm.bracketMatching(), editing.of(editParts(editable)), undoing.of(cm.history()), cm.EditorView.clipboardInputFilter.of((pasted, s) => pasted.replace(/\r\n|\r|\n/g, s.lineBreak)), wrapping.of(wrap ? cm.EditorView.lineWrapping : []), findField, quoteField, landedField, heldField, sinceField, maskPlugin, marksNoted, keys, updates] });
  const shell = document.createElement("div");
  shell.className = "code-cm text-control";
  const hostBlock = document.createElement("section");
  hostBlock.className = "pane-block code-host" + (phone ? " is-phone" : "");
  hostBlock.dataset.blockId = "code";
  hostBlock.dataset.lang = lang.id;
  const blocks = document.createElement("div");
  blocks.className = "code-blocks";
  blocks.hidden = true;
  const view = new cm.EditorView({ state, parent: shell });
  savedDoc = view.state.doc;
  const hbar = document.createElement("div"), hinner = document.createElement("div");
  hbar.className = "code-hbar";
  hbar.append(hinner);
  hbar.setAttribute("aria-hidden", "true");
  const wrapButton = iconButton(GLYPH.wrap, CHROME.wrap, { class: "is-small code-wrap", "aria-pressed": String(wrap) });
  const lineButton = iconButton(GLYPH.line, CHROME.line, { key: "Ctrl+G", class: "is-small code-goto" });
  const copyButton = iconButton(GLYPH.copy, CHROME.copy, { class: "is-small code-copy" });
  const field = document.createElement("input");
  Object.assign(field, { type: "text", className: "code-line-field", hidden: true, autocomplete: "off", spellcheck: false });
  field.setAttribute("inputmode", "numeric");
  field.setAttribute("aria-label", CHROME.field);
  field.setAttribute("enterkeyhint", "go");
  const tools = document.createElement("span");
  tools.className = "code-tools";
  tools.append(lineButton, wrapButton, copyButton);
  const foot = document.createElement("div");
  foot.className = "code-foot text-control";
  const line = document.createElement("div");
  line.className = "code-bar";
  line.append(status, field, tools);
  foot.append(hbar, line);
  hostBlock.append(shell, foot);
  hostBlock.classList.toggle("is-editable", editable);
  scroller.classList.add("is-code");
  function attach() {
    if (!hostBlock.isConnected || hostBlock.parentNode !== host) host.replaceChildren(hostBlock, blocks);
    view.requestMeasure();
  }
  attach();
  paintStatus(view.state);
  paintWrap();
  planBlocks();
  planOutline(0);
  function paintStatus(s) {
    const head = s.selection.main.head, at = s.doc.lineAt(head), lines = s.doc.lines;
    const words = [[saving ? "Saving…" : flashWord, "is-flash"], [wasDirty && "Modified", "is-modified"], [onDisk && "Changed on disk", "is-disk"]].filter(([word]) => word);
    status.replaceChildren(`${lang.label} · ${at.number}:${head - at.from + 1} · ${lines.toLocaleString("en-US")} ${lines === 1 ? "line" : "lines"}`, ...words.flatMap(([word, cls]) => {
      const node = document.createElement("span");
      node.className = "code-word " + cls;
      node.textContent = word;
      return [" · ", node];
    }));
  }
  function paintWrap() {
    wrapButton.setAttribute("aria-pressed", String(wrap));
    setIcon(wrapButton, GLYPH.wrap, wrap ? CHROME.unwrap : CHROME.wrap);
    hostBlock.classList.toggle("is-wrapped", wrap);
    schedule();
  }
  wrapButton.addEventListener("click", () => {
    wrap = !wrap;
    if (!phone && lang.id !== "text") saved.write(WRAP_KEY, wrap);
    view.dispatch({ effects: wrapping.reconfigure(wrap ? cm.EditorView.lineWrapping : []) });
    paintWrap();
  });
  function openLine() {
    field.hidden = false;
    status.hidden = true;
    field.value = "";
    field.placeholder = `${CHROME.line} (1–${view.state.doc.lines})`;
    field.focus({ preventScroll: true });
  }
  function closeLine(back = true) {
    if (field.hidden) return;
    field.hidden = true;
    status.hidden = false;
    if (back) view.contentDOM.focus({ preventScroll: true });
  }
  lineButton.addEventListener("click", () => {
    if (field.hidden) openLine();
    else closeLine();
  });
  field.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const [n, col] = field.value.split(/[:,\s]+/).map((part) => parseInt(part, 10));
      if (Number.isFinite(n)) {
        closeLine();
        goLine(n, col);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLine();
    }
  });
  field.addEventListener("blur", () => setTimeout(() => {
    if (document.activeElement !== field) closeLine(false);
  }, 0));
  const ctrlG = (event) => {
    if (event.defaultPrevented || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== "g" || event.target.closest?.("input, textarea, .p2-suggest-editor")) return;
    event.preventDefault();
    openLine();
  };
  scroller.addEventListener("keydown", ctrlG);
  function goLine(n, col = 1) {
    const s = view.state, at = s.doc.line(Math.max(1, Math.min(s.doc.lines, n)));
    const pos = Math.min(at.to, at.from + Math.max(0, (Number.isFinite(col) ? col : 1) - 1));
    openAt(pos);
    view.dispatch({ selection: { anchor: pos } });
    hostBlock.classList.add("is-touched");
    bring(pos, 0.33, true);
    view.contentDOM.focus({ preventScroll: true });
  }
  copyButton.addEventListener("click", async () => {
    const all = wholeText();
    let done = false;
    try {
      await navigator.clipboard.writeText(all);
      done = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = all;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      try {
        done = document.execCommand("copy");
      } catch {
      }
      area.remove();
    }
    if (!done) return;
    setIcon(copyButton, "check", CHROME.copied);
    setTimeout(() => setIcon(copyButton, GLYPH.copy, CHROME.copy), 1400);
  });
  hostBlock.addEventListener("pointerdown", () => hostBlock.classList.add("is-touched"));
  view.contentDOM.addEventListener("keydown", () => hostBlock.classList.add("is-touched"));
  function boxAt(pos) {
    const block = view.lineBlockAt(pos), top = view.documentTop + block.top, rect = view.contentDOM.getBoundingClientRect();
    return { top, bottom: top + block.height, height: block.height, left: rect.left, right: rect.right, width: rect.width, x: rect.left, y: top };
  }
  function bring(pos, where = 0.38, always = false) {
    const box = boxAt(pos), frameBox = scroller.getBoundingClientRect();
    if (!always && box.top >= frameBox.top + 40 && box.bottom <= frameBox.bottom - 90) return;
    const by = box.top - frameBox.top - frameBox.height * where;
    scroller.scrollTo({ top: scroller.scrollTop + by, behavior: reduced() || Math.abs(by) > frameBox.height * 2 ? "auto" : "smooth" });
  }
  function openAt(from, to = from) {
    const effects = [];
    cm.foldedRanges(view.state).between(from, to, (a, b) => {
      if (a <= to && b >= from && !(a === from && b === to)) effects.push(cm.unfoldEffect.of({ from: a, to: b }));
    });
    if (effects.length) view.dispatch({ effects });
  }
  function topPos() {
    const y = scroller.getBoundingClientRect().top - view.documentTop;
    return y <= 0 ? 0 : view.lineBlockAtHeight(y).from;
  }
  function find(words, { keep = false } = {}) {
    const needle = String(words ?? "").trim().toLocaleLowerCase();
    if (keep && needle === query && !findStale) return { count: hits.length, now };
    const was = keep && needle === query ? now : -1;
    query = needle;
    hits = [];
    now = -1;
    findStale = false;
    if (needle) {
      const cursor = new cm.SearchCursor(view.state.doc, needle, 0, view.state.doc.length, (part) => part.toLowerCase());
      while (hits.length < FIND_MAX && !cursor.next().done) hits.push({ from: cursor.value.from, to: cursor.value.to });
      if (hits.length) {
        const top = topPos();
        now = was >= 0 ? Math.min(was, hits.length - 1) : Math.max(0, hits.findIndex((hit) => hit.from >= top));
      }
    }
    paintFind(was < 0);
    return { count: hits.length, now };
  }
  function step(dir) {
    if (!hits.length) return { count: 0, now: -1 };
    now = (now + dir + hits.length) % hits.length;
    paintFind(true);
    return { count: hits.length, now };
  }
  function paintFind(bringIt) {
    view.dispatch({ effects: setFind.of({ hits, now }) });
    if (bringIt && now >= 0) {
      openAt(hits[now].from, hits[now].to);
      bring(hits[now].from);
    }
  }
  function reveal(anchor) {
    const found = locate({ text: wholeText(), parts: [] }, anchor);
    if (!found) {
      quote = null;
      view.dispatch({ effects: setQuote.of(null) });
      notice.textContent = QUOTE_GONE;
      notice.hidden = false;
      return false;
    }
    notice.hidden = true;
    quote = { from: found.start, to: found.end };
    view.dispatch({ effects: setQuote.of(quote) });
    openAt(quote.from, quote.to);
    bring(quote.from, 0.3);
    return true;
  }
  function clearQuote() {
    quote = null;
    view.dispatch({ effects: setQuote.of(null) });
  }
  let whole = { doc: null, text: "" };
  const wholeText = () => {
    if (whole.doc !== view.state.doc) whole = { doc: view.state.doc, text: view.state.doc.toString() };
    return whole.text;
  };
  function settle() {
    const selection = globalThis.getSelection?.();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    if (anchorNode?.nodeType === 3 && focusNode?.nodeType === 3) return;
    if (!view.contentDOM.contains(anchorNode) || !view.contentDOM.contains(focusNode)) return;
    const range = selection.getRangeAt(0), forward = anchorNode === range.startContainer && anchorOffset === range.startOffset;
    const texts = [], walker = document.createTreeWalker(view.contentDOM, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data && !node.parentElement?.closest(".cm-ide-folded, .code-held")) texts.push(node);
    const startText = range.startContainer.nodeType === 3 ? [range.startContainer, range.startOffset] : ((n) => n ? [n, 0] : null)(texts.find((node) => range.comparePoint(node, 0) >= 0));
    const endText = range.endContainer.nodeType === 3 ? [range.endContainer, range.endOffset] : ((n) => n ? [n, n.data.length] : null)(texts.findLast((node) => range.comparePoint(node, node.data.length) <= 0));
    if (!startText || !endText) return;
    if (forward) selection.setBaseAndExtent(...startText, ...endText);
    else selection.setBaseAndExtent(...endText, ...startText);
  }
  hostBlock.addEventListener("pointerup", settle, true);
  hostBlock.addEventListener("keyup", settle, true);
  function index() {
    if (liveIndex) return liveIndex;
    const text2 = wholeText(), found = [];
    const walker = document.createTreeWalker(view.contentDOM, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.data || node.parentElement?.closest(".cm-ide-folded, .code-held")) continue;
      let at;
      try {
        at = view.posAtDOM(node, 0);
      } catch {
        continue;
      }
      if (text2.startsWith(node.data, at)) found.push({ node, start: at });
    }
    found.sort((a, b) => a.start - b.start);
    const parts2 = [];
    let end = 0;
    const stand = (from, to) => {
      if (to <= from) return;
      const node = document.createTextNode(text2.slice(from, to));
      posOf.set(node, from);
      parts2.push({ node, start: from, stand: true });
    };
    for (const part of found) {
      if (part.start < end) continue;
      stand(end, part.start);
      parts2.push(part);
      posOf.set(part.node, part.start);
      end = part.start + part.node.data.length;
    }
    stand(end, text2.length);
    return liveIndex = { text: text2, parts: parts2 };
  }
  function noteMarks() {
    if (!globalThis.CSS?.highlights || !shown) return;
    for (const name of KEPT) for (const range of CSS.highlights.get(name) ?? []) {
      if (rangeAt.has(range)) continue;
      const a = posOf.get(range.startContainer), b = posOf.get(range.endContainer);
      if (a != null && b != null) rangeAt.set(range, { from: a + range.startOffset, to: b + range.endOffset });
    }
  }
  function rebind() {
    if (typeof Highlight !== "function" || !globalThis.CSS?.highlights || !shown) return;
    noteMarks();
    for (const name of KEPT) {
      const held = CSS.highlights.get(name);
      if (!held) continue;
      let moved = false;
      const next = [];
      for (const range of held) {
        const at = rangeAt.get(range);
        const kept = !at || posOf.has(range.startContainer) && posOf.has(range.endContainer) && range.startContainer.isConnected && range.endContainer.isConnected;
        if (kept) {
          next.push(range);
          continue;
        }
        const fresh = rangeOf(index(), at.from, at.to);
        if (fresh) {
          rangeAt.set(fresh, at);
          moved = true;
        }
        next.push(fresh ?? range);
      }
      if (moved) CSS.highlights.set(name, new Highlight(...next));
    }
  }
  function schedule() {
    if (frame || dead) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (dead) return;
      syncBar();
      rebind();
    });
  }
  function syncBar() {
    const wide = view.scrollDOM.scrollWidth, room = view.scrollDOM.clientWidth;
    hbar.hidden = wrap || wide <= room + 1;
    if (!hbar.hidden) {
      hinner.style.width = wide + "px";
      if (hbar.scrollLeft !== view.scrollDOM.scrollLeft) hbar.scrollLeft = view.scrollDOM.scrollLeft;
    }
  }
  let syncing = false;
  hbar.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    view.scrollDOM.scrollLeft = hbar.scrollLeft;
    requestAnimationFrame(() => {
      syncing = false;
    });
  }, { passive: true });
  view.scrollDOM.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    hbar.scrollLeft = view.scrollDOM.scrollLeft;
    requestAnimationFrame(() => {
      syncing = false;
    });
  }, { passive: true });
  const sized = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  sized?.observe(hostBlock);
  function planOutline(wait = 160) {
    if (dead || outlineTimer) return;
    if (!(lang.id === "python" || JS.has(lang.id))) return;
    if (!wait) {
      cancelIdle();
      outlineIdle = idle((deadline) => {
        outlineIdle = 0;
        paintOutline(deadline);
      });
      return;
    }
    outlineTimer = setTimeout(() => {
      outlineTimer = 0;
      paintOutline();
    }, wait);
  }
  function paintOutline(deadline) {
    if (dead) return;
    const s = view.state, len = s.doc.length;
    const budget = !deadline ? 8 : deadline.didTimeout ? 16 : Math.min(40, Math.max(4, deadline.timeRemaining() - 1));
    const whole2 = cm.ensureSyntaxTree(s, len, budget);
    if (!whole2) {
      cancelIdle();
      outlineIdle = idle((next2) => {
        outlineIdle = 0;
        paintOutline(next2);
      }, 80);
    }
    if (!whole2 && !outlineFirst) return;
    outlineFirst = false;
    const next = outlineOf(s, whole2 ?? cm.syntaxTree(s), lang.id);
    const sign = JSON.stringify(next.map((h) => [h.id, h.level, h.at])), was = JSON.stringify(headings.map((h) => [h.id, h.level, h.at]));
    headings = next.map((h) => ({ ...h, node: hostBlock }));
    if (sign !== was && !quiet) changed("folds");
  }
  function cancelIdle() {
    if (outlineIdle) unidle(outlineIdle);
    outlineIdle = 0;
  }
  function foldOf(h) {
    const s = view.state, head = s.doc.lineAt(h.at), own = cm.foldable(s, head.from, head.to);
    if (own) return own;
    const to = Math.min(h.to, s.doc.length);
    return to > head.to ? { from: head.to, to } : null;
  }
  const foldedAt = (h) => {
    const range = foldOf(h);
    let on = false;
    if (range) cm.foldedRanges(view.state).between(range.from, range.from, (a, b) => {
      if (a === range.from && b === range.to) on = true;
    });
    return on;
  };
  function toggle(id, on) {
    const h = headings.find((entry) => entry.id === id), range = h && foldOf(h);
    if (!range) return;
    const shut = on ?? !foldedAt(h);
    view.dispatch({ effects: (shut ? cm.foldEffect : cm.unfoldEffect).of(range) });
  }
  function foldAll(on) {
    if (on) view.dispatch({ effects: headings.filter((h) => h.level === 1).map(foldOf).filter(Boolean).filter((range) => !foldedAt({ at: range.from, to: range.to })).map((range) => cm.foldEffect.of(range)) });
    else {
      const effects = [];
      cm.foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
        effects.push(cm.unfoldEffect.of({ from, to }));
      });
      view.dispatch({ effects });
    }
  }
  function goTo(id, { smooth = !reduced() } = {}) {
    const h = headings.find((entry) => entry.id === id);
    if (!h) return;
    openAt(h.at);
    const box = boxAt(h.from), frameBox = scroller.getBoundingClientRect(), by = box.top - frameBox.top - 18;
    scroller.scrollTo({ top: scroller.scrollTop + by, behavior: smooth && Math.abs(by) <= frameBox.height * 2 ? "smooth" : "auto" });
    view.dispatch({ selection: { anchor: h.at } });
    hostBlock.classList.add("is-touched");
  }
  let litId = null, scrolledAt = 0, resting = 0;
  const scrolled = () => {
    scrolledAt = performance.now();
  };
  scroller.addEventListener("scroll", scrolled, { passive: true });
  function currentHeading() {
    const id = headingAt();
    if (id === litId || performance.now() - scrolledAt > 150) {
      litId = id;
      return id;
    }
    clearTimeout(resting);
    resting = setTimeout(() => {
      resting = 0;
      if (!dead && shown && headingAt() !== litId) changed("folds");
    }, 170);
    return litId;
  }
  function headingAt() {
    if (!headings.length) return null;
    const y = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.2 - view.documentTop;
    const pos = y <= 0 ? 0 : view.lineBlockAtHeight(y).from;
    let lo = 0, hi = headings.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (headings[mid].from <= pos) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo - 1; i >= 0; i--) if (!hidden(headings[i])) return headings[i].id;
    return headings[0].id;
  }
  const hidden = (h) => {
    let away = false;
    cm.foldedRanges(view.state).between(h.at, h.at, (a, b) => {
      if (a < h.at && b > h.at) away = true;
    });
    return away;
  };
  const posFrom = (node) => {
    try {
      return view.posAtDOM(node, 0);
    } catch {
      return null;
    }
  };
  function sectionOf(node) {
    const pos = view.contentDOM.contains(node) ? posFrom(node) : null;
    if (pos == null) return [];
    return headings.filter((h) => h.from <= pos && pos <= h.to).map((h) => h.text);
  }
  function unfoldTo(node) {
    const pos = view.contentDOM.contains(node) ? posFrom(node) : null;
    if (pos != null) openAt(pos);
  }
  function folded() {
    const ranges = cm.foldedRanges(view.state);
    if (foldMemo.ranges !== ranges || foldMemo.headings !== headings) foldMemo = { ranges, headings, set: ranges.size ? new Set(headings.filter(foldedAt).map((h) => h.id)) : new Set() };
    return foldMemo.set;
  }
  function planBlocks() {
    if (dead || blocksIdle) return;
    blocksIdle = idle(() => {
      blocksIdle = 0;
      if (dead) return;
      paintBlocks();
      for (const fn of afterBlocks.splice(0)) fn();
    });
  }
  function whenBlocks(fn) {
    afterBlocks.push(fn);
    if (!blocksIdle) blocksIdle = idle(() => {
      blocksIdle = 0;
      if (!dead) for (const next of afterBlocks.splice(0)) next();
    });
  }
  function paintBlocks() {
    const doc = view.state.doc, per = Math.max(1, Math.ceil(doc.lines / (MAX_BLOCKS - 1))), out = document.createDocumentFragment(), list = [];
    for (let first = 1; first <= doc.lines; first += per) {
      const last = Math.min(doc.lines, first + per - 1), node = document.createElement("section");
      node.className = "pane-block code-line";
      node.dataset.blockId = "L" + first;
      node.dataset.lines = first + "-" + last;
      node.textContent = per === 1 ? doc.line(first).text : doc.sliceString(doc.line(first).from, doc.line(last).to);
      out.append(node);
      list.push(node);
    }
    lastBlocks = list;
    blocksDoc = doc;
    blocks.replaceChildren(out);
    view.dispatch({ effects: setSince.of({ changed: new Set(), fresh: new Set() }) });
  }
  const linesOf = (node) => {
    const [first, last] = String(node.dataset.lines ?? "").split("-").map(Number);
    return { first, last: last || first };
  };
  function sinceMarked() {
    const changedLines = new Set(), freshLines = new Set();
    let landed = null;
    for (const node of lastBlocks) {
      const on = node.classList.contains("p2-since-changed") ? changedLines : node.classList.contains("p2-since-new") ? freshLines : null;
      if (!on) continue;
      const { first, last } = linesOf(node);
      for (let n = first; n <= last; n++) on.add(n);
      if (!node.codeBound) {
        node.codeBound = true;
        node.getBoundingClientRect = () => boxAt(view.state.doc.line(Math.min(first, view.state.doc.lines)).from);
        node.scrollIntoView = () => {
          const pos = view.state.doc.line(Math.min(first, view.state.doc.lines)).from;
          openAt(pos);
          bring(pos, 0.3, true);
        };
      }
      if (node.classList.contains("is-landed")) landed = view.state.doc.line(Math.min(first, view.state.doc.lines)).from;
    }
    view.dispatch({ effects: [setSince.of({ changed: changedLines, fresh: freshLines }), setLanded.of(landed)] });
  }
  const watcher = typeof MutationObserver === "function" ? new MutationObserver(sinceMarked) : null;
  watcher?.observe(blocks, { subtree: true, attributes: true, attributeFilter: ["class"] });
  class Holder extends cm.WidgetType {
    constructor(node) {
      super();
      this.node = node;
    }
    eq(other) {
      return other.node === this.node;
    }
    toDOM() {
      return this.node;
    }
    ignoreEvent() {
      return true;
    }
    get estimatedHeight() {
      return this.node.offsetHeight || 220;
    }
  }
  let heldNode = null;
  function holdEditor(editor) {
    const where = editor.querySelector(".p2-se-where")?.textContent ?? "", numbers = where.match(/\d+/g)?.map(Number) ?? [];
    const lineNo = numbers.at(-1);
    if (!lineNo) return;
    const s = view.state, at = s.doc.line(Math.min(s.doc.lines, lineNo));
    const box = document.createElement("div");
    box.className = "code-held";
    const focused = editor.contains(document.activeElement);
    box.append(editor);
    heldNode = box;
    if (typeof MutationObserver === "function") new MutationObserver((records, self) => {
      if (!box.querySelector(".p2-suggest-editor")) {
        self.disconnect();
        if (heldNode === box) dropHeld();
      }
    }).observe(box, { childList: true });
    openAt(at.from, at.to);
    view.dispatch({ effects: setHeld.of(cm.Decoration.set([cm.Decoration.widget({ widget: new Holder(box), block: true, side: 1 }).range(at.to)])) });
    requestAnimationFrame(() => {
      if (focused || !document.activeElement || document.activeElement === document.body) editor.querySelector("textarea")?.focus({ preventScroll: true });
      bring(at.to, 0.35);
    });
  }
  function dropHeld() {
    if (!heldNode) return;
    heldNode = null;
    view.dispatch({ effects: setHeld.of(cm.Decoration.none) });
  }
  const arrivals = typeof MutationObserver === "function" ? new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.classList.contains("p2-suggest-editor")) holdEditor(node);
  }) : null;
  arrivals?.observe(host, { childList: true });
  const dirty = () => !dead && !!savedDoc && !view.state.doc.eq(savedDoc);
  function paintDirty() {
    const now2 = dirty();
    if (now2 !== wasDirty) {
      wasDirty = now2;
      changed("dirty");
      if (!now2) session?.clearError();
      if (!now2 && (onDisk || removed)) {
        onDisk = false;
        void reload?.();
      }
    }
  }
  function edited(update2) {
    if (update2.transactions.every((tr) => tr.annotation(disk(cm)))) return;
    const map = (from, to) => ({ from: update2.changes.mapPos(from, 1), to: update2.changes.mapPos(to, -1) });
    if (query) {
      hits = hits.map((hit) => map(hit.from, hit.to)).filter((hit) => hit.to > hit.from);
      now = Math.min(now, hits.length - 1);
      findStale = true;
      clearTimeout(textTimer);
      textTimer = setTimeout(() => {
        if (!dead) changed("text");
      }, 250);
    }
    if (globalThis.CSS?.highlights) for (const name of KEPT) for (const range of CSS.highlights.get(name) ?? []) {
      const at = rangeAt.get(range);
      if (at) rangeAt.set(range, map(at.from, at.to));
    }
    if (flashWord) {
      flashWord = "";
      clearTimeout(flashTimer);
    }
    paintDirty();
  }
  function setEditable(on) {
    on = on && !phone;
    if (on === editable) return;
    editable = on;
    hostBlock.classList.toggle("is-editable", on);
    view.dispatch({ effects: [compartments(cm).edit.reconfigure(cm.EditorState.readOnly.of(!on)), editing.reconfigure(editParts(on))] });
  }
  function freshHistory() {
    view.dispatch({ effects: undoing.reconfigure([]) });
    view.dispatch({ effects: undoing.reconfigure(cm.history()) });
  }
  function flash(word) {
    flashWord = word;
    paintStatus(view.state);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashWord = "";
      if (!dead) paintStatus(view.state);
    }, 1600);
  }
  function update(next, nextMasked) {
    if (removed) {
      removed = false;
      session?.removed(false);
    }
    masks = nextMasked;
    const drop = dropNext;
    dropNext = false;
    if (editable && !drop && ["unavailable", "unsynced"].includes(next.reason)) return;
    if (dirty() && !drop) {
      if (next.sha && next.sha !== sha && !onDisk) {
        onDisk = true;
        paintStatus(view.state);
      }
      return;
    }
    if (next.text == null) return;
    quiet = true;
    try {
      const lineBreak = lineBreakOf(next.text);
      if (lineBreak !== view.state.lineBreak) view.dispatch({ effects: compartments(cm).file.reconfigure(fileExtensions(cm, lineBreak, indentOf(next.text, lang.id))) });
      const spec = diskChange(cm, view.state, asLines(next.text, lineBreak));
      if (spec) {
        view.dispatch(spec);
        liveIndex = null;
        posOf = new WeakMap();
        rangeAt = new WeakMap();
        if (query) {
          const keepNow = now;
          find(query);
          if (keepNow >= 0 && hits.length) {
            now = Math.min(keepNow, hits.length - 1);
            paintFind(false);
          }
        }
        if (quote) clearQuote();
        paintOutline();
      }
      if (spec || drop) freshHistory();
      if (spec || blocksDoc !== view.state.doc) planBlocks();
      savedDoc = view.state.doc;
      sha = next.sha;
      bom = next.bom;
      onDisk = false;
      setEditable(next.editable);
      session?.set(next);
      paintDirty();
      paintStatus(view.state);
    } finally {
      quiet = false;
    }
  }
  if (!phone && gateway) session = createSession({ target, api: gateway, head: base().head, scroller, root: host, file, view: { doc: () => view.state.doc, text: () => view.state.sliceDoc(), dirty, sha: () => sha, bom: () => bom, saved(doc, next) {
    savedDoc = doc;
    sha = next;
    onDisk = false;
    paintDirty();
    paintStatus(view.state);
  }, drop() {
    dropNext = true;
  }, reload: () => reload?.(), busy(on) {
    saving = on;
    paintStatus(view.state);
  }, flash, focus: () => view.contentDOM.focus({ preventScroll: true }), get source() {
    return !!source;
  } } });
  const api = { get dead() {
    return dead;
  }, view, host: hostBlock, lang, attach, update, whenBlocks, get dirty() {
    return dirty();
  }, get editable() {
    return editable;
  }, get session() {
    return session;
  }, get keeps() {
    return dirty() && !dropNext;
  }, gone() {
    if (dead || removed) return;
    removed = true;
    session?.removed(true);
  }, doc: { index, sectionOf, toggle, foldAll, goTo, currentHeading, unfoldTo, find, step, reveal, clearQuote, show(on) {
    shown = !!on;
    if (on) schedule();
  }, get finding() {
    return { count: hits.length, now, query };
  }, get headings() {
    return headings;
  }, get folded() {
    return folded();
  }, facts, save: () => session?.save() ?? Promise.resolve(false), get dirty() {
    return dirty();
  }, keepOpen: (why) => session?.keepOpen(why) ?? false }, facts, goLine, destroy() {
    if (dead) return;
    session?.destroy();
    dead = true;
    cancelAnimationFrame(frame);
    clearTimeout(outlineTimer);
    clearTimeout(resting);
    clearTimeout(flashTimer);
    clearTimeout(textTimer);
    cancelIdle();
    if (blocksIdle) unidle(blocksIdle);
    afterBlocks = [];
    watcher?.disconnect();
    arrivals?.disconnect();
    sized?.disconnect();
    scroller.removeEventListener("keydown", ctrlG);
    scroller.removeEventListener("scroll", scrolled);
    view.destroy();
    hostBlock.remove();
    blocks.remove();
    scroller.classList.remove("is-code");
    if (hold.get(host) === api) hold.delete(host);
    if (wasDirty) changed("dirty");
  } };
  function facts() {
    return codeFacts(base(), { text: wholeText, blocks: () => lastBlocks, masked: masks });
  }
  return api;
}
export function codeFacts(doc, { text, blocks, masked }) {
  return { target: doc.target, root: doc.root, head: doc.head, scroller: doc.scroller, item: doc.item, get text() {
    return text();
  }, get blocks() {
    return blocks().map((node) => ({ id: node.dataset.blockId, level: 0, node, text: node.textContent }));
  }, ...typeof doc.raw === "function" && !masked && !doc.item?.masked ? { raw: doc.raw } : {} };
}
export function withCode(doc, current) {
  return new Proxy(doc, { get(target, key, receiver) {
    if (key === "destroy") return () => {
      current()?.destroy();
      target.destroy();
    };
    const code = current();
    if (code && !code.dead && Object.prototype.hasOwnProperty.call(code.doc, key)) return code.doc[key];
    return Reflect.get(target, key, receiver);
  } });
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", (event) => {
    const line = event.target?.closest?.(".code-host .cm-line");
    if (!line || !line.closest(".p2-picking") || !globalThis.getSelection || !getSelection().isCollapsed) return;
    const range = document.createRange();
    range.selectNodeContents(line);
    if (!range.toString().trim()) return;
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, true);
}
