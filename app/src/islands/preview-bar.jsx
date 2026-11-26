import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
const svg = (props, ...paths) => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {paths.map((d, n) => <path key={n} d={d} />)}
  </svg>;
const Reload = (props) => svg(props, "M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7");
const Phone = (props) => svg(props, "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M11 18h2");
const Screen = (props) => svg(props, "M3 5h18v11H3z", "M9 20h6", "M12 16v4");
export const MARK = "작업 중 · 검수 전";
export const LIVE_LINE = { hmr: "Edits appear as they land", watch: "Reloads when a file changes" };
const row = { display: "flex", alignItems: "center", gap: "var(--spacing-2)", minWidth: 0 };
const bar = { ...row, flexWrap: "wrap", columnGap: "var(--spacing-4)", rowGap: "var(--spacing-2)", padding: "var(--spacing-2) var(--spacing-3)" };
export function PreviewBar({ state = "loading", preview = null, size = "1920", scale = 100, session = "", onSize, onReload }) {
  const host = preview?.origin ? preview.origin.replace(/^https:\/\//, "") : "";
  return <div style={bar} data-state={state}>
      <div style={{ ...row, flex: "1 1 18rem" }}>
        <span style={{ flex: "none" }}><Badge variant={state === "stopped" ? "neutral" : "warning"} label={state === "stopped" ? "Stopped" : MARK} /></span>
        {}
        <span style={{ flex: "0 1 auto", minWidth: "7rem", overflow: "hidden" }}><Text type="body" weight="semibold" maxLines={1}>{preview?.title || "Live preview"}</Text></span>
        {preview?.agent && <span style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden" }}><Text type="supporting" maxLines={1}>{preview.agent}</Text></span>}
      </div>
      <div style={{ ...row, flex: "0 1 auto" }}>
        {host && <Link href={preview.origin + "/"} isExternalLink newTabLabel="opens in a new tab" label={`Open ${host} in a new tab`}>
          <Text type="code" color="secondary" maxLines={1}>{host}</Text>
        </Link>}
      </div>
      <div style={{ ...row, flex: "0 0 auto" }}>
        <SegmentedControl label="Viewport" value={size} onChange={(value) => onSize?.(value)} size="sm" isDisabled={state !== "live"}>
          <SegmentedControlItem value="390" label="Phone 390" icon={<Icon icon={Phone} />} />
          <SegmentedControlItem value="1920" label="PC 1920" icon={<Icon icon={Screen} />} />
        </SegmentedControl>
        <Text type="supporting" hasTabularNumbers>{scale} %</Text>
        <IconButton label="Reload" tooltip="Reload" icon={<Icon icon={Reload} />} variant="ghost" size="sm" isDisabled={state !== "live"} onClick={() => onReload?.()} />
      </div>
      {state === "live" && <div style={{ ...row, flex: "1 0 100%" }} role="status">
        {session && <StatusDot variant="success" label="Feedback session" />}
        <Text type="supporting">{LIVE_LINE[preview?.reload] ?? LIVE_LINE.hmr}{session ? ` · feedback session ${session}` : ""}</Text>
      </div>}
    </div>;
}
export const mount = island(PreviewBar);
