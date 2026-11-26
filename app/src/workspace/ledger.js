import { shortWhen, clip } from "./core.js";
import { ledgerRef } from "../names.js";
export const STATUS = { received: "New", planning: "Planning", awaiting_approval: "Awaiting approval", executing: "Executing", done_candidate: "Checking done", done: "Done", blocked: "Blocked", blocked_on_owner: "Your turn", awaiting_owner: "Your turn", paused: "Paused", dropped: "Dropped", merged: "Merged" };
export const REQUEST = { open: "Open", in_progress: "In progress", done: "Done", dropped: "Dropped" };
export const DECISION = { approved: "Approved", denied: "Denied", rejected: "Rejected", expired: "Expired", pending: "Pending" };
const SIZE = { small: "Small", medium: "Medium", big: "Big" };
const RESOURCE = { seat: "Seats", host: "Hosts", gpu: "GPUs", codex: "Codex", api: "API" };
const goalStatus = (goal2) => goal2.now ? md(goal2.now) : STATUS[goal2.status] ?? md(goal2.status);
export const statusName = (kind, status) => (kind === "goal" ? STATUS : kind === "request" ? REQUEST : kind === "approval" ? DECISION : {})[status] ?? String(status ?? "");
const md = (value) => String(value ?? "").replace(/[\\`*_[\]<>|~#]/g, "\\$&");
const plain = (id, body, label = "") => ({ id, type: "ledger", part: "plain", label, text: String(body ?? "") });
const ownerAsk = (id, body, at) => ({ id, type: "ledger", part: "ask", label: "Your turn", text: String(body ?? ""), at: at ?? null });
const goalRef = (id) => id ? `[#${id}](${ledgerRef()}:goal/${id})` : "—";
const heading = (id, text2, level = 2) => ({ id, type: "heading", level, text: text2 });
const text = (id, body) => ({ id, type: "text", text: body });
const table = (id, columns, rows) => ({ id, type: "table", columns, rows });
const newest = (field) => (a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? ""));
export const running = (goal2) => goal2.place === "live";
export const openGoal = (goal2) => goal2.active === true;
export const liveRequest = (request2) => request2.live === true;
export const doneAt = (goal2) => goal2.done_at ?? null;
const goalRefs = (goals2) => (goals2 ?? []).map((goal2) => goalRef(goal2.id)).join(" ") || "—";
const when = (value) => value ? shortWhen(value) : "—";
function goals({ goals: rows = [] }, turn = []) {
  const open = rows.filter(openGoal), live = open.filter(running).sort(newest("updated_at")), waiting = open.filter((goal2) => goal2.place !== "live" && goal2.place !== "later").sort(newest("updated_at"));
  const later = open.filter((goal2) => goal2.place === "later").sort((a, b) => String(a.next_check_at ?? "").localeCompare(String(b.next_check_at ?? "")));
  const ended = rows.filter((goal2) => !openGoal(goal2)), still = ended.filter((goal2) => goal2.status !== "done").sort(newest("updated_at"));
  const done = ended.filter((goal2) => goal2.status === "done").sort((a, b) => String(doneAt(b) ?? "").localeCompare(String(doneAt(a) ?? "")));
  const owner = turn;
  const ownerRef = (item) => item.goal_id || item.kind === "goal" ? goalRef(item.goal_id ?? item.id) : `[#${item.id}](${item.kind === "step" ? "#/step/" : ledgerRef() + ":approval/"}${item.id})`;
  const row = (goal2) => [goalRef(goal2.id), md(goal2.title), goalStatus(goal2), SIZE[goal2.size] ?? "—", md(clip(goal2.waiting_on, 60)) || "—", when(goal2.updated_at)];
  return { title: "Goals", blocks: [text("g0", `Running **${live.length}** · Waiting ${waiting.length} · Later ${later.length} · Dropped or merged ${still.length} · Done ${done.length} · All ${rows.length}`), heading("g1", "Your turn"), owner.length ? table("g2", ["Item", "Title", "Waiting on"], owner.map((item) => [ownerRef(item), md(item.title), md(clip(item.what, 90)) || "—"])) : text("g2", "No goal is waiting on you now."), heading("g3", "Running"), live.length ? table("g4", ["Goal", "Title", "Status", "Size", "Waiting on", "Updated"], live.map(row)) : text("g4", "No goal is running."), heading("g4a", "Waiting"), waiting.length ? table("g4b", ["Goal", "Title", "Status", "Size", "Waiting on", "Updated"], waiting.map(row)) : text("g4b", "None."), heading("g4c", "Later"), later.length ? table("g4d", ["Goal", "Title", "Waiting on", "Back"], later.map((goal2) => [goalRef(goal2.id), md(goal2.title), md(clip(goal2.waiting_on, 60)) || "—", when(goal2.next_check_at)])) : text("g4d", "None."), heading("g5", "Dropped · Merged"), still.length ? table("g6", ["Goal", "Title", "Status", "Updated"], still.map((goal2) => [goalRef(goal2.id), md(goal2.title), goalStatus(goal2), when(goal2.updated_at)])) : text("g6", "None."), heading("g7", "Done"), done.length ? table("g8", ["Goal", "Title", "Done"], done.slice(0, 30).map((goal2) => [goalRef(goal2.id), md(goal2.title), when(doneAt(goal2))])) : text("g8", "None."), ...done.length > 30 ? [text("g9", `The latest 30. The other ${done.length - 30} are in the ledger's history.`)] : []] };
}
function goal({ goals: rows = [], requests: requests2 = [], approvals: approvals2 = [] }, id) {
  const item = rows.find((goal2) => goal2.id === id);
  if (!item) return null;
  const linked = new Set(item.request_ids ?? []);
  const asked = requests2.filter((request2) => linked.has(request2.id) || (request2.goals ?? []).some((goal2) => goal2.id === id)).sort(newest("at")), decided = approvals2.filter((approval2) => approval2.goal_id === id).sort(newest("created_at"));
  const facts = [`**${goalStatus(item)}**`, item.whose ? "Turn " + md(item.whose) : "", item.eta ? "ETA " + md(item.eta) : "", SIZE[item.size], "Created " + when(item.created_at), "Updated " + when(item.updated_at), running(item) ? "Running" : ""].filter(Boolean).join(" · ");
  const blocks = [text("o0", facts), ...item.owner_action ? [ownerAsk("o0a", item.owner_action, item.updated_at)] : [], ...item.waiting_on ? [plain("o0w", item.waiting_on, "Waiting on")] : [], ...item.next_check_at ? [text("o0n", `Next check ${when(item.next_check_at)}`)] : []];
  if (item.projects?.length) blocks.push(heading("o1", "Projects"), table("o2", ["Project", "Title", "Status", "Blocked on", "Opened"], item.projects.map((project) => ["#" + md(project.id), md(project.title), STATUS[project.status] ?? md(project.status), md(clip(project.blocked ?? project.waiting_on, 80)) || "—", when(project.opened_at)])));
  blocks.push(heading("o3", "Requests"), asked.length ? table("o4", ["Request", "Received", "Status", "Text"], asked.map((request2) => [`[#${request2.id}](${ledgerRef()}:request/${request2.id})`, when(request2.at), REQUEST[request2.status] ?? md(request2.status), md(clip(request2.text, 140))])) : text("o4", "No request is attached to this goal."));
  if (decided.length) blocks.push(heading("o5", "Approvals"), table("o6", ["Approval", "Kind", "Decision", "Scope"], decided.map((approval2) => [`[#${approval2.id}](${ledgerRef()}:approval/${approval2.id})`, md(approval2.kind + " · " + approval2.level), DECISION[approval2.status] ?? md(approval2.status), md(clip(approval2.scope, 120))])));
  return { title: `#${item.id} ${item.title}`, blocks };
}
function requests({ requests: rows = [] }) {
  const open = rows.filter(liveRequest).sort(newest("at")), done = rows.filter((request2) => !liveRequest(request2)).sort(newest("at"));
  const row = (request2) => [`[#${request2.id}](${ledgerRef()}:request/${request2.id})`, when(request2.at), goalRefs(request2.goals), md(clip(request2.text, 120))];
  return { title: "Requests", blocks: [text("r0", `Open or in progress **${open.length}** · Done or dropped ${done.length} · All ${rows.length}`), heading("r1", "Open or in progress"), open.length ? table("r2", ["Request", "Received", "Goals", "Text"], open.map(row)) : text("r2", "No request is open."), heading("r3", "Recently closed"), done.length ? table("r4", ["Request", "Received", "Goals", "Text"], done.slice(0, 20).map(row)) : text("r4", "None.")] };
}
function request({ requests: rows = [] }, id) {
  const item = rows.find((request2) => request2.id === id);
  if (!item) return null;
  return { title: `Request #${item.id}`, blocks: [text("q0", [`**${REQUEST[item.status] ?? md(item.status)}**`, "Received " + when(item.at), "Goals " + goalRefs(item.goals), md(item.channel), item.closed_at ? "Closed " + when(item.closed_at) : ""].filter(Boolean).join(" · ")), heading("q1", "Your message"), plain("q2", item.text || "—")] };
}
function approvals({ approvals: rows = [] }) {
  const waiting = rows.filter((approval2) => approval2.status === "pending").sort(newest("created_at"));
  const decided = rows.filter((approval2) => approval2.decided_7d === true).sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)));
  const row = (approval2) => [`[#${approval2.id}](${ledgerRef()}:approval/${approval2.id})`, goalRef(approval2.goal_id), md(approval2.kind + " · " + approval2.level), DECISION[approval2.status] ?? md(approval2.status), md(clip(approval2.scope, 110)), when(approval2.decided_at ?? approval2.created_at)];
  return { title: "Approvals", blocks: [text("a0", waiting.length ? `Pending **${waiting.length}**` : "No approval is waiting now."), ...waiting.length ? [heading("a1", "Pending"), table("a2", ["Approval", "Goal", "Kind", "Status", "Scope", "Created"], waiting.map(row))] : [], heading("a3", `Decided · 7 days ${decided.length}`), decided.length ? table("a4", ["Approval", "Goal", "Kind", "Decision", "Scope", "Decided"], decided.slice(0, 25).map(row)) : text("a4", "None.")] };
}
function approval({ approvals: rows = [] }, id) {
  const item = rows.find((approval2) => approval2.id === id);
  if (!item) return null;
  const card = typeof item.card_url === "string" && item.card_url.startsWith("https://") ? item.card_url : null;
  return { title: `Approval #${item.id}`, blocks: [text("p0", [`**${DECISION[item.status] ?? md(item.status)}**`, md(item.kind + " · " + item.level), "Goal " + goalRef(item.goal_id), "Created " + when(item.created_at), item.decided_at ? "Decided " + when(item.decided_at) : "", item.decided_via ? md(item.decided_via) : ""].filter(Boolean).join(" · ")), heading("p1", "Scope"), plain("p2", item.scope || "—"), ...card ? [text("p3", `Decide it in Lime: [the approval card](${card})`)] : []] };
}
const resourceStatus = (row) => row.kind === "host" ? row.state_text ?? row.status : row.kind === "codex" ? row.fresh ? `${row.use?.busy ?? 0}/${row.use?.active ?? 0} busy` : row.status || "Unavailable" : row.kind === "api" ? row.valid ? `$${row.use?.period_cost_usd} / $${row.use?.monthly_usd}` : row.status || "Unavailable" : row.status;
function resources({ resources: rows = [] }) {
  const of = (kind) => rows.filter((row) => row.kind === kind), kinds = Object.keys(RESOURCE).filter((kind) => of(kind).length);
  const providers = of("seat").length + of("codex").length + of("api").length, hosts = of("host");
  const counts = [of("seat").length ? `Seats ${of("seat").length}` : "", providers > of("seat").length ? `Providers ${providers}` : "", hosts.length ? `Hosts ${hosts.length} · online ${hosts.filter((row) => row.online === true).length}` : "", of("gpu").length ? `GPUs ${of("gpu").length}` : ""].filter(Boolean);
  return { title: "Resources", blocks: [text("s0", counts.join(" · ") || "No resources on record."), ...kinds.flatMap((kind, n) => [heading("s" + (n * 2 + 1), RESOURCE[kind]), table("s" + (n * 2 + 2), ["ID", "Name", "Status", "Checked"], of(kind).map((row) => [md(row.key), md(row.label) || "—", md(resourceStatus(row)) || "—", when(row.at)]))])] };
}
export function ledgerNeeds(ref) {
  const [kind] = String(ref).split("/");
  return kind === "goals" ? ["goals"] : kind === "goal" ? ["goals", "requests", "approvals"] : kind === "requests" || kind === "request" ? ["requests"] : kind === "approvals" || kind === "approval" ? ["approvals"] : kind === "resources" ? ["resources"] : [];
}
export function ledgerDoc(ref, rows, { turn = [], fetchedAt = null } = {}) {
  const [kind, raw] = String(ref).split("/"), id = Number(raw), R = rows ?? {};
  const doc = kind === "goals" ? goals(R, turn) : kind === "goal" ? goal(R, id) : kind === "requests" ? requests(R) : kind === "request" ? request(R, id) : kind === "approvals" ? approvals(R) : kind === "approval" ? approval(R, id) : kind === "resources" ? resources(R) : null;
  return doc && { ...doc, updatedAt: fetchedAt };
}
