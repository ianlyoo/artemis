import { svg, STROKE } from "../../icons.js";
const inner = (name) => svg(name).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
const glyph = (name) => {
  const markup = { __html: inner(name) };
  const Glyph = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={markup} />;
  Glyph.displayName = `HomeIcon(${name})`;
  return Glyph;
};
export const BackGlyph = glyph("left"), FullGlyph = glyph("fit"), SunGlyph = glyph("sun"), MoonGlyph = glyph("moon"), AwayGlyph = glyph("external");
