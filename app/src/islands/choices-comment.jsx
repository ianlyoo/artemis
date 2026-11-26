import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { island } from "./lib/mount.jsx";
import { l10n } from "./lib/l10n.js";
const Bubble = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v7a2.5 2.5 0 0 1-2.5 2.5H12l-4 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5v-7A2.5 2.5 0 0 1 6.5 5z" />
  </svg>;
const quiet = { color: "var(--ink-quiet)" };
export function Comment({ label, value = "", compact = false, disabled = false, onChange = () => {
} }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(value ? "kept" : false);
  const button = useRef(null), back = useRef(false);
  useLayoutEffect(() => {
    if (back.current && !open) {
      back.current = false;
      button.current?.focus({ preventScroll: true });
    }
  }, [open]);
  if (!open) {
    const icon = <Icon icon={Bubble} />, show = () => setOpen("asked");
    return compact ? <IconButton ref={button} label={label} tooltip={l10n("코멘트", "Comment")} icon={icon} variant="ghost" style={quiet} onClick={show} /> : <Button ref={button} label={label} icon={icon} variant="ghost" style={quiet} onClick={show}>{l10n("코멘트", "Comment")}</Button>;
  }
  return <TextInput label={label} isLabelHidden value={text} placeholder={l10n("코멘트", "Comment")} maxLength={300} width="100%" hasAutoFocus={open === "asked"} isDisabled={disabled} onChange={(next) => {
    setText(next);
    onChange(next);
  }} onKeyDown={(event) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing || text) return;
    event.preventDefault();
    back.current = true;
    setOpen(false);
  }} />;
}
export const mount = island(Comment);
