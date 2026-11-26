import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { GROUP_NAMES, connections, curve, flowLines, flows, groupNodes, kindLabel, linkTone, liveNote, nearest, tiers } from "../../workspace/sysmap-data.js";
const SMALL = 12, HUB = 40, FEW = 160;
const ARROWS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]);
const byId = (id) => `[data-id="${CSS.escape(id)}"]`;
const dotSize = (degree) => degree ? Math.round((0.45 + 0.55 * Math.min(1, Math.sqrt(degree / HUB))) * 100) / 100 : 0;
const middle = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const Node = memo(function Node2({ node, degree, kind, chip, note, mark, tab }) {
  const words = note ? [note.state, note.text].filter(Boolean).join(" · ") : "";
  return <button type="button" className={(chip ? "sm-node sm-chip" : "sm-node sm-dot") + (mark ? " is-" + mark : "")} data-id={node.id} data-tone={note?.tone || void 0} data-hollow={!chip && !degree ? "" : void 0} tabIndex={tab ? 0 : -1} aria-current={mark === "selected" || void 0} aria-label={[node.name, kind, words].filter(Boolean).join(", ")} style={chip ? void 0 : { "--sm-r": dotSize(degree) }}>
      <i className="sm-mark" aria-hidden="true" />
      {chip ? <span className="sm-name">{node.name}</span> : null}
      {chip && note?.text ? <span className="sm-note">{note.text}</span> : null}
    </button>;
});
function District({ group, nodes, chips, chars, longest, lit, linkedCount, children }) {
  const id = `sm-d-${group}`;
  return <section className={"sm-district" + (lit ? " is-hot" : "")} data-group={group} data-shape={chips ? "chips" : "dots"} aria-labelledby={id} style={{ flexGrow: Math.max(1, Math.round(chars)), ...longest ? { "--sm-longest": longest } : null }}>
      <div className="sm-district-head">
        <Heading level={3} id={id} className="sm-district-name">{GROUP_NAMES[group] ?? group}</Heading>
        <Text type="supporting" hasTabularNumbers className={linkedCount ? "sm-count is-lit" : "sm-count"}>{linkedCount ? `${linkedCount} linked` : nodes}</Text>
      </div>
      <div className="sm-district-body">{children}</div>
    </section>;
}
export function Graph({ map, shown, names, stacked, live, selected, active, setActive, onSelect, hot, onHot, rel, peek }) {
  const box = useRef(null);
  const [geo, setGeo] = useState(null), [hover, setHover] = useState(null), [focused, setFocused] = useState(null);
  const rows = useMemo(() => tiers(map), [map]);
  const small = useMemo(() => new Set([...groupNodes(map.nodes)].filter(([, nodes]) => nodes.length <= SMALL).map(([g]) => g)), [map]);
  const byGroup = useMemo(() => groupNodes(shown), [shown]);
  const few = shown.length < map.nodes.length && shown.length <= FEW;
  const linked = useMemo(() => selected ? connections(map, selected).ids : null, [map, selected]);
  const lines = useMemo(() => flows(map, shown, rel), [map, shown, rel]);
  const measure = useCallback(() => {
    const el = box.current;
    if (!el || stacked) {
      setGeo(null);
      return;
    }
    const o = el.getBoundingClientRect();
    const rect = (n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    };
    setGeo({ w: el.offsetWidth, h: el.offsetHeight, districts: new Map([...el.querySelectorAll(".sm-district")].map((d) => [d.dataset.group, rect(d)])), nodes: new Map([...el.querySelectorAll("[data-id]")].map((n) => [n.dataset.id, rect(n)])) });
  }, [stacked]);
  useLayoutEffect(measure, [measure, shown, names]);
  useEffect(() => {
    const el = box.current;
    if (!el) return void 0;
    let frame = 0;
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    watch.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, [measure]);
  useEffect(() => {
    if (selected && !stacked) box.current?.querySelector(byId(selected))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected, stacked]);
  const focusNode = (id) => {
    setActive(id);
    box.current?.querySelector(byId(id))?.focus();
  };
  const onKeyDown = (event) => {
    const at = event.target.closest?.("[data-id]");
    if (!at || !box.current.contains(at)) return;
    const id = at.dataset.id, all = [...box.current.querySelectorAll("[data-id]")];
    let next = null;
    if (ARROWS.has(event.key)) {
      const o = box.current.getBoundingClientRect(), point = (n) => {
        const r = n.getBoundingClientRect();
        return { id: n.dataset.id, x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
      };
      next = nearest(all.map(point), point(at), event.key);
    } else if (event.key === "Home" || event.key === "End") {
      const here = [...at.closest(".sm-district").querySelectorAll("[data-id]")];
      next = (event.key === "Home" ? here[0] : here.at(-1))?.dataset.id;
    } else if (event.key === "PageDown" || event.key === "PageUp") {
      const districts = [...box.current.querySelectorAll(".sm-district")], i = districts.indexOf(at.closest(".sm-district"));
      next = districts[i + (event.key === "PageDown" ? 1 : -1)]?.querySelector("[data-id]")?.dataset.id;
    } else return;
    event.preventDefault();
    if (next && next !== id) focusNode(next);
  };
  const idAt = (event) => event.target.closest?.("[data-id]")?.dataset.id ?? null;
  const onPointerOver = (event) => {
    setHover(idAt(event));
    onHot(event.target.closest?.(".sm-district")?.dataset.group ?? null);
  };
  const onPointerLeave = () => {
    setHover(null);
    onHot(null);
  };
  const onFocus = (event) => {
    const id = idAt(event);
    if (id) {
      setActive(id);
      setFocused(id);
    }
  };
  const onBlur = () => setFocused(null);
  const onClick = (event) => {
    const id = idAt(event);
    if (id) onSelect(id);
  };
  const flowsDrawn = useMemo(() => {
    if (!geo) return [];
    const rects = new Map(geo.districts), hosts = geo.districts.get("hosts");
    for (const [id, r] of geo.nodes) if (hosts && map.byId.get(id)?.kind === "host") rects.set(id, { x: r.x, w: r.w, y: hosts.y, h: hosts.h });
    return flowLines(lines, rects).map((line) => ({ ...line, tone: map.byId.get(line.to) ? liveNote(map.byId.get(line.to), live)?.tone ?? "" : "" }));
  }, [geo, lines, map, live]);
  const edges = useMemo(() => {
    if (!geo || !selected || !geo.nodes.has(selected)) return [];
    const from = middle(geo.nodes.get(selected)), home = map.byId.get(selected)?.group, bundles = new Map();
    for (const e of connections(map, selected).edges) {
      const group = map.byId.get(e.to)?.group;
      if (rel && e.rel !== rel || !group || group === home || !geo.nodes.has(e.to)) continue;
      const key = e.direction + " " + group;
      if (!bundles.has(key)) bundles.set(key, { key, group, dir: e.direction, to: new Set(), tone: "" });
      const bundle = bundles.get(key);
      bundle.to.add(e.to);
      bundle.tone = bundle.tone === "warning" ? "warning" : linkTone(map, selected, e.to, live) || bundle.tone;
    }
    return [...bundles.values()].map((b) => {
      const d = geo.districts.get(b.group);
      const end = b.to.size === 1 ? middle(geo.nodes.get([...b.to][0])) : d.y > from.y ? { x: d.x + d.w / 2, y: d.y } : d.y + d.h < from.y ? { x: d.x + d.w / 2, y: d.y + d.h } : { x: from.x < d.x ? d.x : d.x + d.w, y: d.y + d.h / 2 };
      return { ...b, d: curve(from, end), end, width: Math.min(5, 1 + Math.log2(b.to.size) * 0.6), many: b.to.size > 1 };
    });
  }, [geo, selected, map, rel, live]);
  const litLine = (line) => hot && (line.from === hot || line.to === hot || hot === "hosts" && line.to.startsWith("host:"));
  const tip = !stacked ? hover ?? peek ?? focused : null;
  const tipNode = tip && geo?.nodes.get(tip) ? map.byId.get(tip) : null;
  const tipName = tipNode && box.current?.querySelector(`${byId(tip)} .sm-name`), tipChip = tipName && tipName.scrollWidth <= tipName.clientWidth;
  const visible = rows.map((row) => row.filter((g) => byGroup.has(g))).filter((row) => row.length);
  const firstTab = active && shown.some((n) => n.id === active) ? active : visible[0] && byGroup.get(visible[0][0])[0].id;
  return <div className={"sm-graph" + (stacked ? " is-stacked" : "") + (selected ? " has-selection" : "") + (hot ? " has-hot" : "")} ref={box} role="group" aria-label={`System map: ${shown.length} parts in ${byGroup.size} groups`} onKeyDown={onKeyDown} onPointerOver={onPointerOver} onPointerLeave={onPointerLeave} onFocus={onFocus} onBlur={onBlur} onClick={onClick}>
      {geo ? <svg className="sm-flows" width={geo.w} height={geo.h} aria-hidden="true" focusable="false">
          {flowsDrawn.map((line) => <path key={line.key} d={line.d} strokeWidth={line.width} className={"sm-flow" + (litLine(line) ? " is-hot" : "") + (line.tone ? " is-" + line.tone : "")} />)}
        </svg> : null}
      {visible.map((row) => <div className="sm-tier" key={row.join(" ")}>
          {row.map((group) => {
    const nodes = byGroup.get(group), chipsAll = names || few || small.has(group);
    const hub = (n) => map.degree.get(n.id) >= HUB, chips = chipsAll ? nodes : nodes.filter(hub), dots = chipsAll ? [] : nodes.filter((n) => !hub(n));
    const linkedCount = linked ? nodes.filter((n) => n.id !== selected && linked.has(n.id)).length : 0;
    const node = (n, chip) => <Node key={n.id} node={n} degree={map.degree.get(n.id)} chip={chip} kind={kindLabel(map, n.kind)} note={liveNote(n, live)} tab={n.id === firstTab} mark={n.id === selected ? "selected" : linked ? linked.has(n.id) ? "linked" : "dim" : n.id === peek ? "peek" : ""} />;
    const sizes = chips.map((n) => n.name.length + (liveNote(n, live)?.text.length ?? 0) * 0.85 + 3);
    return <District key={group} group={group} nodes={nodes.length} chips={chipsAll} chars={sizes.reduce((a, b) => a + b, 0) + dots.length * 2.5} longest={sizes.length ? Math.round(Math.max(...sizes)) : 0} lit={hot === group} linkedCount={linkedCount}>
                {chips.map((n) => node(n, true))}
                {dots.map((n) => node(n, false))}
              </District>;
  })}
        </div>)}
      {edges.length ? <svg className="sm-edges" width={geo.w} height={geo.h} aria-hidden="true" focusable="false">
          {edges.map((e) => <g key={e.key} className={"sm-edge" + (e.dir === "in" ? " is-in" : "") + (e.tone ? " is-" + e.tone : "")}>
              <path d={e.d} strokeWidth={e.width} strokeDasharray={e.dir === "in" ? `${3 + e.width * 1.5} ${2 + e.width * 1.2}` : void 0} />
              {e.many ? <circle cx={e.end.x} cy={e.end.y} r={e.width / 2 + 1.5} /> : null}
            </g>)}
        </svg> : null}
      {tipNode && !tipChip ? <div className="sm-tip" aria-hidden="true" style={{ left: middle(geo.nodes.get(tip)).x, top: geo.nodes.get(tip).y }}>
          <b>{tipNode.name}</b> <span>{kindLabel(map, tipNode.kind)}</span>
        </div> : null}
    </div>;
}
