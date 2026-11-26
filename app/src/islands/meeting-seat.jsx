import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
export const SEAT_LABEL = "자리 추가";
const key = (choice) => [choice.role, choice.project_id ?? choice.family ?? ""].join(":");
export function MeetingSeat({ choices = [], busy = null, onPick = () => {
}, sheet = false }) {
  const items = choices.map((choice) => ({ id: key(choice), label: choice.label, onClick: () => onPick(choice) }));
  return <DropdownMenu items={items} presentation={sheet ? "bottom-sheet" : "popover"} placement="above" alignment="end" header={<div style={sheet ? void 0 : { padding: "var(--spacing-2) var(--spacing-3) var(--spacing-1)" }}><Text type="supporting">고르면 다음 차례부터 말해요</Text></div>} button={{ label: busy ? "자리 추가 중…" : SEAT_LABEL, variant: "ghost", size: "sm", isDisabled: !!busy, className: "meeting-seat" }} />;
}
export const mount = island(MeetingSeat);
