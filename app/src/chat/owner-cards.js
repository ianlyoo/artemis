import { approvalIds } from "./links.js";
import { isLead, l10n } from "../names.js";
export function attachOwnerCards(items, cards, previousAt, origin = globalThis.location?.origin) {
  let previous = previousAt === void 0 ? void 0 : previousAt === null ? Date.parse(items[0]?.at) : Date.parse(previousAt);
  return items.map((item) => {
    if (item.role !== "assistant" || !item.text.trim()) return item;
    const at = Date.parse(item.at), lower = previous;
    previous = at;
    if (lower === void 0 || item.streaming) return item;
    const present = new Set(approvalIds((item.segments ?? [{ type: "md", text: item.text }]).filter((segment) => segment?.type === "md").map((segment) => segment.text ?? "").join("\n"), origin));
    const ids = cards.filter((card) => Date.parse(card.created_at) > lower && Date.parse(card.created_at) <= at).map((card) => String(card.id)).filter((id) => !present.has(id));
    if (!ids.length) return item;
    return { ...item, segments: [...item.segments ?? [{ type: "md", text: item.text }], ...ids.map((approval) => ({ type: "card", approval }))] };
  });
}
async function precedingReply(read, readHistory, { history, ledger }) {
  while (history || ledger !== null) {
    if (history) {
      const { status, body: page } = await readHistory(history);
      if (status === 409 || status === 400) return void 0;
      if (status !== 200 || !Array.isArray(page?.items) || page.reset) throw new Error("owner_cards_history_unavailable");
      const reply = page.items.findLast((item) => item.role === "assistant" && item.text.trim());
      if (reply) return reply.at;
      const next = page.hasOlder ? page.before : null;
      if (next === history) throw new Error("owner_cards_history_stalled");
      history = next;
    } else {
      const page = await read("/chat/ledger" + (ledger === void 0 ? "" : "?before=" + encodeURIComponent(ledger)));
      if (!Array.isArray(page.items) || !(page.next === null || typeof page.next === "string")) throw new Error("owner_cards_ledger_unavailable");
      const reply = page.items.find((item) => isLead(item.who) && item.text.trim());
      if (reply) return reply.at;
      if (page.next !== null && page.next === ledger) throw new Error("owner_cards_ledger_stalled");
      ledger = page.next;
    }
  }
  return null;
}
export function createOwnerCards({ api, history, view, changed }) {
  let cards = [], projected = new Map(), boundary = null, reading = null, error = null;
  const read = async (path) => {
    const response = await api(path, { timeout: 15e3 });
    if (!response.ok) throw new Error("owner_cards_unavailable");
    return response.json();
  };
  const tokenOf = (current) => JSON.stringify([current.agent?.id, current.older]);
  function project() {
    const current = view(), token = tokenOf(current);
    const previous = current.older === null ? null : current.older && boundary?.token === token ? boundary.at : void 0;
    projected = new Map(attachOwnerCards(current.items, cards, previous).map((item) => [item.key, item]));
  }
  async function update() {
    project();
    const current = view(), token = tokenOf(current);
    if (!cards.length || !current.older || boundary?.token === token || reading) return;
    reading = (async () => {
      boundary = { token, at: await precedingReply(read, history, current.older) };
      error = null;
    })().catch(() => {
      error = l10n("카드 위치를 불러오지 못했어요. 새로고침해 주세요", "Didn't load where the cards are. Reload the page");
    }).finally(() => {
      reading = null;
      project();
      changed();
      const latest = view();
      if (!error && token !== tokenOf(latest)) void update();
    });
    await reading;
  }
  let refreshing = null;
  return { get error() {
    return error;
  }, item: (item) => projected.get(item.key) ?? item, update, refresh() {
    return refreshing ??= (async () => {
      try {
        const body = await read("/db/read?kind=approvals");
        if (!Array.isArray(body.items) || body.items.some((c) => !Number.isSafeInteger(c.id) || c.id < 1 || !Number.isFinite(Date.parse(c.created_at)))) throw new Error("owner_cards_invalid");
        cards = body.items;
        error = null;
        await update();
      } catch {
        error = l10n("카드 목록을 불러오지 못했어요. 새로고침해 주세요", "Didn't load the cards. Reload the page");
      } finally {
        refreshing = null;
        project();
        changed();
      }
    })();
  } };
}
