import { useEffect, useRef } from "react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { island } from "./lib/mount.jsx";
import { l10n } from "./lib/l10n.js";
const Back = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 18l-6-6 6-6" />
  </svg>;
export function TurnBack({ label = l10n("목록으로", "Back to the list"), size = "md", focus = false, onBack = () => {
} }) {
  const button = useRef(null);
  useEffect(() => {
    if (focus) button.current?.focus({ preventScroll: true });
  }, [focus]);
  return <IconButton ref={button} label={label} tooltip={label} icon={<Icon icon={Back} />} variant="ghost" size={size} onClick={onBack} />;
}
export const mount = island(TurnBack);
