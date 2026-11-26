import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
const MARK = "작업 중 · 검수 전";
const column = { display: "grid", gap: "var(--spacing-3)", minWidth: 0 };
const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-2)" };
const buttons = { ...row, marginInlineStart: "calc(-1 * var(--spacing-3))" };
export function PreviewCard({ phase = "loading", preview = null, started = "", phone = false, onOpen, onReload }) {
  const head = <div style={row}>
      <Text type="label" color="secondary">라이브 미리보기</Text>
      {phase !== "stopped" && <Badge variant="warning" label={MARK} />}
    </div>;
  if (phase !== "live" || !preview) {
    return <Card padding={4}>
        <div style={column} aria-busy={phase === "loading" || void 0}>
          {head}
          {phase === "loading" && <div style={row}><Spinner size="sm" shade="subtle" aria-label="불러오는 중" /><Text type="supporting">미리보기를 불러오는 중이에요</Text></div>}
          {phase === "stopped" && <Text type="supporting" as="p" display="block">이 미리보기는 멈췄어요. 다시 띄우면 새 카드로 알려 드려요.</Text>}
          {phase === "failed" && <div style={row}>
            <Text type="supporting">미리보기를 불러오지 못했어요.</Text>
            <Button label="다시 불러오기" variant="ghost" size="sm" onClick={() => onReload?.()} />
          </div>}
        </div>
      </Card>;
  }
  const host = preview.origin.replace(/^https:\/\//, "");
  return <Card padding={4}>
      <div style={column} data-state="live">
        {head}
        <div style={{ display: "grid", gap: "var(--spacing-1)", minWidth: 0 }}>
          <Text type="large" weight="semibold" as="p" display="block" textWrap="pretty">{preview.title || "라이브 미리보기"}</Text>
          <Text type="supporting" as="p" display="block">{[preview.agent, started && `띄운 지 ${started}`.replace("띄운 지 방금", "방금 띄웠어요")].filter(Boolean).join(" · ")}</Text>
        </div>
        {}
        <div style={phone ? row : buttons} role="group" aria-label="미리보기 열기">
          {!phone && <Button label="옆 탭에서 열기" variant="primary" onClick={() => onOpen?.()} />}
          <Link href={preview.origin + "/"} isExternalLink newTabLabel="새 탭에서 열려요" label={`${host} 새 탭에서 열기`}>
            <Text type="body">새 탭에서 열기</Text>
          </Link>
        </div>
        <Text type="supporting" as="p" display="block">고치는 대로 화면이 바뀌어요. 보시면서 바로 말씀해 주세요. 괜찮으면 «OK»라고 해 주시면 마지막 점검 한 번 거쳐 배포해요.</Text>
      </div>
    </Card>;
}
export const mount = island(PreviewCard);
