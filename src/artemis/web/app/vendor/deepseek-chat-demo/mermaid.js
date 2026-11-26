import mermaidEngine from "mermaid";
let renderQueue = Promise.resolve();
let nextId = 0;
const loadMermaid = () => Promise.resolve(mermaidEngine);
export const validateMermaid = (code) => {
  if (code.length > 128 * 1024 || /(?:%%\s*\{|^---[ \t]*$|(?:https?:|data:|javascript:|file:|blob:)\s*|url\s*\(|\/\/|&#|\bimg\s*:|@font-face|<(?:img|image)\b)/im.test(code)) throw new Error("Mermaid accepts local diagram syntax only");
};
const homeTheme = () => {
  const styles = getComputedStyle(document.documentElement), read = (name) => styles.getPropertyValue(name).trim();
  return { primaryColor: read("--surface"), primaryTextColor: read("--ink"), primaryBorderColor: read("--muted"), lineColor: read("--muted"), secondaryColor: read("--surface"), tertiaryColor: read("--paper"), edgeLabelBackground: read("--surface"), fontFamily: "var(--font-sans)" };
};
const sanitizeMermaid = (code) => code.replace(/<((?:img|image)\s+)/gi, "&lt;$1");
export const renderMermaid = (code, dark, isCancelled) => {
  const result = renderQueue.then(async () => {
    if (isCancelled() || !code.trim()) {
      return null;
    }
    validateMermaid(code);
    const mermaid = await loadMermaid();
    if (isCancelled()) {
      return null;
    }
    mermaid.initialize({ theme: "base", fontFamily: "var(--font-sans)", themeVariables: homeTheme(), htmlLabels: false, flowchart: { htmlLabels: false }, securityLevel: "strict", startOnLoad: false, suppressErrorRendering: true });
    const { svg } = await mermaid.render(`standalone-mermaid-${nextId++}`, sanitizeMermaid(code));
    return isCancelled() ? null : svg.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, "$1@layer astryx-base {$2}$3");
  });
  renderQueue = result.then(() => {
  }, () => {
  });
  return result;
};
