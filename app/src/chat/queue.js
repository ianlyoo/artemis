import { deliveryCapabilities } from "./delivery-capabilities.js";
import { el } from "../boards/dom.js";
import { mountIsland } from "../islands/island.js";
import { l10n } from "../names.js";
export const isWaitingMessage = (item) => item.role === "user" && item.delivery?.state === "queued";
const EDIT_DELIVERED = () => l10n("이미 보냈어요 · 고친 내용은 입력창에 있어요", "Sent already · your edit is in the message box");
const draftOf = (item, text) => ({ text, images: (item.attachments ?? []).filter((file) => typeof file.data === "string").map(({ data, mimeType }) => ({ data, mimeType })), attachments: (item.attachments ?? []).filter((file) => typeof file.id === "string").map((file) => ({ id: file.id, name: file.fileName ?? file.name ?? "file", size: file.size, mimeType: file.mimeType })) });
export function createQueue({ store, phone = false, onRestore = () => {
}, island = mountIsland }) {
  const node = el("section", { class: "chat-queue", "aria-label": l10n("보내기 대기", "Waiting to send"), hidden: true });
  const rows = new Map();
  let order = [];
  let view, loading, gone = false, expanded = false, notice = "";
  const data = () => [...(deliveryCapabilities(store.agent?.role).queue ? store.queue : []).map((item) => ({ ...item, key: "queue:" + item.id })), ...store.items.filter(isWaitingMessage).map((item) => ({ ...item, key: "delivery:" + item.messageId, id: item.messageId, state: "queued", delivery: item.delivery }))];
  function recover(row) {
    if (row.editing && !row.pending) onRestore(draftOf(row.editing.item, row.text), EDIT_DELIVERED());
    row.editing = null;
  }
  async function act(row, action) {
    if (row.pending) return;
    const item = row.item;
    if (action === "edit") {
      row.editing = { revision: item.revision, item };
      row.text = item.text;
      row.error = "";
      render();
      const result2 = await store.holdQueue(item.id, true);
      if (!result2.ok) {
        row.error = result2.line;
        render();
      }
      return;
    }
    if (action === "close") {
      row.editing = null;
      row.error = "";
      render();
      const result2 = await store.holdQueue(item.id, false);
      if (!result2.ok) {
        row.error = result2.line;
        render();
      }
      return;
    }
    const draft = action === "save" && row.editing ? draftOf(row.editing.item, row.text) : null;
    if (draft && !draft.text.trim()) {
      row.error = l10n("메시지를 입력해 주세요", "Type a message");
      render();
      return;
    }
    row.pending = true;
    row.error = "";
    notice = "";
    render();
    let result;
    try {
      if (item.delivery) {
        const ok = await (action === "cancel" ? store.removeHeld(item.id) : store.sendNow(item.id));
        result = { ok, line: l10n("처리하지 못했어요. 다시 시도해 주세요", "Couldn't do that. Try again") };
      } else result = await (action === "save" ? store.editQueue(item.id, draft.text, row.editing.revision) : action === "cancel" ? store.cancelQueue(item.id) : store.sendQueueNow(item.id));
    } catch {
      result = { ok: false, line: l10n("연결을 확인하고 다시 시도해 주세요", "Check the connection and try again") };
    }
    if (gone) return;
    row.pending = false;
    if (result.ok && draft || result.status === 409) row.editing = null;
    if (draft && result.status === 409 && result.error === "not_queued") onRestore(draft, EDIT_DELIVERED());
    else if (!result.ok) {
      row.error = result.line;
      if (!rows.has(item.key)) notice = result.line;
    }
    paint();
  }
  function props() {
    const all = order.map((id) => rows.get(id));
    return { phone, expanded, count: all.length, notice, onExpand: () => {
      expanded = !expanded;
      render();
    }, rows: (expanded ? all : all.slice(0, 1)).map((row) => ({ id: row.item.key, text: row.item.text, attachments: row.item.attachments?.length ?? row.item.images?.length ?? 0, state: row.item.state, held: row.item.held, editing: !!row.editing, draft: row.text, pending: row.pending || row.item.delivery && store.sendingNow(row.item.id), error: row.error, editable: !row.item.delivery, removable: !row.item.delivery || row.item.delivery.removable, onChange: (text) => {
      row.text = text;
    }, onAction: (action) => void act(row, action) })) };
  }
  function render() {
    if (gone) return;
    node.hidden = !rows.size && !notice;
    if (view) view.update(props());
    else if (!node.hidden && !loading) {
      loading = island("chat-queue", node, props()).then((mounted) => {
        if (gone) mounted.unmount();
        else {
          view = mounted;
          view.update(props());
        }
      }).catch(() => {
        loading = null;
        node.textContent = l10n("대기 메시지를 불러오지 못했어요. 채팅을 다시 열어 주세요", "Couldn't load the waiting messages. Open the chat again");
      });
    }
  }
  function paint() {
    const items = data(), ids = new Set(items.map((item) => item.key));
    order = [...ids];
    for (const [id, row] of rows) if (!ids.has(id)) {
      recover(row);
      rows.delete(id);
    }
    for (const item of items) {
      let row = rows.get(item.key);
      if (!row) {
        row = { editing: null, pending: false, text: "", error: "" };
        rows.set(item.key, row);
      }
      row.item = item;
      if (item.state === "sending") recover(row);
    }
    render();
  }
  const unsubscribe = store.subscribe((event) => {
    if (["queue", "snapshot", "reset", "state", "delivery", "local", "remove"].includes(event.type) || event.type === "item" && event.item?.role === "user") paint();
  });
  paint();
  return { node, destroy() {
    gone = true;
    unsubscribe();
    view?.unmount();
    rows.clear();
  } };
}
