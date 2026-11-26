import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { island } from "./lib/mount.jsx";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Spinner } from "@astryxdesign/core/Spinner";
import { filterNodes, kindLabel } from "../workspace/sysmap-data.js";
import { Graph } from "./sysmap/graph.jsx";
import { Glance } from "./sysmap/charts.jsx";
import { Press } from "./admin/parts.jsx";
import { BackGlyph, FullGlyph, MoonGlyph, SunGlyph } from "./sysmap/icons.jsx";
const SystemDocument = lazy(() => import("./sysmap/document.jsx")), SidePane = lazy(() => import("./sysmap/pane.jsx"));
const Flows = lazy(() => import("./sysmap/flows.jsx"));
const WholeDetail = lazy(() => import("./sysmap/detail.jsx").then((module) => ({ default: module.Detail })));
const ALL = "all";
const NARROW = 700;
const side = (width) => Math.round(Math.min(560, Math.max(280, width * 0.36)));
const clock = (at) => at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const glyph = (component, size) => <Icon icon={component} size={size} />;
const VIEWS = [["map", "Map", "The parts and their links"], ["flows", "Flows", "운영 흐름: 시스템이 돌아가는 순서"], ["document", "Document", "Read it as a document"]];
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return void 0;
    setWidth(box.clientWidth);
    const watch = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    watch.observe(box);
    return () => watch.disconnect();
  }, [ref]);
  return width;
}
function Meta({ map, shown, live }) {
  if (!map) return null;
  const links = map.nodes.reduce((sum, node) => sum + node.links.length, 0);
  const gaps = [...map.gaps.no_description, ...map.gaps.unheld_flows, ...map.gaps.unheld_steps];
  return <Text type="supporting" hasTabularNumbers className="sm-meta">
      <span>{shown === map.nodes.length ? `${map.nodes.length} nodes` : `${shown} of ${map.nodes.length} nodes`}</span>
      <span>{links} links</span>
      <span title={`Generated ${map.generated_at}`}>{map.commit.slice(0, 8)}</span>
      {}
      {!live ? <span className="is-quiet">Live connecting</span> : live.ok ? <span>Live {clock(live.at)}</span> : <span className="is-warn">Live unavailable</span>}
      {gaps.length ? <span className="is-warn" title={gaps.join("\n")}>{gaps.length} gaps</span> : null}
    </Text>;
}
export function SystemMap({ chrome = "sheet", state = "loading", error, map, live, loadDocument, onRetry, theme, onTheme, route, onRoute, hashOf }) {
  const root = useRef(null);
  const width = useWidth(root), stacked = width > 0 && width < NARROW;
  const [query, setQuery] = useState(""), [kind, setKind] = useState(ALL), [names, setNames] = useState(false);
  const [view, setView] = useState(route?.view ?? "map"), [flow, setFlow] = useState(route?.flow ?? null);
  useEffect(() => {
    if (route) {
      setView(route.view);
      setFlow(route.flow);
    }
  }, [route]);
  const flowId = map ? (map.flows.find((f) => f.id === flow) ?? map.flows[0])?.id ?? null : flow;
  const address = view === "flows" ? { view, flow: flowId } : { view: "map", flow: null };
  useEffect(() => {
    onRoute?.(address);
  }, [address.view, address.flow]);
  const [selected, setSelected] = useState(null), [active, setActive] = useState(null), [peek, setPeek] = useState(null);
  const [hover, setHover] = useState(null), [picked, setPicked] = useState(null), [rel, setRel] = useState("");
  const shown = useMemo(() => map ? filterNodes(map, query, kind === ALL ? "" : kind) : [], [map, query, kind]);
  const kinds = useMemo(() => map ? [{ value: ALL, label: "All kinds" }, ...[...new Set(map.nodes.map((n) => n.kind))].map((value) => ({ value, label: kindLabel(map, value) })).sort((a, b) => a.label.localeCompare(b.label))] : [], [map]);
  useEffect(() => {
    if (selected && !shown.some((n) => n.id === selected)) setSelected(null);
  }, [shown, selected]);
  useEffect(() => setPeek(null), [selected]);
  const [restore, setRestore] = useState(null);
  const select = useCallback((id) => {
    setSelected(id);
    setActive(id);
  }, []);
  const close = useCallback(() => {
    setRestore(selected);
    setSelected(null);
  }, [selected]);
  useLayoutEffect(() => {
    if (!restore) return;
    root.current?.querySelector(`.sm-graph [data-id="${CSS.escape(restore)}"]`)?.focus({ preventScroll: !stacked });
    setRestore(null);
  }, [restore, stacked]);
  const pick = useCallback((id) => {
    if (!shown.some((n) => n.id === id)) {
      setQuery("");
      setKind(ALL);
    }
    select(id);
  }, [shown, select]);
  const pickGroup = useCallback((group) => {
    setPicked((now) => now === group ? null : group);
    requestAnimationFrame(() => root.current?.querySelector(`.sm-district[data-group="${CSS.escape(group)}"]`)?.scrollIntoView({ block: "nearest" }));
  }, []);
  const onKeyDown = (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && selected && view === "map") {
      event.preventDefault();
      close();
      return;
    }
    const typing = event.target.closest?.("input, textarea, [contenteditable=true], [role=combobox], [role=listbox][aria-multiselectable]");
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      root.current?.querySelector(".sm-search input")?.focus();
    }
  };
  const size = stacked ? "md" : "sm";
  const header = <header className="sm-head">
      {chrome === "standalone" ? <IconButton variant="ghost" className="sm-lead" label="Workspace" tooltip="Back to the workspace" icon={glyph(BackGlyph)} href="#/workspace" /> : null}
      {chrome === "sheet" ? null : <Heading level={1} className="sm-title">System map</Heading>}
      {state === "ready" ? <div className="sm-views" role="group" aria-label="View">
          {VIEWS.map(([value, label, tooltip]) => <Press key={value} pressed={view === value} size={size} label={label} tooltip={tooltip} onClick={() => setView(value)} />)}
        </div> : null}
      {state === "ready" ? <Meta map={map} shown={view === "map" ? shown.length : map.nodes.length} live={live} /> : null}
      {view === "map" && state === "ready" ? <div className="sm-tools">
          <TextInput type="search" className="sm-search" containerClassName="sm-search" label="Search the system" isLabelHidden placeholder="Search  /" startIcon="search" hasClear value={query} onChange={setQuery} size={size} width={stacked ? "100%" : "15em"} autoComplete="off" />
          <Selector label="Kind" isLabelHidden options={kinds} value={kind} onChange={(value) => setKind(value ?? ALL)} variant="ghost" size={size} hasSearch searchPlaceholder="Find a kind" presentation="adaptive" containerClassName="sm-kind" />
          <Press pressed={names} size={size} label="Names" tooltip={names ? "Show dots" : "Show every node by name"} onClick={() => setNames((on) => !on)} className="sm-names" />
        </div> : null}
      <div className="sm-ends">
        {chrome === "standalone" ? null : <IconButton variant="ghost" size={size} label="Full window" tooltip="Open in a full window" icon={glyph(FullGlyph)} href={hashOf(address)} />}
        {chrome === "standalone" && onTheme ? <IconButton variant="ghost" size={size} label={theme === "dark" ? "Light theme" : "Dark theme"} icon={glyph(theme === "dark" ? SunGlyph : MoonGlyph)} onClick={onTheme} /> : null}
      </div>
    </header>;
  let body;
  if (state === "loading") body = <div className="sm-wait"><Spinner label="Loading the map" /></div>;
  else if (state === "error") body = <EmptyState title="Map unavailable" description={error} actions={onRetry ? <Button label="Try again" onClick={onRetry} /> : null} />;
  else if (view === "document") body = <Suspense fallback={<div className="sm-wait"><Spinner label="Loading the document" /></div>}><SystemDocument load={loadDocument} stacked={stacked} /></Suspense>;
  else if (view === "flows") body = <Suspense fallback={<div className="sm-wait"><Spinner label="Loading the flows" /></div>}><Flows map={map} flow={flowId} onFlow={setFlow} live={live} width={width} /></Suspense>;
  else if (!shown.length) body = <EmptyState title="No matches" description="Nothing in the map has those words or that kind." actions={<Button label="Clear the search" onClick={() => {
    setQuery("");
    setKind(ALL);
  }} />} />;
  else {
    const hot = hover ?? picked;
    const graph = <Graph map={map} shown={shown} names={names} stacked={stacked} live={live} selected={selected} active={active} setActive={setActive} onSelect={select} hot={hot} onHot={setHover} rel={rel} peek={peek} />;
    const glance = <Glance map={map} live={live} shown={shown} hot={hot} picked={picked} onHot={setHover} onPick={pickGroup} rel={rel} onRel={setRel} onSelect={pick} />;
    const about = { map, id: selected, live, onPick: pick, onClose: close, onPeek: setPeek };
    const column = <div className="sm-panel" style={{ width: side(width) }}>{glance}</div>;
    body = stacked ? <div className="sm-stack">
        <div className="sm-stack-map" hidden={!!selected}>{graph}{glance}</div>
        {selected ? <div className="sm-stack-detail"><Suspense fallback={null}><WholeDetail key={selected} stacked {...about} /></Suspense></div> : null}
      </div> : <div className="sm-split">
        <div className="sm-canvas">{graph}</div>
        <Suspense fallback={column}>{width ? <SidePane size={side(width)} figures={glance} {...about} /> : column}</Suspense>
      </div>;
  }
  return <div className={"sm" + (stacked ? " is-stacked" : "")} ref={root} onKeyDown={onKeyDown} data-view={view} data-chrome={chrome}>
      {header}
      <div className="sm-body">{body}</div>
    </div>;
}
export const mount = island(SystemMap);
