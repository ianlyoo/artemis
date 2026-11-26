import { el, svg } from "./dom.js";
import { when } from "./format.js";
import { openPdf, pageCanvas } from "./media.js";
import { mountIsland } from "../islands/island.js";
import { INK, LIMITS, fitInk, inkWidth, compactLines } from "./sign-ink.js";
import { userKo } from "../names.js";
const REQUEST_NUMBERS = 3e4;
const percent = (value) => (value * 100).toFixed(4) + "%";
const KINDS = { sign: { tag: "여기에 서명", go: "서명하기", again: "다시 그리기", name: "서명", line: "여기에 서명하세요", hint: "" }, write: { tag: "여기에 쓰기", go: "쓰기", again: "다시 쓰기", name: "쓰기", line: "여기에 쓰세요", hint: "크게 쓰면 칸에 맞춰 줄여 넣어요" } };
export const kindOf = (place) => place?.kind === "write" ? KINDS.write : KINDS.sign;
export function readingOrder(places) {
  const middle = (place) => place.box[1] + place.box[3] / 2, rows = [];
  for (const place of [...places].sort((a, b) => a.page - b.page || middle(a) - middle(b))) {
    const row = rows.at(-1);
    if (row && row.page === place.page && middle(place) <= row.bottom) row.places.push(place);
    else rows.push({ page: place.page, bottom: place.box[1] + place.box[3], places: [place] });
  }
  return rows.flatMap((row) => row.places.sort((a, b) => a.box[0] - b.box[0]));
}
export function nextPlace(order, drawn, after = null) {
  const from = order.findIndex((place) => place.id === after);
  for (let step = 1; step <= order.length; step++) {
    const place = order[(from + step + order.length) % order.length];
    if (place.id !== after && !drawn.has(place.id)) return place;
  }
  return null;
}
export function tally(places, done) {
  const writes = places.filter((place) => place.kind === "write").length, signs = places.length - writes;
  if (!writes) return { all: `서명할 곳 ${signs}곳`, now: `서명할 곳 ${signs}곳 · ${done}곳 그렸어요`, where: "서명할 곳이", left: (n) => `${n}곳 더 그리면 보낼 수 있어요` };
  if (!signs) return { all: `쓸 곳 ${writes}곳`, now: `쓸 곳 ${writes}곳 · ${done}곳 썼어요`, where: "쓸 곳이", left: (n) => `${n}곳 더 쓰면 보낼 수 있어요` };
  return { all: `서명 ${signs}곳 · 쓰기 ${writes}곳`, now: `서명 ${signs}곳 · 쓰기 ${writes}곳 · ${done}곳 했어요`, where: "채울 곳이", left: (n) => `${n}곳 더 채우면 보낼 수 있어요` };
}
export const SPOTS = ["above-left", "above-right", "below-left", "below-right"];
export function tagSpot(box, [width, height, gap], page, keep) {
  const [x, top, w, h] = box, meets = (a, b) => Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]);
  for (const spot of SPOTS) {
    const rect = [spot.endsWith("left") ? x : x + w - width, spot.startsWith("above") ? top - gap - height : top + h + gap, width, height];
    if (rect[0] >= 0 && rect[1] >= 0 && rect[0] + width <= page[0] && rect[1] + height <= page[1] && !keep.some((other) => meets(rect, other))) return { spot, rect };
  }
  return null;
}
const documentKey = (block) => JSON.stringify([block.src, block.sha256, block.places, block.error ?? null, block.signed ?? null]);
export function boardTarget(board) {
  return { post: "/canvas/sign", names: { board }, gone: "이 서명 칸이 보드에서 빠졌어요", async read(api, slot, signal) {
    const result = await api("/canvas/boards/" + encodeURIComponent(board), { signal });
    if (result.status === 401) return { login: true };
    if (!result.ok) return {};
    const read = await result.json(), block = read?.blocks?.find((each) => each?.type === "sign" && each.slot === slot);
    return block ? { block } : { gone: true };
  } };
}
export function signRequest(names, block, drawings) {
  const budget = Math.min(LIMITS.place, Math.floor(REQUEST_NUMBERS / Math.max(block.places.length, 1)));
  return { ...names, slot: block.slot, sha256: block.sha256, places: block.places.map((place) => {
    const drawing = drawings.get(place.id);
    return { id: place.id, aspect: drawing.aspect, lines: compactLines(drawing.lines, drawing.aspect, budget) };
  }) };
}
export function refusal(status, error) {
  switch (error) {
    case "changed":
      return { words: "문서가 바뀌었어요. 새로 요청해 주세요", reread: true };
    case "missing":
      return { words: "서류를 찾을 수 없어요. 새로 요청해 주세요", reread: true };
    case "document_mismatch":
    case "places_mismatch":
      return { words: "서류가 그사이 바뀌었어요. 새 서류를 불러올게요", reread: true };
    case "already_signed":
      return { words: "이미 서명된 서류예요", reread: true };
    case "unknown_slot":
      return { words: "이 서명 칸을 찾을 수 없어요", reread: true };
    case "not_answerable":
      return { words: "이 보드에서는 서명할 수 없어요" };
    case "unknown_board":
      return { words: "이 보드를 찾을 수 없어요" };
    case "unsupported":
      return { words: "이 서류는 여기서 서명할 수 없어요" };
    case "invalid_value":
      return { words: "서명을 저장하지 못했어요. 다시 그려 주세요", redo: true };
  }
  if (!status || status >= 500) return { words: "연결이 끊겨 보내지 못했어요", retry: true };
  return { words: "서명을 보내지 못했어요. 다시 보내 주세요", retry: true };
}
const BLOCK_ERRORS = { changed: "문서가 바뀌었어요. 새로 요청해 주세요", missing: "서류를 찾을 수 없어요. 새로 요청해 주세요" };
export function inkPreview(drawing, box) {
  const lines = fitInk(drawing.lines, drawing.aspect, box);
  const path = lines.map((line) => {
    const count = line.length / 2;
    if (count === 1) return `M${line[0].toFixed(2)} ${line[1].toFixed(2)}h.01`;
    let d = `M${line[0].toFixed(2)} ${line[1].toFixed(2)}`;
    for (let i = 1; i < count - 1; i++) d += `Q${line[i * 2].toFixed(2)} ${line[i * 2 + 1].toFixed(2)} ${((line[i * 2] + line[i * 2 + 2]) / 2).toFixed(2)} ${((line[i * 2 + 1] + line[i * 2 + 3]) / 2).toFixed(2)}`;
    return d + `L${line[count * 2 - 2].toFixed(2)} ${line[count * 2 - 1].toFixed(2)}`;
  }).join("");
  return svg("svg", { class: "bv-sign-ink", viewBox: `0 0 ${box[2]} ${box[3]}`, "aria-hidden": "true", focusable: "false" }, svg("path", { d: path, fill: "none", stroke: INK, "stroke-width": inkWidth(box[3]), "stroke-linecap": "round", "stroke-linejoin": "round" }));
}
export function signSlot(block, node, env) {
  const target = env?.signTo ?? (env?.answer?.board ? boardTarget(env.answer.board) : null);
  const state = el("span", { class: "bv-sign-state", role: "status", "aria-live": "polite" });
  const head = el("div", { class: "bv-sign-head" }, el("span", { class: "bv-sign-who" }, userKo() + " 서명"), state);
  const note = el("p", { class: "bv-sign-note" });
  const pages = el("div", { class: "bv-sign-pages" });
  const send = el("button", { type: "button", class: "bv-sign-send", disabled: true }, "서명 완료");
  const said = el("span", { class: "bv-sign-said", role: "status", "aria-live": "polite" });
  const foot = el("div", { class: "bv-sign-foot" }, send, said);
  const root = el("div", { class: "bv-sign" }, head, note, pages, foot);
  node.append(root);
  const drawings = new Map();
  let current = block, key = documentKey(block), phase = "ready", notice = "", shown = null, pad = null, padHost = null, padMade = null, gone = false, after = null;
  const live = () => !!target && !current.error && !current.signed;
  const say = (words) => {
    if (said.textContent !== words) said.textContent = words;
  };
  const places = () => Array.isArray(current.places) ? current.places : [];
  const complete = () => places().length > 0 && places().every((place) => drawings.has(place.id));
  function showPages(src, mode) {
    const wanted = JSON.stringify([src, places(), mode]);
    if (shown?.wanted === wanted) {
      marks();
      return;
    }
    shown?.close();
    shown = pagesOf(src, mode);
    shown.wanted = wanted;
  }
  function pagesOf(src, mode) {
    const controller = new AbortController(), signal = controller.signal, figures = [];
    const stop = () => controller.abort();
    env?.signal?.addEventListener("abort", stop, { once: true });
    let task = null, observer = null, frame = 0;
    pages.replaceChildren(el("p", { class: "bv-sign-loading" }, "서류를 불러오는 중…"));
    (async () => {
      task = await openPdf(env.api, src, signal);
      if (signal.aborted) {
        task.destroy().catch(() => {
        });
        return;
      }
      const pdf = await task.promise;
      const total = Number(pdf.numPages) || 0, numbers = [...new Set(places().map((place) => place.page))].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
      for (const number of numbers) {
        const page = await pdf.getPage(number);
        if (signal.aborted) return;
        const base = page.getViewport({ scale: 1 }), onPage = mode === "signed" ? [] : readingOrder(places()).filter((place) => place.page === number);
        const text = mode === "sign" ? await page.getTextContent().catch(() => null) : null;
        if (signal.aborted) return;
        const words = (text?.items ?? []).filter((item) => item.str?.trim() && item.transform).map((item) => {
          const [left, line] = base.convertToViewportPoint(item.transform[4], item.transform[5]), height = item.height || Math.hypot(item.transform[2], item.transform[3]);
          return [left, line - height, item.width, height * 1.2];
        });
        const sheet = el("div", { class: "bv-sign-sheet", style: { "aspect-ratio": `${base.width} / ${base.height}` } });
        const rows = [];
        for (const place of onPage) {
          const [x, top, width, height] = place.box;
          const mark = el("div", { class: "bv-sign-mark", "data-place": place.id, "aria-hidden": "true", style: { left: percent(x / base.width), top: percent(top / base.height), width: percent(width / base.width), height: percent(height / base.height) } });
          sheet.append(mark);
          if (mode !== "sign") continue;
          mark.addEventListener("click", () => openPad(place));
          rows.push(el("button", { type: "button", class: "bv-sign-row", "data-place": place.id, onclick: () => openPad(place) }, el("span", { class: "bv-sign-label" }, place.label || kindOf(place).name), el("span", { class: "bv-sign-go" })));
        }
        figures.push({ number, page, base, words, places: onPage, sheet, width: 0, canvas: null, render: null, figure: el("figure", { class: "bv-sign-page", "data-page": String(number) }, sheet, rows.length ? el("figcaption", { class: "bv-sign-rows" }, rows) : null) });
      }
      if (signal.aborted) return;
      pages.replaceChildren(...figures.map((each) => each.figure));
      marks(total);
      const paint = () => {
        frame = 0;
        for (const each of figures) {
          const width = Math.round(each.sheet.clientWidth);
          if (!width || width === each.width) continue;
          each.width = width;
          each.render?.task.cancel();
          const drawn = pageCanvas(each.page, width, `${each.number}쪽`, 3);
          each.render = drawn;
          drawn.canvas.className = "bv-sign-canvas";
          drawn.task.promise.then(() => {
            if (signal.aborted || each.render !== drawn) return;
            each.canvas?.remove();
            each.canvas = drawn.canvas;
            each.sheet.prepend(drawn.canvas);
          }, () => {
          });
        }
        tags();
      };
      paint();
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(() => {
          if (!frame) frame = requestAnimationFrame(paint);
        });
        observer.observe(pages);
      }
    })().catch(() => {
      if (signal.aborted) return;
      pages.replaceChildren(el("p", { class: "bv-sign-problem" }, "서류를 불러오지 못했어요 ", el("button", { type: "button", class: "bv-sign-again", onclick: () => {
        shown = null;
        draw();
      } }, "다시 불러오기")));
    });
    function tags() {
      for (const each of figures) {
        const scale = each.sheet.clientWidth / each.base.width;
        if (!scale) continue;
        const keep = [...each.words, ...each.places.map((place) => place.box)], placeOf = (tag) => each.places.find((one) => one.id === tag.parentNode.dataset.place);
        const rank = (tag) => (tag.parentNode.classList.contains("is-next") ? 0 : 2) + (placeOf(tag)?.kind === "write" ? 1 : 0);
        for (const tag of [...each.sheet.querySelectorAll(".bv-sign-tag")].sort((a, b) => rank(a) - rank(b))) {
          const place = placeOf(tag);
          tag.hidden = false;
          const found = place && tagSpot(place.box, [tag.offsetWidth / scale, tag.offsetHeight / scale, 3.5 / scale], [each.base.width, each.base.height], keep.filter((rect) => rect !== place.box));
          tag.hidden = !found;
          if (found) {
            tag.dataset.at = found.spot;
            keep.push(found.rect);
          }
        }
      }
    }
    return { tags, close() {
      stop();
      env?.signal?.removeEventListener("abort", stop);
      observer?.disconnect();
      cancelAnimationFrame(frame);
      for (const each of figures) each.render?.task.cancel();
      task?.destroy().catch(() => {
      });
    } };
  }
  function marks(total = current.pages) {
    const all = places(), done = all.filter((place) => drawings.has(place.id)).length, words = tally(all, done);
    const next = live() && ["ready", "retry"].includes(phase) ? nextPlace(readingOrder(all), drawings, after) : null;
    for (const place of all) {
      const drawn = drawings.get(place.id), kind = kindOf(place), shows = drawn ?? (live() ? kind.tag : null);
      for (const mark of pages.querySelectorAll(`.bv-sign-mark[data-place="${CSS.escape(place.id)}"]`)) {
        mark.classList.toggle("is-next", place === next);
        if (mark.shows === shows) continue;
        mark.shows = shows;
        mark.classList.toggle("is-drawn", !!drawn);
        mark.replaceChildren(...drawn ? [inkPreview(drawn, place.box)] : shows ? [el("span", { class: "bv-sign-tag" }, shows)] : []);
      }
      for (const row of pages.querySelectorAll(`.bv-sign-row[data-place="${CSS.escape(place.id)}"]`)) {
        row.classList.toggle("is-drawn", !!drawn);
        row.setAttribute("aria-label", `${place.label || kind.name} · ${drawn ? kind.again : kind.go}`);
        row.querySelector(".bv-sign-go").textContent = drawn ? kind.again : kind.go;
      }
    }
    shown?.tags?.();
    const count = Number(total) || 0, withPlaces = new Set(all.map((place) => place.page)).size;
    note.textContent = count ? `서류 ${count}쪽 중 ${words.where} 있는 ${withPlaces}쪽` : "";
    if (!live()) return;
    state.textContent = words.now;
    const ready = done === all.length && all.length > 0;
    if (phase === "ready") {
      send.disabled = !ready;
      say(notice || (ready ? "" : words.left(all.length - done)));
    }
  }
  function island() {
    if (!padMade) {
      padHost = el("div", { class: "bv-sign-pad" });
      document.body.append(padHost);
      padMade = (env.island ?? mountIsland)("sign-pad", padHost, { open: false }).then((made) => {
        if (gone) {
          made.unmount();
          return null;
        }
        pad = made;
        return made;
      }, () => {
        padHost?.remove();
        padHost = null;
        padMade = null;
        say("서명 칸을 열지 못했어요. 다시 눌러 주세요");
        return null;
      });
    }
    return padMade;
  }
  async function openPad(place) {
    if (!live() || !["ready", "retry"].includes(phase)) return;
    const made = await island();
    if (!made || gone || !live()) return;
    const order = readingOrder(places()), kind = kindOf(place), forDocument = key;
    made.update({ open: true, title: place.label || kind.name, note: `${order.indexOf(place) + 1} / ${order.length}`, hint: kind.hint, line: kind.line, confirm: nextPlace(order, drawings, place.id) ? "다음 칸" : "확인", place: place.id + "\n" + Date.now(), onCancel: closePad, onConfirm: (drawing) => {
      if (forDocument !== key || !live()) {
        closePad();
        return;
      }
      const was = complete();
      drawings.set(place.id, { aspect: drawing.aspect, lines: drawing.lines });
      notice = "";
      after = place.id;
      if (phase === "retry") {
        phase = "ready";
        send.textContent = "서명 완료";
      }
      marks();
      const next = nextPlace(readingOrder(places()), drawings, place.id);
      if (next) {
        void openPad(next);
        return;
      }
      closePad();
      if (!was && complete()) foot.scrollIntoView?.({ block: "center" });
    } });
  }
  function closePad() {
    pad?.update({ open: false });
  }
  async function submit() {
    if (!live() || !["ready", "retry"].includes(phase) || places().some((place) => !drawings.has(place.id))) return;
    phase = "sending";
    send.disabled = true;
    send.textContent = "저장 중…";
    say("");
    root.dataset.phase = phase;
    const forDocument = key;
    let result = null, body = null;
    try {
      result = await env.api(target.post, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signRequest(target.names, current, drawings)) });
      body = await result.json().catch(() => null);
    } catch {
    }
    if (gone || forDocument !== key) return;
    if (result?.status === 401) {
      location.assign("/login");
      return;
    }
    if (result?.ok && body?.ok !== false) {
      phase = "sent";
      drawings.clear();
      root.dataset.phase = phase;
      send.hidden = true;
      say("서명했어요 · 서명본을 불러오는 중…");
      if (body?.at) state.textContent = "서명됨 · " + when(body.at);
      if (body?.block?.type === "sign" && body.block.slot === current.slot) refresh(body.block);
      else void reread();
      return;
    }
    const meant = refusal(result?.status ?? 0, body?.error);
    if (meant.retry) {
      phase = "retry";
      send.disabled = false;
      send.textContent = "다시 보내기";
      say(meant.words);
      root.dataset.phase = phase;
      return;
    }
    if (meant.redo) {
      phase = "ready";
      drawings.clear();
      after = null;
      notice = meant.words;
      send.textContent = "서명 완료";
      root.dataset.phase = phase;
      marks();
      return;
    }
    phase = "stopped";
    root.dataset.phase = phase;
    send.hidden = true;
    say(meant.words);
    if (meant.reread) void reread(meant.words);
  }
  send.addEventListener("click", submit);
  async function reread(words = "") {
    try {
      const read = await target.read(env.api, current.slot, env.signal);
      if (read.login) {
        location.assign("/login");
        return;
      }
      if (gone) return;
      if (read.block) refresh(read.block, words);
      else if (read.gone) {
        phase = "stopped";
        send.hidden = true;
        say(target.gone ?? "이 서명 칸을 찾을 수 없어요");
      }
    } catch {
    }
  }
  function draw() {
    const error = current.error, signed = current.signed;
    root.dataset.phase = phase;
    root.dataset.state = error ? "error" : signed ? "signed" : target ? "open" : "read";
    if (error) {
      shown?.close();
      shown = null;
      pages.replaceChildren();
      note.textContent = "";
      state.textContent = "서명할 수 없어요";
      foot.hidden = false;
      send.hidden = true;
      say(BLOCK_ERRORS[error] ?? "이 서류는 여기서 서명할 수 없어요");
      return;
    }
    if (signed) {
      state.textContent = "서명됨 · " + when(signed.at);
      foot.hidden = true;
      send.hidden = true;
      say("");
      showPages(signed.src, "signed");
      return;
    }
    if (!target) {
      state.textContent = tally(places(), 0).all;
      foot.hidden = false;
      send.hidden = true;
      say("여기서는 서명할 수 없어요");
      showPages(current.src, "read");
      return;
    }
    foot.hidden = false;
    send.hidden = phase === "stopped" || phase === "sent";
    showPages(current.src, "sign");
  }
  function refresh(next, words = "") {
    const nextKey = documentKey(next);
    current = next;
    if (nextKey !== key) {
      key = nextKey;
      drawings.clear();
      after = null;
      closePad();
      phase = "ready";
      notice = words;
      send.textContent = "서명 완료";
      send.disabled = true;
      say(words);
    }
    draw();
  }
  env?.own?.(() => {
    gone = true;
    shown?.close();
    drawings.clear();
    pad?.unmount();
    padHost?.remove();
  });
  globalThis.homePreload?.("islands/sign-pad.js");
  draw();
  return target ? refresh : null;
}
