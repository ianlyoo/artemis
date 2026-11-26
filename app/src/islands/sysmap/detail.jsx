import { useEffect, useRef, useState } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Code } from "@astryxdesign/core/Code";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { GROUP_NAMES, kindLabel, liveNote, nodeLive, relationshipGroups } from "../../workspace/sysmap-data.js";
import { BackGlyph } from "./icons.jsx";
const LIVE_KINDS = new Set(["host", "seat", "role"]);
const shortId = (id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id.slice(0, 8) : id;
const FIRST_AGENTS = 6;
export function Detail({ map, id, live, onPick, onClose, onPeek, stacked, back }) {
  const [allAgents, setAllAgents] = useState(false), article = useRef(null);
  useEffect(() => {
    if (stacked || back) article.current?.querySelector("button")?.focus();
  }, [id, stacked, back]);
  const node = map.byId.get(id);
  if (!node) return null;
  const now = nodeLive(node, live), agents = [...now.agents].sort((a, b) => Number(b.busy) - Number(a.busy));
  const note = live ? liveNote(node, live) : null;
  const links = relationshipGroups(map, id).flatMap(({ groups }) => groups);
  const total = links.reduce((sum, group) => sum + group.edges.length, 0);
  const peekAt = (to) => onPeek ? { onPointerEnter: () => onPeek(to), onPointerLeave: () => onPeek(null), onFocus: () => onPeek(to), onBlur: () => onPeek(null) } : null;
  return <article className="sm-detail" aria-label={`${node.name} details`} ref={article}>
      <div className="sm-detail-top">
        {back ? <Button variant="ghost" size={stacked ? "md" : "sm"} className="sm-back" icon={<Icon icon={BackGlyph} />} label={back} tooltip="Esc" onClick={onClose} /> : stacked ? <IconButton variant="ghost" className="sm-lead" label="Back to the map" icon={<Icon icon={BackGlyph} />} onClick={onClose} /> : null}
        <Text type="supporting" maxLines={1}>{[...new Set([kindLabel(map, node.kind), GROUP_NAMES[node.group] ?? node.group])].join(" · ")}</Text>
        {stacked || back ? null : <IconButton variant="ghost" size="sm" label="Close details" tooltip="Close · Esc" icon={<Icon icon="close" />} onClick={onClose} />}
      </div>
      <Heading level={2} className="sm-detail-name">{node.name}</Heading>
      <Code className="sm-detail-id">{node.id}</Code>
      {node.description ? <Text as="p" className="sm-detail-text">{node.description}</Text> : null}
      <MetadataList label={{ position: "start", width: "5.5em" }}>
        <MetadataListItem label="Source"><Code>{node.source}</Code></MetadataListItem>
        <MetadataListItem label="Host">{node.host ?? "—"}</MetadataListItem>
        {LIVE_KINDS.has(node.kind) ? <MetadataListItem label="Now">
            {live ? <Text className={live.ok ? "is-" + (note?.tone || "quiet") : "is-warn"}>{now.label || (now.agents.length ? "Working" : "No agents")}</Text> : <Text className="is-quiet">Connecting</Text>}
          </MetadataListItem> : null}
      </MetadataList>
      {now.agents.length ? <section className="sm-detail-part" aria-label="Agents now">
          <Text type="label" className="sm-part-head">Agents · {agents.length}{note?.running ? `, ${note.running} running` : ""}</Text>
          <List density="compact" edge="flush">
            {(allAgents ? agents : agents.slice(0, FIRST_AGENTS)).map((agent) => <ListItem key={agent.id} label={`${agent.role} · ${shortId(agent.id)}`} description={`${agent.host ?? "—"} / ${agent.seat ?? "—"}`} endContent={<Text type="supporting" className={agent.busy ? "is-ok" : "is-quiet"}>{agent.busy ? "running" : "idle"}</Text>} />)}
          </List>
          {!allAgents && agents.length > FIRST_AGENTS ? <Button variant="ghost" size="sm" className="sm-more" label={`Show all ${agents.length}`} onClick={() => setAllAgents(true)} /> : null}
        </section> : null}
      <section className="sm-detail-part" aria-label="Links">
        <Text type="label" className="sm-part-head">Links · {total}</Text>
        {links.length ? links.map((group) => <div className="sm-rel" key={`${group.edges[0].direction}:${group.rel}`} data-rel={group.rel}>
            <Text type="supporting" className="sm-rel-head">{group.label} · {group.edges.length}</Text>
            <List density="compact" edge="flush">
              {group.edges.map((edge) => {
    const target = map.byId.get(edge.to);
    return <ListItem key={edge.to} label={target?.name ?? edge.to} isDisabled={!target} onClick={target ? () => onPick(edge.to) : void 0} {...peekAt(edge.to)} endContent={<Text type="supporting" maxLines={1}>{target ? kindLabel(map, target.kind) : "not in the map"}</Text>} />;
  })}
            </List>
          </div>) : <Text type="supporting" as="p">No links recorded.</Text>}
      </section>
    </article>;
}
