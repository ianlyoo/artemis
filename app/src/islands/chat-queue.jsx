import { useLayoutEffect, useRef } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { island } from "./lib/mount.jsx";
import { l10n } from "./lib/l10n.js";
const actionStyle = { minHeight: 44, minWidth: 44, fontSize: "var(--t-meta)", paddingInline: 12 };
const actionsStyle = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" };
const leadStyle = { marginRight: "auto", color: "var(--color-text-secondary)", fontSize: "var(--t-meta)" };
function QueueRow({ row, lead }) {
  const host = useRef(null), wasEditing = useRef(false);
  useLayoutEffect(() => {
    if (row.editing) host.current?.querySelector("textarea")?.focus({ preventScroll: true });
    else if (wasEditing.current) host.current?.querySelector('[data-queue-action="edit"]')?.focus({ preventScroll: true });
    wasEditing.current = row.editing;
  }, [row.editing]);
  const button = (action, label, variant = "ghost") => <Button key={action} label={label} variant={variant} data-queue-action={action} isDisabled={row.pending} style={actionStyle} onClick={() => row.onAction(action)}>{label}</Button>;
  return <div ref={host} data-queue-id={row.id} aria-busy={row.pending || row.state === "sending"} style={{ padding: "10px 4px 0 14px", borderTop: lead ? 0 : "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
    {row.editing ? <div onKeyDown={(event) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing && !row.pending) row.onAction("close");
  }}>
      <TextArea label={l10n("대기 메시지 수정", "Edit the queued message")} isLabelHidden defaultValue={row.draft} onChange={row.onChange} isDisabled={row.pending} rows={2} style={{ fontSize: 16, width: "100%" }} />
      <div style={actionsStyle}>{lead}{button("close", l10n("수정 취소", "Cancel edit"))}{button("save", l10n("저장", "Save"), "secondary")}</div>
    </div> : <>
      <p className="chat-queue-text" title={row.text} style={{ margin: 0, paddingRight: 10, fontSize: "var(--t-body)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{row.text || l10n("첨부 메시지", "Attachment message")}</p>
      {row.attachments > 0 && <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-secondary)" }}>{l10n(`첨부 ${row.attachments}개`, `${row.attachments} attached`)}</span>}
      {row.state === "sending" ? <div style={actionsStyle}>{lead}<p role="status" style={{ margin: 0, minHeight: 44, display: "flex", alignItems: "center", paddingRight: 10, color: "var(--color-text-secondary)" }}>{l10n("보내는 중…", "Sending…")}</p></div> : <div style={actionsStyle}>{lead}{row.held && <span style={{ color: "var(--color-text-secondary)" }}>{l10n("수정 중", "Editing")}</span>}
          {row.editable && button("edit", l10n("수정", "Edit"))}{row.removable && button("cancel", l10n("취소", "Cancel"))}{button("send_now", l10n("지금 보내기", "Send now"), "secondary")}</div>}
    </>}
    {row.error && <p role="status" style={{ margin: "0 10px 8px 0", color: "var(--color-text-error)" }}>{row.error}</p>}
  </div>;
}
export function ChatQueue({ rows = [], count = 0, expanded, onExpand, notice }) {
  const lead = count > 1 ? <Button label={expanded ? l10n("대기 메시지 접기", "Fold the queued messages") : l10n("대기 메시지 모두 보기", "Show all queued messages")} variant="ghost" onClick={onExpand} aria-expanded={expanded} style={{ ...actionStyle, marginRight: "auto", marginLeft: -10, paddingInline: 10, color: "var(--color-text-secondary)" }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{l10n(`보내기 대기 ${count}개`, `${count} queued`)}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ rotate: expanded ? "180deg" : "0deg" }}>
        <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
  </Button> : count > 0 && <span style={leadStyle}>{l10n(`보내기 대기 ${count}개`, `${count} queued`)}</span>;
  return <div style={{ background: "var(--color-background-surface)", border: "1px solid var(--color-border)", borderRadius: 16, overflow: "hidden" }}>
    <div style={{ maxHeight: "min(32vh, 320px)", overflowY: "auto", overscrollBehavior: "contain" }}>
      {rows.map((row, n) => <QueueRow key={row.id} row={row} lead={n === 0 ? lead : null} />)}
    </div>
    {notice && <p role="status" style={{ margin: 0, padding: "8px 14px", color: "var(--color-text-error)" }}>{notice}</p>}
  </div>;
}
export const mount = island(ChatQueue);
