import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { ChatComposer, ChatSendButton } from "@astryxdesign/core/Chat";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
const WORDS = { judging: "판정 중", accept: "승인", reject: "반려", need_look: "확인 요청", intent_question: "의도 질문" };
const TONES = { judging: "var(--state-running)", accept: "var(--ok)", reject: "var(--bad)", need_look: "var(--warn)", intent_question: "var(--warn)" };
const LABELS = { "확인": "var(--ok)", "미확인": "var(--bad)", "추정": "var(--warn)" };
const name = (item) => item.short_name || item.title || `목표 #${item.goal_id}`;
const result = (item) => item.owner_result && item.owner_result.trim() !== `${name(item)} 반영 완료` ? item.owner_result : "";
const KST = { timeZone: "Asia/Seoul" };
const day = (date) => date.toLocaleDateString("en-CA", KST);
export function when(at, now = new Date()) {
  const date = new Date(at);
  if (!at || !Number.isFinite(+date)) return "";
  const time = date.toLocaleTimeString("en-GB", { ...KST, hour: "2-digit", minute: "2-digit" });
  if (day(date) === day(now)) return time;
  const [, month, dom] = day(date).split("-");
  return `${+month}/${+dom} ${time}`;
}
const caseAt = (item) => item.verdict_at ?? item.created_at;
const meta = (item) => [`목표 #${item.goal_id}`, item.project_id ? `프로젝트 #${item.project_id}` : null, `${item.round}회차`, item.criteria ? `기준 ${item.met}/${item.criteria}` : null, item.shadow ? "시험 판정" : null].filter(Boolean).join(" · ");
const Back = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 18l-6-6 6-6" />
  </svg>;
const Up = (props) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 19V5 M6 11l6-6 6 6" />
  </svg>;
