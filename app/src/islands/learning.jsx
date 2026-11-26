import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createEmptyCard, fsrs } from "ts-fsrs";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { island } from "./lib/mount.jsx";
import { useSpoken } from "./lib/dictation.jsx";
export const TRACKS = { "system-design": "시스템 설계", "ai-ml": "AI·ML", "languages-runtimes": "언어·런타임", "infra-security-data": "인프라·보안·데이터" };
export const CALIBRATION = [["know", "알아요"], ["vague", "어렴풋이"], ["unknown", "몰라요"]];
export const RATINGS = [[1, "못 떠올렸어요"], [2, "어렴풋했어요"], [3, "말로 했어요"], [4, "바로 나왔어요"]];
const scheduler = fsrs();
const column = { width: "100%", maxWidth: "48em", marginInline: "auto", boxSizing: "border-box", paddingInline: "var(--spacing-4)" };
const stack = (gap) => ({ display: "grid", gap: `var(--spacing-${gap})`, minWidth: 0 });
const row = { display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)", alignItems: "center" };
const label = { fontSize: "var(--t-small, 0.92em)", color: "var(--color-text-secondary)" };
const prose = { overflowWrap: "anywhere", lineHeight: "var(--lh-base, 1.6)" };
export const quoted = (phrase) => {
  const code = phrase.trim().slice(-1).charCodeAt(0) - 44032;
  return `«${phrase}»${code >= 0 && code < 11172 && code % 28 ? "이라고" : "라고"}`;
};
const LEFT = { known: "알고 계신 카드는 다시 나오지 않아요.", odd: "알려 주셔서 고마워요. 확인해서 고칠 때까지 이 카드는 빼 둘게요." };
export function attemptId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function schedule(stored, rating, now = new Date()) {
  const card = stored ? { ...stored, due: new Date(stored.due), last_review: stored.last_review ? new Date(stored.last_review) : void 0 } : createEmptyCard(now);
  const next = scheduler.next(card, now, rating);
  return JSON.parse(JSON.stringify({ card: next.card, log: next.log }));
}
export function nextLine(iso, now = new Date()) {
  if (!iso) return "새 카드는 내일 와요.";
  const at = new Date(iso), ms = at - now;
  if (ms < 36e5) return null;
  const day = (d) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" })).toDateString();
  const time = at.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
  if (day(at) === day(now)) return `다음 카드는 오늘 ${time}쯤 와요.`;
  if (day(at) === day(new Date(now.getTime() + 864e5))) return `다음 카드는 내일 ${time}쯤 와요.`;
  return `다음 카드는 ${at.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })}에 와요.`;
}
function WeekLine({ terms = [] }) {
  return <Text type="supporting" display="block" style={prose}>
      {terms.length ? <>{`이번 주 실제 지시에 쓴 용어 ${terms.length}개 · `}<span style={{ color: "var(--color-text-primary)" }}>{terms.join(", ")}</span></> : "배운 용어를 실제 지시에 쓰시면 여기에 모여요."}
    </Text>;
}
function Exits({ busy, onExit }) {
  const [odd, setOdd] = useState(false), [note, setNote] = useState("");
  const box = useRef(null);
  useEffect(() => {
    if (odd) {
      box.current?.scrollIntoView?.({ block: "center" });
      box.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }
  }, [odd]);
  if (odd) {
    return <div ref={box} style={stack(2)}>
        <TextArea label="무엇이 이상한지 (비워 둬도 돼요)" value={note} onChange={setNote} rows={2} htmlMaxLength={1e3} />
        <div style={row}>
          <Button label="이상해요 보내기" variant="secondary" size="sm" isLoading={busy} onClick={() => onExit("odd", note.trim() || null)} />
          <Button label="취소" variant="ghost" size="sm" onClick={() => {
      setOdd(false);
      setNote("");
    }} />
        </div>
      </div>;
  }
  return <div style={{ ...row, justifyContent: "flex-end" }}>
      <Button label="이미 알아요" variant="ghost" size="sm" isDisabled={busy} onClick={() => onExit("known", null)} />
      <Button label="이상해요" variant="ghost" size="sm" isDisabled={busy} onClick={() => setOdd(true)} />
    </div>;
}
function Calibrate({ items, total, busy, onAnswer }) {
  const item = items[0], done = total - items.length;
  return <div style={stack(5)}>
      <div style={stack(1)}>
        <Text weight="semibold" display="block">{`처음 한 번만, 용어 ${total}개를 훑어요.`}</Text>
        <Text type="supporting" display="block" style={prose}>아는 정도만 고르면 돼요. 여기서 고른 걸로 첫 카드를 정하고, 아시는 건 다시 나오지 않아요.</Text>
      </div>
      <Card>
        <div style={stack(3)}>
          <span style={label}>{`${TRACKS[item.track] ?? item.track} · `}<span style={{ fontVariantNumeric: "tabular-nums" }}>{`${done + 1} / ${total}`}</span></span>
          <div style={stack(1)}>
            <Heading level={2} style={prose}>{item.term}</Heading>
            <Text color="secondary" display="block">{item.term_ko}</Text>
          </div>
          <Text display="block" style={prose}>{item.gloss}</Text>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--spacing-2)" }}>
            {CALIBRATION.map(([value, name]) => <Button key={value} label={name} variant="secondary" width="100%" isDisabled={busy} onClick={() => onAnswer(item.id, value)} />)}
          </div>
        </div>
      </Card>
    </div>;
}
function Revealed({ card, mode, answer, picked }) {
  return <div style={stack(4)}>
      {mode === "pick" ? <Text type="supporting" display="block">{`고른 용어: ${picked}`}</Text> : null}
      {card.quote ? <Text display="block" style={prose}>{`${quoted(card.quote)} 하셨던 것, 이렇게 부르면 더 짧고 정확해요.`}</Text> : null}
      <div style={stack(1)}>
        <Heading level={2} style={prose}>{card.term}</Heading>
        <Text color="secondary" display="block">{card.term_ko}</Text>
      </div>
      <div style={stack(1)}>
        <span style={label}>한 줄로</span>
        <Text display="block" style={prose}>{card.model}</Text>
      </div>
      {mode === "say" && answer ? <div style={stack(1)}>
          <span style={label}>내 문장</span>
          <Text display="block" style={prose}>{answer}</Text>
        </div> : null}
      <div style={stack(1)}>
        <span style={label}>에이전트에게 이렇게</span>
        <Text display="block" style={{ ...prose, borderInlineStart: "2px solid var(--color-border-strong, var(--hairline))", paddingInlineStart: "var(--spacing-3)" }}>{card.say}</Text>
      </div>
      <div style={stack(1)}>
        <span style={label}>헷갈리기 쉬운 점</span>
        <Text display="block" style={prose}>{card.trap}</Text>
      </div>
      {card.pair?.length ? <div style={stack(1)}>
          <span style={label}>같이 보면 좋아요</span>
          {card.pair.map((p) => <Text key={p.slug} display="block" style={prose}><span style={{ fontWeight: 600 }}>{p.term}</span>{` · ${p.model}`}</Text>)}
        </div> : null}
      {card.caveat ? <div style={stack(1)}>
          <span style={{ ...label, color: "var(--warn, var(--color-text-secondary))" }}>확실하지 않은 부분</span>
          <Text display="block" style={prose}>{card.caveat}</Text>
        </div> : null}
    </div>;
}
function Recall({ card, position, count, busy, onRate, onExit }) {
  const [step, setStep] = useState("ask"), [mode, setMode] = useState("say");
  const [answer, setAnswer] = useState(""), [picked, setPicked] = useState(null), [attempt] = useState(attemptId);
  const top = useRef(null);
  useLayoutEffect(() => {
    if (step === "reveal") top.current?.scrollIntoView?.({ block: "start" });
  }, [step]);
  const reveal = (how, choice = null) => {
    setMode(how);
    setPicked(choice);
    setStep("reveal");
  };
  const said = answer.trim();
  const from = card.source_title ? `${card.source_title}에서` : { request: "내 요청에서", sparring: "스파링에서", project: "최근 작업에서" }[card.source] ?? null;
  return <div ref={top} style={stack(4)}>
      <span style={label}>{[TRACKS[card.track] ?? card.track, from].filter(Boolean).join(" · ")}
        {count > 1 ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{` · ${position} / ${count}`}</span> : null}</span>
      <Card>
        {step === "ask" ? <div style={stack(4)}>
            <Text display="block" style={prose}>{card.situation}</Text>
            <Text weight="semibold" display="block" style={{ ...prose, fontSize: "var(--t-title, 1.15em)" }}>{card.ask}</Text>
            {mode === "pick" ? <div style={stack(2)}>
                {card.choices.map((choice) => <Button key={choice} label={choice} variant="secondary" width="100%" onClick={() => reveal("pick", choice)} />)}
                <div><Button label="직접 써 볼게요" variant="ghost" size="sm" onClick={() => setMode("say")} /></div>
              </div> : <div style={stack(3)}>
                <TextArea label="에이전트에게 보낼 한 문장" value={answer} onChange={setAnswer} rows={3} htmlMaxLength={1e3} description="떠오르는 대로 한 문장이면 돼요. 비워 두면 생각만 하고 넘어가요." />
                <div style={row}>
                  <Button label={said ? "답 보기" : "생각만 하고 답 보기"} variant="primary" onClick={() => reveal(said ? "say" : "think")} />
                  {card.choices?.length === 3 ? <Button label="용어 고르기" variant="ghost" onClick={() => setMode("pick")} /> : null}
                </div>
              </div>}
          </div> : <div style={stack(5)}>
            <Revealed card={card} mode={mode} answer={said} picked={picked} />
            <div style={stack(2)}>
              <span style={label}>스스로 보기에</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--spacing-2)" }}>
                {RATINGS.map(([value, name]) => <Button key={value} label={name} variant="secondary" width="100%" isDisabled={busy} onClick={() => onRate(card, value, mode, mode === "say" ? said : mode === "pick" ? picked : null, attempt)} />)}
              </div>
            </div>
          </div>}
      </Card>
      <Exits key={card.id} busy={busy} onExit={(kind, note) => onExit(card, kind, note)} />
    </div>;
}
const WRITING = { asking: "질문을 쓰고 있어요.", answering: "엔지니어식 버전을 쓰고 있어요." };
export const POLL_MS = 4e3, STALE_MS = 4 * 6e4;
function Said({ name, text }) {
  return <div style={stack(1)}>
      <span style={label}>{name}</span>
      <Text display="block" style={{ ...prose, whiteSpace: "pre-wrap" }}>{text}</Text>
    </div>;
}
export function Sparring({ session, send, poll, toLead, openLead = () => {
}, lead = "", now = () => Date.now(), uuid = () => crypto.randomUUID() }) {
  const [draft, setDraft] = useState(""), [rewrite, setRewrite] = useState(session?.draft ?? "");
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  const spokenDraft = useSpoken(draft, setDraft), spokenRewrite = useSpoken(rewrite, setRewrite, { prefill: session?.draft ?? null });
  const sendId = useRef(null);
  const status = session?.status ?? null;
  useEffect(() => {
    if (!WRITING[status]) return void 0;
    const timer = setInterval(() => poll().then(() => setProblem(""), (error) => setProblem(`진행 상황을 불러오지 못했어요. 잠시 뒤 다시 볼게요. (${error?.message ?? error})`)), POLL_MS);
    return () => clearInterval(timer);
  }, [status, poll]);
  async function step(path, body2, after) {
    setBusy(true);
    setProblem("");
    try {
      await send(path, body2);
      after?.();
    } catch (error) {
      setProblem(`보내지 못했어요. 다시 눌러 주세요. (${error?.message ?? error})`);
    } finally {
      setBusy(false);
    }
  }
  const at = session ? `sparring/${session.id}` : "";
  const close = <Button label="이번 다듬기 그만두기" variant="ghost" size="sm" isDisabled={busy} onClick={() => step(`${at}/close`, {})} />;
  const retry = <Button label="다시 시도" variant="secondary" size="sm" isLoading={busy} onClick={() => step(`${at}/retry`, {})} />;
  const silent = WRITING[status] && now() - Date.parse(session.updated_at) > STALE_MS;
  async function toHer(text) {
    setBusy(true);
    setProblem("");
    try {
      sendId.current ??= uuid();
      await toLead(text, sendId.current);
      await send(`${at}/send`, { text });
      openLead();
    } catch (error) {
      setProblem(`${lead}에게 보내지 못했어요. 다시 눌러 주세요. (${error?.message ?? error})`);
    } finally {
      setBusy(false);
    }
  }
  let body;
  if (!session) {
    body = <div style={stack(3)}>
        <Text display="block" style={prose}>{`${lead}에게 보낼 생각을 평소 말투로 적거나 말해 주세요. 선생님이 정하지 않은 부분을 한두 개 묻고, 직접 고쳐 쓰신 다음에 엔지니어식 버전을 옆에 보여 드려요.`}</Text>
        <TextArea label="초안" value={draft} onChange={setDraft} rows={4} htmlMaxLength={4e3} />
        <div style={row}>
          {spokenDraft.mic}
          <Button label="질문 받기" variant="secondary" isDisabled={!draft.trim() || spokenDraft.busy} isLoading={busy} onClick={() => step("sparring", { draft: draft.trim() }, () => setDraft(""))} />
        </div>
        {spokenDraft.line}
      </div>;
  } else if (WRITING[status]) {
    body = <div style={stack(3)}>
        <Said name={status === "asking" ? "초안" : "고쳐 쓴 글"} text={status === "asking" ? session.draft : session.rewrite} />
        <Text display="block" style={prose}>{silent ? "평소보다 오래 걸리고 있어요. 다시 시도해 볼까요?" : `선생님이 ${WRITING[status]} 1분쯤 걸려요. 다른 화면에 다녀와도 돼요.`}</Text>
        <div style={row}>{silent ? retry : null}{close}</div>
      </div>;
  } else if (status === "asked") {
    body = <div style={stack(4)}>
        <Said name="초안" text={session.draft} />
        {(session.questions ?? []).map((q) => <div key={q.question} style={stack(2)}>
            <Text weight="semibold" display="block" style={prose}>{q.question}</Text>
            {q.options?.length ? <ul style={{ margin: 0, paddingInlineStart: "1.2em", display: "grid", gap: "var(--spacing-1)" }}>
                {q.options.map((option) => <li key={option}><Text style={prose}>{option}</Text></li>)}
              </ul> : null}
            <Text type="supporting" display="block" style={prose}>{`${q.term}${q.term_ko ? ` · ${q.term_ko}` : ""}: ${q.why}`}</Text>
          </div>)}
        <TextArea label="고쳐 쓴 글" value={rewrite} onChange={setRewrite} rows={5} htmlMaxLength={4e3} description="질문에 답이 되도록 직접 고쳐 써 주세요. 그다음에 엔지니어식 버전을 보여 드려요." />
        <div style={row}>
          {spokenRewrite.mic}
          <Button label="고쳐 쓴 글 보내기" variant="primary" isDisabled={!rewrite.trim() || spokenRewrite.busy} isLoading={busy} onClick={() => step(`${at}/rewrite`, { rewrite: rewrite.trim() })} />
          {close}
        </div>
        {spokenRewrite.line}
      </div>;
  } else if (status === "answered") {
    const version = session.version ?? {};
    body = <div style={stack(4)}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18em), 1fr))", gap: "var(--spacing-4)" }}>
          <Card><Said name="내가 고쳐 쓴 글" text={session.rewrite} /></Card>
          <Card><Said name="엔지니어식 버전" text={version.text} /></Card>
        </div>
        {version.tradeoffs?.length ? <div style={stack(2)}>
            <span style={label}>고를 때 생각할 점</span>
            {version.tradeoffs.map((t) => <Text key={t.choice} display="block" style={prose}><span style={{ fontWeight: 600 }}>{t.choice}</span>{` · 얻는 것: ${t.gives} · 치르는 것: ${t.costs}`}</Text>)}
          </div> : null}
        {version.cards?.length ? <div style={stack(1)}>
            <span style={label}>이번에 나온 용어 (보내면 학습 카드로 저장돼요)</span>
            <Text display="block" style={prose}>{version.cards.map((c) => `${c.term} · ${c.term_ko}`).join(", ")}</Text>
          </div> : null}
        <div style={stack(2)}>
          <div style={row}>
            <Button label={`이 버전으로 ${lead}에게`} variant="primary" isLoading={busy} onClick={() => toHer(version.text)} />
            <Button label={`내 글로 ${lead}에게`} variant="secondary" isDisabled={busy} onClick={() => toHer(session.rewrite)} />
          </div>
          <Text type="supporting" display="block" style={prose}>{`누르면 고른 글을 ${lead}에게 바로 보내요.`}</Text>
        </div>
        {}
        <div style={{ ...row, justifyContent: "flex-end", paddingBlockStart: "var(--spacing-4)" }}>{close}</div>
      </div>;
  } else {
    body = <div style={stack(3)}>
        {}
        <Text display="block" style={prose}>{session.rewrite ? "엔지니어식 버전을 쓰지 못했어요. 다시 시도해 볼까요?" : "질문을 쓰지 못했어요. 다시 시도해 볼까요?"}</Text>
        <div style={row}>{retry}{close}</div>
      </div>;
  }
  return <section aria-label="보내기 전에 말로 다듬기" style={{ ...stack(4), borderBlockStart: "1px solid var(--color-border, var(--hairline))", paddingBlockStart: "var(--spacing-6)" }}>
      <Heading level={2}>보내기 전에 말로 다듬기</Heading>
      <div aria-live="polite" style={stack(4)}>
        {body}
        {problem ? <Text display="block" style={{ ...prose, color: "var(--bad, var(--color-text-primary))" }}>{problem}</Text> : null}
      </div>
    </section>;
}
const STAGES = [["s1", "어렴풋이 앎"], ["s2", "말로 설명함"], ["s3", "지시에 써 봄"], ["known", "원래 알던 것"]];
export function CompetencyMap({ map = [] }) {
  const met = map.filter((t) => STAGES.some(([key]) => t[key] > 0));
  if (!met.length) return null;
  return <section aria-label="역량 지도" style={{ ...stack(3), borderBlockStart: "1px solid var(--color-border, var(--hairline))", paddingBlockStart: "var(--spacing-6)" }}>
      <Heading level={2}>역량 지도</Heading>
      {met.map((t) => <div key={t.track} style={stack(1)}>
          <Text weight="semibold" display="block">{TRACKS[t.track] ?? t.track}</Text>
          <Text display="block" style={prose}>{STAGES.filter(([key]) => t[key] > 0).map(([key, name]) => `${name} ${t[key]}`).join(" · ")}</Text>
        </div>)}
    </section>;
}
export const LABS = [{ slug: "idempotency-key", title: "같은 답을 두 번 세지 않기", term: "idempotency key", from: "이 학습 화면의 저장소 검토에서", line: "응답이 사라져 다시 보낸 답이 두 번 세어지는 문제를 직접 고쳐요." }, { slug: "group-leakage", title: "같은 사람을 학습과 평가로 나누지 않기", term: "data leakage · group k-fold", from: "커넥톰 연구 과제에서", line: "한 사람의 그림이 학습과 평가에 나뉘어 들어가 부푼 교차검증 점수를 바로잡아요." }, { slug: "checkpoint-resume", title: "끊겨도 이어서, 저장하다 끊겨도 안 깨지게", term: "checkpoint · atomic write", from: "인터뷰 창 수정에서", line: "긴 작업이 중간에 죽어도 마지막 저장 지점부터 다시 돌고, 저장 도중에 죽어도 파일이 깨지지 않게 해요." }];
const LAB_ERRORS = { forbidden: (lead) => `실습 폴더가 아직 없어요. 매일 아침 6시 30분에 채워지고, 지금 필요하면 ${lead}에게 말해 주세요.`, busy: () => "Home 터미널이 이미 8개 열려 있어요. 하나를 닫고 다시 눌러 주세요." };
export function Labs({ labs = LABS, openLab, lead = "" }) {
  const [opening, setOpening] = useState(null), [problem, setProblem] = useState("");
  async function open(slug) {
    setOpening(slug);
    setProblem("");
    try {
      await openLab(slug);
    } catch (error) {
      setProblem((Object.hasOwn(LAB_ERRORS, error?.code ?? "") ? LAB_ERRORS[error.code](lead) : null) ?? `터미널을 열지 못했어요. (${error?.message ?? error})`);
    } finally {
      setOpening(null);
    }
  }
  return <section aria-label="미니 실습" style={{ ...stack(4), borderBlockStart: "1px solid var(--color-border, var(--hairline))", paddingBlockStart: "var(--spacing-6)" }}>
      <Heading level={2}>미니 실습</Heading>
      <Text display="block" style={prose}>{"내 프로젝트에서 나온 20분짜리 실습이에요. 열면 Home 터미널이 그 실습 폴더에서 열려요. claude를 입력하면 튜터가 시작하는데, 코드는 직접 쓰고 튜터는 질문과 힌트만 줘요. PC에서 하기 좋아요."}</Text>
      {labs.map((lab) => <Card key={lab.slug}>
          <div style={stack(2)}>
            <span style={label}>{`약 20분 · ${lab.from}`}</span>
            <Text weight="semibold" display="block" style={prose}>{lab.title}</Text>
            <Text display="block" style={prose}>{lab.line}</Text>
            <Text type="supporting" display="block" style={prose}>{lab.term}</Text>
            <div><Button label="터미널에서 열기" aria-label={`${lab.title} · 터미널에서 열기`} variant="secondary" size="sm" isLoading={opening === lab.slug} isDisabled={Boolean(opening) && opening !== lab.slug} onClick={() => open(lab.slug)} /></div>
          </div>
        </Card>)}
      {problem ? <Text display="block" style={{ ...prose, color: "var(--bad, var(--color-text-primary))" }}>{problem}</Text> : null}
    </section>;
}
const TUTOR_ERRORS = { tutor_timeout: "선생님이 아직 오지 않았어요. 잠시 뒤 다시 눌러 주세요." };
export function AskTutor({ askTutor }) {
  const [calling, setCalling] = useState(false), [problem, setProblem] = useState("");
  async function call() {
    setCalling(true);
    setProblem("");
    try {
      await askTutor();
    } catch (error) {
      setProblem(TUTOR_ERRORS[error?.message] ?? `선생님을 부르지 못했어요. 다시 눌러 주세요. (${error?.message ?? error})`);
    } finally {
      setCalling(false);
    }
  }
  return <div style={{ ...stack(1), justifyItems: "end" }}>
      <Button label="선생님에게 묻기" variant="secondary" size="sm" isDisabled={calling} onClick={call} />
      {calling ? <Text type="supporting" display="block" style={{ ...prose, textAlign: "end" }}>선생님을 부르는 중이에요. 처음엔 1분쯤 걸려요.</Text> : null}
      {problem ? <Text display="block" style={{ ...prose, textAlign: "end", color: "var(--bad, var(--color-text-primary))" }}>{problem}</Text> : null}
    </div>;
}
export function Learning({ load, send, initial = null, now = () => new Date(), toLead = async () => {
}, openLead = () => {
}, openLab = async () => {
}, askTutor = async () => {
}, lead = "" }) {
  const [view, setView] = useState(initial), [problem, setProblem] = useState("");
  const [index, setIndex] = useState(0), [busy, setBusy] = useState(false), [done, setDone] = useState(0), [round, setRound] = useState(0);
  const [left, setLeft] = useState("");
  const refresh = useCallback(async () => {
    setProblem("");
    setLeft("");
    try {
      const next = await load();
      setView(next);
      setIndex(0);
      setRound((n) => n + 1);
    } catch (error) {
      setProblem(`학습 화면을 불러오지 못했어요: ${error?.message ?? error}`);
    }
  }, [load]);
  useEffect(() => {
    if (!initial) refresh();
  }, []);
  async function act(action, body2, after) {
    setBusy(true);
    setProblem("");
    try {
      await send(action, body2);
      setLeft("");
      after();
    } catch (error) {
      setProblem(`저장하지 못했어요. 다시 눌러 주세요. (${error?.message ?? error})`);
    } finally {
      setBusy(false);
    }
  }
  const calibrate = (id, answer) => act("calibration", { concept_id: id, answer }, () => {
    const rest = view.calibration.filter((c) => c.id !== id);
    if (rest.length) setView({ ...view, calibration: rest });
    else refresh();
  });
  const advance = () => {
    setDone((n) => n + 1);
    setIndex((i) => i + 1);
  };
  const rate = (card, rating, kind, answer, attempt) => {
    const { card: next, log } = schedule(card.fsrs, rating, now());
    return act("review", { concept_id: card.id, attempt, kind, rating, fsrs: next, log, ...answer ? { answer } : {} }, advance);
  };
  const exit = (card, kind, note) => act("exit", { concept_id: card.id, kind, ...note ? { note } : {} }, () => {
    advance();
    setLeft(LEFT[kind]);
  });
  const open = (s) => s && !["sent", "closed"].includes(s.status) ? s : null;
  const spar = useCallback(async (path, body2) => {
    const result = await send(path, body2);
    setView((v) => ({ ...v, sparring: open(result?.sparring) }));
    return result;
  }, [send]);
  const poll = useCallback(async () => {
    const next = await load();
    setView((v) => ({ ...v, sparring: next.sparring }));
  }, [load]);
  const session = view?.phase === "session" ? view.session : [];
  const finished = view?.phase === "session" && index >= session.length;
  let body;
  if (!view) body = problem ? null : <Text type="supporting">불러오는 중이에요.</Text>;
  else if (view.phase === "calibrate") body = <Calibrate items={view.calibration} total={view.calibration_total} busy={busy} onAnswer={calibrate} />;
  else if (view.phase === "session" && !finished) {
    body = <Recall key={`${round}-${index}`} card={session[index]} position={index + 1} count={session.length} busy={busy} onRate={rate} onExit={exit} />;
  } else {
    const line = view.phase === "rest" ? nextLine(view.next_due, now()) : null;
    body = <div style={stack(2)}>
        <Text weight="semibold" display="block">{done ? `오늘 카드 ${done}장 했어요.` : "오늘 볼 카드는 다 봤어요."}</Text>
        {line ? <Text type="supporting" display="block">{line}</Text> : null}
        {finished ? <div><Button label="더 있는지 보기" variant="ghost" size="sm" onClick={refresh} /></div> : null}
      </div>;
  }
  return <div style={{ ...column, wordBreak: "keep-all", paddingBlock: "var(--spacing-6) var(--spacing-12)", display: "grid", gap: "var(--spacing-6)" }}>
      <header style={stack(2)}>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "start" }}>
          <Heading level={1}>학습</Heading>
          <AskTutor askTutor={askTutor} />
        </div>
        {view ? <WeekLine terms={view.week} /> : null}
      </header>
      <section style={stack(4)} aria-live="polite">
        {problem ? <div style={stack(2)}>
            <Text display="block" style={{ color: "var(--bad, var(--color-text-primary))" }}>{problem}</Text>
            {!view ? <div><Button label="다시 시도" variant="secondary" size="sm" onClick={refresh} /></div> : null}
          </div> : null}
        {left ? <Text type="supporting" display="block" style={prose}>{left}</Text> : null}
        {body}
      </section>
      {view ? <Sparring key={view.sparring?.id ?? "new"} session={view.sparring ?? null} send={spar} poll={poll} toLead={toLead} openLead={openLead} lead={lead} /> : null}
      {view ? <CompetencyMap map={view.map} /> : null}
      {view ? <Labs openLab={openLab} lead={lead} /> : null}
    </div>;
}
export const mount = island(Learning);
