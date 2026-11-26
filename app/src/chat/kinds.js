export const VISUAL = Object.freeze(["chart", "table", "timeline", "sketch"]);
export const KIND = Object.freeze({ chart: "Chart", table: "Table", timeline: "Timeline", sketch: "Sketch", mermaid: "Diagram" });
export const visualKind = (block) => block?.type === "code" && block.lang === "mermaid" ? "mermaid" : VISUAL.includes(block?.type) ? block.type : null;
