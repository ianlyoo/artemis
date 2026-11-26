import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { AwayGlyph, MoonGlyph } from "../sysmap/icons.jsx";
import { Rings, TRACK } from "./charts.jsx";
import { Line, Part, gap, inset, nums, quiet } from "./parts.jsx";
import { l10n } from "../lib/l10n.js";
const body = { padding: `calc(var(--ui) * .55) ${inset}`, minWidth: 0 };
const grid = { ...body, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(var(--adm-gauge-cell),1fr))", gap: `${gap(0.8)} ${gap(0.5)}`, paddingBlock: "calc(var(--ui) * 1)" };
const Gauge = ({ name, under, children }) => <div style={{ display: "grid", justifyItems: "center", gap: gap(0.3), minWidth: 0 }}>
    {children}
    <div style={{ display: "grid", justifyItems: "center", minWidth: 0, maxWidth: "100%" }}>
      <Line weight="medium">{name}</Line>
      <Text type="supporting" style={{ ...nums, whiteSpace: "nowrap" }}>{under}</Text>
    </div>
  </div>;
const figure = (text, color = "var(--ink-strong)") => <Text type="inherit" style={{ ...nums, fontSize: "var(--t-data)", fontWeight: "var(--fw-title)", lineHeight: 1, color }}>{text}</Text>;
const level = (v, color, red) => red ? "var(--bad)" : v != null && v >= 85 ? "var(--warn)" : color;
const FIVE = "var(--chart-4)", WEEK = "var(--chart-1)", CPU = "var(--chart-4)";
const swatch = (color) => <i aria-hidden="true" style={{ display: "inline-block", width: ".62em", height: ".62em", borderRadius: "50%", background: color, marginInlineEnd: ".35em" }} />;
const ON = { out: "var(--state-owner)", sleep: "var(--state-waiting)" };
function Me({ owner, onOwner, phone }) {
  const one = (which, label, glyph, on, more = "") => {
    const name = `${label} · ${on ? l10n("켜짐", "on") : l10n("꺼짐", "off")}`;
    const lit = on ? { color: ON[which], "--glyph-glow": `drop-shadow(0 0 .35em color-mix(in srgb,${ON[which]} 55%,transparent))` } : { color: "var(--ink-quiet)" };
    return <Button variant="ghost" isIconOnly icon={<Icon icon={glyph} />} label={name} tooltip={name + more} aria-pressed={!!on} size={phone ? "md" : "sm"} isDisabled={!owner.ready} isLoading={!!owner.busy && owner.which === which} onClick={() => onOwner(which)} style={lit} />;
  };
  const note = owner.error ? <Text type="supporting" as="p" role="alert" style={{ color: "var(--bad)" }}>{owner.error}</Text> : owner.asleep ? <Text type="supporting" as="p" style={quiet}>{l10n("잠: 메시지를 보내면 풀려요", "Asleep: a message wakes you")}</Text> : null;
  const both = <span role="group" aria-label="Owner" aria-busy={!!owner.busy} style={{ display: "flex", gap: gap(0.2), marginInlineEnd: "calc(var(--spacing-2) * -1)" }}>
      {one("out", l10n("외출", "Away"), AwayGlyph, owner.away)}
      {one("sleep", l10n("잠", "Asleep"), MoonGlyph, owner.asleep, l10n(" · 메시지를 보내면 풀려요", " · a message wakes you"))}
    </span>;
  return <Part id="adm-me-h" title="Me" meta={both}>
      {note ? <div style={{ ...body, paddingBlock: "calc(var(--ui) * .5)" }}>{note}</div> : null}
    </Part>;
}
function Seats({ view }) {
  if (!view.seats.length) return null;
  const meta = <Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}>{swatch(FIVE)}5 h<span style={{ marginInlineStart: ".9em" }}>{swatch(WEEK)}week</span></Text>;
  return <Part id="adm-seats-h" title="Seats" meta={meta}>
      <div style={grid}>
        {view.seats.map((s) => <Gauge key={s.key} name={s.key} under={s.agents ? `${s.busy}/${s.agents} busy` : "no agents"}>
            <Rings size="var(--adm-gauge)" title={s.title} label={s.title} rings={[{ value: s.use, color: level(s.use, FIVE, s.red) }, { value: s.week, color: level(s.week, WEEK, s.red) }]}>
              {figure(s.use == null ? "—" : `${s.use}%`, s.red ? "var(--bad)" : "var(--ink-strong)")}
            </Rings>
          </Gauge>)}
      </div>
    </Part>;
}
function Antigravity({ view }) {
  const all = view.antigravity || [];
  if (!all.length) return null;
  const meta = <Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}>
      {all.map((a, i) => <span key={a.key} data-state={a.state} style={a.state === "idle" ? null : { color: "var(--state-color)" }}>{i ? " · " : ""}{a.status}</span>)}
    </Text>;
  return <Part id="adm-agy-h" title="Antigravity" meta={meta}>
      <div style={grid}>
        {all.flatMap((a) => a.pools.map((p) => <Gauge key={p.key} name={p.name} under={<>{p.under}{p.reset ? <><br />{p.reset}</> : null}</>}>
            <Rings size="var(--adm-gauge)" title={p.title} label={p.title} rings={[{ value: p.use, color: level(p.use, FIVE) }, { value: p.week, color: level(p.week, WEEK) }]}>
              {figure(p.use == null ? "—" : `${p.use}%`)}
            </Rings>
          </Gauge>))}
      </div>
    </Part>;
}
function Hosts({ view }) {
  if (!view.hosts.length) return null;
  return <Part id="adm-hosts-h" title="Hosts" meta={<Text type="supporting" style={quiet}>CPU</Text>}>
      <div style={grid}>
        {view.hosts.map((h) => <Gauge key={h.key} name={h.label} under={!h.online ? h.state || "off" : h.active ? `${h.busy}/${h.active} busy` : "no agents"}>
            <Rings size="var(--adm-gauge)" title={h.title} label={h.title} rings={[{ value: h.online ? h.cpu : null, color: level(h.cpu, CPU) }]}>
              {h.online ? figure(h.cpu == null ? "—" : `${h.cpu}%`, h.hot ? "var(--warn)" : "var(--ink-strong)") : figure("off", "var(--ink-quiet)")}
            </Rings>
          </Gauge>)}
      </div>
    </Part>;
}
function Agents({ view }) {
  const meta = <Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}>
      <span style={{ ...nums, color: "var(--state-running)" }}>{view.busy}</span> running · <span style={{ ...nums, color: "var(--ink)" }}>{view.idle}</span> idle
    </Text>;
  const most = Math.max(1, ...view.roles.map((r) => r.total));
  return <Part id="adm-agents-h" title="Agents" meta={meta}>
      {view.roles.length ? <div role="img" aria-label={view.roles.map((r) => `${r.label} ${r.busy} of ${r.total} busy`).join(", ")} style={{ ...body, display: "grid", gridTemplateColumns: `minmax(${gap(3.6)},auto) minmax(0,1fr) auto`, alignItems: "center", gap: `${gap(0.45)} ${gap(0.7)}`, paddingBlock: "calc(var(--ui) * .9)" }}>
          {view.roles.map((r) => [<Text key={r.key + ":n"} type="label" weight="medium" aria-hidden="true">{r.label}</Text>, <span key={r.key + ":b"} aria-hidden="true" style={{ display: "flex", height: "calc(var(--ui) * .75)", minWidth: 0 }}>
              <span style={{ display: "flex", width: `${r.total / most * 100}%`, borderRadius: "calc(var(--ui) * .2)", overflow: "hidden", background: TRACK }}>
                <i style={{ width: `${r.busy / r.total * 100}%`, background: "var(--state-running)", transition: "width var(--dur-grow) var(--ease-out)" }} />
              </span>
            </span>, <Text key={r.key + ":f"} type="supporting" aria-hidden="true" style={{ ...nums, whiteSpace: "nowrap" }}><span style={{ color: "var(--ink)" }}>{r.busy}</span>/{r.total}</Text>])}
        </div> : <div style={body}><Text type="supporting" as="p">{l10n("에이전트가 없어요.", "No agents.")}</Text></div>}
    </Part>;
}
export function Rail({ view, owner = {}, onOwner = () => {
}, phone = false, shown = { seats: true, hosts: true } }) {
  return <div style={{ display: "grid", gridTemplateColumns: "var(--adm-rail-cols, minmax(0,1fr))", alignItems: "start", gap: `${gap(0.4)} ${gap(1.2)}`, minWidth: 0 }}>
      {owner && <Me owner={owner} onOwner={onOwner} phone={phone} />}
      {shown.seats && <Seats view={view} />}
      {shown.seats && <Antigravity view={view} />}
      {shown.hosts && <Hosts view={view} />}
      <Agents view={view} />
    </div>;
}
