import { useMemo } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Archive, Line, Press, nums, quiet, tone } from "./parts.jsx";
import { TRACK } from "./charts.jsx";
import { rows, useRows } from "./rows.jsx";
import { l10n } from "../lib/l10n.js";
const gap = (n) => `calc(var(--t-body) * ${n})`;
const DOT = { running: "success", stuck: "error", blocked: "error", owner: "warning", done: "neutral" };
function Head({ view, phone, onFilter, onCompleted }) {
  const count = (label, n, style) => <Text type="label" style={{ ...quiet, whiteSpace: "nowrap" }}>{label} <Text type="label" weight="semibold" style={{ ...nums, color: "var(--ink)", ...style }}>{n}</Text></Text>;
  const title = <Heading level={2} id="adm-work-h" style={{ fontSize: "var(--t-title)", lineHeight: "var(--lh-tight)", whiteSpace: "nowrap" }}>
      Work <Text type="inherit" style={{ ...quiet, ...nums, fontWeight: "var(--fw-control)" }}>{view.work}</Text>
    </Heading>;
  const one = view.slices.find((s) => s.key === view.filter);
  const states = one ? <Press pressed label={`${one.label} ${one.n}`} onClick={() => onFilter(one.key)} style={phone ? { justifySelf: "start", marginInlineStart: "calc(var(--spacing-2) * -1)" } : void 0}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: ".45em" }}>
        <span style={{ color: tone(one.state), fontWeight: "var(--fw-emph)" }}>{one.label}</span>
        <span style={{ ...nums, color: "var(--ink)" }}>{one.n}</span>
        <Icon icon="close" size="sm" color="inherit" />
      </span>
    </Press> : null;
  const counts = <>
      {count("Asks", view.asks)}
      <Text type="label" style={{ display: "inline-flex", alignItems: "center", gap: ".3em", whiteSpace: "nowrap", color: view.attention ? "var(--warn)" : "var(--ink-quiet)" }}>
        <Icon icon="warning" size="sm" color="inherit" />Warning
        {}
        <Text type="label" weight="semibold" style={{ ...nums, color: view.attention ? "var(--warn)" : "var(--ink)" }} data-attention-count="">{view.attention}</Text>
      </Text>
    </>;
  const completed = <Button label={`Completed ${view.completed}`} variant="ghost" size="sm" icon={<Icon icon={Archive} />} onClick={onCompleted} aria-haspopup="dialog" style={{ marginInlineEnd: "calc(var(--spacing-2) * -1)" }}>
      Completed <Text type="inherit" style={{ ...nums, color: "var(--ink)" }} data-completed-count="">{view.completed}</Text>
    </Button>;
  const line = { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: gap(1.2), rowGap: gap(0.2) };
  if (phone) return <div style={{ display: "grid", gap: gap(0.3) }}>
      <div style={{ ...line, justifyContent: "space-between" }}>{title}{completed}</div>
      {states}
      <div style={line}>{counts}</div>
    </div>;
  return <div style={{ ...line, minHeight: "calc(var(--ui) * 2.9)" }}>
      {title}{states}
      <span style={{ ...line, marginInlineStart: "auto" }}>{counts}{completed}</span>
    </div>;
}
function Mark({ row: r }) {
  const flag = r.status.tone === "stuck" ? r.status : null;
  const word = r.turn?.length ? <span style={{ color: tone("owner"), fontWeight: "var(--fw-emph)" }}>
      <b data-adm-mine="" style={{ fontWeight: "inherit" }}>{l10n("내 차례", "My turn")}</b>{" "}
      <span data-adm-count="" style={nums}>{r.turn.length}</span>{l10n("건", "")}
    </span> : flag ? <b style={{ color: "var(--state-stuck)", fontWeight: "var(--fw-emph)" }}>{flag.text}</b> : r.said ? <b style={{ color: tone(r.state), fontWeight: "var(--fw-emph)" }}>{r.said}</b> : null;
  if (!word && !r.queue && !r.estimate) return null;
  return <Line type="supporting" aria-description={flag?.title || void 0}>
      {word}
      {r.queue ? <span style={{ ...nums, color: "var(--ink)" }}>{word ? " · " : ""}{r.queue.text} · {r.queue.age}</span> : null}
      {r.estimate ? <span>{word || r.queue ? " · " : ""}{r.estimate}</span> : null}
    </Line>;
}
const toggle = { display: "block", width: "100%", minWidth: 0, padding: 0, margin: 0, border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "start", cursor: "pointer", outline: "none" };
const Work = ({ row: r }) => <div data-adm-row={r.key} style={{ display: "grid", minWidth: 0 }}>
    <button type="button" data-adm-toggle="" aria-expanded={r.open} style={toggle}>
      <Line weight={r.size === "sm" ? "medium" : "semibold"} maxLines={r.open ? void 0 : 1} style={r.current ? { color: "var(--accent-ink)", textShadow: "var(--hover-glow)" } : { color: r.state === "paused" ? "var(--ink-quiet)" : r.size === "sm" ? "var(--ink)" : "var(--ink-strong)" }}>{r.open ? r.full : r.title}</Line>
    </button>
    <Mark row={r} />
  </div>;
