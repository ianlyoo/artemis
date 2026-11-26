import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
const TONE = { running: "--state-running", idle: "--state-idle", stuck: "--state-stuck", blocked: "--state-stuck", owner: "--state-owner", done: "--done", person: "--state-waiting", date: "--state-idle", waiting: "--neutral" };
export const tone = (state) => state === "paused" ? "color-mix(in srgb,var(--neutral) 60%,var(--paper))" : `var(${TONE[state] || "--neutral"})`;
export const Line = ({ type = "label", children, ...rest }) => <Text type={type} maxLines={1} {...rest}>{children}</Text>;
export const quiet = { color: "var(--ink-quiet)" };
export const Press = ({ pressed, size = "sm", ...rest }) => <Button variant="ghost" size={size} aria-pressed={!!pressed} {...rest} />;
export const nums = { fontVariantNumeric: "tabular-nums" };
const stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
export const Archive = (props) => <svg {...stroke} {...props}><path d="M4 5h16v4H4zM6 9v11h12V9M10 13h4" /></svg>;
export const gap = (n) => `calc(var(--t-body) * ${n})`;
export const inset = "var(--adm-part-in, var(--s-in))";
export const Part = ({ id, title, meta, children, style }) => <section aria-labelledby={id} style={{ minWidth: 0, ...style }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: inset, minHeight: "calc(var(--ui) * 2.9)", padding: `0 ${inset}`, borderBottom: "1px solid var(--rule)" }}>
      <Heading level={3} id={id} style={{ fontSize: "var(--t-data)", fontWeight: "var(--fw-title)", lineHeight: "var(--lh-tight)", whiteSpace: "nowrap" }}>{title}</Heading>
      {meta}
    </div>
    {children}
  </section>;
