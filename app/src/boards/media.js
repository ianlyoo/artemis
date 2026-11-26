import { el, response, assetPath, problem, number } from "./dom.js";
import { dataTable } from "./graphics.js";
import { iconNode } from "./icons.js";
import { l10n } from "../names.js";
const tool = (name, label) => el("button", { type: "button", class: "bv-button bv-tool", "aria-label": label, title: label }, iconNode(name));
let pdfLibrary;
export async function openPdf(api, src, signal) {
  const path = assetPath(src);
  if (!path) throw new Error("Invalid asset");
  pdfLibrary ||= import("./vendor/pdf.js").catch((error) => {
    pdfLibrary = null;
    throw error;
  });
  const [library, data] = await Promise.all([pdfLibrary, response(api, path, signal).then((r) => r.arrayBuffer())]);
  library.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.js", import.meta.url).href;
  class BinaryDataFactory {
    async fetch({ kind, filename }) {
      const key = { cMapUrl: "cmaps/", standardFontDataUrl: "standard_fonts/" }[kind] + filename;
      const archive = await pdfResources(api), entry = archive.index[key];
      if (!entry) throw new Error("Unsupported PDF resource");
      return archive.bytes.slice(archive.offset + entry[0], archive.offset + entry[0] + entry[1]);
    }
  }
  return library.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false, useWasm: false, useWorkerFetch: false, BinaryDataFactory, isEvalSupported: false, enableXfa: false });
}
export function pageCanvas(page, width, label, most = 2) {
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  const dpr = Math.min(devicePixelRatio || 1, most, Math.sqrt(16e6 / (viewport.width * viewport.height)));
  const canvas = el("canvas", { role: "img", "aria-label": label });
  canvas.width = Math.ceil(viewport.width * dpr);
  canvas.height = Math.ceil(viewport.height * dpr);
  const task = page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
  return { canvas, viewport, task };
}
const packs = new WeakMap();
async function pdfResources(api) {
  if (!packs.has(api)) {
    const load = (async () => {
      const [{ default: lzma }, result] = await Promise.all([import("./vendor/lzma.js"), response(api, new URL("./vendor/pdf-data.bin", import.meta.url).pathname)]);
      const input = new Uint8Array(await result.arrayBuffer());
      const bytes = await new Promise((resolve, reject) => lzma.decompress(input, (value, error) => error ? reject(error) : resolve(Uint8Array.from(value))));
      const size = new DataView(bytes.buffer).getUint32(0, true), index = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + size))), offset = 4 + size;
      return { index, bytes, offset };
    })();
    packs.set(api, load);
    load.catch(() => packs.delete(api));
  }
  return packs.get(api);
}
export function sheet(block, env) {
  const root = el("div", { class: "bv-sheet" }), header = el("div", { class: "bv-media-toolbar" }), select = el("select", { "aria-label": "Worksheet" }), info = el("span", { class: "bv-media-meta" }), body = el("div"), footer = el("div", { class: "bv-pager" });
  const previous = tool("prev", "Previous rows"), next = tool("next", "Next rows"), range = el("span", { class: "bv-numeric", "aria-live": "polite" });
  header.append(select, info);
  footer.append(previous, range, next);
  root.append(header, body, footer);
  let sheets = [], selected = 0, page = 0;
  const pageSize = 100;
  const columnName = (index) => {
    let result = "", n = index + 1;
    while (n) {
      result = String.fromCharCode(65 + (n - 1) % 26) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };
  const show = () => {
    const data = sheets[selected];
    if (!data) {
      body.replaceChildren(problem("This worksheet is empty"));
      footer.hidden = true;
      return;
    }
    const rows = data.rows || [], cols = Math.max(data.header?.length || 0, ...rows.slice(0, 100).map((row) => row.length), 0), headers = Array.from({ length: cols }, (_, i) => data.header?.[i] || columnName(i));
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1));
    info.textContent = `${number(rows.length)} rows · ${number(cols)} columns`;
    const table = dataTable(headers, rows.slice(page * pageSize, (page + 1) * pageSize), { sortable: false, format: (cell) => cell?.t ?? "", numeric: (cell) => Number.isFinite(cell?.n) });
    if (data.freeze?.cols) table.classList.add("bv-freeze-first");
    body.replaceChildren(table);
    footer.hidden = rows.length <= pageSize;
    range.textContent = `${number(page * pageSize + (rows.length ? 1 : 0))}–${number(Math.min((page + 1) * pageSize, rows.length))} / ${number(rows.length)}`;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= rows.length;
  };
  select.addEventListener("change", () => {
    selected = Number(select.value);
    page = 0;
    show();
  });
  previous.addEventListener("click", () => {
    page--;
    show();
  });
  next.addEventListener("click", () => {
    page++;
    show();
  });
  const load = async () => {
    body.replaceChildren(el("p", { class: "bv-muted", role: "status" }, "Loading…"));
    try {
      const path = assetPath(block.src);
      if (!path) throw new Error("Invalid asset");
      const data = await (await response(env.api, path, env.signal)).json();
      if (env.signal.aborted) return;
      if (!Array.isArray(data.sheets)) throw new Error("Invalid sheets");
      sheets = data.sheets;
      select.replaceChildren(...sheets.map((item, i) => el("option", { value: i }, item.name)));
      select.disabled = sheets.length < 2;
      show();
    } catch (error) {
      if (!env.signal.aborted) {
        body.replaceChildren(problem("Couldn’t load this sheet", load));
        footer.hidden = true;
      }
    }
  };
  load();
  return root;
}
export function pdf(block, env) {
  const root = el("div", { class: "bv-pdf" }), toolbar = el("div", { class: "bv-media-toolbar" }), body = el("div", { class: "bv-pdf-page" });
  const previous = tool("prev", "Previous page"), next = tool("next", "Next page");
  const input = el("input", { type: "number", min: 1, value: 1, "aria-label": "PDF page", class: "bv-page-input" }), total = el("span", { class: "bv-numeric" }, `/ ${block.pages || "—"}`);
  const fit = tool("fit", "Fit width"), minus = tool("zoomOut", "Zoom out"), plus = tool("zoomIn", "Zoom in"), scaleLabel = el("span", { class: "bv-numeric" }, "100%");
  const continuous = el("button", { type: "button", class: "bv-button", "aria-pressed": "false", title: l10n("꽉 채워 보기", "Fill the width") }, l10n("꽉 채워 보기", "Fill the width"));
  const text = el("div", { class: "bv-pdf-text bv-prose" }), textDisclosure = el("details", { class: "bv-data-disclosure" }, el("summary", {}, "Page text"), text);
  toolbar.append(previous, input, total, next, el("span", { class: "bv-toolbar-space" }), minus, scaleLabel, plus, fit, continuous);
  root.append(toolbar, body, textDisclosure);
  let document = null, loadingTask = null, renderTask = null, pageNumber = 1, zoom = 1, generation = 0, resizeFrame = 0, lastWidth = 0;
  let observer, pageObserver, continuousMode = false, tasks = new Set();
  const controls = (enabled) => {
    for (const control of [previous, next, input, minus, plus, fit, continuous]) control.disabled = !enabled;
  };
  controls(false);
  function stopPages() {
    pageObserver?.disconnect();
    pageObserver = null;
    for (const task of tasks) task.cancel();
    tasks.clear();
    for (const canvas of body.querySelectorAll("canvas")) canvas.width = canvas.height = 0;
  }
  async function renderContinuous() {
    const current = ++generation;
    renderTask?.cancel();
    stopPages();
    body.classList.add("bv-pdf-continuous");
    const pages = await Promise.all(Array.from({ length: document.numPages }, (_, i) => document.getPage(i + 1)));
    if (current !== generation || env.signal.aborted) return;
    const width = body.clientWidth;
    const slots = pages.map((page, i) => {
      const unit = page.getViewport({ scale: 1 });
      const slot = el("div", { class: "bv-pdf-slot", "data-page": i + 1 });
      slot.style.aspectRatio = `${unit.width} / ${unit.height}`;
      return slot;
    });
    body.replaceChildren(...slots);
    pageObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.firstChild) continue;
        const slot = entry.target, index = Number(slot.dataset.page) - 1;
        const { canvas, task } = pageCanvas(pages[index], width, `PDF page ${index + 1} of ${document.numPages}`);
        canvas.style.width = "100%";
        slot.append(canvas);
        tasks.add(task);
        task.promise.catch((error) => {
          if (error.name !== "RenderingCancelledException") {
            canvas.remove();
            slot.append(problem("Couldn’t show this page", renderContinuous));
          }
        }).finally(() => tasks.delete(task));
      }
    }, { root: body, rootMargin: "300px 0px" });
    slots.forEach((slot) => pageObserver.observe(slot));
    scrollToPage();
  }
  function scrollToPage() {
    const slot = body.querySelector(`[data-page="${pageNumber}"]`);
    if (slot) body.scrollTop += slot.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientTop;
  }
  function showPage() {
    if (continuousMode) scrollToPage();
    else render();
  }
  async function render() {
    if (continuousMode) return renderContinuous();
    stopPages();
    body.classList.remove("bv-pdf-continuous");
    if (!document || env.signal.aborted) return;
    const current = ++generation;
    renderTask?.cancel();
    previous.disabled = pageNumber <= 1;
    next.disabled = pageNumber >= document.numPages;
    input.value = pageNumber;
    input.max = document.numPages;
    scaleLabel.textContent = `${Math.round(zoom * 100)}%`;
    try {
      const page = await document.getPage(pageNumber);
      if (current !== generation || env.signal.aborted) return;
      const drawn = pageCanvas(page, Math.max(280, body.clientWidth - 24) * zoom, `PDF page ${pageNumber} of ${document.numPages}`), { canvas, viewport } = drawn;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      body.replaceChildren(canvas);
      root.setAttribute("aria-busy", "true");
      renderTask = drawn.task;
      await renderTask.promise;
      if (current !== generation || env.signal.aborted) return;
      root.setAttribute("aria-busy", "false");
      root.dataset.renderedPage = pageNumber;
      const content = await page.getTextContent();
      if (current !== generation || env.signal.aborted) return;
      const lines = [];
      let line = "";
      for (const item of content.items) if ("str" in item) {
        line += item.str + " ";
        if (item.hasEOL) {
          lines.push(line.trim());
          line = "";
        }
      }
      if (line.trim()) lines.push(line.trim());
      text.textContent = lines.join("\n") || "No selectable text on this page";
    } catch (error) {
      if (current === generation && !env.signal.aborted && error.name !== "RenderingCancelledException") body.replaceChildren(problem("Couldn’t show this page", render));
    }
  }
  const load = async () => {
    controls(false);
    observer?.disconnect();
    observer = null;
    renderTask?.cancel();
    if (loadingTask) {
      const previousTask = loadingTask;
      loadingTask = null;
      document = null;
      await previousTask.destroy().catch(() => {
      });
    }
    if (env.signal.aborted) return;
    body.replaceChildren(el("p", { class: "bv-muted", role: "status" }, "Loading…"));
    try {
      const task = await openPdf(env.api, block.src, env.signal);
      if (env.signal.aborted) {
        task.destroy().catch(() => {
        });
        return;
      }
      loadingTask = task;
      document = await loadingTask.promise;
      if (env.signal.aborted) {
        await loadingTask.destroy();
        return;
      }
      total.textContent = `/ ${document.numPages}`;
      controls(true);
      await render();
      lastWidth = body.clientWidth;
      observer = new ResizeObserver(() => {
        if (Math.abs(body.clientWidth - lastWidth) < 2) return;
        lastWidth = body.clientWidth;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(render);
      });
      observer.observe(body);
    } catch (error) {
      if (loadingTask) {
        const failedTask = loadingTask;
        loadingTask = null;
        document = null;
        await failedTask.destroy().catch(() => {
        });
      }
      if (!env.signal.aborted) {
        body.replaceChildren(problem("Couldn’t load this PDF", load));
        controls(false);
        root.removeAttribute("aria-busy");
      }
    }
  };
  body.addEventListener("scroll", () => {
    if (!continuousMode) return;
    const top = body.getBoundingClientRect().top;
    const current = [...body.querySelectorAll(".bv-pdf-slot")].find((slot) => slot.getBoundingClientRect().bottom > top + 2);
    if (current) {
      pageNumber = Number(current.dataset.page);
      input.value = pageNumber;
      previous.disabled = pageNumber <= 1;
      next.disabled = pageNumber >= document.numPages;
    }
  });
  continuous.addEventListener("click", () => {
    continuousMode = !continuousMode;
    const label = continuousMode ? l10n("원래 보기", "Original size") : l10n("꽉 채워 보기", "Fill the width");
    continuous.textContent = continuous.title = label;
    continuous.setAttribute("aria-pressed", String(continuousMode));
    for (const control of [minus, plus, fit]) control.disabled = continuousMode;
    render();
  });
  previous.addEventListener("click", () => {
    pageNumber = Math.max(1, pageNumber - 1);
    showPage();
  });
  next.addEventListener("click", () => {
    pageNumber = Math.min(document.numPages, pageNumber + 1);
    showPage();
  });
  input.addEventListener("change", () => {
    pageNumber = Math.max(1, Math.min(document?.numPages || 1, Math.round(Number(input.value) || 1)));
    showPage();
  });
  minus.addEventListener("click", () => {
    zoom = Math.max(0.5, zoom - 0.25);
    render();
  });
  plus.addEventListener("click", () => {
    zoom = Math.min(3, zoom + 0.25);
    render();
  });
  fit.addEventListener("click", () => {
    zoom = 1;
    render();
  });
  env.own(() => {
    generation++;
    renderTask?.cancel();
    stopPages();
    observer?.disconnect();
    cancelAnimationFrame(resizeFrame);
    loadingTask?.destroy().catch(() => {
    });
    for (const canvas of root.querySelectorAll("canvas")) canvas.width = canvas.height = 0;
  });
  load();
  return root;
}
