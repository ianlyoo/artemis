export const CQO = "cqo";
const STATES = { judging: ["판정 중", "run"], accept: ["승인", "ok"], reject: ["반려", "bad"], need_look: ["확인 요청", "wait"], intent_question: ["의도 질문", "wait"] };
export const verdictWord = (state) => STATES[state]?.[0] ?? "";
export const verdictTone = (state) => STATES[state]?.[1] ?? "idle";
export const caseAt = (item) => item?.verdict_at ?? item?.created_at ?? null;
export const caseName = (item) => item?.short_name || item?.title || `목표 #${item?.goal_id}`;
export const caseLine = (item) => `[CQO 판정 · 목표 #${item.goal_id} «${caseName(item)}» ${item.round}회차 ${verdictWord(item.state)} · 사례 #${item.id}]`;
export function cqoRow(cases = []) {
  const open = cases.some((c) => c.state === "judging");
  const at = cases.map(caseAt).filter(Boolean).sort().at(-1) ?? null;
  return { id: CQO, role: "cqo", displayName: "CQO", pinned: "cqo", state: open ? "judging" : cases[0]?.state ?? "idle", lastActivityAt: at };
}
export const POLL = Object.freeze({ open: 15e3, most: 12e4 });
export function createCqoRecord({ api, timers = globalThis }) {
  const listeners = new Set(), details = new Map();
  let cases = [], next = null, deep = false, loaded = false, problem = null, reading = null, paging = null;
  let timer = null, watched = false, wait = POLL.open;
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  async function call(path) {
    const response = await api(path);
    const body = await response.json().catch(() => void 0);
    if (!response.ok) throw new Error(body?.error ?? `http_${response.status}`);
    if (!Array.isArray(body?.items) && !body?.item) throw new Error("invalid_response");
    return body;
  }
  function schedule() {
    timers.clearTimeout(timer);
    timer = null;
    if (watched) timer = timers.setTimeout(() => {
      timer = null;
      void read();
    }, wait);
  }
  async function read() {
    if (reading) return reading;
    reading = (async () => {
      try {
        const body = await call("/cqo/cases"), last = body.items.at(-1)?.id;
        cases = [...body.items, ...deep && last !== void 0 ? cases.filter((c) => c.id < last) : []];
        if (!deep) next = body.next ?? null;
        loaded = true;
        problem = null;
        wait = POLL.open;
        for (const [id, detail] of details) {
          const listed = cases.find((c) => c.id === id);
          if (detail.item && listed && (listed.state === "judging" || listed.state !== detail.item.state)) void open(id, true);
        }
      } catch (error) {
        problem = error.message;
        wait = Math.min(POLL.most, wait * 2);
      } finally {
        reading = null;
        schedule();
        emit();
      }
      return cases;
    })();
    return reading;
  }
  async function more() {
    if (paging || next === null) return paging;
    paging = (async () => {
      try {
        const body = await call("/cqo/cases?" + new URLSearchParams({ before: String(next) }));
        const seen = new Set(cases.map((c) => c.id));
        cases = [...cases, ...body.items.filter((c) => !seen.has(c.id))];
        next = body.next ?? null;
        deep = true;
      } catch (error) {
        problem = error.message;
      } finally {
        paging = null;
        emit();
      }
    })();
    return paging;
  }
  async function open(id, again = false) {
    const known = details.get(id);
    if (known?.loading || known?.item && !again) return known.loading;
    const detail = known ?? { item: null, problem: null, loading: null };
    details.set(id, detail);
    detail.loading = (async () => {
      try {
        detail.item = (await call("/cqo/cases?" + new URLSearchParams({ id: String(id) }))).item;
        detail.problem = null;
      } catch (error) {
        detail.problem = error.message;
      } finally {
        detail.loading = null;
        emit();
      }
    })();
    emit();
    return detail.loading;
  }
  return { get cases() {
    return cases;
  }, get next() {
    return next;
  }, get loaded() {
    return loaded;
  }, get problem() {
    return problem;
  }, get paging() {
    return !!paging;
  }, get reading() {
    return !!reading;
  }, detail: (id) => details.get(id) ?? null, read, more, open, watch(on) {
    watched = !!on;
    if (watched) void read();
    else {
      timers.clearTimeout(timer);
      timer = null;
    }
  }, subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, destroy() {
    watched = false;
    timers.clearTimeout(timer);
    timer = null;
    listeners.clear();
  } };
}