const act = { fontSize: "var(--t-data)" };
const ask = { fontSize: "var(--text-label-size)", lineHeight: "var(--text-label-leading)", fontWeight: "var(--fw-emph)", color: "var(--ink-strong)" };
const oneLine = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
function Turn({ row: r, phone }) {
  if (!r.turn?.length) return null;
  return <section aria-label={l10n("내 할 일", "My steps")} style={{ display: "grid", gap: gap(0.2), minWidth: 0 }}>
      <Text type="supporting" weight="semibold" style={{ color: tone("owner") }}>
        {l10n("내 할 일", "My steps")} <span style={{ ...nums, color: "var(--ink)" }}>{r.turn.length}</span>
      </Text>
      <ul data-adm-turn={r.key} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", minWidth: 0 }}>
        {r.turn.map((t, i) => <li key={t.key} data-key={t.key} style={{ display: "grid", gap: gap(0.1), minWidth: 0, paddingBlock: phone ? 0 : gap(0.15), borderTop: i ? "1px solid var(--color-border)" : void 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", columnGap: gap(phone ? 0.6 : 1), minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: phone ? "center" : "baseline", gap: gap(0.55), minWidth: 0, minHeight: phone ? 44 : void 0 }}>
                <span style={{ ...oneLine, flex: "0 1 auto", ...ask }} title={t.line}>
                  {t.href ? <a className="adm-step-go" href={t.href} {...t.external ? { target: "_blank", rel: "noopener" } : {}}>{t.line}</a> : t.line}
                </span>
                {!phone && t.permit ? <Text type="supporting" style={{ ...oneLine, flex: "0 1 auto" }}>
                    <b style={{ color: "var(--warn)" }}>{t.permit.asks}</b> <b style={{ color: "var(--ink-strong)" }}>{t.permit.act}</b> {t.permit.aim}
                  </Text> : null}
                {!phone && !t.permit ? <Text type="supporting" style={{ color: tone("owner"), fontWeight: "var(--fw-emph)", whiteSpace: "nowrap", flexShrink: 0 }}>{t.word}</Text> : null}
                {t.age ? <Text type="supporting" style={{ ...nums, whiteSpace: "nowrap", flexShrink: 0 }} title={t.age.title}>{t.age.text}</Text> : null}
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: gap(phone ? 0.4 : 0.9), flexShrink: 0 }}>
                {t.answer ? <a className="adm-btn" style={act} href={t.href}>{l10n("답하기", "Answer")}</a> : null}
                {t.done ? <button type="button" className="adm-btn" style={act} data-step-done={t.id} disabled={t.done.pending} aria-busy={t.done.pending || void 0}>{l10n("완료", "Done")}</button> : null}
                <button type="button" className="adm-btn adm-btn-q" style={act} data-adm-quote={t.key}>{t.quote}</button>
              </span>
            </div>
            {phone && t.permit ? <Line type="supporting" maxLines={1}><b style={{ color: "var(--warn)" }}>{t.permit.asks}</b> <b style={{ color: "var(--ink-strong)" }}>{t.permit.act}</b> {t.permit.aim}</Line> : null}
            {t.done?.error ? <Text type="supporting" role="alert" style={{ color: "var(--bad)" }}>{t.done.error}</Text> : null}
          </li>)}
      </ul>
    </section>;
}
function Next({ row: r, phone }) {
  const next = r.next.what || r.next.who ? <Line maxLines={r.open ? void 0 : 1} style={{ color: r.size === "sm" ? "color-mix(in srgb,var(--ink) 80%,var(--paper))" : "var(--ink)" }}>
      {r.next.who ? <><b style={{ fontWeight: "var(--fw-title)", color: tone(r.state), marginInlineEnd: ".2em" }}>{r.next.who}</b> </> : null}{r.next.what}
    </Line> : null;
  const d = r.doing, doing = d && (!d.same || phone) ? <Line type="supporting" maxLines={r.open ? void 0 : 1} aria-label={d.title}>
      {l10n("지금", "Now")} {d.who ? <b style={{ fontWeight: "var(--fw-emph)", color: "var(--ink)" }}>{d.who}</b> : null} {d.what}{d.since ? <span style={nums}> · {d.since}</span> : null}
    </Line> : null;
  return <div style={{ display: "grid", gap: gap(0.1), minWidth: 0 }}>{d?.same && phone ? null : next}{doing}</div>;
}
const time = (r) => r.when.text ? <Text type="label" style={{ ...nums, color: r.when.far ? "var(--ink-quiet)" : "var(--ink)", whiteSpace: "nowrap" }} aria-label={r.when.title}>{r.when.text}</Text> : null;
const mark = (x, title, style) => <i title={title} style={{ position: "absolute", left: `${x}%`, top: "50%", width: "calc(var(--ui) * .62)", height: "calc(var(--ui) * .62)", boxSizing: "border-box", borderRadius: "50%", transform: "translate(-50%,-50%)", ...style }} />;
const When = ({ row: r, track }) => !track || r.when.at == null && r.when.eta == null ? <span style={{ display: "flex", justifyContent: "flex-end" }}>{time(r)}</span> : <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) calc(var(--ui) * 3.6)", alignItems: "center", gap: gap(0.6), minHeight: "calc(var(--t-body) * var(--lh-base))" }}>
    <span aria-hidden="true" style={{ position: "relative", height: "calc(var(--ui) * 1)", marginInline: "calc(var(--ui) * .35)" }}>
      <i style={{ position: "absolute", insetInline: 0, top: "50%", height: 1, background: TRACK }} />
      {[25, 50, 75].map((x) => <i key={x} style={{ position: "absolute", left: `${x}%`, top: "30%", height: "40%", width: 1, background: TRACK }} />)}
      {r.when.eta != null ? mark(r.when.eta, r.when.etaTitle, { border: `1.5px solid ${tone(r.state)}`, background: "var(--paper)" }) : null}
      {r.when.at != null ? mark(r.when.at, r.when.title, { background: tone(r.state) }) : null}
    </span>
    <span style={{ justifySelf: "end" }}>{time(r)}</span>
  </span>;
