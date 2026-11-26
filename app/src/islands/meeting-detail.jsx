import { lazy, Suspense } from "react";
import { Popover } from "@astryxdesign/core/Popover";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { List, ListItem } from "@astryxdesign/core/List";
import { island } from "./lib/mount.jsx";
export const DETAIL_LABEL = "회의 상세";
const Markdown = lazy(() => import("@astryxdesign/core/Markdown").then((m) => ({ default: m.Markdown })));
const TONE = { run: "accent", wait: "warning", stuck: "error", idle: "neutral" };
const SPOKE = { spoke: "success", speaking: "accent", silent: "neutral" };
const Dotted = ({ variant, children }) => <HStack gap={1.5} align="center"><StatusDot variant={variant} label={children} /><span>{children}</span></HStack>;
const Mark = ({ seat }) => <span aria-hidden="true" style={{ display: "inline-block", width: "1.5em", textAlign: "center", fontWeight: 600, color: seat.member ? "var(--state-owner)" : "var(--color-text-secondary)" }}>{seat.mark}</span>;
export function DetailBody({ detail }) {
  const { id, title, status, tone, kind, goal, time, round, agenda, seats } = detail;
  const rated = seats.some((seat) => seat.state);
  return <VStack gap={5}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting">회의 #{id}</Text>
      </VStack>
      <MetadataList label={{ width: "4.5em" }}>
        <MetadataListItem label="상태"><Dotted variant={TONE[tone] ?? "neutral"}>{status}</Dotted></MetadataListItem>
        <MetadataListItem label="종류">{kind}</MetadataListItem>
        <MetadataListItem label="목표">{goal}</MetadataListItem>
        <MetadataListItem label="시간">{time ?? "정하지 않았어요"}</MetadataListItem>
        <MetadataListItem label="라운드">{round ?? "시작 전"}</MetadataListItem>
      </MetadataList>
      <List density="compact" edge="flush" header={<HStack justify="between" align="center">
          <Heading level={3}>참석자 {seats.length}명</Heading>
          {rated && <Text type="supporting">{round} 발언</Text>}
        </HStack>}>
        {seats.map((seat) => <ListItem key={seat.name} label={seat.label} description={seat.purpose} align="first-line" startContent={<Mark seat={seat} />} endContent={seat.state && <Text type="supporting"><Dotted variant={SPOKE[seat.state]}>{seat.stateWord}</Dotted></Text>} />)}
      </List>
      {agenda && <VStack gap={2}>
          <Heading level={3}>안건</Heading>
          <Suspense fallback={<p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{agenda}</p>}>
            <Markdown density="compact" headingLevelStart={4} contentWidth="100%">{agenda}</Markdown>
          </Suspense>
        </VStack>}
    </VStack>;
}
export function MeetingDetail({ detail, sheet = false }) {
  const body = <DetailBody detail={detail} />;
  return <Popover label={DETAIL_LABEL} presentation={sheet ? "bottom-sheet" : "popover"} placement="above" alignment="end" width={sheet ? void 0 : 440} padding={sheet ? void 0 : 0} content={sheet ? body : <div style={{ maxHeight: "min(72vh, 680px)", overflowY: "auto", padding: "var(--spacing-5)" }}>{body}</div>}>
      <Button label={DETAIL_LABEL} variant="ghost" size="sm" className="meeting-detail" />
    </Popover>;
}
export const mount = island(MeetingDetail);
