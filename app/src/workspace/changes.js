import { el } from "../boards/dom.js";
import { registerSection, registerKind } from "./extensions.js";
import { stylesheet, abs, rel, fileName, shortWhen, day, clip, saved, WORK, SYSTEM } from "./core.js";
import { getJSON, homeApi } from "./api.js";
import { ledgerName } from "../names.js";
import { row } from "./explorer.js";
import { iconButton, setIcon } from "./icons.js";
import { parsePatch, countLines, unifiedView, splitView, counts } from "./diff.js";
const COMMITS = 8, AHEAD = 8, LONG = 800;
export const VIEW_KEY = "p2-diff-view";
const q = (value) => encodeURIComponent(value);
export const paths = { repos: () => "/ide/repos", log: (repo, { limit = COMMITS, ref, base, path, before } = {}) => "/ide/changes/log?repo=" + q(repo) + (ref ? "&ref=" + q(ref) : "") + (base ? "&base=" + q(base) : "") + (path ? "&path=" + q(path) : "") + (before ? "&before=" + q(before) : "") + "&limit=" + limit, branches: (repo) => "/ide/changes/branches?repo=" + q(repo), commit: (repo, sha) => "/ide/changes/commit?repo=" + q(repo) + "&sha=" + q(sha), compare: (repo, base, head) => "/ide/changes/compare?repo=" + q(repo) + "&base=" + q(base) + "&head=" + q(head), file: (path, since) => "/ide/changes/file?target=" + q("file:" + path) + "&since=" + q(since) };
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, SHA = /^[0-9a-f]{7,40}$/i;
export const isRef = (value) => typeof value === "string" && /^[A-Za-z0-9._/-]{1,200}$/.test(value) && !value.startsWith("-") && !value.includes("..") && !value.endsWith("/") && !value.endsWith(".lock");
const isTime = (value) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const inRoots = (path) => typeof path === "string" && (path.startsWith(WORK + "/") || path.startsWith(SYSTEM + "/")) && !path.split("/").includes("..");
export const commitTarget = (raw) => raw?.kind === "commit" && REPO.test(raw.repo ?? "") && SHA.test(raw.sha ?? "") ? { kind: "commit", repo: raw.repo, sha: raw.sha.toLowerCase() } : null;
export const compareTarget = (raw) => raw?.kind === "compare" && REPO.test(raw.repo ?? "") && isRef(raw.base) && isRef(raw.head) ? { kind: "compare", repo: raw.repo, base: raw.base, head: raw.head } : null;
export const sinceTarget = (raw) => raw?.kind === "since" && inRoots(raw.path) && isTime(raw.since) ? { kind: "since", path: raw.path, since: new Date(raw.since).toISOString() } : null;
const AGE = 6e4, MEMORY = "changes";
const later = (fn) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(fn, 0)) : setTimeout(fn, 0);
const validRepos = (list) => Array.isArray(list) ? list.filter((repo) => repo && REPO.test(String(repo.id)) && typeof repo.root === "string") : null;
const validCommits = (list) => Array.isArray(list) ? list.filter((commit) => commit && SHA.test(String(commit.sha))) : null;
const validBranches = (list) => Array.isArray(list) ? list.filter((branch) => branch && isRef(branch.name)) : null;
export function createChanges({ api = homeApi, now = () => Date.now(), memory = null } = {}) {
  let repos = null, reposAt = 0, reposFlight = null;
  const logs = new Map(), branches = new Map(), subjects = new Map();
  const listeners = new Set(), tell = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (error) {
        console.error("Changes:", error);
      }
    }
  };
  const stale = (entry) => !entry || entry.state !== "loading" && now() - entry.at > AGE;
  const kept = memory?.read(MEMORY, null);
  if (kept && typeof kept === "object") {
    const list = validRepos(kept.repos);
    if (list?.length) repos = { state: "cached", list };
    for (const [map, from, valid] of [[logs, kept.logs, validCommits], [branches, kept.branches, validBranches]]) {
      for (const [id, raw] of Object.entries(from && typeof from === "object" ? from : {})) {
        const list2 = REPO.test(id) && valid(raw);
        if (list2) map.set(id, { state: "cached", at: 0, list: list2 });
        if (list2 && map === logs) for (const commit of list2) remember(id, commit.sha, commit.subject);
      }
    }
  }
  const lists = (map) => Object.fromEntries([...map].filter(([, entry]) => entry.list.length).map(([id, entry]) => [id, entry.list.slice(0, 50)]));
  const keep = () => memory?.write(MEMORY, { repos: repos?.list ?? [], logs: lists(logs), branches: lists(branches) });
  function loadRepos() {
    if (repos && repos.state === "ready") return Promise.resolve(repos);
    reposFlight ??= getJSON(api, paths.repos()).then((answer) => {
      const list = answer.ok ? validRepos(answer.body.repos) : null;
      repos = list ? { state: "ready", list } : { state: "failed", list: repos?.list ?? [] };
      reposAt = now();
      if (list) keep();
      tell();
      return repos;
    }).finally(() => {
      reposFlight = null;
    });
    return reposFlight;
  }
  function per(map, id, path, pick) {
    const known = map.get(id);
    if (known?.state === "cached") {
      if (!known.queued) {
        known.queued = true;
        later(() => {
          if (map.get(id) === known) {
            read(map, id, path, pick, known);
            tell();
          }
        });
      }
      return known;
    }
    if (!stale(known)) return known;
    return read(map, id, path, pick, known);
  }
  function read(map, id, path, pick, known) {
    const entry = { state: "loading", at: now(), list: known?.list ?? [] };
    map.set(id, entry);
    void getJSON(api, path).then((answer) => {
      if (map.get(id) !== entry) return;
      const list = answer.ok ? pick(answer.body) : null;
      Object.assign(entry, list ? { state: "ready", list } : { state: "failed" }, { at: now() });
      if (list && map === logs) for (const commit of list) remember(id, commit.sha, commit.subject);
      if (list) keep();
      tell();
    });
    return entry;
  }
  function remember(repo, sha, subject) {
    if (typeof sha === "string" && typeof subject === "string") subjects.set(repo + ":" + sha.toLowerCase(), subject);
  }
  return { use(next) {
    if (typeof next === "function") api = next;
  }, get api() {
    return api;
  }, repos: () => repos, loadRepos, repo: (id) => repos?.list.find((repo) => repo.id === id) ?? null, forPath(path) {
    if (!repos || !inRoots(path)) return null;
    return repos.list.filter((repo) => path.startsWith(abs(repo.root).replace(/\/?$/, "/"))).sort((a, b) => b.root.length - a.root.length)[0] ?? null;
  }, log: (id) => per(logs, id, paths.log(id), (body) => validCommits(body.commits)), branches: (id) => per(branches, id, paths.branches(id), (body) => validBranches(body.branches)), subject: (repo, sha) => subjects.get(repo + ":" + String(sha).toLowerCase()) ?? null, remember, listen(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, get reposAt() {
    return reposAt;
  } };
}
export const changes = createChanges({ memory: saved });
export const defaultBranch = (repo, list = []) => ["main", "master"].find((name) => list.some((branch) => branch.name === name)) ?? repo?.branch ?? "main";
export function fileOf(repo, file) {
  if (!repo || !file || file.denied || /^d/i.test(String(file.status ?? "")) || typeof file.path !== "string") return null;
  const path = abs(repo.root.replace(/\/?$/, "/") + file.path);
  return inRoots(path) ? { kind: "file", path } : null;
}
const STATUS = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "type changed" };
export const statusWord = (status) => STATUS[String(status ?? "").charAt(0).toUpperCase()] ?? (typeof status === "string" && status ? status.toLowerCase() : "modified");
export const diffLayout = { get: () => saved.read(VIEW_KEY, "unified") === "split" ? "split" : "unified", set: (value) => saved.write(VIEW_KEY, value === "split" ? "split" : null) };
function fileSection(file, { repo, open, layout }) {
  const hunks = file.binary || file.denied ? [] : parsePatch(file.patch ?? "");
  const own = Number.isFinite(file.additions) && Number.isFinite(file.deletions) ? { additions: file.additions, deletions: file.deletions } : countLines(hunks);
  const long = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0) > LONG;
  const target = fileOf(repo, file);
  const twist = el("button", { type: "button", class: "p2-fold", "aria-expanded": String(!long), "aria-label": (long ? "Unfold " : "Fold ") + file.path, title: long ? "Unfold this file" : "Fold this file" });
  const name = target ? el("button", { type: "button", class: "p2-path p2-link", title: "Open " + rel(target.path) }, file.path) : el("span", { class: "p2-path" }, file.path);
  if (target) name.addEventListener("click", () => open(target, { from: "changes" }));
  const was = file.old_path && file.old_path !== file.path ? el("span", { class: "p2-was" }, "from " + file.old_path) : null;
  const body = el("div", { class: "p2-file-body" });
  const section = el("section", { class: "p2-file" + (long ? " is-folded" : ""), "data-path": file.path }, el("header", { class: "p2-file-head" }, twist, name, was, el("span", { class: "p2-status" }, statusWord(file.status)), counts(own), long ? el("span", { class: "p2-quiet-inline" }, "Long · unfold to show") : null), body);
  let drawn = null;
  const draw = () => {
    if (section.classList.contains("is-folded")) return;
    const now = layout();
    if (drawn === now) return;
    drawn = now;
    if (file.binary) {
      body.replaceChildren(el("p", { class: "p2-quiet" }, "Binary file · not shown"));
      return;
    }
    if (!hunks.length) {
      body.replaceChildren(el("p", { class: "p2-quiet" }, file.patch ? "No lines changed" : "No text changes (a mode or a name)"));
      return;
    }
    body.replaceChildren(now === "split" ? splitView(hunks) : unifiedView(hunks));
  };
  twist.addEventListener("click", () => {
    const folded = section.classList.toggle("is-folded");
    twist.setAttribute("aria-expanded", String(!folded));
    twist.title = folded ? "Unfold this file" : "Fold this file";
    twist.setAttribute("aria-label", (folded ? "Unfold " : "Fold ") + file.path);
    section.querySelector(".p2-quiet-inline")?.remove();
    draw();
  });
  draw();
  return { section, own, redraw: () => {
    drawn = drawn === null ? null : "stale";
    draw();
  } };
}
const LONG_TITLE = 100;
export function diffPage({ title, meta = [], body = "", files = [], truncated = false, repo = null, open, extra = null, empty = "No file changed" }) {
  void stylesheet("p2-views.css");
  const layoutButton = iconButton("split", "Show side by side", { class: "p2-layout" });
  const paintLayout = () => {
    const split = diffLayout.get() === "split";
    setIcon(layoutButton, split ? "unified" : "split", split ? "Show unified" : "Show side by side");
    layoutButton.setAttribute("aria-pressed", String(split));
  };
  const shownFiles = files.filter((file) => file && typeof file.path === "string");
  const parts = shownFiles.map((file) => file.denied ? { file, section: el("p", { class: "p2-quiet p2-denied", "data-path": file.path }, file.path + " · hidden (a protected file)") } : { file, ...fileSection(file, { repo, open, layout: diffLayout.get }) });
  const total = parts.reduce((sum, part) => part.own ? { additions: sum.additions + part.own.additions, deletions: sum.deletions + part.own.deletions } : sum, { additions: 0, deletions: 0 });
  const list = el("ol", { class: "p2-filelist", "aria-label": "Files changed" }, parts.filter((part) => !part.file.denied).map((part) => {
    const go = el("button", { type: "button", class: "p2-filelink", title: "Go to its changes" }, el("span", { class: "p2-path" }, part.file.path));
    go.addEventListener("click", () => {
      if (part.section.classList.contains("is-folded")) part.section.querySelector(".p2-fold")?.click();
      part.section.scrollIntoView({ block: "start" });
    });
    return el("li", { class: "p2-fileitem ide-row" }, go, el("span", { class: "p2-status" }, statusWord(part.file.status)), counts(part.own));
  }));
  const cut = () => truncated ? el("p", { class: "p2-cut", role: "note" }, "The diff is longer than Home shows (400 KB) · the rest is cut") : null;
  const head = el("header", { class: "doc-head" }, el("h1", { class: "doc-title" + (String(title).length > LONG_TITLE ? " is-long" : "") }, title), el("p", { class: "doc-meta" }, meta.filter(Boolean).map((part) => el("span", {}, part))), body ? el("pre", { class: "p2-body" }, body) : null);
  const summary = el("div", { class: "p2-summary-line" }, el("span", {}, shownFiles.length === 1 ? "1 file" : shownFiles.length + " files"), counts(total), el("span", { class: "p2-gap" }), layoutButton);
  const page = el("div", { class: "p2-page p2-diffpage" }, head, extra, shownFiles.length ? [summary, cut(), list, el("div", { class: "p2-files" }, parts.map((part) => part.section)), cut()] : el("p", { class: "p2-quiet" }, empty));
  layoutButton.addEventListener("click", () => {
    diffLayout.set(diffLayout.get() === "split" ? "unified" : "split");
    paintLayout();
    for (const part of parts) part.redraw?.();
  });
  paintLayout();
  return { page, outline: parts.map((part) => ({ level: 1, text: part.file.path, el: part.section })) };
}
async function tab(load) {
  void stylesheet("p2-views.css");
  try {
    const made = await load();
    return { node: made.page, outline: made.outline, head: false };
  } catch (error) {
    if (!error?.line) console.error("Changes:", error);
    return { node: el("p", { class: "p2-problem" }, error?.line ?? "Couldn't load the changes"), outline: [] };
  }
}
const LINES = { not_found: "Couldn't find it in the repo", forbidden: "Home can't read this repo", busy: "Git is busy · try again in a moment" };
const fail = (answer) => Object.assign(new Error("changes"), { line: answer.body?.error === "hq_unavailable" ? ledgerName() + " isn't loaded yet" : LINES[answer.body?.error] ?? "Couldn't load the changes" });
const who = (commit) => [commit.short || String(commit.sha ?? "").slice(0, 7), commit.author, commit.at ? shortWhen(commit.at) : null];
function commitRows(list, { repo, open }) {
  return el("ol", { class: "p2-commits", "aria-label": "Commits" }, list.map((commit) => {
    const go = el("button", { type: "button", class: "p2-commit ide-row" }, el("span", { class: "p2-subject" }, String(commit.subject ?? "")), el("span", { class: "p2-sha" }, commit.short || String(commit.sha).slice(0, 7)), el("span", { class: "p2-when" }, commit.at ? shortWhen(commit.at) : ""));
    go.addEventListener("click", () => open({ kind: "commit", repo, sha: commit.sha }, { from: "changes" }));
    return el("li", {}, go);
  }));
}
export async function commitPage(target, { open, source = changes }) {
  await source.loadRepos();
  const answer = await getJSON(source.api, paths.commit(target.repo, target.sha));
  if (!answer.ok) throw fail(answer);
  const body = answer.body, repo = source.repo(target.repo);
  source.remember(target.repo, target.sha, body.subject);
  return diffPage({ title: String(body.subject ?? target.sha), meta: [...who({ ...body, sha: body.sha ?? target.sha }), repo?.label ?? target.repo], body: String(body.body ?? "").trim(), files: body.files ?? [], truncated: !!body.truncated, repo, open });
}
export async function comparePage(target, { open, source = changes }) {
  await source.loadRepos();
  const [answer, log] = await Promise.all([getJSON(source.api, paths.compare(target.repo, target.base, target.head)), getJSON(source.api, paths.log(target.repo, { ref: target.head, base: target.base, limit: 50 }))]);
  if (!answer.ok) throw fail(answer);
  const repo = source.repo(target.repo), commits = log.ok && Array.isArray(log.body.commits) ? log.body.commits : [];
  const extra = commits.length ? el("section", { class: "p2-part" }, el("h2", { class: "p2-h" }, commits.length === 1 ? "1 commit" : commits.length + (log.body.next ? "+" : "") + " commits"), commitRows(commits, { repo: target.repo, open })) : null;
  return diffPage({ title: target.base + " … " + target.head, meta: [repo?.label ?? target.repo, "what " + target.head + " has that " + target.base + " does not"], files: answer.body.files ?? [], truncated: !!answer.body.truncated, repo, open, extra, empty: "Nothing differs" });
}
export async function sincePage(target, { open, source = changes }) {
  await source.loadRepos();
  const answer = await getJSON(source.api, paths.file(target.path, target.since));
  if (!answer.ok) throw fail(answer);
  const body = answer.body, since = "Since " + shortWhen(target.since);
  if (!body.tracked) return { page: el("div", { class: "p2-page" }, el("header", { class: "doc-head" }, el("h1", { class: "doc-title" }, fileName(target.path)), el("p", { class: "doc-meta" }, el("span", {}, since))), el("p", { class: "p2-quiet" }, "This file isn't in a repo Home reads")), outline: [] };
  const repo = source.repo(body.repo) ?? source.forPath(target.path), commits = Array.isArray(body.commits) ? body.commits : [];
  const extra = el("section", { class: "p2-part" }, el("h2", { class: "p2-h" }, commits.length ? commits.length === 1 ? "1 commit since" : commits.length + " commits since" : "No commit since"), commits.length ? commitRows(commits, { repo: body.repo, open }) : null);
  const path = typeof body.path === "string" ? body.path : rel(target.path);
  const files = body.patch ? [{ path, status: "M", patch: body.patch }] : [];
  return diffPage({ title: fileName(target.path), meta: [since, repo?.label ?? body.repo, body.mtime ? "Edited " + shortWhen(body.mtime) : null], files, repo, open, extra, empty: "No change since then" });
}
const openRepos = new Set();
let sectionPaint = null, sectionOff = null, sectionLoad = false;
export function changesSection({ open, api, refresh }) {
  changes.use(api);
  if (sectionPaint !== refresh) {
    sectionOff?.();
    sectionPaint = refresh;
    sectionOff = changes.listen(() => refresh?.());
  }
  const known = changes.repos();
  if (!known || known.state === "cached") {
    if (!sectionLoad) {
      sectionLoad = true;
      later(() => {
        void changes.loadRepos().finally(() => {
          sectionLoad = false;
        });
      });
    }
  }
  if (!known) return [el("p", { class: "ex-quiet" }, "Loading…")];
  if (known.state === "failed" && !known.list.length) return [row({ name: "Couldn't load the repos · retry", muted: true, onClick: () => {
    void changes.loadRepos();
  } })];
  if (!known.list.length) return [el("p", { class: "ex-quiet" }, "No repo here")];
  if (!openRepos.size && known.list[0]) openRepos.add(known.list[0].id);
  const rows = [];
  for (const repo of known.list) {
    const opened = openRepos.has(repo.id);
    rows.push(row({ name: repo.label || repo.id, note: repo.branch || (repo.head ? String(repo.head).slice(0, 7) : ""), dir: opened ? "open" : "shut", title: repo.root + (repo.branch ? "\n" + repo.branch : ""), onClick: () => {
      if (openRepos.has(repo.id)) openRepos.delete(repo.id);
      else openRepos.add(repo.id);
      refresh?.();
    } }));
    if (!opened) continue;
    const log = changes.log(repo.id), branches = changes.branches(repo.id);
    if (log.state === "failed") rows.push(el("p", { class: "ex-quiet", style: { "--d": "1" } }, "Couldn't load the commits"));
    else if (!log.list.length) rows.push(el("p", { class: "ex-quiet", style: { "--d": "1" } }, log.state === "loading" ? "Loading…" : "No commits"));
    for (const commit of log.list.slice(0, COMMITS)) rows.push(row({ name: clip(commit.subject, 90), note: day(commit.at), depth: 1, title: commit.short + " · " + commit.subject, target: { kind: "commit", repo: repo.id, sha: commit.sha }, onClick: () => open({ kind: "commit", repo: repo.id, sha: commit.sha }, { from: "explorer" }) }));
    const base = defaultBranch(repo, branches.list);
    const ahead = branches.list.filter((branch) => branch.name !== base && Number(branch.ahead) > 0).sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
    if (ahead.length) rows.push(el("p", { class: "ex-quiet p2-ex-label", style: { "--d": "1" } }, "Ahead of " + base));
    for (const branch of ahead.slice(0, AHEAD)) rows.push(row({ name: branch.name, note: branch.ahead + " ahead", depth: 1, title: branch.name + "\n" + (branch.subject ?? ""), target: { kind: "compare", repo: repo.id, base, head: branch.name }, onClick: () => open({ kind: "compare", repo: repo.id, base, head: branch.name }, { from: "explorer" }) }));
    if (ahead.length > AHEAD) rows.push(el("p", { class: "ex-quiet", style: { "--d": "1" } }, `${ahead.length - AHEAD} more branches ahead`));
  }
  return rows;
}
const label = (target) => target.kind === "commit" ? clip(changes.subject(target.repo, target.sha) ?? target.sha.slice(0, 7), 32) : target.kind === "compare" ? target.base + "…" + target.head : fileName(target.path) + " · since";
registerSection({ id: "changes", title: "Changes", glyph: "branch", order: 30, render: changesSection, count: () => null });
registerKind("commit", { key: (target) => "commit:" + target.repo + ":" + target.sha, toTarget: commitTarget, label, title: (target) => (changes.subject(target.repo, target.sha) ?? "Commit") + " · " + target.sha.slice(0, 7), kept: true, render: ({ target, api, open }) => {
  changes.use(api);
  return tab(() => commitPage(target, { open }));
} });
registerKind("compare", { key: (target) => "compare:" + target.repo + ":" + target.base + "..." + target.head, toTarget: compareTarget, label, title: (target) => target.base + " … " + target.head + " · " + target.repo, kept: true, render: ({ target, api, open }) => {
  changes.use(api);
  return tab(() => comparePage(target, { open }));
} });
registerKind("since", { key: (target) => "since:" + target.path + "@" + target.since, toTarget: sinceTarget, label, title: (target) => rel(target.path) + " · since " + shortWhen(target.since), kept: false, render: ({ target, api, open }) => {
  changes.use(api);
  return tab(() => sincePage(target, { open }));
} });
