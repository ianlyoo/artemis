import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Code } from "@astryxdesign/core/Code";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { kindLabel, sequence } from "../../workspace/sysmap-data.js";
import { Detail } from "./detail.jsx";
const WIDE = 960;
const side = (width) => Math.round(Math.min(420, Math.max(300, width * 0.2)));
const ROW = [3.2, 6];
const SOURCE = "knowledge/system/flows.yaml";
const notes = (s, steps) => {
  const out = [];
  if (s.leads.length) out.push({ key: "next", text: (s.leads.length > 1 ? "갈래: " : "다음: ") + s.leads.join(" · ") });
  if (s.back) {
    const to = steps.find((t) => t.id === s.back.to);
    out.push({ key: "back", tone: "warn", text: `되돌아감: ${s.back.label} → ${to?.n ?? s.back.to}` });
  }
  return out;
};
function Notes({ step, steps }) {
  const list = notes(step, steps);
  return list.length ? <span className="sm-seq-notes">{list.map((n) => <span key={n.key} className={n.tone ? "is-" + n.tone : ""}>{n.text}</span>)}</span> : null;
}
export default function Flows({ map, flow: id, onFlow, live, width }) {
  const panel = useId();
  const flow = map.flows.find((f) => f.id === id) ?? map.flows[0];
  if (!flow) return <EmptyState title="No flows" description={`This map was generated without ${SOURCE}.`} />;
  const wide = width >= WIDE;
  const top = <div className="sm-seq-top">
      <TabList value={flow.id} onChange={onFlow} role="tablist" aria-label="흐름" size={wide ? "sm" : "md"} className="sm-seq-tabs">
        {map.flows.map((f) => <Tab key={f.id} value={f.id} label={f.title} panelId={panel} />)}
      </TabList>
      <Text as="p" className="sm-seq-summary">{flow.summary}</Text>
    </div>;
  return <Steps map={map} flow={flow} live={live} wide={wide} width={width} top={top} panel={panel} />;
}
function Steps({ map, flow, live, wide, width, top, panel }) {
  const seq = useMemo(() => sequence(flow), [flow]);
  const name = useMemo(() => new Map(flow.actors.map((a) => [a.id, a.name])), [flow]);
  const [step, setStep] = useState(null), [hot, setHot] = useState(null), [part, setPart] = useState(null);
  const [shown, setShown] = useState(flow.id);
  if (shown !== flow.id) {
    setShown(flow.id);
    setStep(null);
    setHot(null);
    setPart(null);
  }
  const root = useRef(null), back = useRef(null);
  useLayoutEffect(() => {
    const at = back.current;
    if (!at || part) return;
    back.current = null;
    const opener = root.current?.querySelector(at);
    (opener?.matches("button, [tabindex]") ? opener : opener?.querySelector("button, a, [tabindex]"))?.focus({ preventScroll: wide });
  }, [part, step, wide]);
  const open = (id, from, words) => {
    back.current = from;
    setPart({ id, back: words });
  };
  const close = () => setPart(null);
  const choose = (row) => {
    setPart(null);
    setStep((now) => now === row ? null : row);
  };
  const onKeyDown = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (part) {
      event.preventDefault();
      close();
    } else if (step != null) {
      event.preventDefault();
      back.current = `[data-row="${step}"]`;
      setStep(null);
    }
  };
  const who = (s) => s.to ? `${name.get(s.actor)} → ${name.get(s.to)}` : name.get(s.actor);
  const chosen = step == null ? null : seq.steps[step];
  const details = part ? <Detail key={part.id} map={map} id={part.id} live={live} stacked={!wide} back={part.back} onClose={close} onPick={(to) => setPart((now) => ({ ...now, id: to }))} /> : null;
  if (!wide) {
    return <div className="sm-seq-stack" ref={root} onKeyDown={onKeyDown}>
        <div className="sm-seq-stack-list" hidden={!!part}>
        {top}
        <ol className="sm-seq-list" id={panel} role="tabpanel" aria-label={flow.title}>
          {seq.steps.map((s, row) => <li key={s.id} className={"sm-seq-item" + (step === row ? " is-chosen" : "")}>
              <button type="button" className="sm-seq-item-head" data-row={row} aria-expanded={step === row} onClick={() => choose(row)}>
                <span className="sm-seq-n">{s.n}</span>
                <span className="sm-seq-item-title">
                  <span className="sm-seq-who">{who(s)}</span>
                  <span className="sm-seq-label">{s.when ? <span className="sm-seq-when">{s.when} · </span> : null}{s.label}</span>
                </span>
              </button>
              <p className="sm-seq-text">{s.text}</p>
              <Notes step={s} steps={seq.steps} />
              {step === row ? <Parts map={map} step={s} onOpen={(node, i) => open(node, `[data-part="${i}"]`, `${s.n}. ${s.label}`)} /> : null}
            </li>)}
        </ol>
        </div>
        {details}
      </div>;
  }
  return <div className="sm-seq-split" ref={root} onKeyDown={onKeyDown}>
      <div className="sm-seq-main">
        {top}
        <section id={panel} role="tabpanel" aria-label={flow.title} className="sm-seq-panel">
          <Chart key={flow.id} seq={seq} flow={flow} hot={hot} step={step} onHot={setHot} onChoose={choose} who={who} onActor={(actor, i) => open(actor.node, `[data-actor="${i}"]`, flow.title)} />
        </section>
      </div>
      <aside className="sm-panel sm-seq-side" style={{ width: side(width) }} aria-label={part ? "Part details" : chosen ? "Step" : "How to read"}>
        {details ?? (chosen ? <StepPane map={map} step={chosen} steps={seq.steps} who={who} onClose={() => {
    back.current = `[data-row="${step}"]`;
    setStep(null);
  }} onStep={setStep} onOpen={(node, i) => open(node, `[data-part="${i}"]`, `${chosen.n}. ${chosen.label}`)} /> : <Legend map={map} flow={flow} onOpen={(node, i) => open(node, `[data-cast="${i}"]`, flow.title)} />)}
      </aside>
    </div>;
}
function Parts({ map, step, onOpen }) {
  return <section className="sm-detail-part" aria-label="Parts">
      <Text type="label" className="sm-part-head">부분 · {step.nodes.length}</Text>
      <List density="compact" edge="flush">
        {step.nodes.map((id, i) => {
    const node = map.byId.get(id);
    return <ListItem key={id} data-part={i} label={node?.name ?? id} isDisabled={!node} onClick={node ? () => onOpen(id, i) : void 0} endContent={<Text type="supporting" maxLines={1}>{node ? kindLabel(map, node.kind) : "not in the map"}</Text>} />;
  })}
      </List>
    </section>;
}
function StepPane({ map, step, steps, who, onClose, onStep, onOpen }) {
  const before = steps[step.row - 1], after = steps[step.row + 1];
  return <article className="sm-detail sm-seq-step-pane" aria-label={`${step.n}. ${step.label}`}>
      <div className="sm-detail-top">
        <Text type="supporting" hasTabularNumbers>단계 {step.n} / {steps.length}</Text>
        <IconButton variant="ghost" size="sm" label="흐름 전체로" tooltip="Esc" icon={<Icon icon="close" />} onClick={onClose} />
      </div>
      <Heading level={2} className="sm-detail-name">{step.label}</Heading>
      <Text type="supporting" className="sm-seq-who">{step.when ? `${step.when} · ` : ""}{who(step)}</Text>
      <Text as="p" className="sm-detail-text">{step.text}</Text>
      <Notes step={step} steps={steps} />
      <Parts map={map} step={step} onOpen={onOpen} />
      <div className="sm-seq-turn">
        {before ? <Button variant="ghost" size="sm" label={`${before.n}. ${before.label}`} tooltip="이전 단계" onClick={() => onStep(before.row)} /> : <span />}
        {after ? <Button variant="ghost" size="sm" label={`${after.n}. ${after.label}`} tooltip="다음 단계" onClick={() => onStep(after.row)} /> : null}
      </div>
      <Code className="sm-detail-id">{step.source}</Code>
    </article>;
}
const KEY = [["n", "번호", "오른쪽 글의 순서"], ["give", "전달", "한쪽이 다른 쪽에 넘기는 일"], ["self", "혼자 하는 일", "화살표 없이 제 줄 위에서"], ["back", "되돌아감", "여기서 막히면 그 단계로"], ["gate", "관문", "멈추거나 돌려보내는 자리"]];
function Mark({ kind }) {
  return <svg className={"sm-seq-mark is-" + kind} viewBox="0 0 40 16" aria-hidden="true">
      {kind === "n" ? <><circle cx="8" cy="8" r="7" /><text x="8" y="8">1</text></> : null}
      {kind === "give" ? <><line x1="2" x2="34" y1="8" y2="8" /><path d="M38 8 32 4.5v7z" /></> : null}
      {kind === "self" ? <><line className="sm-seq-life" x1="8" x2="8" y1="0" y2="16" /><circle cx="8" cy="8" r="5" /></> : null}
      {kind === "back" ? <><line x1="38" x2="8" y1="8" y2="8" /><path d="M3 8 9 4.5v7z" /></> : null}
      {kind === "gate" ? <><line className="is-back" x1="2" x2="38" y1="8" y2="8" /><rect x="17" y="2" width="4" height="12" rx="1" /></> : null}
    </svg>;
}
function Legend({ map, flow, onOpen }) {
  return <div className="sm-detail sm-seq-legend">
      <Text type="label" className="sm-part-head">읽는 법</Text>
      <dl className="sm-seq-key">
        {KEY.map(([kind, term, says]) => <div key={kind}><dt><Mark kind={kind} />{term}</dt><dd>{says}</dd></div>)}
      </dl>
      <Text as="p" type="supporting">단계를 고르면 그 단계가 가리키는 부분이 여기 나오고, 부분을 고르면 맵의 설명으로 갑니다.</Text>
      <section className="sm-detail-part" aria-label="Actors">
        <Text type="label" className="sm-part-head">등장 · {flow.actors.length}</Text>
        <List density="compact" edge="flush">
          {flow.actors.map((a, i) => {
    const node = a.node && map.byId.get(a.node);
    return <ListItem key={a.id} data-cast={i} label={a.name} isDisabled={!node} onClick={node ? () => onOpen(a.node, i) : void 0} endContent={<Text type="supporting" maxLines={1}>{node ? node.name : "사람"}</Text>} />;
  })}
        </List>
      </section>
      <Code className="sm-detail-id">{SOURCE}</Code>
    </div>;
}
function Chart({ seq, flow, hot, step, onHot, onChoose, onActor, who }) {
  const view = useRef(null), grid = useRef(null);
  const [room, setRoom] = useState(0), [geo, setGeo] = useState(null);
  const cols = seq.columns, lanes = seq.lanes;
  const measure = () => {
    const box = view.current, g = grid.current;
    if (!box || !g) return;
    setRoom(box.clientHeight);
    const at = g.getBoundingClientRect(), cast = g.querySelector(":scope > .sm-seq-cast").getBoundingClientRect();
    const next = { u: parseFloat(getComputedStyle(g).fontSize) || 14, xs: [...g.querySelectorAll(":scope > .sm-seq-cast > *")].map((c) => {
      const b = c.getBoundingClientRect();
      return Math.round(b.left - at.left + b.width / 2);
    }), rows: [...g.querySelectorAll(":scope > .sm-seq-row")].map((r) => {
      const b = r.getBoundingClientRect();
      return [Math.round(b.top - at.top), Math.round(b.height)];
    }), top: Math.round(cast.height), right: Math.round(cast.right - at.left), width: g.clientWidth, height: g.scrollHeight, words: [...g.querySelectorAll(":scope > .sm-seq-lines .sm-seq-label")].map((t) => Math.ceil(t.getComputedTextLength())) };
    setGeo((now) => JSON.stringify(now) === JSON.stringify(next) ? now : next);
  };
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const watch = new ResizeObserver(() => measure());
    watch.observe(view.current);
    watch.observe(grid.current);
    return () => watch.disconnect();
  }, []);
  const u = geo?.u ?? 14, top = geo?.rows[0]?.[0] ?? u * 4;
  const row = Math.min(ROW[1] * u, Math.max(ROW[0] * u, (room - top - u * 1.5) / seq.steps.length));
  const style = { "--sm-seq-cols": cols, "--sm-seq-lanes": lanes, "--sm-seq-row": room ? `${Math.floor(row)}px` : void 0 };
  return <div className="sm-seq-view" ref={view}>
      <div className="sm-seq-grid" ref={grid} style={style}>
        <div className="sm-seq-cast">
          {flow.actors.map((a, i) => a.node ? <button key={a.id} type="button" className="sm-seq-actor" data-actor={i} title={a.node} onClick={() => onActor(a, i)}>{a.name}</button> : <span key={a.id} className="sm-seq-actor">{a.name}</span>)}
        </div>
        {seq.steps.map((s, i) => <button key={s.id} type="button" data-row={i} className={"sm-seq-row" + (hot === i ? " is-hot" : "") + (step === i ? " is-chosen" : "")} aria-pressed={step === i} aria-label={`${s.n}. ${who(s)} · ${s.when ? s.when + " · " : ""}${s.label}: ${s.text}`} onClick={() => onChoose(i)} onPointerEnter={() => onHot(i)} onPointerLeave={() => onHot(null)} onFocus={() => onHot(i)} onBlur={() => onHot(null)}>
            <span className="sm-seq-say">
              <span className="sm-seq-n">{s.n}</span>
              {}
              <span className="sm-seq-text">{s.text} <Notes step={s} steps={seq.steps} /></span>
            </span>
          </button>)}
        {geo && geo.rows.length === seq.steps.length ? <Lines seq={seq} geo={geo} hot={hot} step={step} /> : null}
      </div>
    </div>;
}
function Lines({ seq, geo, hot, step }) {
  const { u, xs, rows } = geo, r = u * 0.72, head = u * 0.45, below = u * 0.8;
  const y = (i) => rows[i][0] + rows[i][1] / 2;
  const lit = (i) => step === i ? " is-chosen" : hot === i ? " is-hot" : "";
  const bottom = rows.at(-1)[0] + rows.at(-1)[1];
  const lane0 = geo.right + u * 0.75;
  return <svg className="sm-seq-lines" width={geo.width} height={geo.height} aria-hidden="true">
      <g className="sm-seq-life">{xs.map((x, i) => <line key={i} x1={x} x2={x} y1={geo.top} y2={bottom} />)}</g>
      {seq.backs.map((b) => {
    const lx = lane0 + b.lane * u * 1.5, target = seq.steps[b.to], ty = y(b.to) + below, tx = xs[target.from] + r * 0.4;
    const ends = b.sources.map((src) => ({ ...src, s: seq.steps[src.row], sy: y(src.row) + below }));
    const far = Math.max(...ends.map((e) => e.sy));
    const on = ends.some((e) => step === e.row || hot === e.row) ? " is-lit" : "";
    return <g key={b.to} className={"sm-seq-back" + on}>
            <path d={`M${lx} ${far}V${ty}H${tx + head * 1.6}`} />
            <path className="sm-seq-tip" d={`M${tx} ${ty}l${head * 1.6} ${-head}v${head * 2}z`} />
            {ends.map((e) => {
      const sx = xs[e.s.into ?? e.s.from] + (e.s.into == null ? r : 0);
      return <g key={e.row}>
                  <path d={`M${sx} ${e.sy}H${lx}`} />
                  <rect className="sm-seq-gate" x={sx + u * 0.5} y={e.sy - u * 0.5} width={u * 0.28} height={u} rx={u * 0.08} />
                  <text className="sm-seq-back-label" x={lx - u * 0.4} y={e.sy - u * 0.35} textAnchor="end">{e.label}</text>
                </g>;
    })}
          </g>;
  })}
      {seq.steps.map((s, i) => {
    const x0 = xs[s.from], cy = y(i), self = s.into == null || s.into === s.from;
    const x1 = self ? x0 : xs[s.into], dir = Math.sign(x1 - x0);
    const w = geo.words?.[i] ?? 0, way = !self ? dir : x0 + r + u * 0.5 + w <= geo.right || x0 - r - u * 0.5 - w < 0 ? 1 : -1;
    const mid = !self && w <= Math.abs(x1 - x0) - 2 * r - u;
    const lx = mid ? (x0 + x1) / 2 : x0 + way * (r + u * (self ? 0.5 : 0.4)), anchor = mid ? "middle" : way > 0 ? "start" : "end";
    return <g key={s.id} className={"sm-seq-step" + lit(i)}>
            {self ? null : <>
                <line x1={x0 + dir * r} x2={x1 - dir * head * 1.6} y1={cy} y2={cy} />
                <path className="sm-seq-tip" d={`M${x1} ${cy}l${-dir * head * 1.6} ${-head}v${head * 2}z`} />
              </>}
            <text className="sm-seq-label" x={lx} y={self ? cy : cy - u * 0.55} textAnchor={anchor} dominantBaseline={self ? "central" : "auto"}>
              {s.when ? <tspan className="sm-seq-when">{s.when} · </tspan> : null}{s.label}
            </text>
            <circle cx={x0} cy={cy} r={r} />
            <text className="sm-seq-num" x={x0} y={cy} textAnchor="middle" dominantBaseline="central">{s.n}</text>
          </g>;
  })}
    </svg>;
}
