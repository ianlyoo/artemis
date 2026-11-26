import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Kbd } from "@astryxdesign/core/Kbd";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
export const GIST = 3;
const ERRORS = ["unreachable", "locked", "not_opened", "failed"];
const FALLBACK = { unreachable: "기기에 연결하지 못했어요. 켜져 있는지 확인해 주세요.", locked: "기기가 잠겨 있어요. 잠금을 풀고 다시 눌러 주세요.", not_opened: "45초 안에 인터뷰가 연결되지 않았어요. 창이 떴는지 확인하고 다시 눌러 주세요.", failed: "창을 띄우지 못했어요. 다시 눌러 주세요." };
const column = { display: "grid", gap: "var(--spacing-3)", minWidth: 0 };
const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-2)" };
const buttons = { ...row, marginInlineStart: "calc(-1 * var(--spacing-3))" };
const hair = { height: 1, background: "var(--color-border)" };
const nameOf = (view, device) => view?.labels?.[device] || device;
function status(view) {
  const where = (device) => device ? nameOf(view, device) : "";
  switch (view.state) {
    case "opening":
      return { spin: true, text: `${where(view.launch?.device)} 화면에 인터뷰 창을 띄우는 중이에요`.trim() + (view.launch?.voice ? ". 첫 질문 뒤에 음성이 켜져요" : "") };
    case "in_progress":
      return { dot: "success", text: view.opened_device ? `${where(view.opened_device)}에서 인터뷰 중이에요` : "인터뷰 중이에요" };
    case "finished":
      return { dot: "success", text: "인터뷰를 마쳤어요" };
    case "closed":
      return { dot: "neutral", text: "닫힌 인터뷰예요" };
    case "failed":
      return { dot: "error", text: view.message || FALLBACK.failed, alert: true };
    default:
      return ERRORS.includes(view.state) ? { dot: "warning", text: view.message || FALLBACK[view.state], alert: true } : null;
  }
}
function Hint({ view, devices, again, mic }) {
  const one = devices.length === 1 ? devices[0] : null, mics = devices.filter((device) => mic[device]);
  const where = again ? "창을 닫았다면 다시 열어요. 답한 데부터 이어져요." : one ? `${nameOf(view, one)} 화면에 인터뷰 창이 떠요.` : "누른 기기 화면에 인터뷰 창이 떠요.";
  const here = one && mics.length ? `${nameOf(view, one)}에서` : "그 기기에서";
  return <Text type="supporting" as="p" display="block">
      {where}{mics.length > 0 && ` ${here} 누르면 첫 질문 뒤에 음성이 저절로 켜지고, 다른 데서 누르면 `}
      {mics.map((device, n) => <span key={device}>{n ? ", " : ""}{one ? "" : `${nameOf(view, device)} `}{mic[device].key ? <Kbd keys={mic[device].key} /> : `「${mic[device].typed}」`}</span>)}
      {mics.length > 0 && "로 켜요."}
    </Text>;
}
export function InterviewCard({ phase = "loading", view = null, busy = null, line = "", mic = {}, onLaunch, onReload }) {
  if (phase !== "view" || !view) {
    return <Card padding={4}>
        <div style={column} aria-busy={phase === "loading" || void 0}>
          <Text type="label" color="secondary">인터뷰</Text>
          {phase === "loading" && <div style={row}><Spinner size="sm" shade="subtle" aria-label="불러오는 중" /><Text type="supporting">인터뷰를 불러오는 중이에요</Text></div>}
          {phase === "gone" && <Text type="supporting" as="p" display="block">이 인터뷰를 찾을 수 없어요.</Text>}
          {phase === "failed" && <div style={row}>
            <Text type="supporting">인터뷰 카드를 불러오지 못했어요.</Text>
            <Button label="다시 불러오기" variant="ghost" size="sm" onClick={() => onReload?.()} />
          </div>}
        </div>
      </Card>;
  }
  const questions = Array.isArray(view.questions) ? view.questions.filter((q) => typeof q === "string" && q.trim()) : [];
  const count = Number.isSafeInteger(view.question_count) ? view.question_count : questions.length;
  const shown = questions.slice(0, GIST), more = Math.max(0, count - shown.length);
  const devices = (Array.isArray(view.devices) ? view.devices : []).filter((device) => typeof device === "string" && device);
  const state = status(view), again = view.state === "in_progress" || !!view.opened_device;
  const opening = view.state === "opening" ? view.launch?.device : null;
  return <Card padding={4}>
      <div style={column} data-state={view.state}>
        <div style={{ display: "grid", gap: "var(--spacing-1)", minWidth: 0 }}>
          <Text type="label" color="secondary">인터뷰 · 질문 {count}개</Text>
          <Text type="large" weight="semibold" as="p" display="block" textWrap="pretty">{view.topic || "인터뷰"}</Text>
        </div>
        {shown.length > 0 && <List listStyle="decimal" density="compact" edge="flush">
          {shown.map((question, n) => <ListItem key={n} label={<Text type="body" color="secondary" textWrap="pretty">{question}</Text>} />)}
        </List>}
        {more > 0 && <Text type="supporting">외 {more}개</Text>}
        {(state || devices.length > 0) && <div style={hair} />}
        {state && <div style={{ ...row, flexWrap: "nowrap", alignItems: "flex-start" }} role={state.alert ? "alert" : "status"}>
          <span style={{ display: "grid", placeItems: "center", flex: "none", height: "1.5em" }}>
            {state.spin ? <Spinner size="sm" aria-label="여는 중" /> : <StatusDot variant={state.dot} label={state.text} />}
          </span>
          <Text type="body" weight={state.alert ? "normal" : "medium"}>{state.text}</Text>
        </div>}
        {}
        {devices.length > 0 && <div style={buttons} role="group" aria-label="인터뷰 열 기기">
          {devices.map((device) => {
    const label = `${nameOf(view, device)}에서 ${again ? "다시 열기" : "시작"}`;
    const held = !!busy && busy !== device || opening === device;
    return <Button key={device} label={label} variant={!again && device === devices[0] ? "primary" : "secondary"} isLoading={busy === device} isDisabled={held} onClick={() => {
      if (!busy && !held) onLaunch?.(device);
    }} />;
  })}
        </div>}
        {line && <div role="alert"><Text type="supporting" color="accent">{line}</Text></div>}
        {devices.length > 0 && <Hint view={view} devices={devices} again={again} mic={mic} />}
      </div>
    </Card>;
}
export const mount = island(InterviewCard);
