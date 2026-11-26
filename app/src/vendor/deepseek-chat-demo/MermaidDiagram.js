import { jsx } from "react/jsx-runtime";
import { memo, useEffect, useRef, useState } from "react";
import { useTheme } from "./theme.js";
import { renderMermaid } from "./mermaid.js";
export const MermaidDiagram = memo(function MermaidDiagram2({ code, loading }) {
  const t = (key) => ({ mermaidEmpty: "다이어그램 내용이 없어요", mermaidRenderFail: "다이어그램을 표시하지 못했어요", mermaidLoading: "다이어그램을 그리는 중" })[key];
  const dark = useTheme() === "dark";
  const [result, setResult] = useState({ svg: "", failedCode: null });
  const latestCodeRef = useRef(code);
  latestCodeRef.current = code;
  const finalCode = loading ? null : code;
  useEffect(() => {
    let cancelled = false;
    let timer;
    let previousCode;
    let displayedCode;
    const draw = async (input) => {
      if (input === displayedCode || cancelled) {
        return;
      }
      const svg = await renderMermaid(input, dark, () => cancelled);
      if (svg && !cancelled) {
        displayedCode = input;
        setResult({ svg, failedCode: null });
      }
    };
    const renderLatest = async () => {
      const input = latestCodeRef.current;
      if (input !== previousCode) {
        previousCode = input;
        try {
          await draw(input);
        } catch {
          if (!cancelled) {
            if (loading) {
              const text = input.trimEnd();
              const lineEnd = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));
              const prefix = text.slice(0, Math.max(0, lineEnd));
              if (prefix && !displayedCode?.startsWith(prefix)) {
                try {
                  await draw(prefix);
                } catch {
                }
              }
            } else {
              setResult({ svg: "", failedCode: input });
            }
          }
        }
      }
      if (!cancelled && loading) {
        timer = setTimeout(renderLatest, 100);
      }
    };
    void renderLatest();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dark, loading, finalCode]);
  if (!code.trim() || !result.svg) {
    return jsx("div", { className: "md-mermaid-status", role: "status", children: !loading && !code.trim() ? t("mermaidEmpty") : !loading && result.failedCode === code ? t("mermaidRenderFail") : t("mermaidLoading") });
  }
  return jsx("div", { className: "md-mermaid-diagram", dangerouslySetInnerHTML: { __html: result.svg } });
});
