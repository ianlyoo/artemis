import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { createDictation } from "../../chat/dictation.js";
const glyph = (d) => (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={d} /></svg>;
const MicGlyph = glyph("M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21");
const StopGlyph = glyph("M8.5 7h7A1.5 1.5 0 0 1 17 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7z");
export const LINES = { recording: "듣고 있어요. 다 말하면 다시 눌러 주세요.", transcribing: "받아 적는 중…", failed: "글로 옮기지 못했어요. 다시 말하거나 적어 주세요.", unavailable: "마이크를 쓰지 못했어요. 마이크 권한을 확인하거나 적어 주세요." };
const PROBLEM = new Set(["failed", "unavailable"]);
const CUES = "/chat/audio/";
export function spokenField(kept) {
  return { get value() {
    const { value, prefill } = kept.current;
    return prefill != null && value === prefill ? "" : value;
  }, set value(next) {
    kept.current.value = next;
    kept.current.onChange(next);
  } };
}
function Mic({ kept, state, onState, create }) {
  const button = useRef(null);
  useLayoutEffect(() => {
    const made = create({ field: spokenField(kept), button: button.current, learning: true, cues: new URL(CUES, globalThis.location?.href), onText() {
    }, onState });
    if (!made) {
      onState("none");
      return void 0;
    }
    return () => {
      made.destroy();
      onState("stopped");
    };
  }, []);
  if (state === "none") return null;
  const on = state === "recording";
  return <Button ref={button} label={on ? "그만 말하기" : "말로 쓰기"} icon={<Icon icon={on ? StopGlyph : MicGlyph} />} variant={on ? "primary" : "ghost"} isDisabled={state === "transcribing"} />;
}
export function useSpoken(value, onChange, { prefill = null, create = createDictation } = {}) {
  const [state, setState] = useState("stopped");
  const kept = useRef({ value, onChange, prefill });
  useLayoutEffect(() => {
    kept.current = { value, onChange, prefill };
  });
  const words = LINES[state];
  return { mic: <Mic kept={kept} state={state} onState={setState} create={create} />, busy: state === "recording" || state === "transcribing", line: words ? <Text type="supporting" display="block" style={{ overflowWrap: "anywhere", ...PROBLEM.has(state) ? { color: "var(--bad, var(--color-text-primary))" } : {} }}>{words}</Text> : null };
}
