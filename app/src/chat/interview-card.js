import { mountIsland } from "../islands/island.js";
import { hosts } from "../names.js";
export const POLL = Object.freeze({ opening: 2e3, open: 1e4 });
export const STATES = Object.freeze(["ready", "opening", "in_progress", "finished", "closed", "unreachable", "locked", "not_opened", "failed"]);
export const FINAL = Object.freeze(["finished", "closed"]);
export const LINES = Object.freeze({ send: "시작 요청이 닿지 않았어요. 다시 눌러 주세요.", device: "이 인터뷰는 그 기기에서 열 수 없어요.", here: "이 기기에서는 인터뷰를 열 수 없어요. 폰이나 PC에서 눌러 주세요.", island: "인터뷰 카드를 표시하지 못했어요." });
const seen = new Map();
export const forgetInterviews = () => seen.clear();
const said = (body) => typeof body?.message === "string" && body.message.trim() ? body.message : null;
const answer = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch {
  }
  return { status: response.status, body };
};
const call = async (api, path, init) => {
  try {
    return await answer(await api(path, init));
  } catch {
    return { status: 0, body: null };
  }
};
export const viewOf = (body, order) => body && typeof body === "object" && body.order_id === order && STATES.includes(body.state) ? body : null;
export const pollAfter = (phase, view) => phase === "failed" ? POLL.open : phase !== "view" || !view || FINAL.includes(view.state) ? null : view.state === "opening" ? POLL.opening : POLL.open;
export function mountInterview(node, { api, order, island = mountIsland, watch = onScreen, doc = globalThis.document }, owner) {
  const kept = seen.get(order);
  const v = { phase: kept ? "view" : "loading", view: kept ?? null, busy: null, line: "" };
  let drawn = null, gone = false, timer = 0, shown = true, due = false, reading = null;
  const host = document.createElement("div");
  host.setAttribute("class", "interview-card");
  node.append(host);
  const paint = () => {
    if (!gone) drawn?.update({ ...v });
  };
  function schedule() {
    clearTimeout(timer);
    timer = 0;
    due = false;
    const wait = gone ? null : pollAfter(v.phase, v.view);
    if (wait !== null) timer = setTimeout(() => {
      timer = 0;
      if (shown && !doc?.hidden) void read();
      else due = true;
    }, wait);
  }
  function read() {
    reading ??= (async () => {
      const got = await call(api, "/chat/interview?order=" + order);
      if (gone) return;
      const view = got.status === 200 ? viewOf(got.body, order) : null;
      if (view) {
        seen.set(order, view);
        Object.assign(v, { phase: "view", view }, FINAL.includes(view.state) ? { line: "" } : {});
      } else if (got.status === 404) {
        seen.delete(order);
        Object.assign(v, { phase: "gone", view: null });
      } else if (!v.view) v.phase = "failed";
      paint();
      schedule();
    })().finally(() => {
      reading = null;
    });
    return reading;
  }
  async function launch(device) {
    if (v.busy || gone) return;
    Object.assign(v, { busy: device, line: "" });
    paint();
    const got = await call(api, "/chat/interview/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: order, device }) });
    if (gone) return;
    v.busy = null;
    const view = got.status === 202 || got.status === 409 ? viewOf(got.body, order) ?? viewOf(got.body?.view, order) : null;
    if (view) {
      seen.set(order, view);
      v.view = view;
      v.phase = "view";
      paint();
      schedule();
      return;
    }
    if (got.status === 409) {
      v.line = got.body?.error === "order_not_open" ? "" : said(got.body) ?? (got.body?.error === "wrong_device" ? LINES.device : "");
      return read();
    }
    v.line = got.status === 403 ? said(got.body) ?? LINES.here : LINES.send;
    paint();
  }
  const stopWatch = watch(node, (now) => {
    shown = now;
    if (now && due) {
      due = false;
      void read();
    }
  });
  const onVisible = () => {
    if (!doc.hidden && shown && due) {
      due = false;
      void read();
    }
  };
  doc?.addEventListener?.("visibilitychange", onVisible);
  const props = () => ({ ...v, mic: hosts().mic, onLaunch: launch, onReload: () => {
    v.phase = "loading";
    paint();
    return read();
  } });
  island("interview-card", host, props()).then((mounted) => {
    if (gone) {
      mounted.unmount();
      return;
    }
    drawn = mounted;
    paint();
  }, () => {
    if (!gone) host.replaceChildren(Object.assign(document.createElement("p"), { className: "interview-card-problem", textContent: LINES.island }));
  });
  void read();
  const destroy = () => {
    gone = true;
    clearTimeout(timer);
    stopWatch?.();
    doc?.removeEventListener?.("visibilitychange", onVisible);
    drawn?.unmount();
    drawn = null;
    host.remove();
  };
  owner?.own?.(destroy);
  return { node, destroy, get view() {
    return { ...v };
  }, read, launch };
}
function onScreen(node, tell) {
  if (typeof IntersectionObserver !== "function") return () => {
  };
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) tell(entry.isIntersecting);
  });
  watcher.observe(node);
  return () => watcher.disconnect();
}
