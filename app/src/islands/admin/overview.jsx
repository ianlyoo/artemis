import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { Donut } from "./charts.jsx";
import { Line, Part, Press, gap, inset, nums, quiet, tone } from "./parts.jsx";
import { l10n } from "../lib/l10n.js";
const body = { padding: `calc(var(--ui) * 1) ${inset}`, minWidth: 0 };
const dot = (color) => <i aria-hidden="true" style={{ flex: "none", width: ".62em", height: ".62em", borderRadius: "50%", background: color }} />;
function ByState({ view, phone, onFilter }) {
  const [lit, setLit] = useState(null);
  const one = view.slices.find((s) => s.key === (lit ?? view.filter));
  const label = view.total ? `Work by state: ${view.slices.map((s) => `${s.label} ${s.n}`).join(", ")}` : "No open work";
  return <Part id="adm-state-h" title="Work by state" meta={<Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}><span style={{ ...nums, color: "var(--ink)" }}>{view.total}</span> open</Text>}>
      <div style={{ ...body, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "center", gap: gap(phone ? 1 : 1.4) }}>
        <Donut slices={view.slices.map((s) => ({ key: s.key, n: s.n, color: tone(s.state) }))} size="var(--adm-donut)" label={label} lit={lit} picked={view.filter} onPick={onFilter} onLit={setLit}>
          <Text type="inherit" style={{ ...nums, fontSize: "calc(var(--t-head) * 1.45)", fontWeight: "var(--fw-title)", lineHeight: 1, color: one ? tone(one.state) : "var(--ink-strong)" }}>{one ? one.n : view.total}</Text>
          <Text type="supporting" style={{ maxWidth: "calc(var(--adm-donut) * .52)", marginTop: ".3em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...quiet }}>{one ? one.label : "open"}</Text>
        </Donut>
        {view.slices.length ? <div role="group" aria-label="Show work by state" style={{ display: "grid", minWidth: 0, marginInline: "calc(var(--spacing-3) * -1)", containerType: "inline-size" }} onPointerLeave={() => setLit(null)} onBlur={() => setLit(null)}>
            {view.slices.map((s) => {
    const picked = view.filter === s.key, ink = picked ? tone(s.state) : lit === s.key ? "var(--accent-ink)" : view.filter ? "var(--ink-quiet)" : null;
    const glow = picked ? `0 0 .8em color-mix(in srgb,${tone(s.state)} 45%,transparent)` : void 0;
    return <span key={s.key} style={{ display: "grid", minWidth: 0 }} onPointerEnter={() => setLit(s.key)} onFocus={() => setLit(s.key)}>
                  <Press pressed={picked} label={`${s.label} ${s.n}`} width="100%" onClick={() => onFilter(s.key)} style={{ justifyContent: "stretch" }}>
                    {}
                    <span style={{ display: "flex", alignItems: "center", gap: ".6em", width: "calc(100cqi - var(--spacing-3) * 2)", minWidth: 0, textShadow: glow, transition: "color var(--dur-hover) var(--ease-hover)" }}>
                      {dot(tone(s.state))}
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start", color: ink ?? "var(--ink)", fontWeight: picked ? "var(--fw-emph)" : "var(--fw-control)" }}>{s.label}</span>
                      <span style={{ ...nums, color: ink ?? "var(--ink-strong)", fontWeight: "var(--fw-emph)" }}>{s.n}</span>
                    </span>
                  </Press>
                </span>;
  })}
          </div> : <Text type="supporting" as="p">{l10n("열린 일이 없어요.", "No open work.")}</Text>}
      </div>
    </Part>;
}
const cut = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" };
const hidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" };
const pipColor = (a) => a.stuck ? "var(--state-stuck)" : a.busy ? "var(--state-running)" : "color-mix(in srgb,var(--ink-quiet) 70%,transparent)";
const hosts = (l) => l.hosts.map((h) => l.hosts.length > 1 ? `${h.label} ${h.n}` : h.label).join(" · ");
const Pip = ({ a }) => <Tooltip placement="top" touchTrigger="tap" hasHoverIndication={false} content={<span style={{ display: "grid", gap: ".15em" }}>
      {a.on || a.task ? <b style={{ fontWeight: "var(--fw-emph)" }}>{a.on || a.task}</b> : null}
      {a.on && a.task ? <span>{a.task}</span> : null}
      <span>{a.name} {a.state}{[a.where, a.model, a.time].filter(Boolean).map((v) => ` · ${v}`).join("")}</span>
    </span>}>
    <div data-key={a.key} role="listitem" className="adm-crew-pip" style={{ position: "relative", flex: "none", width: "var(--adm-crew-pip)", height: "calc(var(--adm-crew-pip) * 2.4)", borderRadius: "calc(var(--adm-crew-pip) * .5)", color: pipColor(a), background: "currentColor" }}>
      <span style={hidden}>{a.name}</span>
      <span style={hidden}>{a.state}</span>
      <span style={hidden}>{[a.on || a.task, a.where, a.model, a.time].filter(Boolean).join(", ")}</span>
    </div>
  </Tooltip>;
function CrewLine({ line, cap, quietName = false }) {
  let left = cap;
  const groups = line.roles.map((r) => {
    const take = r.agents.slice(0, Math.max(0, left));
    left -= take.length;
    return { ...r, take };
  });
  const name = line.go ? <button type="button" className="adm-crew-go" data-adm-goto={line.key} aria-label={`${line.title}: its row`} style={{ display: "flex", alignItems: "center", minWidth: 0, maxWidth: "100%", padding: 0, border: 0, background: "none", font: "inherit", color: "var(--ink)", cursor: "pointer", textAlign: "start" }}>
      <Line weight="medium">{line.title}</Line>
    </button> : <Line style={{ color: quietName ? "var(--ink-quiet)" : "var(--ink)" }}>{line.title}</Line>;
  return <li className="adm-crew-line" style={{ display: "grid", gridTemplateColumns: "var(--adm-crew-cols)", gridTemplateAreas: "var(--adm-crew-areas)", alignItems: "center", columnGap: gap(1), rowGap: gap(0.25), minHeight: "var(--adm-crew-row)", minWidth: 0, paddingBlock: "var(--adm-crew-pad)" }}>
      <span style={{ gridArea: "name", display: "flex", alignItems: "center", gap: ".5em", minWidth: 0 }}>
        {line.stuck ? <Icon icon="warning" size="sm" color="inherit" style={{ flex: "none", color: "var(--state-stuck)" }} /> : dot(line.key === "standing" ? "var(--state-idle)" : tone(line.state))}
        {name}
      </span>
      <div role="list" aria-label={line.roles.map((r) => `${r.label} ${r.n}`).join(", ")} style={{ gridArea: "crew", display: "flex", alignItems: "center", flexWrap: "wrap", gap: `${gap(0.3)} ${gap(0.9)}`, minWidth: 0 }}>
        {groups.map((r) => <span key={r.label} style={{ display: "inline-flex", alignItems: "center", gap: ".45em", minWidth: 0 }}>
            <Text type="supporting" aria-hidden="true" style={{ whiteSpace: "nowrap" }}>{r.label}</Text>
            {r.take.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: "calc(var(--adm-crew-pip) * .55)" }}>{r.take.map((a) => <Pip key={a.key} a={a} />)}</span> : null}
            {r.n > 1 || r.take.length < r.n ? <Text type="supporting" aria-hidden="true" style={{ ...nums, color: "var(--ink)" }}>{r.n}</Text> : null}
          </span>)}
      </div>
      <Text type="supporting" style={{ gridArea: "hosts", ...quiet, ...cut, whiteSpace: "nowrap", justifySelf: "end" }}>{hosts(line)}</Text>
    </li>;
}
function Crew({ crew, busy, idle, phone }) {
  const cap = phone ? 10 : 20;
  const box = useRef(null), [fit, setFit] = useState(null), [edge, setEdge] = useState("");
  const count = crew.lines.length;
  useLayoutEffect(() => {
    const ul = box.current;
    if (!ul || count <= crew.box) {
      setFit(null);
      return void 0;
    }
    const measure = () => {
      const name = ul.children[crew.box - 1]?.firstElementChild;
      setFit(name ? Math.round(name.offsetTop + name.offsetHeight * 0.6) : null);
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(ul);
    return () => seen.disconnect();
  }, [count, crew.box, phone]);
  const onScroll = () => {
    const ul = box.current;
    if (!ul) return;
    const top = ul.scrollTop > 1, bottom = ul.scrollTop + ul.clientHeight < ul.scrollHeight - 1;
    setEdge(top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "");
  };
  useLayoutEffect(onScroll, [fit, count]);
  const meta = <Text type="supporting" style={{ ...quiet, whiteSpace: "nowrap" }}>
      <span style={{ ...nums, color: "var(--state-running)" }}>{busy}</span> running · <span style={{ ...nums, color: "var(--ink)" }}>{idle}</span> idle
    </Text>;
  const list = { listStyle: "none", margin: 0, paddingInline: inset, display: "grid", alignContent: "start", minWidth: 0 };
  return <Part id="adm-crew-h" title="Agents at work" meta={meta}>
      {crew.n ? <div style={{ paddingBlock: "calc(var(--ui) * 1)", minWidth: 0 }}>
          {count ? <ul ref={box} className="adm-crew-box" data-edge={edge || void 0} aria-label={`Agents by work, ${count} works`} tabIndex={fit ? 0 : void 0} onScroll={onScroll} style={{ ...list, position: "relative", maxHeight: fit ?? void 0, overflowY: fit ? "auto" : void 0 }}>
              {crew.lines.map((l) => <CrewLine key={l.key} line={l} cap={cap} />)}
            </ul> : null}
          {crew.standing ? <ul aria-label="Standing agents" style={{ ...list, paddingTop: fit ? "calc(var(--ui) * .4)" : 0 }}><CrewLine line={crew.standing} cap={cap} quietName /></ul> : null}
        </div> : <div style={body}><Text type="supporting" as="p">{l10n("일하는 에이전트가 없어요.", "No agents working.")}</Text></div>}
    </Part>;
}
function Day({ day, phone }) {
  const sep = <span aria-hidden="true" style={quiet}> · </span>;
  return <p aria-label={day.text} data-adm-day="" style={{ gridColumn: "1 / -1", margin: 0, padding: `0 ${inset}`, fontSize: phone ? "var(--t-title)" : "var(--t-head)", fontWeight: "var(--fw-control)", lineHeight: "var(--lh-tight)", color: "var(--ink)", overflowWrap: "anywhere" }}>
      <span aria-hidden="true">
        <span style={{ ...quiet, fontWeight: "var(--fw-title)" }}>{day.label}</span>
        {day.parts.map((p) => <span key={p.key} style={{ whiteSpace: "nowrap" }}>{sep}{p.before}
          <span style={{ ...nums, fontWeight: "var(--fw-title)", color: p.key === "stuck" ? "var(--state-stuck)" : "var(--ink-strong)" }}>{p.n}</span>{p.after}</span>)}
      </span>
    </p>;
}
export function Overview({ view, phone = false, onFilter = () => {
} }) {
  return <div style={{ display: "grid", gridTemplateColumns: "var(--adm-ov-cols)", alignItems: "start", gap: `${gap(0.6)} var(--adm-ov-gap)`, minWidth: 0 }}>
      {view.day ? <Day day={view.day} phone={phone} /> : null}
      <ByState view={view} phone={phone} onFilter={onFilter} />
      <Crew crew={view.crew} busy={view.busy} idle={view.idle} phone={phone} />
    </div>;
}
