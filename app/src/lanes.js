import { ms, standingRoles, standingAgent, lanePriority, laneData, reportedBlock, agentName, agentLabel } from "./model.js";
import { originRequestId } from "./requests.js";
import { hostHealth } from "./host-switches.js";
import { hostName } from "./pc-data.js";
import { seatWord } from "./seats.js";
import { has, myTurn } from "./names.js";
import { zoned } from "./zone.js";
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = zoned("en-GB", { hour: "2-digit", minute: "2-digit" }), day = zoned("en-US", { month: "numeric", day: "numeric" });
const at = (v) => typeof v === "number" ? v : ms(v);
export const time = (v) => Number.isFinite(at(v)) ? clock.format(at(v)) : "—";
export const date = (v) => day.format(at(v));
export const when = (t) => date(t) === date(Date.now()) ? time(t) : date(t) + " " + time(t);
export const glyph = (s) => ({ running: "●", stuck: "◆", owner: "▲", done: "✓", idle: "○", waiting: "◷", warning: "△", unrouted: "○" })[s] || "○";
export const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const stateLabel = (n) => n.stateAvailable === false ? "idle" : n.stateLabel || (n.state === "waiting" ? "WAITING" : n.data.status !== "active" && n.data.status || n.state);
export { lanePriority, laneData };
export function statusView(m, { showWaiting = false, showLater = false } = {}) {
  const lanes = laneData(m, { showWaiting, showLater }), standing = standingData(m);
  return { lanes, standing, html: '<div class="net"><div id="graph-world">' + networkHTML(lanes, m, standing) + "</div></div>" };
}
export function standingData(m) {
  const node = (a) => m.nodes.get("agent:" + a.id), open = (a) => node(a)?.state !== "done";
  const heads = m.agents.filter((a) => standingAgent(a) && open(a)).sort((a, b) => standingRoles().indexOf(a.role) - standingRoles().indexOf(b.role) || ms(b.created_at) - ms(a.created_at));
  const temps = m.agents.filter((a) => !standingAgent(a) && a.goal_id == null && a.project_id == null && open(a) && (node(a)?.stateAvailable === false || lanePriority(m, node(a)) < 3));
  const sub = (a, parent) => ({ node: node(a), parent: parent && node(parent), sub: true });
  return [...heads.flatMap((a) => [{ node: node(a), sub: false }, ...temps.filter((t) => t.parent_id === a.id).map((t) => sub(t, a))]), ...temps.filter((t) => !heads.some((a) => a.id === t.parent_id)).map((t) => sub(t))];
}
function badge(m, n) {
  const back = n.place === "later" ? ms(n.data.next_check_at) : NaN;
  const text = Number.isFinite(back) ? "next " + (date(back) === date(m.now) ? time(back) : date(back)) : { waiting: n.next ? "next " + when(n.next) : n.stateLabel, owner: n.stateLabel || myTurn() }[n.state];
  return text ? '<span class="badge ' + n.state + '">' + esc(text) + "</span>" : "";
}
const rowId = (n) => n.kind === "goal" ? "G" + n.id : n.kind === "project" ? "P" + n.id : n.kind === "request" ? "R" + n.id : agentName(n.data);
function title(m, n) {
  const request = n.kind === "goal" ? originRequestId(n.data, m.d) : n.data.request_id;
  return [...new Set([rowId(n), request != null ? "R" + request : "", clean(n.label), ...n.whyFull || [], stateLabel(n), n.kind === "goal" && n.state === "owner" ? n.data.owner_action : null, n.data.host && hostName(n.data.host), n.data.seat, n.data.source === "codex" ? n.data.model : null].filter(Boolean))].join(" · ");
}
function ring(n) {
  return '<span class="ring"><b>' + n.busy + "</b></span>";
}
function chip(m, n, cls = "", style = "") {
  const d = n.data, k = n.kind, top = (id, extra = "") => '<div class="chip-top"><span class="state ' + n.state + '">' + glyph(n.state) + '</span><b class="chip-id">' + id + "</b>" + extra + "</div>";
  const body = k === "request" ? '<b class="chip-id">R' + n.id + "</b><small>" + (date(d.at) === date(Date.now()) ? time(d.at) : date(d.at)) + "</small>" : k === "goal" || k === "project" ? top(rowId(n), k === "goal" ? badge(m, n) : "<small>" + esc((d.host ? hostName(d.host) : "—") + " / " + (d.seat || "—")) + "</small>") + '<div class="chip-title">' + esc(n.label) + "</div>" : k === "agent" ? '<span class="state ' + n.state + '">' + glyph(n.state) + "</span><b>" + esc(agentLabel(d).name) + "</b><small>" + esc(agentLabel(d).state) + "</small>" : ring(n) + '<span class="tile-text"><b>' + esc(n.label || n.id) + "</b><small>" + (n.state === "warning" ? k === "host" ? esc(hostHealth(d, m.now).status) : "△ " + esc(d.data?.red ? "RED" : seatWord(d)) : n.busy + " / " + n.active + " busy") + "</small></span>";
  return '<div class="chip ' + (k === "seat" || k === "host" ? "tile " : "") + k + (cls ? " " + cls : "") + (k === "agent" && reportedBlock(d) ? " reported-block" : "") + '" data-node="' + esc(n.key) + '" data-state="' + n.state + '" role="button" tabindex="0" title="' + esc(title(m, n)) + '"' + (style ? ' style="' + style + '"' : "") + ">" + body + "</div>";
}
export function networkHTML(L, m, S = []) {
  const used = [];
  for (const a of [...S.map((r) => r.node), ...L.flatMap((l) => [...l.rows.flatMap((r) => r.agents), ...l.loose])]) for (const k of ["seat:" + a.data.seat, "host:" + a.data.host]) if (!used.includes(k)) used.push(k);
  const order = (k) => used.includes(k) ? used.indexOf(k) : used.length, lead = S.length ? 1 : 0;
  const rail = (kind, cap) => '<div class="rail-col"><span class="cap">' + cap + "</span>" + [...m.d.resources?.[kind + "s"] || [], ...kind === "seat" ? [{ key: "codex" }] : []].map((r) => m.nodes.get(kind + ":" + r.key)).filter(Boolean).sort((a, b) => order(a.key) - order(b.key)).map((n, i) => chip(m, n, "", "--i:" + i)).join("") + "</div>";
  const lane = (l, i) => {
    const rows = [...l.rows, ...l.loose.length ? [{ agents: l.loose }] : []];
    return '<div class="net-lane' + (l.muted ? " muted" : "") + '" data-lane="' + esc(l.key) + '"' + (l.head.place ? ' data-place="' + esc(l.head.place) + '"' : "") + ' data-state="' + l.head.state + '" style="--i:' + (i + lead) + ";--rows:" + Math.max(1, rows.length) + '">' + (l.req ? chip(m, l.req, "c-req") : "") + chip(m, l.head, "c-goal") + rows.map((r, k) => (r.node ? chip(m, r.node, "c-proj" + (r.muted ? " muted" : ""), "grid-row:" + (k + 1)) : "") + '<div class="cell" style="grid-row:' + (k + 1) + '">' + r.agents.map((a) => chip(m, a)).join("") + "</div>").join("") + "</div>";
  };
  const group = lead ? '<div class="net-standing" data-lane="standing" style="--i:0"><span class="cap">Standing</span><div class="cell">' + S.map((r) => chip(m, r.node, r.sub ? "sub" : "")).join("") + "</div></div>" : "";
  return '<svg class="wires" data-own aria-hidden="true"></svg><div class="net-lanes">' + group + ["Request", "Goal", "Project", "Agent"].map((c, i) => '<span class="cap" style="grid-column:' + (i + 1) + '">' + c + "</span>").join("") + L.map(lane).join("") + '</div><div class="net-rail">' + (has("seats") ? rail("seat", "Seat") : "") + rail("host", "Host") + "</div>";
}
const bezier = (a, b, c, d) => {
  let l = 0, p = a;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, u = 1 - t, q = [0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * d[j]);
    l += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return l;
};
function route(p) {
  const f = (v) => v.toFixed(1), o = { d: "M" + f(p[0]) + " " + f(p[1]), len: 0, at: p };
  o.line = (q) => {
    o.d += "L" + f(q[0]) + " " + f(q[1]);
    o.len += Math.hypot(q[0] - o.at[0], q[1] - o.at[1]);
    o.at = q;
    return o;
  };
  o.curve = (q) => {
    const a = o.at, dx = Math.max(12, (q[0] - a[0]) * 0.5), b = [a[0] + dx, a[1]], c = [q[0] - dx, q[1]];
    o.d += "C" + f(b[0]) + " " + f(b[1]) + " " + f(c[0]) + " " + f(c[1]) + " " + f(q[0]) + " " + f(q[1]);
    o.len += bezier(a, b, c, q);
    o.at = q;
    return o;
  };
  return o;
}
export function drawWires(world, L, S = []) {
  const svg = world?.querySelector(".wires");
  if (!svg || !world.offsetWidth) return;
  const box = /* @__PURE__ */ new Map();
  for (const el of world.querySelectorAll(".chip")) {
    let x = 0, y = 0, e = el;
    while (e && e !== world) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent;
    }
    box.set((el.closest("[data-lane]")?.dataset.lane || "rail") + "|" + el.dataset.node, { x, y, w: el.offsetWidth, h: el.offsetHeight });
  }
  const busy = (a) => a.stateAvailable !== false && a.data.busy;
  const sig = JSON.stringify([[...box], S.map((r) => [r.node.state, busy(r.node)]), L.map((l) => [l.muted, l.head.state, l.rows.map((r) => r.node.state), [...l.rows.flatMap((r) => r.agents), ...l.loose].map(busy)])]);
  if (svg.sig === sig) return;
  svg.sig = sig;
  const R = (b) => [b.x + b.w, b.y + b.h / 2], Lf = (b) => [b.x, b.y + b.h / 2], M = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const path = (p, live, keys) => '<path class="wire' + (live ? " " + live : "") + '" data-path="' + esc(keys) + '" d="' + p.d + '" style="--wl:' + Math.ceil(p.len) + 'px"/>';
  const wire = (a, b, live, keys) => path(route(R(a)).curve(Lf(b)), live, keys);
  const rem = parseFloat(getComputedStyle(world).fontSize), speed = 15 * rem, P = Math.round(1.8 * rem), pairs = /* @__PURE__ */ new Map();
  let out = "", packets = "", n = 0;
  const tail = (a, ab, via) => {
    const seat = box.get("rail|seat:" + a.data.seat), host = box.get("rail|host:" + a.data.host), on = busy(a) && "live", pair = "seat:" + a.data.seat + " host:" + a.data.host;
    if (seat && host) pairs.set(pair, pairs.get(pair) || on);
    if (!seat) return "";
    if (on && host) {
      const [first, ...rest] = [...via, ab], p = route(M(first)).line(R(first));
      for (const b of rest) p.curve(Lf(b)).line(R(b));
      p.curve(Lf(seat)).line(R(seat)).curve(Lf(host)).line(M(host));
      const dur = (p.len + P) / speed, style = "--p:" + P + "px;--len:" + Math.ceil(p.len) + "px;--dur:" + dur.toFixed(2) + "s;--d:" + (-(n++ * 0.37 % 1) * dur).toFixed(2) + "s";
      packets += '<path class="pk glow" data-path="' + esc(a.key) + '" d="' + p.d + '" style="' + style + '"/><path class="pk" data-path="' + esc(a.key) + '" d="' + p.d + '" style="' + style + '"/>';
    }
    return wire(ab, seat, on, a.key + " seat:" + a.data.seat);
  };
  let w = "";
  for (const r of S) {
    const a = r.node, ab = box.get("standing|" + a.key), up = r.parent && box.get("standing|" + r.parent.key);
    if (!ab) continue;
    if (up) {
      const x = up.x + 0.9 * rem, y = ab.y + ab.h / 2, p = route([x, up.y + up.h]);
      p.d += "Q" + x.toFixed(1) + " " + y.toFixed(1) + " " + ab.x.toFixed(1) + " " + y.toFixed(1);
      p.len += y - up.y - up.h + ab.x - x;
      w += path(p, busy(a) && "live", r.parent.key + " " + a.key);
    }
    w += tail(a, ab, []);
  }
  if (w) out += '<g style="--i:0">' + w + "</g>";
  const lead = S.length ? 1 : 0;
  L.forEach((l, i) => {
    const lane = (k) => box.get(l.key + "|" + k), head = lane(l.head.key), req = l.req && lane(l.req.key);
    if (!head) return;
    const rows = [...l.rows, ...l.loose.length ? [{ agents: l.loose }] : []], rowBusy = (r) => r.agents.some(busy);
    let w2 = req ? wire(req, head, rows.some(rowBusy) && "live", l.req.key + " " + l.head.key) : "";
    for (const r of rows) {
      const pb = r.node && lane(r.node.key);
      if (pb) w2 += wire(head, pb, rowBusy(r) && "live", l.head.key + " " + r.node.key);
      for (const a of r.agents) {
        const ab = lane(a.key);
        if (!ab) continue;
        w2 += wire(pb || head, ab, busy(a) && "live", (r.node || l.head).key + " " + a.key) + tail(a, ab, [req, head, pb].filter(Boolean));
      }
    }
    out += "<g" + (l.muted ? ' class="muted"' : "") + ' style="--i:' + (i + lead) + '">' + w2 + "</g>";
  });
  for (const [k, on] of pairs) {
    const [s, h] = k.split(" "), a = box.get("rail|" + s), b = box.get("rail|" + h);
    if (a && b) out += '<g style="--i:' + (L.length + lead) + '">' + wire(a, b, on, k) + "</g>";
  }
  svg.setAttribute("width", world.offsetWidth);
  svg.setAttribute("height", world.offsetHeight);
  svg.innerHTML = out + packets;
}
export { patch } from "./dom-patch.js";
