import "katex/dist/katex.min.css";
import { MathBlock, InlineMath } from "../vendor/deepseek-chat-demo/MathFormula.js";
import { island } from "./lib/mount.jsx";
export { MathBlock, InlineMath };
export function MathFormula({ value, inline = false }) {
  return inline ? <InlineMath value={value} /> : <MathBlock value={value} />;
}
export const mount = island(MathFormula);
export const stylesheet = new URL("./render-math.css", import.meta.url).href;
