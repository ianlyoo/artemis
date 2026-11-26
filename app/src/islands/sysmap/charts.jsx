import { Text } from "@astryxdesign/core/Text";
import { Donut, Rings } from "../admin/charts.jsx";
import { Part, Press, nums, quiet } from "../admin/parts.jsx";
import { GROUP_NAMES, groupNodes, hostHealth, outgoingLabel, relationCounts } from "../../workspace/sysmap-data.js";
const TONE = { running: "var(--state-running)", idle: "var(--state-idle)", warning: "var(--warn)", quiet: "var(--neutral)" };
const QUIET = "color-mix(in srgb,var(--ink) 30%,transparent)";
const row = { display: "flex", alignItems: "center", gap: ".6em", width: "100%", minWidth: 0, textAlign: "start" };
const Cell = ({ children, ...rest }) => <span style={{ display: "grid", minWidth: 0, marginInline: "calc(var(--spacing-3) * -1)", containerType: "inline-size" }} {...rest}>{children}</span>;
const whole = { width: "calc(100cqi - var(--spacing-3) * 2)" };
const cut = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const lineButton = { justifyContent: "stretch", height: "auto", minHeight: "var(--sm-line)", paddingBlock: ".3em" };
function Hosts({ hosts, live, onSelect }) {
  const running = hosts.reduce((n, h) => n + h.running, 0), count = hosts.reduce((n, h) => n + h.count, 0);
  const meta = live?.ok ? <Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}><span style={{ ...nums, color: "var(--state-running)" }}>{running}</span> of {count} agents running</Text> : <Text type="supporting" style={quiet}>{live ? "Live unavailable" : "Live connecting"}</Text>;
  return <Part id="sm-hosts-h" title="Hosts" meta={meta}>
      <div className="sm-glance-list" role="group" aria-label="Hosts">
        {hosts.map((h) => {
    const words = [h.label || (live?.ok ? "no data" : ""), h.count ? `${h.running}/${h.count} running` : ""].filter(Boolean).join(" · ");
    return <Cell key={h.id}><Press width="100%" label={`${h.name}: ${words || "no live data"}; ${h.cpu == null ? "CPU unknown" : `CPU ${h.cpu}%`}; ${h.parts} parts run here`} onClick={() => onSelect(h.id)} style={lineButton}>
              <span style={{ ...row, ...whole }}>
                <Rings size="calc(var(--t-body) * 2.1)" rings={[{ value: h.cpu, color: h.cpu >= 85 ? "var(--warn)" : "var(--chart-4)" }]} label={h.cpu == null ? "CPU unknown" : `CPU ${h.cpu}%`} />
                <span style={{ display: "grid", flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                  <span style={{ ...row, gap: ".45em" }}>
                    <i aria-hidden="true" className="sm-glance-dot" style={{ background: TONE[h.tone] ?? QUIET }} />
                    <b style={{ ...cut, fontWeight: "var(--fw-emph)", color: "var(--ink)" }}>{h.name}</b>
                    <span style={{ ...nums, marginInlineStart: "auto", color: "var(--ink)" }}>{h.cpu == null ? "—" : `${h.cpu}%`}</span>
                  </span>
                  <span style={{ ...row, ...quiet, fontSize: "var(--t-meta)" }}>
                    <span style={{ ...cut, color: TONE[h.tone] ?? "var(--ink-quiet)" }}>{words || (live?.ok ? "no live data" : "—")}</span>
                    <span style={{ ...nums, marginInlineStart: "auto", whiteSpace: "nowrap" }}>{h.parts} parts</span>
                  </span>
                </span>
              </span>
            </Press></Cell>;
  })}
      </div>
    </Part>;
}
function Groups({ shown, hot, picked, onHot, onPick }) {
  const groups = [...groupNodes(shown)].map(([key, nodes]) => ({ key, n: nodes.length, label: GROUP_NAMES[key] ?? key }));
  const one = groups.find((g) => g.key === hot) ?? groups.find((g) => g.key === picked);
  return <Part id="sm-groups-h" title="Parts by group" meta={<Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}><span style={{ ...nums, color: "var(--ink)" }}>{groups.length}</span> groups</Text>}>
      <div className="sm-glance-groups">
        <Donut slices={groups.map((g) => ({ key: g.key, n: g.n, color: g.key === (hot ?? picked) ? "var(--accent-ink)" : QUIET }))} size="var(--sm-donut)" label={`Parts by group: ${groups.map((g) => `${g.label} ${g.n}`).join(", ")}`} lit={hot} picked={picked} onPick={onPick} onLit={onHot}>
          <Text type="inherit" style={{ ...nums, fontSize: "var(--t-head)", fontWeight: "var(--fw-title)", lineHeight: 1, color: one ? "var(--accent-ink)" : "var(--ink-strong)" }}>{one ? one.n : shown.length}</Text>
          <Text type="supporting" style={{ ...cut, maxWidth: "calc(var(--sm-donut) * .56)", marginTop: ".25em", ...quiet }}>{one ? one.label : "parts"}</Text>
        </Donut>
        <div role="group" aria-label="Light a group on the map" className="sm-glance-legend" onPointerLeave={() => onHot(null)}>
          {groups.map((g) => <Cell key={g.key} onPointerEnter={() => onHot(g.key)} onFocus={() => onHot(g.key)} onBlur={() => onHot(null)}>
              <Press width="100%" pressed={picked === g.key} label={`${g.label} ${g.n}`} onClick={() => onPick(g.key)} style={lineButton}>
                <span style={{ ...row, ...whole }}>
                  <span style={{ ...cut, flex: 1, color: g.key === (hot ?? picked) ? "var(--accent-ink)" : "var(--ink)" }}>{g.label}</span>
                  <span style={{ ...nums, ...quiet }}>{g.n}</span>
                </span>
              </Press>
            </Cell>)}
        </div>
      </div>
    </Part>;
}
function Relations({ shown, rel, onRel }) {
  const counts = relationCounts(shown), most = counts[0]?.[1] ?? 1;
  return <Part id="sm-rel-h" title="Links by relation" meta={rel ? <Text type="supporting" style={quiet}>{outgoingLabel(rel)} only</Text> : null}>
      <div className="sm-glance-list" role="group" aria-label="Show one relation's lines">
        {counts.map(([key, n]) => <Cell key={key}><Press width="100%" pressed={rel === key} label={`${outgoingLabel(key)} ${n}`} onClick={() => onRel(rel === key ? "" : key)} style={lineButton}>
            <span style={{ ...row, ...whole, display: "grid", gridTemplateColumns: "minmax(0,7.5em) minmax(0,1fr) auto" }}>
              <span style={{ ...cut, color: rel === key ? "var(--accent-ink)" : "var(--ink)" }}>{outgoingLabel(key)}</span>
              <span aria-hidden="true" className="sm-bar"><i style={{ width: `${Math.max(2, n / most * 100)}%`, background: rel === key ? "var(--accent-ink)" : QUIET }} /></span>
              <span style={{ ...nums, ...quiet, minWidth: "2.2em", textAlign: "end" }}>{n}</span>
            </span>
          </Press></Cell>)}
      </div>
    </Part>;
}
export function Glance({ map, live, shown, hot, picked, onHot, onPick, rel, onRel, onSelect }) {
  return <aside className="sm-glance" aria-label="Figures">
      <Hosts hosts={hostHealth(map, live)} live={live} onSelect={onSelect} />
      <Groups shown={shown} hot={hot} picked={picked} onHot={onHot} onPick={onPick} />
      <Relations shown={shown} rel={rel} onRel={onRel} />
    </aside>;
}
