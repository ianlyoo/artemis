import { lead, isLead, ledgerName, ledgerRef } from "../names.js";
import { zoned } from "../zone.js";
const STEPS = [[/^Read$/, "read", "File read", "Reading a file", "Read a file"], [/^Grep$/, "search", "Code search", "Searching code", "Searched code"], [/^Glob$/, "search", "File search", "Finding files", "Found files"], [/^(Edit|MultiEdit|NotebookEdit)$/, "edit", "File edit", "Editing a file", "Edited a file"], [/^Write$/, "edit", "File write", "Writing a file", "Wrote a file"], [/^Bash$/, "run", "Command", "Running a command", "Ran a command"], [/^WebSearch$/, "web", "Web search", "Searching the web", "Searched the web"], [/^WebFetch$/, "web", "Web page read", "Reading a web page", "Read a web page"], [/^(Task|Agent)$/, "hand", "Subtask", "Handing off a subtask", "Handed off a subtask"], [/^TodoWrite$/, "list", "To-do update", "Updating the to-dos", "Updated the to-dos"], [/^ToolSearch$/, "search", "Tool search", "Finding a tool", "Found a tool"], [/^company · (state|dashboard)$/, "ledger", "Ledger check", "Checking the ledger", "Checked the ledger"], [/^company · log$/, "ledger", "Log entry", "Writing a log entry", "Wrote a log entry"], [/^company · search$/, "search", "Ledger search", "Searching the ledger", "Searched the ledger"], [/^company · read$/, "ledger", "Ledger read", "Reading the ledger", "Read the ledger"], [/^company · request_log$/, "ledger", "Request log", "Logging your request", "Logged your request"], [/^company · goal_create$/, "ledger", "Goal creation", "Creating a goal", "Created a goal"], [/^company · (goal_(move|note|wait|attach|merge|reopen)|roadmap_submit)$/, "ledger", "Goal update", "Updating a goal", "Updated a goal"], [/^company · decide$/, "ledger", "Decision", "Recording a decision", "Recorded a decision"], [/^company · project_open$/, "hand", "Project start", "Starting a project", "Started a project"], [/^company · project_(move|note|wait|park)$/, "ledger", "Project update", "Updating a project", "Updated a project"], [/^company · report$/, "ledger", "Report", "Reporting", "Reported"], [/^company · ask$/, "ask", "Question", "Sending a question", "Sent a question"], [/^company · gpu_slot$/, "gpu", "GPU slot", "Using the GPU slot", "Used the GPU slot"], [/^company · admin_job$/, "ask", "Admin job", "Asking you to approve an admin job", "Asked you to approve an admin job"], [/^company · memory_hook$/, "ledger", "Memory save", "Saving memory", "Saved memory"], [/^company · /, "ledger", "Ledger tool", "Using a ledger tool", "Used a ledger tool"]];
const BOARD = ["board", "Board open", "Opening a board", "Opened a board"], OTHER = ["tool", "Tool", "Using a tool", "Used a tool"];
const GOAL_WRITES = new Set(["goal_move", "goal_note", "goal_wait", "goal_attach", "goal_merge", "goal_reopen", "roadmap_submit"]), PROJECT_WRITES = new Set(["project_move", "project_note", "project_wait", "project_park"]);
const HQ_TOOLS = new Set(["state", "dashboard", "log", "search", "read", "request_log", "goal_create", ...GOAL_WRITES, "decide", "project_open", ...PROJECT_WRITES, "report", "ask", "gpu_slot", "admin_job", "memory_hook"]);
const toolName = (tool) => {
  const name = String(tool?.name ?? ""), old = ledgerRef() + " · ";
  return name.startsWith(old) ? "company · " + name.slice(old.length) : name;
};
const IMAGE = ["image", "Image view", "Viewing an image", "Viewed an image"];
const COMPACTION = ["compact", "Compaction", "Compacting context", "Compacted context"];
const ROLE_WORDS = { owner: "you", cto: "the CTO", pm: "a PM", worker: "a worker", reviewer: "a reviewer" };
const roleWord = (id) => isLead(id) ? lead() : Object.hasOwn(ROLE_WORDS, id ?? "") ? ROLE_WORDS[id] : void 0;
export function stepWords(tool) {
  const name = toolName(tool), hit = STEPS.find(([pattern]) => pattern.test(name));
  if (tool?.kind === "compaction") return words(COMPACTION);
  if (imageOf(tool)) return words(IMAGE);
  const command = name === "Bash" ? companyCommand(tool.summary) : null;
  const named = command && !Object.hasOwn(COMMANDS, command.command) ? command.command.replace(/-/g, "_") : null;
  if (named && HQ_TOOLS.has(named)) return toolWords(named, { ...tool, summary: `${named} ${command.rest}` }) ?? words(STEPS.find(([pattern]) => pattern.test("company · " + named)).slice(1));
  if (command) return words(commandWords(command));
  if (name.startsWith("company · ")) {
    const told = toolWords(name.slice("company · ".length), tool);
    if (told) return told;
  }
  const [icon, noun, doing, done] = hit?.[1] === "run" && (tool.refs ?? []).some((ref) => ref?.kind === "board") ? BOARD : hit ? hit.slice(1) : OTHER;
  return { icon, noun, doing, done };
}
const words = ([icon, noun, doing, done]) => ({ icon, noun, doing, done });
const READS = { goals: ["goal", "the goals"], projects: ["project", "the projects"], requests: ["request", "the requests"], approvals: ["approval", "the approvals"], asks: ["question", "the questions"], events: ["event", "the events"], agents: [null, "the agents"], resources: [null, "the resources"], owner_messages: ["message", "your messages"], lessons: ["lesson", "the lessons"], memory: [null, "the memory"], conversation: [null, "the conversation"], docs: [null, "the docs"], journal: [null, "the journal"] };
const VERDICTS = { approve: ["Approving", "Approved", "a roadmap"], deny: ["Denying", "Denied", "a roadmap"], accept: ["Accepting", "Accepted", "a result"], reject: ["Rejecting", "Rejected", "a result"] };
const REPORTS = { progress: ["Reporting progress", "Reported progress"], blocked: ["Reporting a blocker", "Reported a blocker"], done_candidate: ["Reporting work done", "Reported work done"], incident: ["Reporting an incident", "Reported an incident"], lesson: ["Recording a lesson", "Recorded a lesson"], presence: ["Updating presence", "Updated presence"], relaunch: ["Requesting a relaunch", "Requested a relaunch"], memo: ["Writing a journal memo", "Wrote a journal memo"] };
const GPU = { acquire: ["Reserving the GPU", "Reserved the GPU"], release: ["Releasing the GPU", "Released the GPU"], status: ["Checking the GPU", "Checked the GPU"] };
function toolWords(tool, call) {
  const [icon, noun, doing, done] = STEPS.find(([pattern]) => pattern.test("company · " + tool)).slice(1);
  const args = argsOf(call.summary, tool), first = args.bare[0], said = (now, past, what = noun) => ({ icon, noun: what, doing: now, done: past });
  if (tool === "ask") {
    const role = roleWord((call.refs ?? []).find((ref) => ref?.kind === "role")?.id) ?? roleWord(args.pairs.to_role ?? first), answer = idIn(args.pairs.ask_id) ?? (first === "answer" ? idIn(args.bare[1]) : null);
    if (answer) return said(`Answering question #${answer}`, `Answered question #${answer}`, "Answer");
    if (role) return said("Asking " + role, "Asked " + role, "Question to " + role);
    return null;
  }
  if (tool === "read") {
    const kind = READS[args.pairs.kind ?? first], id = idOf(args, null, true);
    if (kind?.[0] && id) return said(`Reading ${kind[0]} #${id}`, `Read ${kind[0]} #${id}`);
    return kind ? said("Reading " + kind[1], "Read " + kind[1]) : null;
  }
  if (GOAL_WRITES.has(tool) || PROJECT_WRITES.has(tool)) {
    const subject = PROJECT_WRITES.has(tool) ? "project" : "goal", id = idOf(args, subject, true), status = statusOf(args.pairs.status);
    if (!id) return null;
    return status ? said(`Moving ${subject} #${id} to ${status}`, `Moved ${subject} #${id} to ${status}`) : said(`Updating ${subject} #${id}`, `Updated ${subject} #${id}`);
  }
  if (tool === "decide") {
    const verdict = args.pairs.verdict ?? args.bare.slice(0, 2).find((word) => word in VERDICTS || word === "ask_owner"), goal = idOf(args, "goal", true), job = idOf(args, "job");
    const what = job ? `admin job #${job}` : goal ? `goal #${goal}` : null;
    if (verdict === "ask_owner") return what ? said("Asking you about " + what, "Asked you about " + what) : said("Asking you", "Asked you");
    if (!VERDICTS[verdict]) return null;
    const [now, past, thing] = VERDICTS[verdict];
    return said(`${now} ${what ?? thing}`, `${past} ${what ?? thing}`);
  }
  if (tool === "project_open" || tool === "request_log") {
    const goal = idOf(args, "goal");
    return goal ? said(`${doing} for goal #${goal}`, `${done} for goal #${goal}`) : null;
  }
  if (tool === "report") {
    const kind = REPORTS[args.pairs.kind ?? first];
    return kind ? said(...kind) : null;
  }
  if (tool === "gpu_slot") {
    const op = GPU[args.pairs.op ?? first];
    return op ? said(...op) : null;
  }
  if (tool === "admin_job") {
    const job = idOf(args, "job");
    return job && !args.pairs.command ? said(`Checking admin job #${job}`, `Checked admin job #${job}`) : null;
  }
  return null;
}
function argsOf(summary, tool) {
  const list = oneLine(summary).split(" ").filter(Boolean), pairs = {}, bare = [];
  if (list[0] === tool) list.shift();
  for (const word of list) {
    const pair = /^([a-z_]+)=(.+)$/.exec(word);
    if (pair && !(pair[1] in pairs)) pairs[pair[1]] = pair[2];
    else if (!pair) bare.push(word.replace(/[:,;]+$/, ""));
  }
  return { pairs, bare };
}
const idIn = (value) => /^#?([1-9]\d{0,14})$/.exec(String(value ?? ""))?.[1] ?? null;
function idOf({ pairs, bare }, kind, own = false) {
  const keyed = kind && idIn(pairs[kind + "_id"] ?? pairs[kind]);
  if (keyed) return keyed;
  const at = kind ? bare.indexOf(kind) : -1;
  if (at >= 0 && idIn(bare[at + 1])) return idIn(bare[at + 1]);
  return own ? idIn(pairs.id) ?? bare.slice(0, 2).map(idIn).find(Boolean) ?? null : null;
}
const statusOf = (value) => typeof value === "string" && /^[a-z_]{2,24}$/.test(value) ? value.replace(/_/g, " ") : null;
const COMMAND = /^(?:cd\s+\S+\s*(?:&&|;)\s*)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:\S*\/)?company(?:\s+--profile(?:=|\s+)\S+)?\s+([a-z][a-z-]*)(.*)$/;
export function companyCommand(summary) {
  const hit = COMMAND.exec(oneLine(summary));
  return hit ? { command: hit[1], rest: hit[2].trim() } : null;
}
const COMMANDS = { apply: ["run", "Apply", "Applying changes", "Applied changes"], launch: ["hand", "Launch", "Launching an agent", "Launched an agent"], relaunch: ["hand", "Relaunch", "Relaunching an agent", "Relaunched an agent"], status: ["ledger", "Status check", "Checking the company status", "Checked the company status"], resources: ["ledger", "Usage check", "Checking account usage", "Checked account usage"], health: ["ledger", "Health check", "Running a health check", "Ran a health check"], backup: ["archive", "Backup", "Backing up the ledger", "Backed up the ledger"], retention: ["archive", "Cleanup", "Cleaning up old files", "Cleaned up old files"], update: ["run", "Host update", "Updating the hosts", "Updated the hosts"], "restart-paseo": ["run", "Paseo restart", "Queueing a Paseo restart", "Queued a Paseo restart"], review: ["list", "Review", "Running a review", "Ran a review"], seats: ["ledger", "Seat check", "Checking the seats", "Checked the seats"], vault: ["archive", "Vault update", "Updating the vault", "Updated the vault"], test: ["run", "Tests", "Running the tests", "Ran the tests"], transcript: ["archive", "Transcript fetch", "Fetching a transcript", "Fetched a transcript"], "migrate-hosts": ["run", "Host migration", "Migrating the hosts", "Migrated the hosts"], send: ["hand", "Message", "Messaging an agent", "Messaged an agent"], place: ["search", "Host pick", "Picking a host", "Picked a host"], run: ["run", "Remote run", "Running on a picked host", "Ran on a picked host"], "move-host": ["hand", "Agent move", "Moving agents", "Moved agents"], emergency: ["alert", "Emergency step", "Running an emergency step", "Ran an emergency step"], tier: ["ledger", "Memory tiering", "Tiering memory", "Tiered memory"] };
const COMPANY = ["run", "Company command", "Running a company command", "Ran a company command"];
function commandWords({ command, rest }) {
  const [icon, noun, doing, done] = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : COMPANY, flag = (word) => new RegExp(`(^|\\s)${word}(\\s|=|$)`).test(rest);
  const role = roleWord(/--role(?:=|\s+)([a-z]+)/.exec(rest)?.[1]);
  if ((command === "apply" || command === "retention") && flag("--dry-run")) return [icon, noun + " check", ...command === "apply" ? ["Checking an apply", "Checked an apply"] : ["Checking old files", "Checked old files"]];
  if (command === "relaunch" && flag("--requested")) return [icon, noun, "Serving relaunch requests", "Served relaunch requests"];
  if ((command === "launch" || command === "relaunch") && role) return [icon, noun, `${doing.split(" ")[0]} ${role}`, `${done.split(" ")[0]} ${role}`];
  if (command === "backup" && flag("drill")) return [icon, "Restore drill", "Running a restore drill", "Ran a restore drill"];
  const kind = command === "review" && /^(daily|weekly)\b/.exec(rest)?.[1];
  if (kind) return [icon, noun, `Running the ${kind} review`, `Ran the ${kind} review`];
  return [icon, noun, doing, done];
}
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
export function imageOf(tool) {
  const read = tool?.name === "Read" && (tool.refs ?? []).some((ref) => ref?.kind === "file" && IMAGE_FILE.test(String(ref.path ?? "")));
  if (!(tool?.kind === "image" || tool?.name === "Image" || read)) return null;
  const name = /^image\s+(.+)$/i.exec(oneLine(tool.summary))?.[1] ?? null;
  return { name: name && short(name, 80), src: typeof tool.src === "string" && /^\/(?![/\\])/.test(tool.src) ? tool.src : null };
}
const INSTANT = /^(Read|Grep|Glob|ToolSearch|Edit|MultiEdit|NotebookEdit|Write|TodoWrite|WebSearch|WebFetch|Image|company · (state|dashboard|search|read|log))$/;
export const instant = (tool) => tool?.kind !== "compaction" && (INSTANT.test(toolName(tool)) || !!imageOf(tool));
const ms = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const hhmm = zoned("ko-KR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clock = (value) => ms(value) === null ? "" : hhmm.format(new Date(value));
export const tokens = (n) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
export function compactionOf(tool) {
  if (tool?.kind !== "compaction") return null;
  const step = tool.compaction ?? {}, from = ms(step.from), to = ms(step.to), before = count(step.before), after = count(step.after);
  const took = tool.status === "running" ? null : count(step.ms) ?? (from !== null && to !== null && to >= from ? to - from : null);
  const when = tool.status === "running" ? from !== null ? "Since " + clock(step.from) : "" : [clock(step.from), clock(step.to)].filter(Boolean).join("–");
  const size = before !== null && after !== null ? `${tokens(before)} → ${tokens(after)} tokens` : before !== null ? `${tokens(before)} tokens before` : "";
  const why = { auto: "automatic", manual: "asked with /compact" }[step.trigger] ?? "";
  return { took, line: [when, size, why].filter(Boolean).join(" · ") };
}
const DETAIL = [[/^Bash$/, "Shell"], [/^(Read|Edit|Write|Grep|Glob)$/, null], [/^(MultiEdit|NotebookEdit)$/, "Edit"], [/^WebSearch$/, "Search"], [/^WebFetch$/, "Fetch"], [/^(Task|Agent)$/, "Task"], [/^TodoWrite$/, "To-dos"], [/^ToolSearch$/, "Tools"], [/^company · /, ledgerName]];
export function stepDetail(tool) {
  const compaction = compactionOf(tool);
  if (compaction) return compaction.line ? { word: "Context", line: compaction.line } : null;
  const image = imageOf(tool), line = short(image?.name ?? tool?.summary, 160);
  if (!line) return null;
  const name = toolName(tool), hit = DETAIL.find(([pattern]) => pattern.test(name));
  const word = image ? "Image" : hit ? (typeof hit[1] === "function" ? hit[1]() : hit[1]) ?? name : name.includes(" · ") ? name.split(" · ")[0] : name && [...name].length <= 16 ? name : "Tool";
  return { word: short(word, 16), line };
}
const EXT = { js: "JS", mjs: "JS", ts: "TS", mts: "TS", tsx: "TSX", css: "CSS", md: "MD", json: "JSON", jsonl: "JSON", py: "PY", sh: "SH", html: "HTML", csv: "CSV", png: "IMG", jpg: "IMG", jpeg: "IMG", webp: "IMG", mp4: "VID", pdf: "PDF", toml: "TOML", yaml: "YAML", yml: "YAML" };
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const short = (text, limit) => {
  const line = oneLine(text);
  return [...line].length > limit ? [...line].slice(0, limit - 1).join("").trimEnd() + "…" : line;
};
export function refMark(ref) {
  const kind = ref?.kind;
  if (kind === "file") {
    const path = String(ref.path ?? ""), dir = path.endsWith("/"), base = path.replace(/\/+$/, "").split("/").pop() || path;
    return { kind, mark: dir ? "DIR" : EXT[/\.([a-z0-9]+)$/i.exec(base)?.[1].toLowerCase()] ?? "FILE", name: base + (dir ? "/" : ""), title: path };
  }
  if (kind === "goal") return { kind, mark: "GOAL", name: "#" + ref.id + (ref.title ? " " + short(ref.title, 16) : ""), title: ref.title ? `#${ref.id} ${ref.title}` : "#" + ref.id };
  if (kind === "request") return { kind, mark: "REQ", name: "#" + ref.id, title: "Request #" + ref.id };
  if (kind === "project") return { kind, mark: "PROJ", name: "#" + ref.id, title: "Project #" + ref.id };
  if (kind === "board") return { kind, mark: "BOARD", name: short(ref.title ?? "Board", 24), title: String(ref.title ?? "") };
  if (kind === "web") return { kind, mark: "WEB", name: short(ref.title ?? ref.host ?? "", 24), title: String(ref.host ?? ref.title ?? "") };
  return null;
}
const KINDS = [["file", "file"], ["goal", "goal"], ["request", "request"], ["project", "project"], ["board", "board"], ["web", "web page"]];
export function touched(tools) {
  const seen = new Map();
  for (const ref of tools.flatMap((tool) => tool.refs ?? [])) {
    const id = ref?.kind === "file" ? ref.path : ["goal", "request", "project"].includes(ref?.kind) ? ref.id : ref?.title ?? ref?.host;
    if (ref?.kind && id != null) seen.set(ref.kind + ":" + id, ref.kind);
  }
  const counts = [...seen.values()].reduce((map, kind) => map.set(kind, (map.get(kind) ?? 0) + 1), new Map());
  return KINDS.filter(([kind]) => counts.get(kind)).map(([kind, word]) => `${counts.get(kind)} ${word}${counts.get(kind) === 1 ? "" : "s"}`).join(" · ");
}
