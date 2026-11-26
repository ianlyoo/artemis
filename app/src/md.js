export const MD_OPTIONS = Object.freeze({ gfm: true, breaks: true, async: false });
export const NOTE_DEF = /^\[\^([^\]\s]+)\](?::[ \t]?|[ \t]+)(.*)$/;
export const NOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;
export const NOTE_OPEN = "", NOTE_CLOSE = "", NOTE_MARK = /\uE000(\d+)\uE001/g;
export const INLINE_MARKS = /\[\^[^\]\s]+\]|\*\*[^*\n]+\*\*|__[^_\n]+__|(^|[^\w*])\*(?!\s)[^*\n]+\*(?!\w)|`[^`\n]+`|!?\[[^\]\n]+\]\([^)\s]+\)|\bhttps?:\/\/\S|<br\s*\/?>/i;
const P = String.raw`(?!~)[\p{P}\p{S}\uE000\uE001]`, PS = String.raw`(?!~)[\s\p{P}\p{S}\uE000\uE001]`, N = String.raw`(?:[^\s\p{P}\p{S}\uE000\uE001]|~)`;
const CJK = String.raw`\p{scx=Han}\p{scx=Hang}\p{scx=Hira}\p{scx=Kana}\p{scx=Bopo}`, C = `[${CJK}]`;
const STAR = { other: null, inline: { emStrongLDelim: new RegExp(String.raw`^\*+(?:((?!\*)${P})|([^\s*]))?`, "u"), punctuation: new RegExp(String.raw`^((?![*_])[\s\p{P}\p{S}\uE000\uE001${CJK}])`, "u"), emStrongRDelimAst: new RegExp([String.raw`^[^_*]*?__[^_*]*?\*[^_*]*?(?=__)`, String.raw`[^*]+(?=[^*])`, String.raw`(?!\*)${P}(\*+)(?=[\s]|$)`, String.raw`(?!${C}\*+(?!\*)${P})${N}(\*+)(?!\*)(?=${PS}|$)`, String.raw`(?!${P}\*+(?!\*)${C})(?!\*)${PS}(\*+)(?=${N})`, String.raw`[\s](\*+)(?!\*)(?=${P})`, String.raw`(?!\*)${P}(\*+)(?!\*)(?=${P}|${C})`, String.raw`(?:${N}(?=\*+${N})|${C}(?=\*+(?!\*)${P}))(\*+)`].join("|"), "gu") } };
export const MD_TOKENIZER = { tokenizer: { del() {
}, emStrong(src, masked, prev) {
  if (src[0] !== "*") return false;
  return Object.getPrototypeOf(this).emStrong.call(Object.create(this, { rules: { value: { ...STAR, other: this.rules.other } } }), src, masked, prev);
} } };
const FENCE = /^\s*(```|~~~)/, MORE = /^(\t| {2,})\S/, CODE = /(`+)[\s\S]*?\1/g;
export function outsideCode(text, words, code = (part) => part) {
  let fence = false;
  return String(text ?? "").split("\n").map((line) => {
    if (FENCE.test(line)) {
      fence = !fence;
      return code(line);
    }
    if (fence) return code(line);
    let out = "", at = 0;
    for (const span of line.matchAll(CODE)) {
      out += words(line.slice(at, span.index)) + code(span[0]);
      at = span.index + span[0].length;
    }
    return out + words(line.slice(at));
  }).join("\n");
}
export function splitNotes(source, join = " ") {
  const defs = /* @__PURE__ */ new Map(), kept = [];
  let last = null, fence = false, blanks = [];
  const add = (text) => defs.set(last, defs.get(last) + text);
  for (const line of String(source ?? "").split(/\r?\n/)) {
    if (last && !line.trim()) {
      blanks.push(line);
      continue;
    }
    if (last && MORE.test(line)) {
      const more = join === "\n" ? line.replace(/^(\t| {1,4})/, "") : line.trim();
      add((blanks.length ? join === "\n" ? "\n\n" : " " : join) + more);
      blanks = [];
      continue;
    }
    kept.push(...blanks);
    blanks = [];
    if (FENCE.test(line)) fence = !fence;
    const def = !fence && line.match(NOTE_DEF);
    if (def) {
      last = def[1];
      defs.set(last, def[2]);
      continue;
    }
    last = null;
    kept.push(line);
  }
  kept.push(...blanks);
  return { text: kept.join("\n"), defs };
}
