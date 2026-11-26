import { l10n } from "../names.js";
const NOT_CHANGED = () => l10n("변경하지 못했어요. 다시 시도해 주세요.", "Couldn't change it. Try again.");
export const whereOf = (value) => value === "집" ? "안" : typeof value === "string" && value.startsWith("밖") ? "밖" : null;
export function createOwnerState(api, render) {
  let frame = null, view = null, seen = null, pending = null, error = null, which = null;
  const time = (p) => Date.parse(p?.updated_at ?? "") || 0;
  const state = () => view && (!frame || time(view) >= time(frame)) ? view.state : frame?.state;
  const load = () => Promise.resolve().then(() => api("/owner-state")).then(async (response) => {
    if (response.ok) view = await response.json();
  }).catch(() => {
  }).finally(() => render());
  return { observe(next) {
    frame = next || null;
    const key = frame ? frame.state + "|" + frame.updated_at : "";
    if (key !== seen) {
      seen = key;
      if (!pending) void load();
    }
  }, view() {
    return { away: whereOf(pending?.where ?? view?.where?.value) === "밖", asleep: pending?.asleep ?? state() === "asleep", busy: !!pending, which: pending ? which : null, ready: !!view, error, failed: error ? which : null };
  }, set(action) {
    if (pending || !view) return;
    const body = action === "out" ? { where: whereOf(view?.where?.value) === "밖" ? "집" : "밖" } : { asleep: state() !== "asleep" };
    pending = body;
    which = action;
    error = null;
    render();
    Promise.resolve().then(() => api("/owner-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).then(async (response) => {
      if (!response.ok) throw Error();
      view = await response.json();
    }).catch(() => {
      error = NOT_CHANGED();
    }).finally(() => {
      pending = null;
      render();
    });
  } };
}
