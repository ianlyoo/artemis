import { useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { inkPad } from "../boards/sign-ink.js";
import { island } from "./lib/mount.jsx";
const row = { display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 4px", flex: "none" };
const present = { animationName: "none" };
export function SignPad({ open = false, title = "서명", note = "", hint = "", line = "여기에 서명하세요", confirm = "확인", place = "", onCancel = () => {
}, onConfirm = () => {
} }) {
  const host = useRef(null), pad = useRef(null);
  const [ink, setInk] = useState({ count: 0, full: false });
  useLayoutEffect(() => {
    if (!open || !host.current) return void 0;
    setInk({ count: 0, full: false });
    const made = inkPad(host.current, { onInk: setInk, line });
    pad.current = made;
    return () => {
      made.destroy();
      if (pad.current === made) pad.current = null;
    };
  }, [open, place]);
  const drawn = ink.count > 0;
  return <Dialog isOpen={open} variant="fullscreen" purpose="form" style={present} onOpenChange={(next) => {
    if (!next) onCancel();
  }}>
      <DialogHeader title={title} subtitle={ink.full ? `더 그릴 수 없어요 · 다시 그리거나 ${confirm}을 눌러 주세요` : [note, hint].filter(Boolean).join(" · ")} hasDivider={false} />
      <div ref={host} data-sign-pad="" />
      <div style={row}>
        <Button label="다시" variant="ghost" isDisabled={!drawn} onClick={() => pad.current?.clear()} />
        <span style={{ flex: "1 1 auto" }} />
        <Button label="취소" variant="ghost" onClick={() => onCancel()} />
        <Button label={confirm} variant="primary" isDisabled={!drawn} onClick={() => {
    const taken = pad.current?.take();
    if (taken?.lines.length) onConfirm(taken);
  }} />
      </div>
    </Dialog>;
}
export const mount = island(SignPad);
