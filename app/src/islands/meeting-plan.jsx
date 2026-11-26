import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
const DateTimeInput = lazy(() => import("@astryxdesign/core/DateTimeInput").then((m) => ({ default: m.DateTimeInput })));
const OWN = "own", AHEAD_DAYS = 30;
const local = (t) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4);
  return d.toISOString().slice(0, 16);
};
const row = { display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)", alignItems: "center" };
export function MeetingPlan({ status, slots = [], busy = null, line = "", now = Date.now(), onStart, onTime, onAnswer }) {
  const [picking, setPicking] = useState(false), [choice, setChoice] = useState(slots[0]?.at ?? OWN), [own, setOwn] = useState(void 0);
  useEffect(() => {
    setPicking(false);
  }, [status]);
  const at = choice === OWN ? own ? new Date(own).toISOString() : null : choice;
  const requested = status === "requested";
  if (picking) {
    return <div role="group" aria-label="회의 시간 정하기" style={{ display: "grid", gap: "var(--spacing-3)" }}>
        <RadioList label="언제 열까요?" value={choice} onChange={setChoice}>
          {slots.map((slot) => <RadioListItem key={slot.at} value={slot.at} label={slot.label} />)}
          <RadioListItem value={OWN} label="직접 정하기" />
        </RadioList>
        {choice === OWN && <Suspense fallback={<Text type="supporting">시간 고르는 칸을 불러오는 중…</Text>}>
          <DateTimeInput label="회의 시간" value={own} onChange={setOwn} min={local(now)} max={local(now + AHEAD_DAYS * 864e5)} hourFormat="24h" placeholder="날짜" timePlaceholder="시간" width="100%" />
        </Suspense>}
        <div style={{ ...row, justifyContent: "flex-end" }}>
          <Button label="취소" variant="ghost" onClick={() => setPicking(false)} isDisabled={!!busy} />
          <Button label="이 시간에 열기" variant="primary" isDisabled={!at || !!busy} isLoading={busy === "time"} onClick={() => at && onTime?.(at)} />
        </div>
        {line && <div role="status"><Text type="supporting" color="accent">{line}</Text></div>}
      </div>;
  }
  return <div role="group" aria-label={requested ? "회의 요청에 답하기" : "예정된 회의"} style={{ display: "grid", gap: "var(--spacing-2)" }}>
      <div style={row}>
        <Button label={requested ? "지금 들어가기" : "지금 시작"} variant="primary" isLoading={busy === "start"} isDisabled={!!busy && busy !== "start"} onClick={() => onStart?.()} />
        <Button label={requested ? "시간 정하기" : "시간 바꾸기"} isDisabled={!!busy} onClick={() => {
    setChoice(slots[0]?.at ?? OWN);
    setPicking(true);
  }} />
        {requested && <Button label="채팅으로 답하기" isDisabled={!!busy} onClick={() => onAnswer?.()} />}
      </div>
      {line && <div role="status"><Text type="supporting" color="accent">{line}</Text></div>}
    </div>;
}
export const mount = island(MeetingPlan);
