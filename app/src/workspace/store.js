import { rememberCardBoardTitles } from "../card-md.js";
import { getJSON, postJSON, paths, homeApi } from "./api.js";
import { emit, keyOf, learnRoots } from "./core.js";
import { boardListing, boardSlice } from "../boards/reports.js";
import { QUIET_MS } from "../quiet.js";
import { has } from "../names.js";
export const LEDGER_VIEWS = ["goals", "requests", "approvals", "resources"];
export const AGE = { reports: 6e4, terms: 1e4, archive: 6e4 };
export const SEED_WAIT = 5e3;
export function createStore({ api = homeApi, now = () => Date.now(), doc = globalThis.document } = {}) {
  const data = { boards: [], activeBoard: null, turn: [], reports: [], terminals: [], goals: [], reportsRevision: null, archive: { state: "idle", items: [], updated_at: null }, termState: null, titles: new Map(), fetched: {}, owner: { epoch: null, revision: 0, state: "idle", error: null }, owner_groups: [], owner_contract_version: null, resources: null, state: { boards: "idle", turn: "idle", reports: "idle", terms: "idle", ledger: "idle", archive: "idle" } };
  const rows = new Map(), at = new Map(), running = new Map();
  const once = (name, run) => {
    if (!running.has(name)) running.set(name, run().finally(() => running.delete(name)));
    return running.get(name);
  };
  const fresh = (name, age) => at.has(name) && now() - at.get(name) < age;
  const done = (name, what = name) => {
    at.set(name, now());
    emit("data", what);
  };
  const failed = (answer) => answer.status === 503 && answer.body?.error === "hq_unavailable" ? "hq_unavailable" : "failed";
  const subscribers = new Set();
  let live = false, received = 0, seeding = null, fallback = null, ownerPayload = null;
  const publish = (change) => {
    for (const fn of subscribers) fn(change);
    emit("data", "ledger");
  };
  const ownerState = (state) => {
    data.owner.state = state;
    data.state.ledger = data.state.turn = state === "stale" ? "failed" : state;
  };
  const validOwnerView = (value) => {
    if (value?.version !== 1 || typeof value.epoch !== "string" || !value.epoch || !Number.isSafeInteger(value.revision) || value.revision < 1 || !["ready", "stale", "hq_unavailable"].includes(value.state) || !Array.isArray(value.turn) || (value.state === "hq_unavailable" ? value.ledgers !== null : !LEDGER_VIEWS.every((view) => Array.isArray(value.ledgers?.[view])))) return false;
    return true;
  };
  function freshOwnerView(value) {
    if (!value || value.epoch !== data.owner.epoch || value.revision !== data.owner.revision || !["ready", "stale", "hq_unavailable"].includes(value.state)) return false;
    ownerPayload = { ...ownerPayload, ...value };
    if (value.state !== "hq_unavailable") {
      for (const view of LEDGER_VIEWS) if (rows.has(view)) data.fetched[view] = value.fetched_at ?? null;
    }
    ownerState(value.state);
    data.owner.error = value.error ?? null;
    publish("freshness");
    return true;
  }
  function applyOwnerView(value) {
    if (!validOwnerView(value)) return false;
    if (value.epoch !== data.owner.epoch || value.revision >= data.owner.revision) ownerPayload = value;
    if (value.epoch === data.owner.epoch && value.revision <= data.owner.revision) {
      if (value.revision === data.owner.revision && data.owner.state !== value.state) {
        ownerState(value.state);
        data.owner.error = value.error;
        publish("freshness");
      }
      return false;
    }
    received++;
    data.owner = { epoch: value.epoch, revision: value.revision, state: value.state, error: value.error };
    if (value.ledgers) for (const view of LEDGER_VIEWS) {
      rows.set(view, value.ledgers[view]);
      data.fetched[view] = value.fetched_at ?? null;
    }
    data.goals = rows.get("goals") ?? [];
    if (value.ledgers) {
      data.owner_groups = value.owner_groups ?? [];
      data.turn = data.owner_groups;
      data.owner_contract_version = value.owner_contract_version ?? null;
    }
    ownerState(value.state);
    seeding?.resolve();
    publish("revision");
    return true;
  }
  function awaitSeed() {
    if (running.has("owner")) return running.get("owner");
    if (seeding || data.owner.epoch) return;
    fallback = null;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    const timer = setTimeout(() => seeding?.resolve(), SEED_WAIT);
    seeding = { promise, resolve: () => {
      clearTimeout(timer);
      seeding = null;
      resolve();
    } };
  }
  async function ownerViews() {
    if (!data.owner.epoch && seeding) await seeding.promise;
    if (data.owner.epoch) return;
    return fallback ??= once("owner", async () => {
      const before = received, answer = await getJSON(api, "/ide/owner-view");
      if (received !== before) return;
      if (answer.ok && validOwnerView(answer.body)) {
        applyOwnerView(answer.body);
        return;
      }
      data.owner.error = "hq_unavailable";
      ownerState(data.owner.epoch ? "stale" : failed(answer));
      publish("freshness");
    });
  }
  let quiet = 0;
  function connection(up) {
    live = !!up;
    clearTimeout(quiet);
    if (!live) seeding?.resolve();
    if (!live && data.owner.epoch && data.owner.state === "ready") {
      data.owner.error = "disconnected";
      data.owner.state = "stale";
      quiet = setTimeout(() => {
        if (!live && data.owner.state === "stale") {
          ownerState("stale");
          publish("freshness");
        }
      }, QUIET_MS);
    }
  }
  async function ledger(view) {
    if (!LEDGER_VIEWS.includes(view)) return null;
    await ownerViews();
    return rows.get(view) ?? null;
  }
  async function ledgerRows(views) {
    await ownerViews();
    return Object.fromEntries(views.map((view) => [view, rows.get(view) ?? null]));
  }
  async function turn() {
    await ownerViews();
    return data.turn;
  }
  async function reports({ force = false } = {}) {
    if (!force && fresh("reports", AGE.reports)) return data.reports;
    return once("reports", async () => {
      const answer = await getJSON(api, paths.reports());
      if (!answer.ok || !Array.isArray(answer.body.items)) {
        data.state.reports = failed(answer);
        emit("data", "reports");
        return data.reports;
      }
      const same = data.state.reports === "ready" && typeof answer.body.revision === "string" && answer.body.revision === data.reportsRevision && answer.body.items.length === data.reports.length && answer.body.items.every((item, i) => item.path === data.reports[i].path);
      if (same) {
        at.set("reports", now());
        return data.reports;
      }
      data.reports = answer.body.items;
      data.reportsRevision = answer.body.revision ?? null;
      for (const item of data.reports) if (item.title) data.titles.set(keyOf({ kind: "file", path: item.path }), item.title);
      data.state.reports = "ready";
      done("reports");
      return data.reports;
    });
  }
  let seeded = null;
  async function boards() {
    if (data.state.boards === "ready") return data.boards;
    return once("boards", async () => {
      if (data.state.boards === "idle") await new Promise((resolve) => {
        const timer = setTimeout(resolve, SEED_WAIT);
        seeded = () => {
          clearTimeout(timer);
          resolve();
        };
      }).finally(() => {
        seeded = null;
      });
      if (data.state.boards === "ready") return data.boards;
      const answer = await getJSON(api, paths.boards());
      if (data.state.boards === "ready") return data.boards;
      if (answer.status !== 200 || !Array.isArray(answer.body?.boards)) {
        data.state.boards = "failed";
        emit("data", "boards");
        return data.boards;
      }
      canvas(answer.body);
      return data.boards;
    });
  }
  let termTimer = null, stopTerms = null;
  function scheduleTerminals() {
    clearTimeout(termTimer);
    if (stopTerms && doc.visibilityState === "visible") termTimer = setTimeout(() => void terminals({ force: true }), data.terminals.length ? 5e3 : 3e4);
  }
  function watchTerminals() {
    if (!has("terminals")) return () => {
    };
    if (stopTerms) return stopTerms;
    const visible = () => {
      clearTimeout(termTimer);
      if (doc.visibilityState === "visible") void terminals({ force: true });
    };
    stopTerms = () => {
      clearTimeout(termTimer);
      doc.removeEventListener("visibilitychange", visible);
      stopTerms = null;
    };
    doc.addEventListener("visibilitychange", visible);
    visible();
    return stopTerms;
  }
  async function terminals({ force = false } = {}) {
    if (!has("terminals") || !force && fresh("terms", AGE.terms)) return data.terminals;
    return once("terms", async () => {
      const answer = await getJSON(api, paths.terms());
      if (answer.status !== 200 || !Array.isArray(answer.body?.terminals)) {
        data.termState = "failed";
        data.state.terms = "failed";
        emit("data", "terms");
        return data.terminals;
      }
      data.terminals = answer.body.terminals.filter((term) => term?.closed !== true && term?.readOnly !== true);
      data.termState = answer.body.state ?? null;
      data.state.terms = "ready";
      done("terms");
      return data.terminals;
    }).finally(scheduleTerminals);
  }
  async function archive({ force = false } = {}) {
    if (!has("archive") || !force && fresh("archive", AGE.archive)) return data.archive;
    return once("archive", async () => {
      const answer = await getJSON(api, paths.archive());
      if (!answer.ok || !Array.isArray(answer.body.items)) {
        data.state.archive = "failed";
        emit("data", "archive");
        return data.archive;
      }
      data.archive = { state: answer.body.state ?? "ready", items: answer.body.items, updated_at: answer.body.updated_at ?? null };
      data.state.archive = "ready";
      done("archive");
      return data.archive;
    });
  }
  async function restore(id) {
    const answer = await postJSON(api, paths.restore(), { id });
    if (answer.ok) {
      void archive({ force: true });
      if (answer.body.kind === "report") void reports({ force: true });
    }
    return answer;
  }
  const tree = (path) => getJSON(api, paths.tree(path)).then((answer) => {
    if (!path && answer.ok) learnRoots(answer.body?.entries);
    return answer;
  });
  function canvas(snapshot) {
    const listing = boardListing(snapshot);
    if (!listing) return;
    data.boards = boardSlice(listing, "newest");
    rememberCardBoardTitles(data.boards);
    data.activeBoard = listing.active_id;
    data.state.boards = "ready";
    seeded?.();
    emit("data", "boards");
  }
  function dashboard(payload) {
    const resources = payload?.dashboard?.resources;
    if (resources && resources !== data.resources) {
      data.resources = resources;
      publish("resources");
    }
  }
  const cached = (view) => rows.get(view) ?? null;
  return { data, ledger, ledgerRows, cached, turn, reports, boards, terminals, watchTerminals, archive, restore, tree, canvas, dashboard, ownerViews, ownerView: () => ownerPayload, applyOwnerView, freshOwnerView, awaitSeed, connection, subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  } };
}
export function ownerViewWatch(store, watch) {
  return { get id() {
    return watch.id;
  }, get targets() {
    return watch.targets;
  }, get live() {
    return watch.live;
  }, set: (keys) => watch.set(keys), connection(up) {
    store.connection(up);
    return watch.connection(up);
  }, frame(frame) {
    if (frame?.kind === "owner_views") {
      store.applyOwnerView(frame.payload);
      return true;
    }
    if (frame?.kind === "owner_views.fresh") {
      store.freshOwnerView(frame.payload);
      return true;
    }
    return watch.frame(frame);
  } };
}
export function ownerViewApi(store, api, { listing = false } = {}) {
  return async (path, init) => {
    if (path.startsWith("/events?ide=")) {
      if (!store.data.owner.epoch) await store.awaitSeed();
      const { epoch, revision } = store.data.owner;
      if (epoch) path += "&owner_epoch=" + encodeURIComponent(epoch) + "&owner_revision=" + revision;
      if (listing) path += "&canvas=listing";
    }
    return api(path, init);
  };
}
