const FENCE = /^ {0,3}(`{3,}|~{3,})/, SPAN = /(?<!`)(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g;
export function proseOf(text) {
  let open = "";
  const unfenced = String(text ?? "").split("\n").map((line) => {
    const fence = line.match(FENCE)?.[1], rest = fence ? line.slice(line.indexOf(fence) + fence.length) : "";
    if (open) {
      if (fence && fence[0] === open[0] && fence.length >= open.length && !rest.trim()) open = "";
      return "";
    }
    if (fence && !(fence[0] === "`" && rest.includes("`"))) {
      open = fence;
      return "";
    }
    return line;
  }).join("\n");
  return unfenced.replace(SPAN, (span) => span.replace(/[^\n]/g, " "));
}
