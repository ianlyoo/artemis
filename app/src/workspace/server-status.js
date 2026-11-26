import { el } from "../boards/dom.js";
import { iconButton, setIcon } from "./icons.js";
import { codexCapacity } from "../codex.js";
import { hostWork } from "../host-switches.js";
import { computerChoices, OFF_LINE } from "./computer.js";
import { has, hosts as serverHosts, ledgerName } from "../names.js";
export const NEAR = 85;
const KST = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const parts = (at) => Object.fromEntries(KST.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
const valid = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const number = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const pct = (value) => number(value) == null ? null : Math.max(0, Math.min(100, value));
function stamp(at, now) {
  const a = parts(at), b = parts(now), time = `${a.hour}:${a.minute}`;
  return a.month === b.month && a.day === b.day ? time : `${a.month}/${a.day} ${time}`;
}
function ago(at, now) {
  const m = Math.max(0, (now - Date.parse(at)) / 6e4);
  return m < 1 ? "just now" : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
const word = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
const nameOf = (row) => typeof row.label === "string" && row.label ? row.label : row.key;
function hostView(row, now) {
  const use = row.use && typeof row.use === "object" ? row.use : {}, status = typeof row.status === "string" ? row.status.trim() : "";
  const state = row.state_en ?? (status ? word(status.slice(0, 24)) : "—");
  const load = number(use.load), cpus = number(use.cpus), ratio = load != null && cpus > 0 ? load / cpus : null;
  const disk = pct(use.disk_used_pct), free = number(use.mem_free_gb);
  return { ...hostWork(row), key: row.key, name: nameOf(row), state, fault: row.state === "unreachable" || row.state === "stale", read: valid(row.at) ? ago(row.at, now) : null, cpus, readings: [{ name: "Load", text: ratio == null ? "—" : ratio >= 1 ? `${ratio.toFixed(1)}×` : `${Math.round(ratio * 100)} %`, bar: ratio == null ? null : Math.min(1, ratio), near: ratio != null && ratio >= 1, title: ratio == null ? null : `Load average ${load} on ${cpus} CPUs (${ratio.toFixed(2)} per CPU)` }, { name: "Disk", text: disk == null ? "—" : `${Math.round(disk)} %`, bar: disk == null ? null : disk / 100, near: disk != null && disk >= NEAR, title: disk == null ? null : `${disk} % of the disk used` }, { name: "Memory", text: free == null ? "—" : `${Number(free.toFixed(1))} GB free`, bar: null, near: false, title: null }] };
}
function seatView(row, now, fault) {
  const use = row.use && typeof row.use === "object" ? row.use : {}, five = pct(use.five_hour), status = typeof row.status === "string" ? row.status.trim() : "";
  const resets = fault && status ? word(status.slice(0, 24)) : valid(use.five_hour_resets_at) ? "resets " + stamp(use.five_hour_resets_at, now) : five == null && status && !/^ok$/i.test(status) ? word(status.slice(0, 24)) : "—";
  return { key: row.key, text: five == null ? "—" : `${Math.round(five)} %`, bar: five == null ? null : five / 100, near: five != null && five >= NEAR, fault: fault === true, resets };
}
function codexView(sample, now) {
  const c = codexCapacity(sample), [five, week] = c.windows;
  return { key: "codex", text: week.percent, bar: week.reset ? week.value / 100 : null, near: !!week.reset && week.value >= NEAR, resets: week.reset ? "resets " + stamp(week.reset, now) : "—", title: ["5-hour " + (five.reset ? five.percent + ", resets " + stamp(five.reset, now) : "—"), c.reason].filter(Boolean).join(" · "), credits: c.credits.text, read: c.credits.at ? "Credit balance, read " + stamp(c.credits.at, now) : c.reason || null };
}
export function statusModel(rows, { host = null, now = Date.now(), resources = null, codex = resources?.codex } = {}) {
  const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object" && typeof row.key === "string" && row.key) : [];
  const controller = list.find((row) => row.kind === "host" && row.controller === true)?.key ?? serverHosts().status;
  const hosts = list.filter((row) => row.kind === "host").sort((a, b) => (b.key === controller) - (a.key === controller) || a.key.localeCompare(b.key));
  const shown = hosts.find((row) => row.key === host) ?? hosts[0] ?? null;
  const seats = list.filter((row) => row.kind === "seat").sort((a, b) => a.key.localeCompare(b.key));
  const faults = new Map((resources?.seats ?? []).map((s) => [s.key, s.fault]));
  return { hosts: hosts.map((row) => row.key), names: Object.fromEntries(hosts.map((row) => [row.key, nameOf(row)])), host: shown ? hostView(shown, now) : null, seats: seats.map((row) => seatView(row, now, faults.get(row.key))), codex: codexView(codex, now) };
}
const POPS = [["seats", "gauge", "Seats"], ["devices", "server", "Devices"], ["computer", "screen", "Computer"]];
const POP_NEEDS = { seats: "seats", devices: "hosts", computer: "pc" };
const GAP = 6, EDGE = 8;
const waiting = (state) => state === "hq_unavailable" ? ledgerName() + " isn't loaded yet" : state === "failed" ? "Couldn't load" : "Loading…";
export function createServerStatus({ store, host = null, change = () => {
}, open: openTarget = () => {
}, now = () => Date.now(), tools = [] }) {
  let chosen = host, open = null;
  const offered = POPS.filter(([kind]) => has(POP_NEEDS[kind]));
  const buttons = { seats: [], devices: [], computer: [] };
  const toggle = (kind, name, label, cls) => {
    const button = iconButton(name, label, { class: cls + " st-toggle", "data-pop": kind, "aria-expanded": "false", "aria-controls": "st-pop-" + kind });
    button.addEventListener("click", () => {
      if (open?.kind === kind) shut(true);
      else show(kind, button);
    });
    buttons[kind].push(button);
    return button;
  };
  const foot = el("div", { class: "ex-foot", role: "group", "aria-label": "Server Status" }, offered.map(([kind, name, label]) => toggle(kind, name, label, "ex-foot-" + kind)), tools.map((tool) => tool("ex-foot-")));
  const railFoot = el("div", { class: "ide-rail-foot", role: "group", "aria-label": "Server Status" }, offered.map(([kind, name, label]) => toggle(kind, name, label, "ide-rail-" + kind)), tools.map((tool) => tool("ide-rail-")));
  const body = { seats: el("div", { class: "st-pop-body" }), devices: el("div", { class: "st-pop-body" }), computer: el("div", { class: "st-pop-body" }) };
  const pops = Object.fromEntries(offered.map(([kind, , label]) => [kind, el("div", { class: "st-pop", id: "st-pop-" + kind, "data-pop": kind, role: "dialog", "aria-label": label, tabindex: "-1", hidden: true }, el("div", { class: "st-pop-head" }, el("span", { class: "st-pop-title" }, label), kind === "seats" ? el("span", { class: "st-pop-note" }, "5-hour limit") : null), body[kind])]));
  for (const node of Object.values(pops)) node.hidden = true;
  let row = null;
  const edges = () => {
    if (!row) return;
    row.classList.toggle("is-less", row.scrollLeft > 1);
    row.classList.toggle("is-more", row.scrollWidth - row.scrollLeft - row.clientWidth > 1);
  };
  const keep = (at = row?.scrollLeft ?? 0) => {
    if (!row) return;
    row.scrollLeft = at;
    const lit = row.querySelector("[aria-current]"), start = lit?.offsetLeft, end = start + lit?.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = Math.max(0, start - 8);
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth + 8;
    edges();
  };
  const resized = typeof ResizeObserver === "function" ? new ResizeObserver(edges) : null;
  resized?.observe(body.devices);
  const watched = typeof ResizeObserver === "function" ? new ResizeObserver(() => place()) : null;
  function show(kind, anchor) {
    shut(false);
    open = { kind, anchor };
    pops[kind].hidden = false;
    for (const button of buttons[kind]) button.setAttribute("aria-expanded", "true");
    place();
    watched?.observe(anchor);
    if (kind === "devices") keep();
    (kind === "devices" && row?.querySelector("[aria-current]") || kind === "computer" && [...body.computer.querySelectorAll(".st-pick")].find((pick) => !pick.disabled) || pops[kind]).focus({ preventScroll: true });
  }
  function shut(back) {
    if (!open) return;
    const { kind, anchor } = open;
    open = null;
    watched?.unobserve(anchor);
    pops[kind].hidden = true;
    for (const button of buttons[kind]) button.setAttribute("aria-expanded", "false");
    if (back) anchor.focus({ preventScroll: true });
  }
  function place() {
    if (!open) return;
    const node = pops[open.kind], layer = node.offsetParent;
    if (!layer) return;
    const at = open.anchor.getBoundingClientRect(), box = layer.getBoundingClientRect();
    if (!at.width) {
      shut(false);
      return;
    }
    node.style.setProperty("--st-x", Math.round(Math.max(EDGE, Math.min(at.left - box.left, box.width - node.offsetWidth - EDGE))) + "px");
    node.style.setProperty("--st-y", Math.round(box.bottom - at.top + GAP) + "px");
    node.style.setProperty("--st-max", Math.round(Math.max(160, at.top - box.top - GAP - EDGE)) + "px");
  }
  const away = (event) => {
    if (open && !pops[open.kind].contains(event.target) && !buttons[open.kind].some((button) => button.contains(event.target))) shut(false);
  };
  const escape = (event) => {
    if (open && event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      shut(true);
    }
  };
  globalThis.document?.addEventListener?.("pointerdown", away, true);
  globalThis.document?.addEventListener?.("keydown", escape);
  globalThis.addEventListener?.("resize", place);
  const bar = (value) => el("span", { class: "st-bar", "aria-hidden": "true" }, value == null ? null : el("i", { style: { "--v": String(value) } }));
  const reading = ({ name, text, bar: value, near, fault, title }, note = "") => el("div", { class: "st-row" + (near || fault ? " is-near" : "") + (value == null ? " is-bare" : ""), "data-fault": fault == null ? null : String(fault), title }, el("span", { class: "st-name" }, name), el("span", { class: "st-value" }, text), el("span", { class: "st-note" }, note), value == null ? null : bar(value));
  const quiet = (text) => el("p", { class: "st-quiet" }, text);
  let listed = "";
  const switchRow = (keys, names) => el("div", { class: "st-hosts", role: "group", "aria-label": "Device", onscroll: edges }, keys.map((key) => {
    const button = el("button", { type: "button", class: "st-host ide-row", "data-host": key }, names[key]);
    button.addEventListener("click", () => {
      if (chosen === key && button.hasAttribute("aria-current")) return;
      chosen = key;
      change({ host: chosen });
      paint();
    });
    return button;
  }));
  function tone(model) {
    const seats = model?.seats.filter((seat) => seat.near).map((seat) => seat.key) ?? [], shown = model?.host ?? null;
    const device = !shown ? null : shown.state === "Stale" ? `${shown.name} stale, read ${shown.read}` : shown.fault ? `${shown.name} ${shown.state.toLowerCase()}` : shown.readings.find((item) => item.name === "Disk")?.near ? `${shown.name} disk near its limit` : null;
    for (const button of buttons.seats) {
      button.classList.toggle("is-near", !!seats.length);
      setIcon(button, "gauge", seats.length ? `Seats · ${seats.join(", ")} near the limit` : "Seats");
    }
    for (const button of buttons.devices) {
      button.classList.toggle("is-near", !!device);
      setIcon(button, "server", device ? `Devices · ${device}` : "Devices");
    }
  }
  function paintSeats(rows, state, model) {
    if (!rows) body.seats.replaceChildren(quiet(waiting(state)));
    else body.seats.replaceChildren(...model.seats.length ? model.seats.map((seat) => reading({ name: seat.key, text: seat.text, bar: seat.bar, near: seat.near, fault: seat.fault, title: null }, seat.resets)) : [quiet("No seat reported")], reading({ name: [model.codex.key, el("span", { class: "st-window" }, "weekly")], text: model.codex.text, bar: model.codex.bar, near: model.codex.near, title: model.codex.title }, model.codex.resets), el("div", { class: "st-row is-bare st-credits", title: model.codex.read }, el("span", { class: "st-name" }), el("span", { class: "st-value" }, model.codex.credits)));
  }
  function paintDevices(rows, state, model) {
    const had = row, was = row?.scrollLeft ?? 0, active = globalThis.document?.activeElement;
    const on = had?.contains(active) ? active.dataset.host : null, parts2 = [], shown = model?.host ?? null;
    if (!shown) row = null;
    else if (!row || listed !== JSON.stringify(model.names)) {
      row = switchRow(model.hosts, model.names);
      listed = JSON.stringify(model.names);
    }
    for (const button of row?.children ?? []) {
      const lit = button.dataset.host === shown.key;
      if (lit) {
        button.setAttribute("aria-current", "true");
        button.removeAttribute("title");
      } else {
        button.removeAttribute("aria-current");
        button.setAttribute("title", `Show ${model.names[button.dataset.host]}`);
      }
    }
    if (!rows) parts2.push(quiet(waiting(state)));
    else if (shown) {
      parts2.push(el("p", { class: "st-state", title: shown.name }, el("span", { class: "st-word", "data-state": shown.state.toLowerCase() }, shown.state), [shown.cpus ? `${shown.cpus} CPUs` : null, shown.read ? "read " + shown.read : null].filter(Boolean).map((text) => " · " + text).join("")));
      for (const item of shown.readings) parts2.push(reading(item));
      parts2.push(el("p", { class: "st-work host-work" }, shown.work));
      for (const text of shown.details) parts2.push(el("p", { class: "st-work host-work" }, text));
      if (shown.eco) parts2.push(el("p", { class: "st-work host-eco" }, shown.eco));
    } else parts2.push(quiet("No device reported"));
    if (row && row === had) {
      for (const child of [...body.devices.children]) if (child !== row) child.remove();
      body.devices.append(...parts2);
    } else body.devices.replaceChildren(...row ? [row] : [], ...parts2);
    if (on != null && row !== had) ([...row?.children ?? []].find((button) => button.dataset.host === on) ?? row?.querySelector("[aria-current]") ?? pops.devices).focus();
    keep(was);
  }
  let picks = "";
  function paintComputer(rows) {
    const choices = computerChoices(rows);
    if (JSON.stringify(choices) === picks) return;
    picks = JSON.stringify(choices);
    body.computer.replaceChildren(...choices.flatMap(({ id, name, off }) => [el("button", { type: "button", class: "st-pick ide-tabmenu-item ide-row", "data-computer": id, disabled: off, onclick: () => {
      shut(false);
      openTarget({ kind: "computer", id, name });
    } }, el("span", {}, name)), ...off ? [el("p", { class: "st-quiet st-pick-line" }, OFF_LINE)] : []]));
  }
  function paint() {
    const rows = store.cached("resources"), state = store.data.state.ledger;
    const model = rows ? statusModel(rows, { host: chosen, now: now(), resources: store.data.resources }) : null;
    tone(model);
    paintSeats(rows, state, model);
    paintDevices(rows, state, model);
    paintComputer(rows);
    place();
  }
  const minute = setInterval(paint, 6e4);
  minute.unref?.();
  paint();
  return { foot, railFoot, pops: Object.values(pops), paint, get host() {
    return chosen;
  }, get shown() {
    return open?.kind ?? null;
  }, close: () => shut(false), destroy() {
    clearInterval(minute);
    resized?.disconnect();
    watched?.disconnect();
    shut(false);
    globalThis.document?.removeEventListener?.("pointerdown", away, true);
    globalThis.document?.removeEventListener?.("keydown", escape);
    globalThis.removeEventListener?.("resize", place);
    for (const node of Object.values(pops)) node.remove();
  } };
}
