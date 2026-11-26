import { svg } from "./icons.js";
import { patch } from "./dom-patch.js";
import { normalize, mergeCompleted, overlapsCompleted, completedCounts } from "./completed-items.js";
import { filtersHTML, loadHTML, recordTableHTML, recordMissingHTML, pagerHTML } from "./completed-view.js";
export function createCompletedPanel(root, { api, counted = () => {
}, closed = () => {
  location.hash = "#/admin";
} } = {}) {
  if (!document.querySelector("link[data-completed-panel-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./completed-panel.css", import.meta.url).href;
    link.dataset.completedPanelStyle = "";
    document.head.append(link);
  }
  root.className = "completed-panel adm-completed";
  root.setAttribute("aria-labelledby", "completed-heading");
  root.innerHTML = '<header class="cp-head"><h2 id="completed-heading">Completed <span data-cp-total>0</span></h2><button type="button" class="lib-ibtn" data-cp-close aria-label="Close completed" title="Close completed">' + svg("close", { klass: "lib-ico" }) + '</button></header><div class="cp-filters"></div><div class="cp-scroll"><div class="cp-columns" aria-hidden="true"><span>Goal / Result</span><span>State</span><span>Finished</span><span></span></div><div class="cp-list"></div></div><footer class="cp-foot"><div class="cp-load"></div><div class="cp-pager"></div></footer>';
  const $ = (s) => root.querySelector(s), scroll = $(".cp-scroll");
  let items = [], next = null, total = 0, counts = null, selected = null, filter = "all", signature = "", version = 0;
  let busy = false, error = false, missing = false, wanted = null, projects = new Map(), opener = null, resolving = false;
  let read = null;
  const visible = () => items.filter((g) => filter === "all" || g.status === filter);
  const page = async (cursor, limit = 50) => {
    const response = await api("/completed?before=" + encodeURIComponent(cursor) + "&limit=" + limit, { signal: read?.signal });
    if (!response.ok) throw Error("Completed unavailable");
    const data = normalize(await response.json());
    if (!data) throw Error("Invalid completed page");
    return data;
  };
  function render() {
    counted(total);
    if (!root.open) return;
    const count = $("[data-cp-total]");
    if (count.textContent !== String(total)) count.textContent = total;
    patch($(".cp-filters"), filtersHTML(completedCounts(total, counts), filter));
    const rows = visible(), position = rows.findIndex((g) => g.goal_id === selected);
    const markup = recordTableHTML(rows, { selected, projects });
    patch($(".cp-list"), (missing ? recordMissingHTML(wanted) : "") + (markup || '<p class="cp-empty">' + (signature ? "No finished goals in this view" : "Loading…") + "</p>"));
    patch($(".cp-load"), loadHTML({ loaded: items.length, total, next, busy, error }));
    patch($(".cp-pager"), position >= 0 ? pagerHTML({ position, of: filter === "all" ? total : counts?.[filter] ?? rows.length, canPrev: position > 0, canNext: !busy && (position < rows.length - 1 || !!next) }) : "");
  }
  function choose(id, push = true) {
    selected = id;
    missing = false;
    wanted = id;
    render();
    const hash = "#/completed" + (id == null ? "" : "/" + id);
    if (location.hash !== hash) history[push ? "pushState" : "replaceState"](null, "", hash);
  }
  async function more() {
    if (!root.open || busy || !next) return false;
    const ticket = version;
    read = new AbortController();
    busy = true;
    error = false;
    render();
    try {
      const data = await page(next);
      if (ticket !== version) return false;
      items = mergeCompleted(data.items, items);
      next = data.next;
      return true;
    } catch {
      if (ticket === version && !read?.signal.aborted) error = true;
      return false;
    } finally {
      if (ticket === version) {
        busy = false;
        read = null;
        render();
      }
    }
  }
  async function resolve() {
    if (resolving || wanted == null || !signature || busy) return;
    resolving = true;
    const id = wanted;
    while (root.open && wanted === id && !items.some((g) => g.goal_id === id) && next) if (!await more()) break;
    resolving = false;
    if (!root.open || wanted !== id) return;
    missing = !items.some((g) => g.goal_id === id);
    selected = missing ? null : id;
    filter = "all";
    render();
    if (!missing) root.querySelector('.cp-row[data-goal="' + id + '"]')?.scrollIntoView({ block: "nearest" });
  }
  async function step(delta) {
    let rows = visible(), position = rows.findIndex((g) => g.goal_id === selected);
    if (delta > 0 && position === rows.length - 1 && next) {
      await more();
      rows = visible();
    }
    if (rows[position + delta]) {
      choose(rows[position + delta].goal_id, false);
      root.querySelector('.cp-row[data-goal="' + selected + '"]')?.focus({ preventScroll: true });
      root.querySelector('.cp-row[data-goal="' + selected + '"]')?.scrollIntoView({ block: "nearest" });
    }
  }
  root.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-cp-close")) {
      closed();
      return;
    }
    if (button.matches(".cp-row")) {
      choose(selected === Number(button.dataset.goal) ? null : Number(button.dataset.goal));
      return;
    }
    if (button.dataset.filter) {
      filter = button.dataset.filter;
      selected = null;
      missing = false;
      wanted = null;
      history.replaceState(null, "", "#/completed");
      render();
      scroll.scrollTop = 0;
    }
    if (button.dataset.act === "more") void more().then(() => {
      if (missing) void resolve();
    });
    if (button.dataset.act === "prev" || button.dataset.act === "next") void step(button.dataset.act === "prev" ? -1 : 1);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closed();
    }
    if (e.target.matches(".cp-row") && ["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      selected = Number(e.target.dataset.goal);
      void step(e.key === "ArrowUp" ? -1 : 1);
    }
  });
  root.addEventListener("cancel", (e) => {
    e.preventDefault();
    closed();
  });
  const stop = () => {
    version++;
    read?.abort();
    read = null;
    busy = false;
  };
  root.ownerDocument?.defaultView?.addEventListener("pagehide", stop);
  return { show(id = null) {
    const first = !root.open;
    wanted = id;
    missing = false;
    if (first) {
      opener = document.activeElement;
      if (matchMedia("(max-width:767.98px)").matches) root.showModal();
      else root.show();
    }
    if (id == null) {
      selected = null;
      render();
    } else void resolve();
    if (first) $("[data-cp-close]").focus({ preventScroll: true });
  }, hide() {
    if (!root.open) return;
    stop();
    root.close();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, async update(snapshot, goals = []) {
    projects = new Map(goals.map((g) => [g.id, g.projects || []]));
    const data = normalize(snapshot);
    if (!data) return;
    const key = JSON.stringify(data);
    if (key === signature) {
      render();
      return;
    }
    signature = key;
    total = data.total ?? data.items.length;
    counts = data.counts;
    if (!items.length || !total) {
      stop();
      items = data.items;
      next = data.next;
    } else if (overlapsCompleted(items, data.items)) items = mergeCompleted(items, data.items);
    else {
      stop();
      items = data.items;
      next = data.next;
    }
    render();
    if (root.open) void resolve();
  } };
}
