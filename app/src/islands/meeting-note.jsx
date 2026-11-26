import { useState } from "react";
import { TextArea } from "@astryxdesign/core/TextArea";
import { island } from "./lib/mount.jsx";
export const NOTE_LABEL = "진행자에게 남길 말 (선택)";
export function MeetingNote({ value = "", max = 4e3, onChange = () => {
} }) {
  const [text, setText] = useState(value);
  return <TextArea label={NOTE_LABEL} value={text} rows={3} maxLength={max} width="100%" placeholder="진행자만 읽고, 결정을 정리할 때 반영해요" onChange={(next) => {
    setText(next);
    onChange(next);
  }} />;
}
export const mount = island(MeetingNote);
