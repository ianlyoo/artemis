export function presentationStyle(node, visual) {
  const next = { ...visual }, size = typeof visual.fontSize === "number" ? visual.fontSize : 0;
  const role = node.props?.style?.color ?? node.style?.color;
  const supporting = ["text", "markdown"].includes(node.kind) && (role === "secondary" || role === "tertiary" || size > 0 && size <= 13);
  const floor = node.kind === "heading" ? 18 : node.kind === "stat" || supporting ? 13 : 16;
  if (size || ["text", "markdown", "heading", "input", "range", "check", "select", "button", "form"].includes(node.kind)) next.fontSize = Math.max(floor, size);
  if (supporting) {
    if (!role || role === "secondary" || role === "tertiary") next.color = "var(--text-secondary)";
    next.opacity = 1;
  }
  return next;
}
