export const graphZoomScale = (scale, factor, fitScale = 0.3) => Math.max(Math.min(0.3, fitScale), Math.min(4, scale * factor));
export function createGraphView(panel, graph, { start, finish, layout, resize = null }) {
  const world = panel.querySelector("#graph-world"), pointers = new Map();
  let frame = 0, drag = null, size = "", panelSize = "", resizeFrame = 0, panning = false, fitTimer = 0, fitting = false;
  const cancelFit = () => {
    clearTimeout(fitTimer);
    fitTimer = 0;
    fitting = false;
  };
  const write = () => {
    frame = 0;
    world.style.transform = "translate(" + graph.x + "px," + graph.y + "px) scale(" + graph.k + ")";
  };
  const apply = () => {
    if (!frame) frame = requestAnimationFrame(write);
  };
  const moved = () => {
    const pending = fitting;
    cancelFit();
    cancelAnimationFrame(resizeFrame);
    graph.fitted = false;
    if (pending) layout();
    apply();
  };
  const measure = () => panel.clientWidth + "x" + panel.clientHeight + "/" + world.offsetWidth + "x" + world.offsetHeight;
  const zoom = (factor, p = { x: panel.clientWidth / 2, y: panel.clientHeight / 2 }) => {
    const k = graphZoomScale(graph.k, factor, graph.fitScale), ratio = k / graph.k;
    graph.x = p.x - (p.x - graph.x) * ratio;
    graph.y = p.y - (p.y - graph.y) * ratio;
    graph.k = k;
    moved();
  };
  const fit = () => {
    cancelFit();
    cancelAnimationFrame(resizeFrame);
    const w = panel.clientWidth, h = panel.clientHeight, m = Math.min(28, w * 0.025, h * 0.03);
    if (!world.isConnected || !w || !h) return;
    panelSize = w + "x" + h;
    const scale = (density) => {
      panel.dataset.density = density;
      return Math.min(1.3, (w - m * 2) / world.offsetWidth, (h - m * 2) / world.offsetHeight);
    };
    const finish2 = (fits2) => {
      const best = Math.min(1, Math.max(...fits2.map((f) => f[1]))), density = fits2.find(([, k2]) => k2 >= best * 0.9)[0], k = scale(density);
      layout();
      graph.k = Math.max(0.05, k);
      graph.fitScale = graph.k;
      graph.fitted = true;
      graph.x = Math.max(m, (w - world.offsetWidth * graph.k) / 2);
      graph.y = Math.max(m, (h - world.offsetHeight * graph.k) / 2);
      cancelAnimationFrame(frame);
      write();
      size = measure();
      fitting = false;
      fitTimer = 0;
    };
    const densities = ["roomy", "compact", "line"];
    if (world.querySelectorAll(".net-lane").length <= 20) {
      finish2(densities.map((d) => [d, scale(d)]));
      return;
    }
    const shown = panel.dataset.density, fits = [];
    fitting = true;
    const step = () => {
      if (!world.isConnected) {
        cancelFit();
        return;
      }
      if (panel.clientWidth !== w || panel.clientHeight !== h) {
        fit();
        return;
      }
      if (fits.length === densities.length) {
        finish2(fits);
        return;
      }
      const density = densities[fits.length];
      fits.push([density, scale(density)]);
      if (shown == null) delete panel.dataset.density;
      else panel.dataset.density = shown;
      fitTimer = setTimeout(step, 0);
    };
    fitTimer = setTimeout(step, 0);
  };
  const coords = (e) => {
    const r = panel.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const wheel = (e) => {
    e.preventDefault();
    if (pointers.size) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? panel.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * unit * 2e-3), coords(e));
    else {
      graph.x -= e.deltaX * unit;
      graph.y -= e.deltaY * unit;
      moved();
    }
  };
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const down = (e) => {
    if (pointers.has(e.pointerId)) up(e);
    if (e.button !== 0 || pointers.size >= 2 || e.target.closest("button,a")) return;
    const p = coords(e);
    pointers.set(e.pointerId, p);
    drag = pointers.size === 1 ? { p, x: graph.x, y: graph.y, moved: false } : null;
  };
  const move = (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (!e.buttons && e.pointerType !== "touch") return up(e);
    const previous = pointers.size === 2 ? pair() : null, p = coords(e);
    pointers.set(e.pointerId, p);
    if (previous) {
      const next = pair();
      zoom(next.d / Math.max(1, previous.d), previous);
      graph.x += next.x - previous.x;
      graph.y += next.y - previous.y;
      return;
    }
    const dx = p.x - drag.p.x, dy = p.y - drag.p.y;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) <= 3) return;
      drag.moved = panning = true;
      panel.setPointerCapture(e.pointerId);
      panel.classList.add("dragging");
      start();
    }
    graph.x = drag.x + dx;
    graph.y = drag.y + dy;
    moved();
  };
  const end = () => {
    const settle = panning || drag?.moved;
    pointers.clear();
    drag = null;
    panning = false;
    panel.classList.remove("dragging");
    if (settle) finish();
  };
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (panel.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId);
    if (pointers.size) {
      const p = [...pointers.values()][0];
      drag = { p, x: graph.x, y: graph.y, moved: true };
      return;
    }
    end();
  };
  const observer = new ResizeObserver(() => {
    if (fitting) return;
    const next = measure(), resized = next.split("/")[0] !== panelSize;
    if (next === size) return;
    size = next;
    panelSize = next.split("/")[0];
    if (resized || graph.fitted) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize ?? fit);
    }
  });
  observer.observe(panel);
  observer.observe(world);
  panel.addEventListener("wheel", wheel, { passive: false });
  const handlers = { pointerdown: down, pointermove: move, lostpointercapture: up }, releases = { pointerup: up, pointercancel: up };
  for (const [name, handler] of Object.entries(handlers)) panel.addEventListener(name, handler);
  for (const [name, handler] of Object.entries(releases)) document.addEventListener(name, handler, true);
  return { panel, apply, zoom, fit, get fitting() {
    return fitting;
  }, destroy() {
    end();
    cancelFit();
    observer.disconnect();
    cancelAnimationFrame(resizeFrame);
    cancelAnimationFrame(frame);
    panel.removeEventListener("wheel", wheel);
    for (const [name, handler] of Object.entries(handlers)) panel.removeEventListener(name, handler);
    for (const [name, handler] of Object.entries(releases)) document.removeEventListener(name, handler, true);
  } };
}