const Agents = ({ row: r }) => <span style={{ display: "flex", flexWrap: "wrap", columnGap: gap(0.6), rowGap: gap(0.1) }}>
    {r.marks.map((m) => <Text key={m.role} type="supporting" weight="medium" style={{ whiteSpace: "nowrap", color: m.busy ? "var(--state-running)" : "var(--ink-quiet)" }} aria-label={m.title}>
        {m.role}{m.n > 1 ? <> <span style={{ ...quiet, ...nums, fontWeight: 400 }}>{m.n}</span></> : null}
      </Text>)}
  </span>;
const PART = { done: "var(--done)", running: "var(--state-running)", date: "var(--state-idle)" };
const PART_WORD = () => ({ done: l10n("끝남", "done"), running: l10n("작업 중", "running"), date: l10n("예정", "scheduled"), waiting: l10n("대기", "waiting") });
const Stage = ({ row: r }) => r.stage.total ? <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: gap(0.5), minHeight: "calc(var(--t-body) * var(--lh-base))" }} role="img" aria-label={`Projects ${r.stage.done} of ${r.stage.total} done: ${r.stage.parts.map((p) => `${p.title} ${PART_WORD()[p.state] || p.state}`).join(", ")}`}>
    <span aria-hidden="true" style={{ display: "flex", gap: 2, height: "calc(var(--ui) * .55)", minWidth: 0 }}>
      {r.stage.parts.map((p) => <i key={p.id} title={`${p.title}: ${PART_WORD()[p.state] || p.state}`} style={{ flex: 1, minWidth: 3, borderRadius: 1, background: PART[p.state] || TRACK }} />)}
    </span>
    <Text type="supporting" aria-hidden="true" style={{ ...nums, whiteSpace: "nowrap" }}><span style={{ color: "var(--ink)" }}>{r.stage.done}</span>/{r.stage.total}</Text>
  </span> : null;
