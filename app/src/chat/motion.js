import { el } from "../boards/dom.js";
import { still } from "../motion-gate.js";
import { zoned } from "../zone.js";
export const reduced = still;
const FADE = 560, PAINT = 42;
const hhmm = zoned("ko-KR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const days = zoned("en-US", { weekday: "short", month: "short", day: "numeric" });
const ymd = zoned("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const valid = (value) => value != null && Number.isFinite(Date.parse(value));
export const clock = (value) => valid(value) ? hhmm.format(new Date(value)) : "";
export const dayKey = (value) => valid(value) ? ymd.format(new Date(value)) : "";
export const dayLabel = (value) => valid(value) ? days.format(new Date(value)) : "";
const REACHES = /^ {0,3}(<[a-z!?/]|\[[^\]\n]+\]:)/im, ITEM = /^([-+*]|\d{1,9}[.)])(\s|$)/, RULE = /^([-*_])(\s*\1){2,}\s*$/, FENCE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
export function settledCut(text, from = 0) {
  if (REACHES.test(text)) return 0;
  let cut = from, blank = true, fence = null;
  for (let at = from, end; (end = text.indexOf("\n", at)) >= 0; at = end + 1) {
    const line = text.slice(at, end), mark = FENCE.exec(line);
    if (fence) {
      if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !line.slice(mark[0].length).trim()) fence = null;
      blank = false;
      continue;
    }
    if (blank && /^\S/.test(line) && !ITEM.test(line) && !RULE.test(line)) cut = at;
    if (mark) fence = mark[1];
    blank = !line.trim();
  }
  return cut;
}
const DELIMITER = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/, UNDERLINE = /^ {0,3}(=+|-+)\s*$/, SENTENCE = /[.!?。…][*_`)"'”’]*(?=\s)/g, LONG = 80;
const closed = (text) => !((text.match(/`/g)?.length ?? 0) % 2) && !((text.match(/\*\*/g)?.length ?? 0) % 2) && (text.match(/\[/g)?.length ?? 0) <= (text.match(/\]/g)?.length ?? 0) && text.lastIndexOf("](") <= text.lastIndexOf(")");
export function revealStops(text) {
  const stops = [], lines = text.split("\n");
  let at = 0, fence = null, table = false;
  lines.forEach((line, i) => {
    const end = at + line.length, next = lines[i + 1], mark = FENCE.exec(line);
    let stop = !!line.trim();
    if (fence) {
      if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !line.slice(mark[0].length).trim()) fence = null;
      else stop = false;
    } else if (mark) {
      fence = mark[1];
      stop = false;
    } else {
      if (!table && line.includes("|") && next?.includes("|") && DELIMITER.test(next)) table = true;
      if (table) {
        table = next !== void 0 && !!next.trim() && next.includes("|");
        stop = !table;
      } else if (stop && next !== void 0 && UNDERLINE.test(next) && !ITEM.test(line.trim())) stop = false;
      else if (stop && line.length > LONG) {
        let from = 0;
        for (const found of line.matchAll(SENTENCE)) {
          const cut = found.index + found[0].length;
          if (cut - from >= 24 && line.length - cut >= 12 && closed(line.slice(0, cut))) {
            stops.push(at + cut);
            from = cut;
          }
        }
      }
    }
    if (stop) stops.push(end);
    at = end + 1;
  });
  if (stops.at(-1) !== text.length) stops.push(text.length);
  return stops;
}
const STRUCTURE = /^(TABLE|THEAD|TBODY|TFOOT|TR|COLGROUP|UL|OL|DL)$/;
export function textWriter(render, { onPaint } = {}) {
  const slot = el("div", { class: "msg-run", "data-segment": "md" });
  let target = "", shown = 0, final = true, node = null, frame = 0, last = 0, renderedLength = 0, gone = false;
  let settled = "", settledLength = 0, tail = [];
  let paced = false, stops = null;
  const marks = [];
  const lengthOf = (root) => {
    let n = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) n += walk.currentNode.length;
    return n;
  };
  function freshen(root, now, base) {
    while (marks.length && now - marks[0].time > FADE) marks.shift();
    if (!marks.length) return;
    const from = marks[0].from, walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), texts = [];
    let at = base;
    while (walk.nextNode()) {
      const text = walk.currentNode, end = at + text.length;
      if (end > from && /\S/.test(text.data) && !STRUCTURE.test(text.parentNode?.nodeName)) texts.push([text, at]);
      at = end;
    }
    for (const [text, start] of texts) {
      const data = text.data, parts = [];
      let cut = Math.max(0, from - start);
      if (cut > 0) parts.push(document.createTextNode(data.slice(0, cut)));
      for (let m = 0; m < marks.length && cut < data.length; m++) {
        const end = m + 1 < marks.length ? Math.max(cut, marks[m + 1].from - start) : data.length;
        if (end <= cut) continue;
        const span = el("span", { class: "fresh" }, data.slice(cut, end));
        span.style.animationDelay = -Math.round(now - marks[m].time) + "ms";
        parts.push(span);
        cut = end;
      }
      text.replaceWith(...parts);
    }
  }
  function paint(animate) {
    const now = performance.now(), source = target.slice(0, shown);
    if (!node) slot.append(node = render(""));
    let cut = settledCut(source, settled.length);
    if (!source.startsWith(settled) || cut < settled.length) {
      node.replaceChildren();
      settled = "";
      settledLength = 0;
      tail = [];
      cut = settledCut(source);
    }
    const done = cut > settled.length ? render(source.slice(settled.length, cut)) : null, rest = render(source.slice(cut));
    const doneLength = done ? lengthOf(done) : 0, length = settledLength + doneLength + lengthOf(rest);
    if (animate && length > renderedLength) marks.push({ from: renderedLength, time: now });
    renderedLength = length;
    if (animate) {
      if (done) freshen(done, now, settledLength);
      freshen(rest, now, settledLength + doneLength);
    } else marks.length = 0;
    if (!(final && shown >= target.length)) ([...rest.querySelectorAll("p,li")].at(-1) || rest).append(el("span", { class: "msg-caret", "aria-hidden": "true" }));
    for (const old of tail) old.remove();
    if (done) {
      node.append(...done.childNodes);
      settled = source.slice(0, cut);
      settledLength += doneLength;
    }
    tail = [...rest.childNodes];
    node.append(...tail);
    last = now;
    onPaint?.();
  }
  function step() {
    frame = 0;
    if (gone) return;
    const behind = target.length - shown;
    if (behind > 0) {
      const next = Math.min(target.length, shown + Math.max(2, Math.ceil(behind / 15))), space = target.slice(next).search(/\s/);
      shown = space < 0 ? target.length : next + space;
    }
    const due = performance.now() - last >= PAINT || shown >= target.length;
    if (due) paint(true);
    if (shown < target.length || !due) frame = requestAnimationFrame(step);
  }
  return { node: slot, set(text, { done = true, live = false, paced: clocked = false } = {}) {
    if (gone) return;
    const value = String(text ?? "");
    if (value === target && done === final && node && paced === clocked) return;
    const continues = value.startsWith(target.slice(0, shown)), was = final;
    target = value;
    final = done;
    paced = clocked && live;
    if (!live || reduced() || !continues) {
      cancelAnimationFrame(frame);
      frame = 0;
      paced = false;
      shown = target.length;
      paint(false);
      return;
    }
    if (!node) {
      shown = 0;
      paint(false);
    }
    if (paced) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (was !== final && shown >= target.length) paint(false);
      return;
    }
    if (!frame) frame = requestAnimationFrame(step);
  }, show(n) {
    if (gone || !paced) return;
    if (stops?.[0] !== target) stops = [target, revealStops(target)];
    const want = Math.max(1, Math.ceil(n)), next = want >= target.length ? target.length : stops[1].find((stop) => stop >= want) ?? target.length;
    if (next <= shown) return;
    shown = next;
    paint(true);
  }, get length() {
    return target.length;
  }, get shown() {
    return shown;
  }, destroy() {
    gone = true;
    cancelAnimationFrame(frame);
    frame = 0;
  } };
}
const GLIDE = 36, END = 4, WANT = 600, SETTLE = 150;
export const glideStep = (left, view, frames = 1) => left > view ? left - view * 0.4 : Math.max(1.5, Math.min(left * (1 - 0.72 ** frames), Math.max(GLIDE, left * 0.1) * frames));
export function follower(scroller, jump, { onChange } = {}) {
  let pinned = true, frame = 0, setTop = -1, held = false, lastTop = 0, waiting = 0, last = 0, owned = false;
  let wanted = -Infinity, rose = -Infinity, finger = null, pull = 0;
  const gap = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  const put = (top) => {
    setTop = Math.round(Math.min(top, scroller.scrollHeight - scroller.clientHeight));
    scroller.scrollTop = setTop;
  };
  const update = () => {
    jump.hidden = pinned || gap() < 48;
    scroller.classList.toggle("is-scrolled", scroller.scrollTop > 2);
    scroller.classList.toggle("has-more", gap() > 2);
    onChange?.(pinned);
  };
  const glide = (time) => {
    frame = 0;
    const frames = last && time > last ? Math.min(3, (time - last) / 16.7) : 1;
    last = 0;
    if (!pinned) return;
    if (performance.now() < waiting) {
      frame = requestAnimationFrame(glide);
      return;
    }
    const left = gap();
    if (left <= 0.5) {
      update();
      return;
    }
    put(reduced() ? scroller.scrollHeight : scroller.scrollTop + glideStep(left, scroller.clientHeight, frames));
    last = time || 0;
    frame = requestAnimationFrame(glide);
  };
  const unpin = () => {
    if (!pinned) return;
    pinned = false;
    cancelAnimationFrame(frame);
    frame = 0;
    update();
  };
  const up = () => {
    owned = true;
    wanted = -Infinity;
    rose = performance.now();
    unpin();
  };
  const toward = () => {
    wanted = performance.now();
  };
  const wheel = (event) => {
    if (event.deltaY < 0) up();
    else if (event.deltaY > 0) toward();
  };
  const touch = (event) => {
    const y = event.touches?.[0]?.clientY, dy = y == null || finger == null ? null : y - finger;
    if (y != null) finger = y;
    if (dy != null && dy <= 0) {
      pull -= dy;
      if (pull > 6) toward();
      return;
    }
    pull = 0;
    if (gap() > 4) up();
  };
  const key = (event) => {
    if (["ArrowUp", "PageUp", "Home"].includes(event.key) || event.key === " " && event.shiftKey) up();
    else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) toward();
  };
  const hold = (event) => {
    held = true;
    finger = event?.touches?.[0]?.clientY ?? null;
    pull = 0;
  }, free = () => {
    held = false;
    finger = null;
  };
  const scroll = () => {
    const top = scroller.scrollTop, from = Math.max(lastTop, setTop), down = top >= from - 1, now = performance.now();
    if (top < lastTop) rose = now;
    lastTop = top;
    if (Math.abs(top - setTop) > 2) {
      const left = gap();
      setTop = -1;
      if (!pinned) {
        if (top > from && left < (owned && now - wanted > WANT && now - rose < SETTLE ? END : 24)) {
          pinned = true;
          owned = false;
        }
      } else if (left < 24 && !(held && !down)) {
      } else if (held || left > Math.max(160, scroller.clientHeight * 0.3)) {
        owned = held;
        pinned = false;
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) frame = requestAnimationFrame(glide);
    }
    update();
  };
  const toEnd = () => {
    pinned = true;
    owned = false;
    if (!frame) frame = requestAnimationFrame(glide);
    update();
  };
  scroller.addEventListener("wheel", wheel, { passive: true });
  scroller.addEventListener("touchmove", touch, { passive: true });
  scroller.addEventListener("keydown", key);
  scroller.addEventListener("scroll", scroll, { passive: true });
  scroller.addEventListener("pointerdown", hold);
  scroller.addEventListener("touchstart", hold, { passive: true });
  for (const type of ["pointerup", "touchend", "touchcancel"]) addEventListener(type, free, { passive: true });
  jump.addEventListener("click", toEnd);
  return { follow() {
    if (pinned && scroller.scrollTop < setTop - 2 && gap() <= 1) setTop = Math.round(scroller.scrollTop);
    if (pinned && reduced()) {
      put(scroller.scrollHeight);
      update();
      return;
    }
    if (pinned && !frame) frame = requestAnimationFrame(glide);
    else update();
  }, resized() {
    if (pinned && !frame) put(scroller.scrollHeight);
    update();
  }, wait(ms) {
    waiting = Math.max(waiting, performance.now() + ms);
  }, jump() {
    pinned = true;
    owned = false;
    waiting = 0;
    cancelAnimationFrame(frame);
    frame = 0;
    put(scroller.scrollHeight);
    update();
  }, toEnd, release: unpin, shift(delta) {
    if (delta) put(scroller.scrollTop + delta);
  }, update, get pinned() {
    return pinned;
  }, destroy() {
    cancelAnimationFrame(frame);
    frame = 0;
    scroller.removeEventListener("wheel", wheel);
    scroller.removeEventListener("touchmove", touch);
    scroller.removeEventListener("keydown", key);
    scroller.removeEventListener("scroll", scroll);
    jump.removeEventListener("click", toEnd);
    scroller.removeEventListener("pointerdown", hold);
    scroller.removeEventListener("touchstart", hold);
    for (const type of ["pointerup", "touchend", "touchcancel"]) removeEventListener(type, free);
  } };
}
