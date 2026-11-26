import "katex/contrib/mhchem";
import { jsx } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import katexEngine from "katex";
const ensureKatex = () => katexEngine;
const KATEX_WRAPPER = { inline: ['<span class="katex">', "</span>"], display: ['<span class="katex-display"><span class="katex">', "</span></span>"] };
const noop = () => {
};
const useMathHtml = (input, isInline) => {
  const previousResultRef = useRef(null);
  const katexRef = useRef(ensureKatex());
  const [katex, setKatex] = useState(katexRef.current instanceof Promise ? null : katexRef.current);
  useEffect(() => {
    if (katexRef.current instanceof Promise) {
      katexRef.current.then(setKatex, noop);
    }
  }, []);
  return useMemo(() => {
    if (!katex) {
      return { html: input, renderMode: "fallback" };
    }
    try {
      const [prefix, suffix] = KATEX_WRAPPER[isInline ? "inline" : "display"];
      const html = katex.renderToString(input, { throwOnError: true, strict: false, displayMode: !isInline }).slice(prefix.length, -suffix.length);
      const result = { html, renderMode: "katex" };
      previousResultRef.current = result;
      return result;
    } catch {
      return previousResultRef.current ?? { html: input, renderMode: "fallback" };
    }
  }, [input, isInline, katex]);
};
export const MathBlock = memo(function MathBlock2({ value }) {
  const { html, renderMode } = useMathHtml(value, false);
  if (renderMode === "fallback") {
    return jsx("p", { className: "ds-markdown-paragraph", children: html });
  }
  return jsx("span", { className: "katex-display ds-markdown-math", children: jsx("span", { className: "katex", dangerouslySetInnerHTML: { __html: html } }) });
});
export const InlineMath = memo(function InlineMath2({ value }) {
  const { html, renderMode } = useMathHtml(value, true);
  if (renderMode === "fallback") {
    return html;
  }
  return jsx("span", { className: "katex", dangerouslySetInnerHTML: { __html: html } });
});