const Asks = ({ row: r }) => <Text type="label" style={{ ...nums, color: r.asks ? "var(--ink)" : "var(--ink-quiet)" }} aria-label={`Asks ${r.asks}`}>{r.asks}</Text>;
const PhoneRow = ({ row: r }) => <div style={{ display: "grid", gap: gap(0.1), minWidth: 0 }}>
    <Work row={r} />
    <Next row={r} phone />
  </div>;
function More({ row: r, phone }) {
  const m = r.more;
  if (!m) return null;
  const head = (label, n) => <Text type="supporting" weight="semibold">{label} <span style={{ ...nums, color: "var(--ink)" }}>{n}</span></Text>;
  const col = { display: "grid", alignContent: "start", gap: gap(0.3), minWidth: 0 };
  const hasDetails = m.asks.length || m.parts.length || m.agents.length || r.key.startsWith("goal:");
  return <div style={{ display: "grid", gap: gap(0.6), padding: `${gap(0.2)} 0 ${gap(0.6)}`, minWidth: 0 }}>
      <Turn row={r} phone={phone} />
      {m.facts.length ? <span style={{ display: "flex", flexWrap: "wrap", gap: `0 ${gap(1.2)}` }}>
          {m.facts.map(([k, v]) => <Text key={k} type="label" style={quiet}>{k} <span style={{ color: "var(--ink)", fontWeight: "var(--fw-emph)" }}>{v}</span></Text>)}
        </span> : null}
      {hasDetails ? <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)", gap: `${gap(0.6)} ${gap(1.4)}` }}>
        <section style={col} aria-label="Asks">
          {head("Asks", m.asks.length)}
          <div style={{ display: "grid", gap: gap(0.3), maxHeight: gap(16), overflowY: "auto", overscrollBehavior: "contain" }}>
            {m.asks.map((a) => <div key={a.key} style={{ display: "grid", gridTemplateColumns: `${gap(5.5)} minmax(0,1fr)`, gap: gap(0.8) }}>
                <Text type="supporting" style={{ ...nums, whiteSpace: "nowrap" }}>{a.time}</Text>
                <Text type="label" maxLines={3}>{a.words}</Text>
              </div>)}
          </div>
        </section>
        {m.parts.length ? <section style={col} aria-label="Projects">
            {head("Projects", m.parts.length)}
            {m.parts.map((p) => <div key={p.id} style={{ display: "grid", gridTemplateColumns: `${gap(0.9)} minmax(0,1fr)`, alignItems: "center", columnGap: gap(0.3) }}>
                <StatusDot variant={DOT[p.state] || "neutral"} label={p.state} />
                <Line style={p.state === "done" ? quiet : void 0}>{p.title}</Line>
                {p.why ? <span style={{ gridColumn: 2 }}><Line type="supporting">{p.why}</Line></span> : null}
              </div>)}
          </section> : null}
        {m.agents.length ? <section style={col} aria-label="Agents">
            {head("Agents", m.agents.length)}
            {m.agents.map((a) => <div key={a.key} style={{ display: "grid", gridTemplateColumns: `${gap(0.9)} minmax(0,1fr) auto`, alignItems: "center", columnGap: gap(0.3) }}>
                <StatusDot variant={a.busy ? "success" : "neutral"} label={a.busy ? "busy" : "idle"} />
                <Line><b style={{ fontWeight: "var(--fw-emph)" }}>{a.name}</b> <span style={quiet}>{[a.host, a.seat].filter(Boolean).join(" · ")}</span></Line>
                <Text type="supporting" style={nums}>{a.time}</Text>
                <span style={{ gridColumn: "2 / 4" }}><Line type="supporting">{a.task}</Line></span>
              </div>)}
          </section> : null}
      </div> : null}
    </div>;
}
const columns = (hours) => [{ key: "work", header: "Work", width: proportional(4, { minWidth: 160 }), renderCell: (r) => <Work row={r} /> }, { key: "next", header: "Next", width: proportional(3, { minWidth: 140 }), renderCell: (r) => <Next row={r} /> }, { key: "stage", header: "Projects", width: proportional(0.9, { minWidth: 68 }), renderCell: (r) => <Stage row={r} /> }, { key: "when", header: `When · ${hours} h`, width: proportional(1.4, { minWidth: 108 }), renderCell: (r) => <When row={r} track /> }, { key: "agents", header: "Agents", width: proportional(0.9, { minWidth: 68 }), renderCell: (r) => <Agents row={r} /> }, { key: "asks", header: "Asks", align: "end", width: proportional(0.6, { minWidth: 46 }), renderCell: (r) => <Asks row={r} /> }];
const NARROW = [...columns(24).filter((c) => c.key === "work" || c.key === "next"), { key: "when", header: "When", align: "end", width: proportional(0.5, { minWidth: 52 }), renderCell: (r) => <When row={r} /> }];
const PHONE = [{ key: "work", header: "Work", width: proportional(1, { minWidth: 160 }), renderCell: (r) => <PhoneRow row={r} /> }, { key: "when", header: "When", align: "end", width: proportional(0.22, { minWidth: 44 }), renderCell: (r) => <When row={r} /> }];
function Later({ later, phone }) {
  if (!later?.length) return null;
  return <section aria-labelledby="adm-later-h" data-adm-later="" style={{ display: "grid", gap: gap(0.3), paddingTop: gap(0.8) }}>
      <Text type="label" weight="semibold" id="adm-later-h" role="heading" aria-level={3} style={{ display: "inline-flex", alignItems: "baseline", gap: ".5em" }}>
        <span style={quiet}>Later</span><span style={{ ...quiet, ...nums, fontWeight: 400 }}>{later.length}</span>
      </Text>
      {later.map((c) => <div key={c.key} data-adm-later-row={c.key} title={c.full} style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr) auto" : "minmax(0,1fr) minmax(0,1.4fr) auto", alignItems: "baseline", columnGap: gap(1.2), padding: `${gap(0.3)} var(--spacing-2)`, borderTop: "1px solid var(--color-border)" }}>
          {phone ? <div style={{ display: "grid", minWidth: 0 }}>
              <Line weight="medium" maxLines={1} style={{ color: "var(--ink-quiet)" }}>{c.title}</Line>
              {c.what ? <Line type="supporting" maxLines={1}>{c.what}</Line> : null}
            </div> : <>
            <Line weight="medium" maxLines={1} style={{ color: "var(--ink-quiet)" }}>{c.title}</Line>
            <Line type="supporting" maxLines={1}>{c.what}</Line>
          </>}
          <Text type="label" style={{ ...nums, whiteSpace: "nowrap", color: "var(--ink)" }} aria-label={`Back ${c.back}`}>Back {c.back}</Text>
        </div>)}
    </section>;
}
const isOpen = (r) => r.open;
const pcPanel = (r) => <More row={r} />, phonePanel = (r) => <More row={r} phone />;
export function Board({ view, phone = false, narrow = false, onWork = () => {
}, onFilter = () => {
}, onCompleted = () => {
} }) {
  const plugin = useRows({ isOpen, onToggle: onWork, panel: phone ? phonePanel : pcPanel, phone });
  const data = useMemo(() => rows(view.rows, view.slices), [view.rows, view.slices]);
  const wide = useMemo(() => columns(view.hours ?? 24), [view.hours]);
  return <section aria-labelledby="adm-work-h" style={{ display: "grid", gap: gap(0.3), minWidth: 0 }}>
      <Head view={view} phone={phone} onFilter={onFilter} onCompleted={onCompleted} />
      {view.empty ? <Text type="label" as="p" style={{ ...quiet, padding: `${gap(0.6)} 0` }}>{view.empty}</Text> : <Table data={data} idKey="key" columns={phone ? PHONE : narrow ? NARROW : wide} density="compact" dividers="rows" hasHover verticalAlign="top" plugins={{ rows: plugin }} />}
      <Later later={view.later} phone={phone} />
    </section>;
}
