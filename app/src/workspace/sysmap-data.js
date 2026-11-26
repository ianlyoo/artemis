export const GROUPS = ["hosts", "services", "products", "schedules", "data", "ledger-tools", "cli", "hooks", "guidance", "capabilities", "skills", "roles", "seats", "resources", "policies", "models", "ship"];
export const GROUP_NAMES = { hosts: "Hosts", services: "Services", products: "Products", schedules: "Schedules", data: "Data", "ledger-tools": "Ledger tools", cli: "CLI", hooks: "Hooks", guidance: "Guidance", capabilities: "Capabilities", resources: "Resources", policies: "Policy", skills: "Skills", roles: "Roles", seats: "Seats", models: "Models", ship: "Ship" };
const strings = (list) => Array.isArray(list) && list.every((v) => typeof v === "string");
const word = (v) => typeof v === "string" && v.trim() !== "";
function flowShape(flow) {
  if (![flow?.id, flow?.title].every(word) || !Array.isArray(flow.actors) || !Array.isArray(flow.steps) || !flow.steps.length) return false;
  const actors = new Set(flow.actors.map((a) => a?.id)), steps = new Set(flow.steps.map((s) => s?.id));
  return flow.actors.every((a) => [a?.id, a?.name].every(word) && (a.node == null || typeof a.node === "string")) && flow.steps.every((s, i) => word(s?.id) && s.n === i + 1 && actors.has(s.actor) && (s.to == null || actors.has(s.to)) && word(s.text) && strings(s.nodes) && strings(s.next) && s.next.every((id) => steps.has(id)) && (s.back == null || steps.has(s.back.to)));
}
export function parseMap(value) {
  const fail = () => {
    throw Error("Could not read the system map. Check the generated file.");
  };
  if (value?.version !== 1 || typeof value.commit !== "string" || !Number.isFinite(Date.parse(value.generated_at)) || !value.kinds || typeof value.kinds !== "object" || Array.isArray(value.kinds) || !Object.values(value.kinds).every((v) => typeof v === "string") || !Array.isArray(value.nodes) || !strings(value.gaps?.no_description) || !strings(value.gaps?.unheld_flows) || !strings(value.gaps.unheld_steps ?? []) || !(value.flows == null || Array.isArray(value.flows) && value.flows.every(flowShape))) fail();
  const byId = new Map();
  for (const n of value.nodes) {
    if (!n || !["id", "kind", "name", "description", "group", "source"].every((k) => typeof n[k] === "string" && n[k].trim()) || !n.id.startsWith(n.kind + ":") || byId.has(n.id) || !(n.host === null || typeof n.host === "string") || !Array.isArray(n.links) || !n.links.every((e) => typeof e?.to === "string" && typeof e.rel === "string" && e.rel.trim())) fail();
    byId.set(n.id, n);
  }
  const incoming = new Map(value.nodes.map((n) => [n.id, []]));
  for (const n of value.nodes) for (const e of n.links) incoming.get(e.to)?.push({ to: n.id, rel: e.rel });
  const kindsByGroup = new Map();
  for (const n of value.nodes) {
    if (!kindsByGroup.has(n.group)) kindsByGroup.set(n.group, new Map());
    const counts = kindsByGroup.get(n.group);
    counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  }
  const mainKinds = new Map([...kindsByGroup].map(([group, counts]) => [group, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
  const degree = new Map(value.nodes.map((n) => [n.id, n.links.length + incoming.get(n.id).length]));
  return { ...value, flows: value.flows ?? [], gaps: { ...value.gaps, unheld_steps: value.gaps.unheld_steps ?? [] }, byId, incoming, mainKinds, degree };
}
export function filterNodes(map, query = "", kind = "") {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return map.nodes.filter((n) => (!kind || n.kind === kind) && words.every((w) => [n.name, n.id, n.description, n.source, n.host ?? ""].join(" ").toLocaleLowerCase().includes(w)));
}
export function connections(map, id) {
  const edges = [...(map.byId.get(id)?.links ?? []).map((e) => ({ ...e, direction: "out" })), ...(map.incoming.get(id) ?? []).map((e) => ({ ...e, direction: "in" }))];
  return { edges, ids: new Set([id, ...edges.map((e) => e.to)]) };
}
export function liveOverlay(payload) {
  const d = payload?.dashboard;
  const agents = (d?.agents ?? []).filter((a) => !a.ended_at && a.status === "active");
  return { at: payload?.fetched_at, ok: payload?.ok === true && !payload?.error, hosts: new Map((d?.resources?.hosts ?? []).map((h) => [h.key, h])), seats: new Map((d?.resources?.seats ?? []).map((s) => [s.key, s])), agents };
}
const liveKey = (node) => node.id.slice(node.kind.length + 1);
export function nodeLive(node, live) {
  if (!live?.ok) return { label: "Live unavailable", agents: [] };
  const key = liveKey(node);
  const agents = live.agents.filter((a) => node.kind === "host" ? a.host === key : node.kind === "seat" ? a.seat === key : node.kind === "role" ? a.role === key : false);
  const host = node.kind === "host" ? live.hosts.get(key) : null;
  return { label: host?.label_text ?? host?.state ?? "", state: host?.state, agents };
}
export const kindLabel = (map, kind) => map.kinds[kind] ?? kind;
export const INCOMING_REL = { "runs-on": "Runs here", reads: "Read by", writes: "Written by", feeds: "Fed by", uses: "Used by", calls: "Called by", checks: "Checked by", grants: "Granted by", "assigned-to": "Assigned here", documents: "Documented by", "part-of": "Parts", "provided-by": "Provides" };
export const outgoingLabel = (rel) => rel.charAt(0).toUpperCase() + rel.slice(1).replaceAll("-", " ");
export function relationshipGroups(map, id) {
  const edges = connections(map, id).edges;
  return ["out", "in"].map((direction) => ({ direction, groups: [...new Set(edges.filter((e) => e.direction === direction).map((e) => e.rel))].map((rel) => ({ rel, label: direction === "out" ? outgoingLabel(rel) : INCOMING_REL[rel] ?? `${rel} (incoming)`, edges: edges.filter((e) => e.direction === direction && e.rel === rel) })) }));
}
const ordered = (groups) => [...new Set([...GROUPS, ...groups])].filter((g) => groups.includes(g));
export function groupNodes(nodes) {
  const byGroup = new Map();
  for (const n of nodes) {
    if (!byGroup.has(n.group)) byGroup.set(n.group, []);
    byGroup.get(n.group).push(n);
  }
  return new Map(ordered([...byGroup.keys()]).map((g) => [g, byGroup.get(g)]));
}
export function tiers(map) {
  const groups = ordered([...new Set(map.nodes.map((n) => n.group))]), order = (g) => groups.indexOf(g);
  const weight = new Map(), key = (a, b) => `${a}
${b}`;
  for (const n of map.nodes) for (const e of n.links) {
    const t = map.byId.get(e.to);
    if (t && t.group !== n.group) weight.set(key(n.group, t.group), (weight.get(key(n.group, t.group)) ?? 0) + 1);
  }
  const below = new Map(groups.map((g) => [g, []]));
  for (const [k, n] of weight) {
    const [a, b] = k.split("\n"), back = weight.get(key(b, a)) ?? 0;
    if (n > back || n === back && order(a) < order(b)) below.get(a).push(b);
  }
  const rank = new Map(), walking = new Set();
  const visit = (g) => {
    if (rank.has(g)) return rank.get(g);
    walking.add(g);
    let r = 0;
    for (const b of below.get(g)) if (!walking.has(b)) r = Math.max(r, visit(b) + 1);
    walking.delete(g);
    rank.set(g, r);
    return r;
  };
  groups.forEach(visit);
  const top = Math.max(0, ...rank.values()), place = new Map();
  const mean = (g) => {
    let sum = 0, of = 0;
    for (const [k, n] of weight) {
      const [a, b] = k.split("\n"), other = a === g ? b : b === g ? a : null;
      if (other && place.has(other)) {
        sum += place.get(other) * n;
        of += n;
      }
    }
    return of ? sum / of : 0.5;
  };
  return Array.from({ length: top + 1 }, (_, i) => {
    const row = groups.filter((g) => rank.get(g) === top - i);
    if (i) row.sort((a, b) => mean(a) - mean(b) || order(a) - order(b));
    row.forEach((g, j) => place.set(g, (j + 0.5) / row.length));
    return row;
  });
}
export function flows(map, shown, rel = "") {
  const ids = new Set(shown.map((n) => n.id)), lines = new Map();
  for (const n of shown) for (const e of n.links) {
    const t = map.byId.get(e.to);
    if (!t || !ids.has(t.id) || t.group === n.group || rel && e.rel !== rel) continue;
    const to = t.kind === "host" ? t.id : t.group, key = `${n.group}>${to}`;
    if (!lines.has(key)) lines.set(key, { key, from: n.group, to, n: 0 });
    lines.get(key).n++;
  }
  return [...lines.values()];
}
export function flowLines(list, rects) {
  const lines = [], edges = new Map();
  const end = (box, edge, line, other) => {
    const k = `${box}|${edge}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ line, other });
  };
  for (const f of list) {
    const a = rects.get(f.from), b = rects.get(f.to);
    if (!a || !b) continue;
    const down = b.y >= a.y + a.h - 1, up = b.y + b.h <= a.y + 1;
    const line = { ...f, width: Math.min(6, 1 + Math.log2(f.n) * 0.7), up, side: !down && !up, ends: [] };
    end(f.from, up ? "top" : "bottom", line, b.x + b.w / 2);
    end(f.to, down ? "top" : "bottom", line, a.x + a.w / 2);
    lines.push(line);
  }
  for (const [k, at] of edges) {
    const [box, edge] = k.split("|"), r = rects.get(box);
    at.sort((p, q) => p.other - q.other).forEach(({ line }, i) => line.ends.push({ box, x: r.x + r.w * (i + 1) / (at.length + 1), y: edge === "top" ? r.y : r.y + r.h }));
  }
  for (const line of lines) {
    const [a, b] = [line.ends.find((e) => e.box === line.from), line.ends.find((e) => e.box === line.to)];
    const bend = line.side ? 24 + Math.abs(b.x - a.x) * 0.08 : Math.max(16, Math.abs(b.y - a.y) / 2);
    const [ca, cb] = line.side ? [a.y + bend, b.y + bend] : line.up ? [a.y - bend, b.y + bend] : [a.y + bend, b.y - bend];
    line.d = `M${r1(a.x)} ${r1(a.y)}C${r1(a.x)} ${r1(ca)} ${r1(b.x)} ${r1(cb)} ${r1(b.x)} ${r1(b.y)}`;
    delete line.ends;
  }
  return lines;
}
const r1 = (v) => Math.round(v * 10) / 10;
export function curve(a, b) {
  if (Math.abs(b.y - a.y) < Math.abs(b.x - a.x) / 4) {
    const mx = (a.x + b.x) / 2;
    return `M${r1(a.x)} ${r1(a.y)}C${r1(mx)} ${r1(a.y)} ${r1(mx)} ${r1(b.y)} ${r1(b.x)} ${r1(b.y)}`;
  }
  const my = (a.y + b.y) / 2;
  return `M${r1(a.x)} ${r1(a.y)}C${r1(a.x)} ${r1(my)} ${r1(b.x)} ${r1(my)} ${r1(b.x)} ${r1(b.y)}`;
}
const LIVE_KINDS = new Set(["host", "seat", "role"]);
const occupancy = (row) => row?.occupancy?.counts ?? row?.occupancy ?? null;
const agentWords = (running, count) => !count ? "" : running ? `${running}/${count} running` : `${count} agent${count > 1 ? "s" : ""}`;
export function liveNote(node, live) {
  if (!LIVE_KINDS.has(node.kind) || !live) return null;
  if (!live.ok) return { text: "", state: "", tone: "quiet", running: 0, count: 0 };
  if (node.kind === "role") {
    const agents = nodeLive(node, live).agents, count2 = agents.length;
    return { text: agentWords(0, count2), state: "", tone: agents.some((a) => a.busy) ? "running" : count2 ? "idle" : "", running: null, count: count2 };
  }
  const row = (node.kind === "host" ? live.hosts : live.seats).get(liveKey(node)), c = occupancy(row);
  const running = c?.busy ?? 0, count = c?.active ?? 0;
  return { text: agentWords(running, count), state: node.kind === "host" ? row?.label_text ?? row?.state ?? "" : "", tone: node.kind === "host" ? row?.health ?? "" : running ? "running" : count ? "idle" : "", running, count };
}
export function linkTone(map, a, b, live) {
  if (!live?.ok) return "";
  const ends = [map.byId.get(a), map.byId.get(b)];
  if (ends.some((n) => n?.kind === "host" && live.hosts.get(liveKey(n))?.health === "warning")) return "warning";
  const on = (agent, n) => agent[n.kind] === liveKey(n);
  return ends.every((n) => n && LIVE_KINDS.has(n.kind)) && live.agents.some((g) => g.busy && ends.every((n) => on(g, n))) ? "running" : "";
}
export function hostHealth(map, live) {
  return map.nodes.filter((n) => n.kind === "host").map((n) => {
    const row = live?.ok ? live.hosts.get(liveKey(n)) : null, d = row?.data ?? {}, note = liveNote(n, live);
    const cpu = typeof d.load === "number" && d.cpus > 0 ? Math.round(d.load / d.cpus * 100) : null;
    return { id: n.id, name: n.name, label: note?.state ?? "", cpu, tone: note?.tone ?? "", running: note?.running ?? 0, count: note?.count ?? 0, parts: (map.incoming.get(n.id) ?? []).filter((e) => e.rel === "runs-on").length };
  });
}
export function relationCounts(nodes) {
  const counts = new Map();
  for (const n of nodes) for (const e of n.links) counts.set(e.rel, (counts.get(e.rel) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export function nearest(points, from, key) {
  const [ax, ay] = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key] ?? [0, 0];
  let best = null, score = Infinity;
  for (const p of points) {
    const dx = p.x - from.x, dy = p.y - from.y, along = dx * ax + dy * ay, side = Math.abs(dx * ay - dy * ax);
    if (p.id === from.id || along < 1) continue;
    if (along + 2 * side < score) {
      score = along + 2 * side;
      best = p.id;
    }
  }
  return best;
}
export function sequence(flow) {
  const column = new Map(flow.actors.map((a, i) => [a.id, i])), row = new Map(flow.steps.map((s, i) => [s.id, i]));
  const steps = flow.steps.map((s, i) => {
    const following = flow.steps[i + 1]?.id;
    const leads = s.next.length === 1 && s.next[0] === following || !s.next.length ? [] : s.next.map((id) => flow.steps[row.get(id)].n);
    return { ...s, row: i, from: column.get(s.actor), into: s.to == null ? null : column.get(s.to), leads };
  });
  const backs = [];
  for (const s of steps) {
    if (!s.back) continue;
    const to = row.get(s.back.to);
    let lane = backs.find((b) => b.to === to);
    if (!lane) backs.push(lane = { to, n: flow.steps[to].n, sources: [] });
    lane.sources.push({ row: s.row, n: s.n, label: s.back.label });
  }
  backs.sort((a, b) => a.to - b.to);
  for (const [i, b] of backs.entries()) {
    b.last = Math.max(...b.sources.map((s) => s.row));
    b.lane = 0;
    while (backs.slice(0, i).some((o) => o.lane === b.lane && o.to <= b.last && b.to <= o.last)) b.lane++;
  }
  return { columns: flow.actors.length, steps, backs, lanes: backs.reduce((m, b) => Math.max(m, b.lane + 1), 0) };
}
