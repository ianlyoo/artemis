import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@astryxdesign/core/Markdown";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@astryxdesign/core/Button";
const body = (text) => text.replace(/^# .*\n+/, "");
export default function SystemDocument({ load, stacked }) {
  const [text, setText] = useState(null), [error, setError] = useState(null), [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(0);
  const article = useRef(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    load().then((value) => {
      if (alive) setText(body(value));
    }, (failure) => {
      if (alive) setError(failure.message);
    });
    return () => {
      alive = false;
    };
  }, [load, attempt]);
  const sections = useMemo(() => text ? [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim()) : [], [text]);
  const headings = () => [...article.current?.querySelectorAll("h2") ?? []];
  useEffect(() => {
    const box = article.current;
    if (!box || !sections.length) return void 0;
    const seen = () => {
      const line = box.getBoundingClientRect().top + box.clientHeight / 3;
      setCurrent(Math.max(0, headings().findLastIndex((h) => h.getBoundingClientRect().top <= line)));
    };
    box.addEventListener("scroll", seen, { passive: true });
    return () => box.removeEventListener("scroll", seen);
  }, [sections]);
  if (error) return <EmptyState title="The document did not load" description={error} actions={<Button label="Try again" onClick={() => setAttempt((n) => n + 1)} />} />;
  if (text == null) return <div className="sm-wait"><Spinner label="Loading the document" /></div>;
  const jump = (index) => {
    headings()[index]?.scrollIntoView({ block: "start" });
    setCurrent(index);
  };
  return <div className={"sm-doc" + (stacked ? " is-stacked" : "")}>
      {stacked ? null : <nav className="sm-toc" aria-label="Sections">
          <List density="compact" edge="flush">
            {sections.map((name, index) => <ListItem key={name} label={name} isSelected={index === current} onClick={() => jump(index)} />)}
          </List>
        </nav>}
      <article className="sm-doc-body" ref={article} tabIndex={0} aria-label="System map document">
        <Markdown density="compact" contentWidth="100%">{text}</Markdown>
      </article>
    </div>;
}