const Label = ({ label }) => <span style={{ color: LABELS[label] ?? "var(--muted)" }}>{label ?? "—"}</span>;
const Word = ({ state }) => <span style={{ color: TONES[state] ?? "var(--muted)", whiteSpace: "nowrap" }}>{WORDS[state] ?? state}</span>;
const column = { width: "100%", maxWidth: "64em", marginInline: "auto", boxSizing: "border-box" };
const round = { "--_button-radius": "50%" };
const resting = { ...round, opacity: 1, backgroundColor: "color-mix(in srgb, var(--color-text-primary) 13%, transparent)", color: "color-mix(in srgb, var(--color-text-primary) 45%, transparent)" };
const pad = (phone) => ({ paddingInline: phone ? "var(--spacing-3)" : "var(--spacing-5)" });
function Cases({ phone, cases, loaded, problem, more, paging, onOpen, onMore, focus }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (focus != null) root.current?.querySelector(`[data-case="${focus}"] button, [data-case="${focus}"]`)?.focus?.({ preventScroll: false });
  }, [focus]);
  const judging = cases.filter((c) => c.state === "judging").length;
  return <div ref={root} style={{ ...column, ...pad(phone), paddingBlock: "var(--spacing-4)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-3)", paddingBottom: "var(--spacing-2)" }}>
        <Text type="label" weight="semibold">Verdicts</Text>
        {judging ? <Text type="supporting"><Word state="judging" /> {judging}</Text> : null}
      </div>
      {!loaded && problem ? <Text type="supporting" as="p">기록을 읽지 못했어요 · 곧 다시 읽어요</Text> : null}
      {!loaded && !problem ? <Spinner size="sm" label="Loading" /> : null}
      {loaded && !cases.length ? <Text type="supporting" as="p">아직 판정이 없어요</Text> : null}
      {cases.length ? <List density={phone ? "balanced" : "compact"} edge="flush" header={<span style={{ position: "absolute", clipPath: "inset(50%)" }}>CQO verdicts</span>}>
          {cases.map((item) => <ListItem key={item.id} data-case={item.id} align="first-line" onClick={() => onOpen(item.id)} label={name(item)} description={<>
                {result(item) ? <Text type="supporting" display="block" maxLines={phone ? 2 : 1} color="primary">{result(item)}</Text> : null}
                <Text type="supporting" display="block">{meta(item)}</Text>
              </>} endContent={<Text type="supporting"><Word state={item.state} /> <span style={{ fontVariantNumeric: "tabular-nums" }}>{when(caseAt(item))}</span></Text>} />)}
        </List> : null}
      {more ? <div style={{ paddingTop: "var(--spacing-3)" }}><Button label="Older" variant="ghost" size="sm" isLoading={paging} onClick={onMore} /></div> : null}
    </div>;
}
function Section({ title, children }) {
  return <section style={{ paddingTop: "var(--spacing-5)" }}>
      <Text type="label" weight="semibold" display="block">{title}</Text>
      <div style={{ paddingTop: "var(--spacing-2)" }}>{children}</div>
    </section>;
}
function Case({ phone, item, detail, onBack }) {
  const back = useRef(null);
  useLayoutEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, [item.id]);
  const whole = detail?.item;
  const said = result(item);
  return <div style={{ ...column, ...pad(phone), paddingBlock: "var(--spacing-3)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-2)" }}>
        <IconButton ref={back} label="Back to verdicts" icon={<Icon icon={Back} />} variant="ghost" size="sm" onClick={onBack} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: "var(--spacing-0-5, 2px)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-3)" }}>
            <Text type="large" weight="semibold" as="div" display="block">{name(item)}</Text>
            <Text type="large" as="div"><Word state={item.state} /></Text>
          </div>
          <Text type="supporting" display="block">{meta(whole ?? item)} · {when(caseAt(item))}</Text>
        </div>
      </div>
      <div style={{ paddingInlineStart: phone ? 0 : "calc(var(--size-element-sm, 28px) + var(--spacing-2))" }}>
        {said ? <Text as="p" display="block" style={{ paddingTop: "var(--spacing-3)" }}>{said}</Text> : null}
        {item.state === "judging" ? <Text type="supporting" as="p" display="block" style={{ paddingTop: "var(--spacing-3)" }}>심사관이 판정하고 있어요</Text> : null}
        {!whole && detail?.problem ? <Text type="supporting" as="p" display="block" style={{ paddingTop: "var(--spacing-3)" }}>
          {detail.problem === "not_found" || detail.problem === "http_404" ? "이 사례는 기록에 없어요" : "판정을 읽지 못했어요 · 곧 다시 읽어요"}</Text> : null}
        {!whole && !detail?.problem && item.state !== "judging" ? <div style={{ paddingTop: "var(--spacing-4)" }}><Spinner size="sm" label="Loading" /></div> : null}
        {whole?.note ? <Section title="Reason">
            <Text as="p" display="block" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{whole.note}</Text>
          </Section> : null}
        {whole?.per_criterion?.length ? <Section title="Criteria">
            {whole.per_criterion.map((c) => <div key={c.n} style={{ display: "grid", gridTemplateColumns: phone ? "1.5em minmax(0, 1fr)" : "1.5em 3.5em minmax(0, 1fr)", columnGap: "var(--spacing-2)", paddingBottom: "var(--spacing-3)" }}>
                <Text type="supporting">{c.n}</Text>
                {phone ? null : <Text><Label label={c.label} /></Text>}
                <div style={{ minWidth: 0 }}>
                  <Text display="block" style={{ overflowWrap: "anywhere" }}>{phone ? <><Label label={c.label} />{" "}</> : null}{c.text}</Text>
                  {c.evidence ? <Text type="supporting" display="block" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", paddingTop: "var(--spacing-1)" }}>{c.evidence}</Text> : null}
                </div>
              </div>)}
          </Section> : null}
        {whole?.gaps?.length ? <Section title="Gaps">
            {whole.gaps.map((g, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5em minmax(0, 1fr)", columnGap: "var(--spacing-2)", paddingBottom: "var(--spacing-2)" }}>
                <Text type="supporting">{g.n}</Text>
                <Text display="block" style={{ overflowWrap: "anywhere" }}>{`«${g.quote}»`}</Text>
              </div>)}
          </Section> : null}
      </div>
    </div>;
}
function ToLead({ phone, lead, item, onSend, onLead, drafts }) {
  const [text, setText] = useState(() => drafts.get(item.id) ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [failed, setFailed] = useState(null);
  useEffect(() => {
    setText(drafts.get(item.id) ?? "");
    setSent(null);
    setFailed(null);
  }, [item.id]);
  async function submit(value) {
    const words = value.trim();
    if (!words || sending) return;
    setSending(true);
    setFailed(null);
    try {
      const reply = await onSend(item, words);
      if (reply?.ok) {
        setText("");
        drafts.delete(item.id);
        setSent((new Date()).toISOString());
      } else setFailed(reply?.line ?? "Not sent. Send it again");
    } catch {
      setFailed("Not sent. Send it again");
    } finally {
      setSending(false);
    }
  }
  return <div style={{ ...column, ...pad(phone), paddingBlock: "var(--spacing-2) var(--spacing-3)" }}>
      {sent ? <div role="status" style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", paddingBottom: "var(--spacing-2)" }}>
          <Text type="supporting">{`Sent to ${lead} · `}{when(sent)}</Text>
          <Button label={`Open ${lead}`} variant="ghost" size="sm" onClick={onLead} />
        </div> : null}
      <ChatComposer value={text} onChange={(value) => {
    setText(value);
    if (value) drafts.set(item.id, value);
    else drafts.delete(item.id);
  }} onSubmit={submit} isDisabled={sending} density={phone ? "balanced" : "compact"} elevation="none" placeholder={`Message ${lead} about #${item.goal_id}`} footerActions={<Text type="supporting" maxLines={1}>{`To ${lead} · 목표 #${item.goal_id} ${item.round}회차 `}<Word state={item.state} /></Text>} sendButton={<ChatSendButton sendIcon={<Icon icon={Up} size="md" />} style={text.trim() && !sending ? round : resting} />} status={failed ? { type: "error", message: failed } : void 0} />
    </div>;
}
export function CqoRecord({ phone = false, cases = [], loaded = false, problem = null, more = false, paging = false, open = null, detail = null, onOpen = () => {
}, onBack = () => {
}, onMore = () => {
}, onSend = async () => ({ ok: false }), onLead = () => {
}, lead = "" }) {
  const drafts = useRef(new Map()).current;
  const [left, setLeft] = useState(null);
  const item = open == null ? null : cases.find((c) => c.id === open) ?? detail?.item ?? null;
  const scroller = useRef(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [open]);
  const goBack = () => {
    setLeft(open);
    onBack();
  };
  return <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }} onKeyDown={(event) => {
    if (event.key !== "Escape" || !item || event.nativeEvent.isComposing || drafts.get(item.id)) return;
    event.preventDefault();
    event.stopPropagation();
    goBack();
  }}>
      <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>
        {item ? <Case phone={phone} item={item} detail={detail} onBack={goBack} /> : <Cases phone={phone} cases={cases} loaded={loaded} problem={problem} more={more} paging={paging} onOpen={onOpen} onMore={onMore} focus={left} />}
      </div>
      {item ? <ToLead phone={phone} lead={lead} item={item} onSend={onSend} onLead={onLead} drafts={drafts} /> : null}
    </div>;
}
export const mount = island(CqoRecord);
