const lengths = new Set(["width", "maxWidth", "minWidth", "height", "minHeight", "maxHeight", "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "gap", "borderRadius", "borderWidth", "fontSize", "lineHeight", "letterSpacing", "flexGrow", "flexShrink"]);
const enums = { textAlign: ["left", "center", "right", "justify"], fontStyle: ["normal", "italic"], alignItems: ["flex-start", "center", "flex-end", "stretch"], justifyContent: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"], flexDirection: ["row", "column", "row-reverse", "column-reverse"], flexWrap: ["wrap", "nowrap"], textDecorationLine: ["none", "underline", "line-through"], borderStyle: ["solid", "dashed", "dotted"] };
const RICH_COLOR_ROLES = ["primary", "secondary", "tertiary", "success", "warning", "danger"];
function richColor(value, palette) {
  return typeof value === "string" && RICH_COLOR_ROLES.includes(value) ? palette[value] : void 0;
}
function richVisualStyle(node, palette) {
  const raw = node.props.style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const style = raw;
  const out = {};
  for (const [key, value] of Object.entries(style)) {
    if (key === "color") {
      const color = palette && richColor(value, palette);
      if (color) out[key] = color;
    } else if (key === "borderWidth" && typeof value === "number") {
      if (value > 0) out[key] = 1;
    } else if (lengths.has(key) && typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (["width", "maxWidth", "minWidth", "height", "minHeight", "maxHeight"].includes(key) && typeof value === "string" && /^(?:\d+(?:\.\d+)?%|auto)$/.test(value)) {
      out[key] = value;
    } else if (key === "fontWeight" && /^(?:[1-9]00|normal|bold)$/.test(String(value))) out[key] = String(value);
    else if (key === "fontFamily" && typeof value === "string" && /^[\w ,'-]{1,120}$/.test(value)) out[key] = value;
    else if (key === "opacity" && typeof value === "number" && Number.isFinite(value)) out[key] = Math.max(0, Math.min(1, value));
    else if (enums[key]?.includes(String(value))) out[key] = String(value);
  }
  if (palette && (out.borderWidth || out.borderStyle)) {
    out.borderWidth ??= 1;
    out.borderStyle ??= "solid";
    out.borderColor = palette.border;
  }
  return out;
}
const shapeTypes = /* @__PURE__ */ new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);
const numbers = /* @__PURE__ */ new Set(["x", "y", "x1", "y1", "x2", "y2", "width", "height", "rx", "ry", "cx", "cy", "r", "strokeWidth", "opacity", "fillOpacity", "strokeOpacity", "fontSize", "letterSpacing"]);
function richVector(node, palette) {
  const vb = Array.isArray(node.props.viewBox) ? node.props.viewBox : String(node.props.viewBox ?? "").split(/[ ,]+/).map(Number);
  const viewBox = vb.length === 4 && vb.every((v) => typeof v === "number" && Number.isFinite(v)) && vb[2] > 0 && vb[3] > 0 ? vb.join(" ") : "0 0 640 360";
  const shapes = [];
  for (const raw of Array.isArray(node.props.shapes) ? node.props.shapes.slice(0, 2048) : []) {
    if (!raw || typeof raw !== "object" || !shapeTypes.has(raw.type)) continue;
    const props = {};
    for (const [k, v] of Object.entries(raw)) {
      if (numbers.has(k) && typeof v === "number" && Number.isFinite(v)) props[k] = v;
      else if (["fill", "stroke"].includes(k)) {
        const c = v === "none" ? "none" : richColor(v, palette);
        if (c) props[k] = c;
      } else if (k === "d" && typeof v === "string" && /^[MmZzLlHhVvCcSsQqTtAa\d.,+eE\s-]+$/.test(v)) props[k] = v;
      else if (["points", "strokeDasharray"].includes(k) && typeof v === "string" && /^[\d.,+eE\s-]+$/.test(v)) props[k] = v;
      else if (k === "transform" && typeof v === "string" && /^(?:(?:translate|scale|rotate|matrix|skewX|skewY)\([\d.,+eE\s-]+\)\s*)+$/.test(v)) props[k] = v;
      else if (k === "textAnchor" && ["start", "middle", "end"].includes(String(v))) props[k] = String(v);
      else if (k === "fontWeight" && /^(?:[1-9]00|normal|bold)$/.test(String(v))) props[k] = String(v);
      else if (k === "strokeLinecap" && ["butt", "round", "square"].includes(String(v))) props[k] = String(v);
      else if (k === "strokeLinejoin" && ["miter", "round", "bevel"].includes(String(v))) props[k] = String(v);
    }
    shapes.push({ type: raw.type, props, text: raw.type === "text" ? String(raw.text ?? "") : void 0 });
  }
  return { viewBox, shapes };
}
export { RICH_COLOR_ROLES, richColor, richVector, richVisualStyle };
