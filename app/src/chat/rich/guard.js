export const SOURCE_LIMIT = 128 * 1024;
export function sourceAllowed(source) {
  if (source.length > SOURCE_LIMIT || new TextEncoder().encode(source).length > SOURCE_LIMIT) return false;
  return !/(?:<\/?[a-z!]|(?:https?:|data:|javascript:|file:|blob:|cindy-media:|url\s*\())/i.test(source);
}
export const HOME_KINDS = Object.freeze(["text", "markdown", "heading", "icon", "stack", "row", "grid", "group", "divider", "code", "math", "diagram", "stat", "chart", "badge", "alert", "progress", "svg", "range", "input", "check", "select", "button", "form", "details", "tabs"]);
export function documentAllowed(doc) {
  if (doc.issues) return false;
  for (const node of doc.nodes.values()) {
    if (!sourceAllowed(JSON.stringify(node.props))) return false;
    if (!HOME_KINDS.includes(node.kind)) return false;
    if (node.kind === "markdown" && /!\[|\]\s*\(|\]\s*:/.test(String(node.props.text ?? ""))) return false;
    if (["badge", "alert", "progress"].includes(node.kind) && ["text", "title", "label", "suffix"].some((k) => typeof node.props[k] === "string" && node.props[k].length > 400)) return false;
    if (node.kind === "chart" && Array.isArray(node.props.data) && node.props.data.length > 512) return false;
    if (node.kind === "range" && (Number(node.props.max ?? 100) - Number(node.props.min ?? 0)) / Number(node.props.step ?? 1) > 4096) return false;
  }
  return true;
}
