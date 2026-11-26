export const SIDES = ["a", "b"];
const across = (side) => side === "a" ? "b" : "a";
export function createSplit() {
  let sides = null;
  const sideOf = (key) => !sides || key == null ? null : sides.a === key ? "a" : sides.b === key ? "b" : null;
  return { get on() {
    return !!sides;
  }, get focus() {
    return sides?.focus ?? null;
  }, sideOf, other: () => sides ? sides[across(sides.focus)] : null, keyOn: (side) => sides?.[side] ?? null, start(a, b, focus = "b") {
    if (!a || !b || a === b || !SIDES.includes(focus)) return false;
    sides = { a, b, focus };
    return true;
  }, end() {
    const kept = sides ? sides[sides.focus] : null;
    sides = null;
    return kept;
  }, show(key) {
    if (!sides || key == null) return;
    const side = sideOf(key);
    if (side) sides.focus = side;
    else sides[sides.focus] = key;
  }, focusOn(side) {
    if (sides && SIDES.includes(side)) sides.focus = side;
  }, put(key, side, { shown = null } = {}) {
    if (!SIDES.includes(side) || key == null) return false;
    if (!sides) {
      const rest = shown && shown !== key ? shown : null;
      if (!rest) return false;
      sides = side === "b" ? { a: rest, b: key, focus: "b" } : { a: key, b: rest, focus: "a" };
      return true;
    }
    const at = sideOf(key);
    if (at === side) {
      sides.focus = side;
      return true;
    }
    if (at) {
      const there = sides[side];
      sides[side] = key;
      sides[at] = there;
    } else sides[side] = key;
    sides.focus = side;
    return true;
  }, close(key) {
    const side = sideOf(key);
    if (!side) return null;
    const rest = sides[across(side)];
    sides = null;
    return rest;
  }, rekey(from, to) {
    const side = sideOf(from);
    if (side && to) sides[side] = to;
  }, state: () => sides ? { ...sides } : null, restore(state, keys) {
    sides = null;
    if (!state || !keys.includes(state.a) || !keys.includes(state.b) || state.a === state.b) return false;
    sides = { a: state.a, b: state.b, focus: SIDES.includes(state.focus) ? state.focus : "a" };
    return true;
  } };
}
