export const INK = "#121c54";
export const LIMITS = Object.freeze({ lines: 80, line: 2e3, place: 6e3 });
export const ASPECT = Object.freeze({ min: 2.5, max: 4 });
const round = (value) => Math.round(value * 1e4) / 1e4;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const inkWidth = (height) => clamp(height / 16, 0.9, 2.2);
export function fitInk(lines, aspect, box) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const line of lines) for (let i = 0; i + 1 < line.length; i += 2) {
    const x = line[i] * aspect, y = line[i + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return [];
  const width = box[2], height = box[3], spanX = maxX - minX, spanY = maxY - minY;
  const scale = Math.min(width * 0.92 / Math.max(spanX, 1e-9), height * 0.85 / Math.max(spanY, 1e-9));
  const left = (width - spanX * scale) / 2, top = (height - spanY * scale) / 2;
  return lines.map((line) => line.map((value, i) => i % 2 ? top + (value - minY) * scale : left + (value * aspect - minX) * scale));
}
function simplify(line, tolerance, aspect) {
  const count = line.length / 2;
  if (count <= 2) return line.slice();
  const keep = new Uint8Array(count);
  keep[0] = keep[count - 1] = 1;
  const stack = [[0, count - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const ax = line[first * 2] * aspect, ay = line[first * 2 + 1], bx = line[last * 2] * aspect, by = line[last * 2 + 1];
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    let far = -1, most = tolerance;
    for (let i = first + 1; i < last; i++) {
      const px = line[i * 2] * aspect, py = line[i * 2 + 1];
      const distance = length ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length : Math.hypot(px - ax, py - ay);
      if (distance > most) {
        most = distance;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  const out = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(line[i * 2], line[i * 2 + 1]);
  return out;
}
function split(line) {
  if (line.length <= LIMITS.line) return [line];
  const parts = [];
  for (let at = 0; at < line.length - 2; at += LIMITS.line - 2) parts.push(line.slice(at, at + LIMITS.line));
  return parts;
}
const numbers = (lines) => lines.reduce((sum, line) => sum + line.length, 0);
export function compactLines(lines, aspect = 1, budget = LIMITS.place) {
  budget = Math.min(budget, LIMITS.place);
  const clean = lines.map((line) => {
    const out2 = [];
    for (let i = 0; i + 1 < line.length; i += 2) {
      const x = round(clamp(line[i], 0, 1)), y = round(clamp(line[i + 1], 0, 1));
      if (out2.length && out2[out2.length - 2] === x && out2[out2.length - 1] === y) continue;
      out2.push(x, y);
    }
    return out2;
  }).filter((line) => line.length >= 2).slice(0, LIMITS.lines);
  let out = clean.flatMap(split);
  for (let tolerance = 4e-4; numbers(out) > budget || out.length > LIMITS.lines; tolerance *= 2) {
    out = clean.map((line) => simplify(line, tolerance, aspect)).flatMap(split);
    if (tolerance > 4) break;
  }
  return out.slice(0, LIMITS.lines);
}
export function traceLine(context, points) {
  const count = points.length / 2;
  if (!count) return;
  context.beginPath();
  if (count === 1) {
    context.arc(points[0], points[1], context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(points[0], points[1]);
  for (let i = 1; i < count - 1; i++) context.quadraticCurveTo(points[i * 2], points[i * 2 + 1], (points[i * 2] + points[i * 2 + 2]) / 2, (points[i * 2 + 1] + points[i * 2 + 3]) / 2);
  context.lineTo(points[count * 2 - 2], points[count * 2 - 1]);
  context.stroke();
}
export function inkPad(host, { onInk = () => {
}, line = "여기에 서명하세요", turn: tip = "가로로 돌리면 더 넓게 쓸 수 있어요" } = {}) {
  const doc = host.ownerDocument;
  const node = (tag, css, text) => {
    const el = doc.createElement(tag);
    el.style.cssText = css;
    if (text) el.textContent = text;
    return el;
  };
  const sheet = node("div", "position:relative;flex:none;background:#fff;border-radius:12px;overflow:hidden;touch-action:none;box-shadow:0 1px 2px rgba(0,0,0,.10),0 18px 40px -20px rgba(0,0,0,.45);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none");
  const canvas = node("canvas", "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair");
  const rule = node("div", `position:absolute;left:7%;right:7%;top:74%;height:1px;background:${INK};opacity:.2;pointer-events:none`);
  const prompt = node("div", `position:absolute;left:7%;top:calc(74% + 8px);font-size:13px;line-height:1.3;color:${INK};opacity:.5;pointer-events:none;letter-spacing:.01em`, line);
  const turn = node("p", "margin:14px 0 0;font-size:13px;line-height:1.4;color:var(--color-text-secondary,#6a6a68);text-align:center", tip);
  const column = node("div", "display:flex;flex-direction:column;align-items:center");
  sheet.append(canvas, rule, prompt);
  column.append(sheet, turn);
  host.style.cssText = "display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:0;padding:12px 0;overflow:hidden;overscroll-behavior:contain;touch-action:none";
  host.append(column);
  const context = canvas.getContext("2d");
  let lines = [], current = null, active = null, aspect = null, width = 0, height = 0, gone = false;
  const state = () => ({ count: lines.length + (current ? 1 : 0), full: lines.length >= LIMITS.lines });
  const scaled = (line2) => line2.map((value, i) => value * (i % 2 ? height : width));
  function pen() {
    context.strokeStyle = context.fillStyle = INK;
    context.lineCap = context.lineJoin = "round";
    context.lineWidth = clamp(height / 34, 2.4, 5.5);
  }
  function redraw() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = canvas.width / Math.max(width, 1);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    pen();
    for (const line2 of current ? [...lines, current] : lines) traceLine(context, scaled(line2));
    prompt.hidden = !!(lines.length || current);
  }
  function layout() {
    if (gone) return;
    const roomWidth = Math.max(host.clientWidth, 120), roomHeight = Math.max(host.clientHeight - 24, 60), upright = roomHeight > roomWidth;
    turn.hidden = !upright;
    const room = roomHeight - (upright ? 60 : 0);
    const shape = lines.length || current ? aspect : clamp(roomWidth / Math.max(room, 1), ASPECT.min, ASPECT.max);
    let w = Math.min(roomWidth, 960), h = w / shape;
    if (h > room) {
      h = Math.max(room, 60);
      w = h * shape;
    }
    w = Math.floor(w);
    h = Math.floor(h);
    aspect = shape;
    if (w === width && h === height) return;
    width = w;
    height = h;
    sheet.style.width = w + "px";
    sheet.style.height = h + "px";
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    redraw();
  }
  function at(event) {
    const box = canvas.getBoundingClientRect();
    return [round(clamp((event.clientX - box.left) / Math.max(box.width, 1), 0, 1)), round(clamp((event.clientY - box.top) / Math.max(box.height, 1), 0, 1))];
  }
  function segment(from, control, to) {
    context.beginPath();
    context.moveTo(from[0], from[1]);
    if (control) context.quadraticCurveTo(control[0], control[1], to[0], to[1]);
    else context.lineTo(to[0], to[1]);
    context.stroke();
  }
  const point = (line2, i) => [line2[i * 2] * width, line2[i * 2 + 1] * height];
  const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  function begin(spot) {
    current = spot.slice();
    prompt.hidden = true;
    const [x, y] = point(current, 0);
    pen();
    context.beginPath();
    context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    onInk(state());
  }
  function add(spot) {
    const count = current.length / 2, last = point(current, count - 1);
    if (Math.hypot(spot[0] * width - last[0], spot[1] * height - last[1]) < 1.5) return;
    current.push(spot[0], spot[1]);
    const n = current.length / 2, a = point(current, n - 3 >= 0 ? n - 3 : 0), b = point(current, n - 2), c = point(current, n - 1);
    pen();
    if (n === 2) segment(b, null, middle(b, c));
    else segment(middle(a, b), b, middle(b, c));
  }
  function finish() {
    if (!current) return;
    const n = current.length / 2;
    if (n >= 2) {
      pen();
      segment(middle(point(current, n - 2), point(current, n - 1)), null, point(current, n - 1));
    }
    lines.push(current);
    current = null;
    onInk(state());
  }
  function down(event) {
    if (active !== null || event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    if (lines.length >= LIMITS.lines) {
      onInk(state());
      return;
    }
    active = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
    }
    begin(at(event));
  }
  function move(event) {
    if (event.pointerId !== active) return;
    event.preventDefault();
    const each = event.getCoalescedEvents?.() ?? [];
    for (const one of each.length ? each : [event]) add(at(one));
  }
  function up(event) {
    if (event.pointerId !== active) return;
    active = null;
    finish();
  }
  const hold = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, up);
  for (const type of ["touchstart", "touchmove", "touchend"]) sheet.addEventListener(type, hold, { passive: false });
  sheet.addEventListener("contextmenu", hold);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(layout) : null;
  observer?.observe(host);
  layout();
  return { take: () => ({ aspect: round(clamp(aspect, 0.5, 8)), lines: lines.map((line2) => line2.slice()) }), clear() {
    lines = [];
    current = null;
    active = null;
    width = height = 0;
    layout();
    redraw();
    onInk(state());
  }, destroy() {
    gone = true;
    observer?.disconnect();
    lines = [];
    current = null;
    canvas.width = canvas.height = 0;
    column.remove();
  } };
}
