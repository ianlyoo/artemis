import { jsx, jsxs } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useReducer, useState } from "react";
import Prism from "prismjs/components/prism-core.js";
import { getHighlightLang, isHighlightLoaded, loadHighlight } from "./highlight.js";
import { Button } from "@astryxdesign/core/Button";
const styles = { container: "ds-code-info", button: "ds-code-copy", name: "ds-code-name" };
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
const t = (key) => ({ copy: "복사", copied: "복사됨" })[key] ?? key;
const CodeInfoRow = ({ code, infostring }) => {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return jsxs("div", { className: styles.container, children: [jsx("span", { className: styles.name, children: infostring || "text" }), jsx(Button, { type: "button", className: styles.button, onClick: async () => {
    if (!await copyText(code)) {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, children: jsx("span", { children: copyFailed ? "텍스트를 선택해 복사" : t(copied ? "copied" : "copy") }) })] });
};
export const CodeBlock = memo(function CodeBlock2({ code, infostring, loading = false }) {
  const rerender = useReducer((n) => n + 1, 0)[1];
  const lang = getHighlightLang(infostring);
  const loaded = lang !== null && isHighlightLoaded(lang);
  useEffect(() => {
    if (lang === null || loaded) {
      return;
    }
    let unmounted = false;
    loadHighlight(lang).then(() => {
      if (!unmounted) {
        rerender();
      }
    });
    return () => {
      unmounted = true;
    };
  }, [lang, loaded, rerender]);
  const renderedHtml = useMemo(() => {
    const name = lang !== null && loaded ? lang : "plaintext";
    return Prism.highlight(code, Prism.languages[name], name);
  }, [code, lang, loaded]);
  return jsxs("div", { className: "md-code-block", children: [jsx("div", { className: "md-code-block-banner", children: jsx(CodeInfoRow, { code, infostring }) }), jsx("pre", { tabIndex: 0, children: jsx("code", { dangerouslySetInnerHTML: { __html: renderedHtml } }) })] });
});
