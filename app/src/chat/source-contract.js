import { activeGoalIds } from "../requests.js";
import { ledgerRef, l10n } from "../names.js";
export const canonical = (value) => JSON.stringify(value, (key, field) => field && typeof field === "object" && !Array.isArray(field) ? Object.fromEntries(Object.keys(field).sort().map((name2) => [name2, field[name2]])) : field);
const extension = (path) => path.slice(path.lastIndexOf("/") + 1).match(/\.[^.]*$/)?.[0] ?? "";
export const SRC_LIMITS = { columns: 12, rows: 200, points: 500, series: 8, items: 100, nodes: 60, edges: 120, fileBytes: 8 * 1024 * 1024, specBytes: 4096, cell: 500, blockBytes: 256 * 1024, jsonRows: 1e3, jsonColumns: 80, jsonBytes: 2 * 1024 * 1024 };
const KINDS = { chart: { data: ["labels", "series"], map: ["kind", "x", "y"], cap: SRC_LIMITS.points }, table: { data: ["columns", "rows"], map: ["cols"], cap: SRC_LIMITS.rows }, timeline: { data: ["items"], map: ["when", "label", "detail"], cap: SRC_LIMITS.items }, diagram: { data: ["nodes", "edges"], map: ["from", "to", "label"], cap: SRC_LIMITS.edges } };
const failSrc = (error, detail) => {
  throw Object.assign(new Error(detail), { error, detail });
};
const name = (value, detail) => {
  if (typeof value !== "string" || !value.trim() || value.length > 200) failSrc("bad_spec", detail);
  return value;
};
export function srcSpec(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) failSrc("bad_spec", "spec must be a JSON object");
  const kind = KINDS[value.type];
  if (!kind) failSrc("bad_spec", `src is not supported for type ${String(value.type)}`);
  for (const key of Object.keys(value)) {
    if (kind.data.includes(key)) failSrc("bad_spec", `src replaces ${key}`);
    if (!["id", "type", "title", "tone", "src", "limit", ...kind.map].includes(key)) failSrc("bad_spec", `unknown field ${value.type}.${key}`);
  }
  if (value.id !== void 0 && (typeof value.id !== "string" || !value.id.trim())) failSrc("bad_spec", "id");
  if (value.title !== void 0 && (typeof value.title !== "string" || value.title.length > 200)) failSrc("bad_spec", "title");
  if (value.tone !== void 0 && !["default", "accent", "muted"].includes(value.tone)) failSrc("bad_spec", "tone");
  if (typeof value.src !== "string" || value.src.length > 1024 || value.src.includes("\0")) failSrc("bad_spec", "src must be a string");
  if (/^file:./.test(value.src)) {
    if (![".csv", ".xlsx", ".json"].includes(extension(filePart(value.src).path).toLowerCase())) failSrc("bad_spec", "file: takes .csv, .xlsx or .json");
  } else if (ledgerSrc(value.src) && value.src.length > ledgerRef().length + 1) ledgerPart(value.src);
  else failSrc("bad_spec", `src must start with file: or ${ledgerRef()}:`);
  if (value.limit !== void 0) {
    if (!Number.isSafeInteger(value.limit) || value.limit < 1) failSrc("bad_spec", "limit must be a positive integer");
    if (value.limit > kind.cap) failSrc("too_large", `limit above ${kind.cap}`);
  }
  if (value.type === "chart") {
    if (!["line", "bar"].includes(value.kind)) failSrc("bad_spec", "chart.kind must be line or bar");
    name(value.x, "chart.x");
    const y = typeof value.y === "string" ? [value.y] : value.y;
    if (!Array.isArray(y) || !y.length) failSrc("bad_spec", "chart.y must be a column or a list of columns");
    y.forEach((v) => name(v, "chart.y"));
    if (y.length > SRC_LIMITS.series) failSrc("too_large", `chart.y above ${SRC_LIMITS.series} series`);
  }
  if (value.type === "table" && value.cols !== void 0) {
    if (!Array.isArray(value.cols) || !value.cols.length) failSrc("bad_spec", "table.cols must be a list of columns");
    value.cols.forEach((v) => name(v, "table.cols"));
    if (value.cols.length > SRC_LIMITS.columns) failSrc("too_large", `table.cols above ${SRC_LIMITS.columns}`);
  }
  for (const key of ["when", "label", "detail", "from", "to"]) if (kind.map.includes(key) && value[key] !== void 0) name(value[key], `${value.type}.${key}`);
  return value;
}
function filePart(src) {
  const raw = src.slice("file:".length), hash = raw.lastIndexOf("#");
  return hash > 0 && raw.slice(0, hash).toLowerCase().endsWith(".xlsx") ? { path: raw.slice(0, hash), sheet: raw.slice(hash + 1) } : { path: raw, sheet: void 0 };
}
export const ledgerSrc = (src) => typeof src === "string" && src.startsWith(ledgerRef() + ":");
function ledgerPart(src) {
  const raw = src.slice(ledgerRef().length + 1), q = raw.indexOf("?"), view = q < 0 ? raw : raw.slice(0, q);
  if (!/^[a-z_]{1,32}$/.test(view)) failSrc("bad_spec", `${ledgerRef()} view name`);
  const params = new URLSearchParams(q < 0 ? "" : raw.slice(q + 1)), filters = {};
  for (const [key, value] of params) {
    if (key in filters) failSrc("bad_spec", `${ledgerRef()} filter ${key} repeated`);
    filters[key] = value;
  }
  return { view, filters };
}
const cell = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? { t: String(value), n: value } : null;
  if (typeof value === "boolean") return { t: value ? "true" : "false" };
  const t = typeof value === "string" ? value : JSON.stringify(value);
  return { t: t.length > SRC_LIMITS.cell ? t.slice(0, SRC_LIMITS.cell) : t };
};
const NUMERIC = /^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/;
const numeric = (c) => c?.n ?? (c && NUMERIC.test(c.t.trim()) ? Number(c.t) : void 0);
const KST = 9 * 36e5;
const time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + KST).toISOString().slice(0, 16).replace("T", " ") : null;
const list = (value) => Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : [];
const id = (value) => {
  if (!/^[1-9]\d{0,15}$/.test(value)) failSrc("bad_spec", "filter takes a number");
  return Number(value);
};
const word = (value) => {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(value)) failSrc("bad_spec", "filter value");
  return value;
};
const equals = (key) => (value) => {
  word(value);
  return (row) => row[key] === value;
};
const resourceList = (r) => [...r.hosts.map((h) => ({ ...h, kind: "host", status: h.label_text })), ...r.resources.gpu.map((g) => ({ ...g, status: g.data?.status }))];
const same = (key) => (value) => {
  const n = id(value);
  return (row) => row[key] === n;
};
const status = (active) => (value) => {
  word(value);
  return (row) => value === "active" ? active(String(row.status)) : row.status === value;
};
const any = (key) => (value) => {
  const n = String(id(value));
  return (row) => String(row[key] ?? "").split(" · ").includes(n);
};
const LIVE_ROWS = new WeakSet();
const SEAT_STATUS = new WeakMap();
const seatRow = (row, status2) => {
  SEAT_STATUS.set(row, String(status2 ?? ""));
  return row;
};
const liveRow = (row, live2) => {
  if (live2) LIVE_ROWS.add(row);
  return row;
};
const live = (value) => {
  word(value);
  return (row) => value === "active" ? LIVE_ROWS.has(row) : row.status === value;
};
export const SOURCE_VIEWS = { goals: { columns: ["id", "title", "status", "size", "projects", "created_at", "updated_at"], timeline: ["updated_at", "title", "status"], rows: (d) => {
  const active = activeGoalIds(d);
  return list(d.goals).map((g) => liveRow({ id: g.id, title: g.title, status: g.status, size: g.size, projects: list(g.projects).length, created_at: time(g.created_at), updated_at: time(g.updated_at) }, active.has(g.id)));
}, filters: { status: live, size: equals("size"), id: same("id") } }, events: { columns: ["id", "at", "kind", "actor", "goal", "project", "agent", "summary"], timeline: ["at", "summary", "kind"], rows: (_d, _w, _r, state) => {
  return state.events.map((e) => ({ id: e.id, at: time(e.at), kind: e.kind, actor: e.actor, goal: e.goal_id, project: e.project_id, agent: e.agent_id, summary: e.summary }));
}, filters: { goal: same("goal"), project: same("project"), actor: equals("actor"), agent: equals("agent"), kind: (value) => {
  word(value);
  return (row) => row.kind === value || String(row.kind).startsWith(value + ".");
} } }, requests: { columns: ["id", "at", "channel", "role", "status", "goal", "text", "result", "closed_at"], timeline: ["at", "text", "status"], rows: (d, w) => {
  const live2 = new Set(w.requests.map((r) => r.id));
  return [...new Map([...list(d.requests), ...w.requests].map((r) => [r.id, r])).values()].map((r) => liveRow({ id: r.id, at: time(r.at), channel: r.channel, role: r.role, status: r.status, goal: list(r.goals).map((g) => g.id).join(" · ") || null, text: r.owner_text, result: r.result, closed_at: time(r.closed_at) }, live2.has(r.id)));
}, filters: { status: live, goal: any("goal"), role: equals("role"), channel: equals("channel") } }, seats: { columns: ["seat", "status", "week_pct", "five_hour_pct", "burn_per_hour", "week_resets_at", "five_hour_resets_at", "at"], timeline: ["at", "seat", "status"], rows: (_d, _w, r) => r.resources.seats.map((s) => seatRow({ seat: s.key, status: s.label_text, week_pct: s.data?.weekly, five_hour_pct: s.data?.five_hour, burn_per_hour: s.data?.burn_per_hour, week_resets_at: time(s.data?.weekly_resets_at), five_hour_resets_at: time(s.data?.five_hour_resets_at), at: time(s.at) }, s.data?.status)), filters: { status: (value) => {
  word(value);
  return (row) => SEAT_STATUS.get(row)?.toLowerCase() === value.toLowerCase();
}, seat: equals("seat") } }, resources: { columns: ["kind", "key", "label", "status", "cpus", "load", "mem_free_gb", "disk_used_pct", "gpu_util", "gpu_mem_free_mb", "gpu_mem_used_mb", "at"], timeline: ["at", "label", "status"], rows: (_d, _w, r) => resourceList(r).map((r2) => ({ kind: r2.kind, key: r2.key, label: r2.label ?? r2.key, status: r2.status ?? null, cpus: r2.data?.cpus, load: r2.data?.load, mem_free_gb: r2.data?.mem_free_gb, disk_used_pct: r2.data?.disk_used_pct, gpu_util: r2.data?.util, gpu_mem_free_mb: r2.data?.mem_free_mb, gpu_mem_used_mb: r2.data?.mem_used_mb, at: time(r2.at) })), filters: { kind: equals("kind"), key: equals("key") } }, approvals: { columns: ["id", "goal", "kind", "level", "status", "scope", "created_at", "decided_at", "decided_via", "card_url"], timeline: ["created_at", "scope", "status"], rows: (_d, w) => w.approvals.items.map((a) => ({ id: a.id, goal: a.goal_id, kind: a.kind, level: a.level, status: a.status, scope: a.scope_text, created_at: time(a.created_at), decided_at: time(a.decided_at), decided_via: a.decided_via, card_url: typeof a.card_url === "string" && /^https:\/\//.test(a.card_url) ? a.card_url : null })), filters: { status: status((s) => s === "pending"), goal: same("goal"), kind: equals("kind"), level: equals("level") } }, completed: { columns: ["goal", "title", "status", "done_at", "requests", "result"], timeline: ["done_at", "title", "status"], rows: (_d, w) => list(w.completed?.items).map((c) => ({ goal: c.goal_id, title: c.title, status: c.status, done_at: time(c.done_at), requests: list(c.requests).map((r) => r.id).join(" · ") || null, result: c.result })), filters: { status: equals("status"), goal: same("goal") } } };
const column = (records, key) => {
  const i = records.columns.indexOf(key);
  if (i < 0) failSrc("not_found", `no column ${key}`);
  return i;
};
const shown = (c) => {
  const t = c?.t ?? "";
  return t.length > SRC_LIMITS.cell ? t.slice(0, SRC_LIMITS.cell - 1) + "…" : t;
};
function shape(spec, data, notes) {
  const cap = Math.min(spec.limit ?? KINDS[spec.type].cap, KINDS[spec.type].cap);
  const cut = (items, unit, total = items.length) => {
    const kept = items.slice(0, cap);
    if (total > kept.length) notes.push(l10n(`전체 ${total}${unit} 중 ${kept.length}${unit}`, `${kept.length} of ${total}`));
    return kept;
  };
  if ("chart" in data) {
    if (spec.type !== "chart") failSrc("not_found", "unsupported JSON shape");
    const ys = typeof spec.y === "string" ? [spec.y] : spec.y;
    const series = ys.map((y) => data.chart.series.find((s) => s?.name === y) ?? failSrc("not_found", `no series ${y}`));
    const labels = cut(data.chart.labels, "개");
    return { kind: spec.kind, labels, series: series.map((s) => ({ name: s.name, values: Array.isArray(s.values) ? s.values.slice(0, labels.length) : s.values })) };
  }
  if ("graph" in data) {
    if (data.graph.nodes.length > SRC_LIMITS.nodes || data.graph.edges.length > SRC_LIMITS.edges) failSrc("too_large", `diagram above ${SRC_LIMITS.nodes} nodes or ${SRC_LIMITS.edges} edges`);
    return { nodes: data.graph.nodes, edges: cut(data.graph.edges, "개") };
  }
  if (!data.rows.length) failSrc("not_found", "the source has no rows");
  const unread = (data.total ?? data.rows.length) - data.rows.length, width = data.width ?? data.columns.length;
  if (spec.type === "table") {
    if (!spec.cols && width > SRC_LIMITS.columns) notes.push(l10n(`전체 ${width}열 중 ${SRC_LIMITS.columns}열`, `${SRC_LIMITS.columns} of ${width} columns`));
    const cols = spec.cols ?? data.columns.slice(0, SRC_LIMITS.columns), index = cols.map((key) => column(data, key));
    return { columns: cols, rows: cut(data.rows, "행", data.rows.length + unread).map((row) => index.map((i) => shown(row[i]))) };
  }
  if (spec.type === "chart") {
    const x = column(data, spec.x), ys = typeof spec.y === "string" ? [spec.y] : spec.y, index = ys.map((key) => column(data, key));
    const points = [];
    let skipped = 0;
    for (const row of data.rows) {
      const values = index.map((i) => numeric(row[i]));
      if (values.every((v) => v !== void 0 && Number.isFinite(v))) points.push({ label: shown(row[x]), values });
      else skipped++;
    }
    if (!points.length) failSrc("bad_spec", "chart.y has no numeric rows");
    if (skipped) notes.push(l10n(`숫자가 아닌 ${skipped}행 제외`, `${skipped} non-numeric rows left out`));
    const kept = cut(points, "개", points.length + unread);
    return { kind: spec.kind, labels: kept.map((p) => p.label), series: ys.map((name2, s) => ({ name: name2, values: kept.map((p) => p.values[s]) })) };
  }
  if (spec.type === "timeline") {
    const [when, label2, detail] = data.timeline ?? ["when", "label", "detail"];
    const w = column(data, spec.when ?? when), l = column(data, spec.label ?? label2);
    const d = spec.detail !== void 0 ? column(data, spec.detail) : data.columns.indexOf(detail);
    return { items: cut(data.rows, "개", data.rows.length + unread).map((row) => ({ when: shown(row[w]), label: shown(row[l]), ...d >= 0 && row[d] ? { detail: shown(row[d]) } : {} })) };
  }
  const from = column(data, spec.from ?? "from"), to = column(data, spec.to ?? "to");
  const label = spec.label !== void 0 ? column(data, spec.label) : data.columns.indexOf("label");
  const linked = data.rows.filter((row) => row[from]?.t && row[to]?.t), edges = cut(linked, "개", linked.length + unread), nodes = new Map();
  for (const row of edges) for (const end of [row[from].t, row[to].t]) if (!nodes.has(end)) nodes.set(end, { id: end, label: end });
  if (nodes.size > SRC_LIMITS.nodes) failSrc("too_large", `diagram above ${SRC_LIMITS.nodes} nodes`);
  return { nodes: [...nodes.values()], edges: edges.map((row) => ({ from: row[from].t, to: row[to].t, ...label >= 0 && row[label] ? { label: shown(row[label]) } : {} })) };
}
export { ledgerPart, cell, shape, time };
export function sourceKey(value) {
  const spec = { ...srcSpec(value) };
  delete spec.id;
  if (spec.limit === KINDS[spec.type]?.cap) delete spec.limit;
  if (ledgerSrc(spec.src)) {
    const { view, filters } = ledgerPart(spec.src), params = new URLSearchParams(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
    spec.src = ledgerRef() + ":" + view + (params.size ? "?" + params : "");
  }
  if (spec.type === "chart" && typeof spec.y === "string") spec.y = [spec.y];
  return canonical(spec);
}
export function sourceRecords(src, page, objects = false) {
  const { view, filters } = ledgerPart(src), contract = SOURCE_VIEWS[view];
  if (!contract) failSrc("not_found", `no ${ledgerRef()} view ${view}`);
  const tests = Object.entries(filters).map(([key, value]) => contract.filters[key] ? contract.filters[key](value) : failSrc("bad_spec", `${ledgerRef()}:${view} has no filter ${key}`));
  const d = page?.dashboard, w = d?.owner_work, r = d?.resources;
  if (!d || view === "goals" && !Array.isArray(d.goals) || view === "approvals" && !Array.isArray(d.approvals) || view === "completed" && !Array.isArray(d.completed?.items) || view === "seats" && !Array.isArray(r?.seats) || view === "resources" && (!Array.isArray(r?.hosts) || !Array.isArray(r?.gpu)) || view === "events" && !Array.isArray(page.events) || view === "requests" && (!Array.isArray(w?.requests) || !Array.isArray(page.requests) && filters.status !== "active") || view === "goals" && filters.status === "active" && !Array.isArray(w?.work_groups)) return;
  const rows = contract.rows({ ...d, requests: filters.status === "active" ? [] : page.requests ?? [] }, { ...w, approvals: { items: d.approvals }, completed: d.completed }, { hosts: r?.hosts, resources: r }, page).filter((row) => tests.every((test) => test(row)));
  return objects ? { objects: rows } : { columns: contract.columns, rows: rows.map((row) => contract.columns.map((key) => cell(row[key]))), timeline: contract.timeline };
}
const safeWords = new Set([...Object.values(SOURCE_VIEWS).flatMap((v) => v.columns), "blocked_on_owner", "awaiting_owner", "awaiting_approval", "in_progress"]);
const safeText = (text) => safeWords.has(text) || /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(text) || !/(?:[A-Za-z0-9_+\/-]{10,}|[=:{}\[\]"'\\]|password|secret|token|credential|authorization|bearer|private.?key|api.?key)/i.test(text);
export function pageSource(value, page) {
  if (!page?.dashboard) return;
  const spec = srcSpec(value);
  if (!ledgerSrc(spec.src)) return;
  const data = sourceRecords(spec.src, page);
  if (!data) return;
  const notes = [], inline = shape(spec, data, notes), asOf = page.fetched_at ?? page.dashboard.generated_at;
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return;
  const drawn = { id: spec.id ?? "src1", type: spec.type, ...spec.title !== void 0 ? { title: spec.title } : {}, ...spec.tone !== void 0 ? { tone: spec.tone } : {}, ...inline };
  const strings = (value2) => typeof value2 === "string" ? [value2] : value2 && typeof value2 === "object" ? Object.values(value2).flatMap(strings) : [];
  if (![...strings(drawn), ...Object.values(ledgerPart(spec.src).filters)].every(safeText)) return;
  const block = { ...drawn, provenance: [spec.src, l10n(`${time(asOf)} KST 기준`, `as of ${time(asOf)} KST`), ...notes].join(" · "), as_of: new Date(asOf).toISOString() };
  if (new TextEncoder().encode(JSON.stringify(block)).length > SRC_LIMITS.blockBytes) failSrc("too_large", "block above byte limit");
  return { ok: true, block };
}
export function pageRevision(page) {
  const payload = page.dashboard, d = payload?.dashboard;
  return payload?.fetched_at ? JSON.stringify([payload.fetched_at, d?.generated_at, d?.owner_work?.as_of, d?.last_event_id]) : d ?? null;
}
