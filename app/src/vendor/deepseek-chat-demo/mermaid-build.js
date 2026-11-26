import { readFileSync } from "node:fs";
const pinnedVersion = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).dependencies.mermaid;
function replaceOne(source, pattern, replacement) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Mermaid ${pinnedVersion} build adapter does not fit the installed source; review its source signatures before building`);
  return source.replace(pattern, replacement);
}
function homeThemeAndLabels(source) {
  source = replaceOne(source, /\/\/ src\/themes\/theme-dark\.js[\s\S]*?(?=\/\/ src\/themes\/index\.js)/g, "");
  source = replaceOne(source, /var themes_default = \{[\s\S]*?\n\};/g, "var themes_default = {base:{getThemeVariables},default:{getThemeVariables}};");
  source = replaceOne(source, /getThemeVariables3 as getThemeVariables,/g, "getThemeVariables,");
  return replaceOne(source, /var isMathMLSupported =[\s\S]*?(?=var common_default =)/g, `var hasKatex = () => false;
var calculateMathMLDimensions = async () => ({width:0,height:0});
var renderKatexSanitized = async (text, config) => sanitizeText(text, config);
`);
}
function withoutFrontMatter(source) {
  source = replaceOne(source, /import \{\s*JSON_SCHEMA,\s*load\s*\} from "\.\/chunks\/mermaid\.core\/[^"\n]+";\n/g, "");
  return replaceOne(source, /function extractFrontMatter\(text\) \{[\s\S]*?\n\}\n__name\(extractFrontMatter, "extractFrontMatter"\);/g, "function extractFrontMatter(text) { return {text, metadata:{}}; }");
}
function jsonYamlReader(source) {
  source = replaceOne(source, /var core = json;[\s\S]*?(?=var _hasOwnProperty\$1 = Object\.prototype\.hasOwnProperty;)/g, "");
  source = replaceOne(source, /var loadAll_1 = loadAll\$1;[\s\S]*?(?=\nexport \{)/g, "var JSON_SCHEMA = json;\nvar load = load$1;\n");
  return replaceOne(source, /\b_default\b/g, "json");
}
function chatDiagramTypes(source) {
  return replaceOne(source, /  if \(true\) \{\n    registerLazyLoadedDiagrams\([\s\S]*?\n  registerLazyLoadedDiagrams\([\s\S]*?\n  \);/g, `  registerLazyLoadedDiagrams(
    detector_default3, classDetector_V2_default, classDetector_default,
    erDetector_default, ganttDetector_default, pie, sequenceDetector_default,
    flowDetector_v2_default, flowDetector_default,
    stateDetector_V2_default, stateDetector_default
  );`);
}
function versionMetadata(source) {
  const installed = source.match(/version: "([^"]+)"/)?.[1];
  if (installed !== pinnedVersion) throw new Error(`Mermaid build adapter: package.json pins ${pinnedVersion}, installed source reports ${installed ?? "no version"}; install the pinned package before building`);
  return `export const package_default = {version:${JSON.stringify(pinnedVersion)}};`;
}
function homeErrors(source) {
  return replaceOne(source, /\/\/ src\/diagrams\/error\/errorRenderer\.ts[\s\S]*?(?=\/\/ src\/diagrams\/error\/errorDiagram\.ts)/g, "var renderer = {draw() {}};\nvar errorRenderer_default = renderer;\n");
}
export function mermaidForHome(path, source) {
  if (path.endsWith("mermaid.core.mjs")) return homeErrors(chatDiagramTypes(withoutFrontMatter(source)));
  if (source.includes("// src/themes/index.js")) return homeThemeAndLabels(source);
  if (source.includes("js-yaml@4.1.0/")) return jsonYamlReader(source);
  if (source.includes("function markdownToLines(")) {
    source = replaceOne(source, /function processNode\(node, parentType = "normal"\) \{\n    if \(node.type === "text"\) \{/g, 'function processNode(node, parentType = "normal") {\n    if (["text", "link", "escape", "codespan"].includes(node.type)) {');
    return replaceOne(source, /word = word\.replace\(\/&#39;\/g, `'`\);/g, 'word = word.replace(/&(?:#(\\d+)|(amp|lt|gt|quot|apos));/g, (entity, digits, named) => named ? ({amp:"&",lt:"<",gt:">",quot:String.fromCharCode(34),apos:String.fromCharCode(39)})[named] : Number(digits) <= 0x10ffff ? String.fromCodePoint(Number(digits)) : entity);');
  }
  if (source.includes("// package.json")) return versionMetadata(source);
  return source;
}
