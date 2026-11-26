import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Item } from "@astryxdesign/core/Item";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { dayTime, recapDays, outcome, terms, litPattern, litParts, failure, meetingDays, meetingMatch } from "../workspace/db-model.js";
import { island } from "./lib/mount.jsx";
const typing = (target) => target?.closest?.("input, textarea, [contenteditable=true]");
const MOVES = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };
const opens = (toggle) => (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
    event.preventDefault();
    toggle();
  }
};
export function Lit({ text, pattern }) {
  return litParts(text, pattern).map((part, at) => part.lit ? <mark key={at} className="db-lit">{part.text}</mark> : part.text);
}
export function Outcome({ line, pattern }) {
  const { word, tone, text } = outcome(line);
  if (!word && !text) return <span className="db-none">No reply</span>;
  return <>{word ? <span className={"db-word is-" + tone}>{word}</span> : null}{word && text ? " " : null}{text ? <Lit text={text} pattern={pattern} /> : null}</>;
}
export function Line({ line, isOpen, isTab, pattern, chat, open, ledger = "ledger", onToggle, onFocus }) {
  const time = dayTime(line.at)?.time ?? "", reply = line.reply ? dayTime(line.reply.at)?.time : null;
  const toggle = () => onToggle(line.id);
  const acts = isOpen ? [chat.can(line.thread) ? <Button key="chat" label="Open in chat" variant="ghost" size="sm" onClick={() => chat.open(line.thread)} /> : null, line.request ? <Button key="request" label={`Request #${line.request.id}`} variant="ghost" size="sm" onClick={() => open({ kind: ledger, ref: `request/${line.request.id}` })} /> : null, ...(line.goals ?? []).map((goal) => <Button key={"goal" + goal} label={`Goal #${goal}`} variant="ghost" size="sm" onClick={() => open({ kind: ledger, ref: `goal/${goal}` })} />)].filter(Boolean) : [];
  return <li className={"db-line" + (isOpen ? " is-open" : "")}>
      <Item role="button" aria-expanded={isOpen} tabIndex={isTab ? 0 : -1} data-line={line.id} className="db-row" align="first-line" onClick={toggle} onFocus={() => onFocus(line.id)} onKeyDown={opens(toggle)} startContent={<time className="db-time" dateTime={line.at}>{time}</time>} label={<span className="db-said"><Lit text={line.text} pattern={pattern} /></span>} labelLines={isOpen ? void 0 : 1} description={<span className="db-came"><Outcome line={line} pattern={pattern} /></span>} descriptionLines={isOpen ? void 0 : 1} />
      {isOpen && (acts.length || reply) ? <div className="db-acts">
          {acts}
          {reply ? <span className="db-quiet">{line.thread?.name ?? chat.lead} replied at {reply}</span> : null}
        </div> : null}
    </li>;
}
export function Days({ days, openId, tabId, pattern, chat, open, ledger, onToggle, onFocus }) {
  return days.map((day) => <section key={day.day} className="db-day" aria-label={day.name}>
      <h2 className="db-day-head">{day.name}</h2>
      {day.threads.map((thread) => <div key={thread.key} className="db-thread">
          <h3 className="db-thread-head"><span className="db-thread-name">{thread.name}</span>{thread.title ? <span className="db-thread-title">{thread.title}</span> : null}</h3>
          <ul className="db-lines">
            {thread.lines.map((line) => <Line key={line.id} line={line} isOpen={openId === line.id} isTab={tabId === line.id} pattern={pattern} chat={chat} open={open} ledger={ledger} onToggle={onToggle} onFocus={onFocus} />)}
          </ul>
        </div>)}
    </section>);
}
const Markdown = lazy(() => import("@astryxdesign/core/Markdown").then((m) => ({ default: m.Markdown })));
const NO_MEETINGS = { list: async () => ({ ok: true, body: { items: [] } }), read: async () => ({ ok: false }), word: (m) => m.status, at: () => null, can: () => false, open() {
} };
const lineOf = (meeting) => "meeting:" + meeting.id;
export function MeetingRecord({ meeting, read, meetings, onRetry }) {
  if (!read || read.busy) return <p className="db-quiet db-meeting">Reading the meeting…</p>;
  if (read.error) return <p className="db-quiet db-meeting">{read.error} <Button label="Try again" variant="ghost" size="sm" onClick={onRetry} /></p>;
  const { decisions = [], record_md: record = null } = read.body;
  return <div className="db-meeting">
      <h3 className="db-meeting-head">Decisions</h3>
      {decisions.length ? decisions.map((decision, at) => <section key={decision.approval_id ?? at} className="db-decision" aria-label={`Decision ${at + 1}`}>
          <p className="db-quiet">Decision {at + 1}{decision.approval_id ? ` · Approval #${decision.approval_id}` : ""}{decision.goal_id ? ` · Goal #${decision.goal_id}` : ""}</p>
          <MetadataList label={{ position: "top" }}>
            <MetadataListItem label="Your words"><span className="db-said-whole">{decision.owner_verbatim}</span></MetadataListItem>
            <MetadataListItem label="Chair's summary">{decision.chair_summary}</MetadataListItem>
          </MetadataList>
        </section>) : <p className="db-quiet">No decisions in this meeting</p>}
      <h3 className="db-meeting-head">Record</h3>
      {record ? <Suspense fallback={<p className="db-quiet">Opening the record…</p>}><Markdown density="compact" headingLevelStart={4} contentWidth="100%" className="db-record">{record}</Markdown></Suspense> : <p className="db-quiet">{["ended", "failed", "answered"].includes(meeting.status) ? "No record for this meeting" : "Its record is written when it ends"}</p>}
      {meetings.can(meeting) ? <div className="db-acts"><Button label="Open in chat" variant="ghost" size="sm" onClick={() => meetings.open(meeting)} /></div> : null}
    </div>;
}
export function MeetingLine({ meeting, isOpen, isTab, read, meetings, onToggle, onFocus, onRetry }) {
  const id = lineOf(meeting), at = meetings.at(meeting), toggle = () => onToggle(id);
  return <li className={"db-line" + (isOpen ? " is-open" : "")}>
      <Item role="button" aria-expanded={isOpen} tabIndex={isTab ? 0 : -1} data-line={id} className="db-row" align="first-line" onClick={toggle} onFocus={() => onFocus(id)} onKeyDown={opens(toggle)} startContent={<time className="db-time" dateTime={at ?? void 0}>{at ? dayTime(at)?.time ?? "" : ""}</time>} label={<span className="db-said">{meeting.title || `Meeting #${meeting.id}`}</span>} labelLines={isOpen ? void 0 : 1} description={<span className="db-came">{meetings.word(meeting)}{meeting.goal_id ? ` · Goal #${meeting.goal_id}` : ""}</span>} descriptionLines={1} />
      {isOpen ? <MeetingRecord meeting={meeting} read={read} meetings={meetings} onRetry={onRetry} /> : null}
    </li>;
}
export function MeetingDays({ days, openId, tabId, reads, meetings, onToggle, onFocus, onRetry }) {
  return days.map((day) => <section key={day.day || "unset"} className="db-day" aria-label={day.name}>
      <h2 className="db-day-head">{day.name}</h2>
      <ul className="db-lines db-meetings">
        {day.meetings.map((meeting) => <MeetingLine key={meeting.id} meeting={meeting} isOpen={openId === lineOf(meeting)} isTab={tabId === lineOf(meeting)} read={reads[meeting.id]} meetings={meetings} onToggle={onToggle} onFocus={onFocus} onRetry={() => onRetry(meeting.id)} />)}
      </ul>
    </section>);
}
export function DbView({ recap, meetings = NO_MEETINGS, chat = { can: () => false, open() {
} }, open = () => {
}, touch = false, now = Date.now, tools = 0, handle = null, ledger = { name: "Ledger", ref: "ledger" } }) {
  const [source, setSource] = useState("chats");
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ asked: "", lines: [], next: null, busy: "all", error: null });
  const [listed, setListed] = useState({ items: [], busy: false, error: null });
  const [reads, setReads] = useState({});
  const [openId, setOpenId] = useState(null);
  const [active, setActive] = useState(null);
  const field = useRef(null), list = useRef(null), more = useRef(null), serial = useRef(0), life = useRef(null);
  async function load({ asked: asked2 = "", before = null } = {}) {
    life.current?.abort();
    const mine = ++serial.current, signal = (life.current = new AbortController()).signal;
    setView((was) => ({ ...was, busy: before ? "more" : "all", error: null }));
    let answer;
    try {
      answer = await recap({ query: asked2, before }, signal);
    } catch {
      return;
    }
    if (mine !== serial.current) return;
    if (!answer.ok || !Array.isArray(answer.body?.items)) {
      setView((was) => ({ ...was, busy: null, error: failure(answer.status, answer.body, ledger.name) }));
      return;
    }
    const { items, next: next2 = null } = answer.body;
    setView((was) => ({ asked: asked2, lines: before ? [...was.lines, ...items] : items, next: next2, busy: null, error: null }));
    if (!before) {
      setOpenId(null);
      list.current?.scrollTo?.(0, 0);
    }
  }
  const search = () => {
    const asked2 = query.trim();
    if (asked2 !== view.asked || view.error) void load({ asked: asked2 });
  };
  const showAll = () => {
    setQuery("");
    void load();
  };
  const earlier = () => {
    if (view.next && !view.busy) void load({ asked: view.asked, before: view.next });
  };
  const toggle = (id) => setOpenId((was) => was === id ? null : id);
  async function listMeetings() {
    life.current?.abort();
    const signal = (life.current = new AbortController()).signal;
    setListed((was) => ({ ...was, busy: true, error: null }));
    let answer;
    try {
      answer = await meetings.list(signal);
    } catch {
      return;
    }
    if (signal.aborted) return;
    setListed(answer.ok && Array.isArray(answer.body?.items) ? { items: answer.body.items, busy: false, error: null } : (was) => ({ ...was, busy: false, error: failure(answer.status, answer.body, ledger.name) }));
  }
  async function readMeeting(id) {
    setReads((was) => ({ ...was, [id]: { busy: true } }));
    let answer;
    try {
      answer = await meetings.read(id);
    } catch {
      return;
    }
    setReads((was) => ({ ...was, [id]: answer.ok ? { body: answer.body } : { error: failure(answer.status, answer.body, ledger.name) } }));
  }
  const toggleMeeting = (id) => {
    const meeting = id.slice("meeting:".length);
    if (openId !== id && (!reads[meeting] || reads[meeting].error)) void readMeeting(meeting);
    toggle(id);
  };
  const choose = (next2) => {
    if (next2 === source) return;
    setSource(next2);
    setQuery("");
    setOpenId(null);
    setActive(null);
    if (next2 === "meetings") void listMeetings();
    else void load();
  };
  useLayoutEffect(() => {
    if (handle) handle.focus = () => field.current?.focus({ preventScroll: true });
  });
  useEffect(() => {
    void load();
    return () => {
      life.current?.abort();
      serial.current++;
    };
  }, []);
  useEffect(() => {
    if (!more.current || typeof IntersectionObserver !== "function") return void 0;
    const watch = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) earlier();
    }, { root: list.current, rootMargin: "0px 0px 30% 0px" });
    watch.observe(more.current);
    return () => watch.disconnect();
  });
  const { asked, lines, next, busy, error } = view;
  const pattern = litPattern(terms(asked));
  const days = recapDays(lines, now(), chat.role);
  const meetingsShown = source === "meetings";
  const shown = listed.items.filter((meeting) => meetingMatch(meeting, meetings.word(meeting), query));
  const held = meetingsShown ? meetingDays(shown, meetings.at, now()) : [];
  const ids = meetingsShown ? held.flatMap((day) => day.meetings.map(lineOf)) : lines.map((line) => line.id);
  const tabId = ids.includes(active) ? active : ids[0] ?? null;
  const rows = () => [...list.current?.querySelectorAll("[data-line]") ?? []];
  const onKeyDown = (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "/" && !typing(event.target) && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      field.current?.focus();
      return;
    }
    if (event.key === "Escape" && openId != null && list.current?.contains(event.target)) {
      event.preventDefault();
      setOpenId(null);
      list.current.querySelector(`[data-line="${openId}"]`)?.focus();
      return;
    }
    const row = event.target.closest?.("[data-line]");
    if (!row || !(event.key in MOVES) || event.target !== row) return;
    const all = rows(), at = all.indexOf(row), step = MOVES[event.key];
    event.preventDefault();
    if (at === 0 && step === -1) {
      field.current?.focus();
      return;
    }
    const to = Number.isFinite(step) ? Math.max(0, Math.min(all.length - 1, at + step)) : step < 0 ? 0 : all.length - 1;
    all[to].focus();
    all[to].scrollIntoView?.({ block: "nearest" });
  };
  let body;
  if (meetingsShown) {
    body = listed.error && !listed.items.length ? <EmptyState isCompact title="Couldn't read the meetings" description={listed.error} actions={<Button label="Try again" variant="ghost" size="sm" onClick={() => void listMeetings()} />} /> : !shown.length && !listed.busy ? query.trim() ? <EmptyState isCompact title="Nothing found" description="A title, #id, goal or state" /> : <EmptyState isCompact title="No meetings yet" description="Each meeting stays here once it opens, its decisions and record whole" /> : <MeetingDays days={held} openId={openId} tabId={tabId} reads={reads} meetings={meetings} onToggle={toggleMeeting} onFocus={setActive} onRetry={(id) => void readMeeting(id)} />;
  } else if (error && !lines.length) {
    body = <EmptyState isCompact title={asked ? "Couldn't search" : "Couldn't read the recap"} description={error} actions={<Button label="Try again" variant="ghost" size="sm" onClick={() => void load({ asked })} />} />;
  } else if (!lines.length && !busy) {
    body = asked ? <EmptyState isCompact title="Nothing found" description="Other words, or fewer of them" actions={<Button label="Show all chats" variant="ghost" size="sm" onClick={showAll} />} /> : <EmptyState isCompact title="No chats yet" description={`What you say to ${chat.lead} and the agents shows here, newest first`} />;
  } else {
    body = <>
        <Days days={days} openId={openId} tabId={tabId} pattern={pattern} chat={chat} open={open} ledger={ledger.ref} onToggle={toggle} onFocus={setActive} />
        {error ? <p className="db-quiet db-more">{error} <Button label="Try again" variant="ghost" size="sm" onClick={earlier} /></p> : next && !asked ? <div ref={more} className="db-more"><Button label="Earlier" variant="ghost" size="sm" isLoading={busy === "more"} onClick={earlier} /></div> : null}
      </>;
  }
  const status = meetingsShown ? listed.busy ? "Reading meetings…" : query.trim() && shown.length ? `${shown.length} found` : "" : busy === "all" ? asked || query.trim() ? "Searching…" : "Reading your chats…" : asked && !error && lines.length ? `${lines.length} found` : "";
  return <div className={"db-view" + (touch ? " is-touch" : "")} onKeyDown={onKeyDown} style={tools ? { "--db-room": `calc(${tools}px + var(--spacing-4) + var(--spacing-3))` } : void 0}>
      <header className="db-head">
        <div className="db-find">
          <SegmentedControl label="Show" value={source} onChange={choose} size={touch ? "lg" : "md"}>
            <SegmentedControlItem value="chats" label="Chats" />
            <SegmentedControlItem value="meetings" label="Meetings" />
          </SegmentedControl>
          <TextInput ref={field} type="search" label={meetingsShown ? "Search meetings" : "Search chats"} isLabelHidden placeholder={meetingsShown ? "Search meetings" : "Search chats"} value={query} onChange={(value) => {
    setQuery(value);
    if (!meetingsShown && !value.trim() && view.asked) void load();
  }} onEnter={meetingsShown ? void 0 : search} startIcon="search" hasClear isLoading={!meetingsShown && busy === "all" && !!query.trim()} size={touch ? "lg" : "md"} containerClassName="db-search" autoComplete="off" hasSpellCheck={false} enterKeyHint="search" onKeyDown={(event) => {
    if (event.key === "ArrowDown" && ids.length) {
      event.preventDefault();
      rows()[0]?.focus();
    }
  }} />
        </div>
        <p role="status" aria-live="polite" className={"db-status" + ((meetingsShown ? status : asked) ? "" : " db-hidden")}>{status}</p>
      </header>
      {}
      <div ref={list} className="db-scroll" tabIndex={-1}>{body}</div>
    </div>;
}
export const mount = island(DbView);
