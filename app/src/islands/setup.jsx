import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
import { Page, Lead, Note, NamesFields, namesReady, LeadChoice, AskChoice, PhoneOnlyChoice, Vault, ApiForm, stack, row } from "./lib/setup-parts.jsx";
import { STEPS, SKIPPABLE, wizardSteps, stepAfter, stepBefore, needsKey, firstChoices, fitPhoneOnly, kindLabel } from "../setup/flow.js";
const LABEL = Object.fromEntries(STEPS);
const mono = { fontFamily: "var(--font-mono)" };
const listed = (kinds, none) => kinds.length ? kinds.map(kindLabel).join(", ") : none;
function Landing({ screen, code, error, retry }) {
  const say = { unpaired: ["Pair this browser", <>Artemis opens only on devices you pair. On the computer it runs on, open the link <code style={mono}>artemis serve</code> printed. On another device, scan a pairing code from Settings, Devices, in the App on that computer.</>], expired: ["This pairing link has run out", "A link works once, for a few minutes. Make a new one in Settings, Devices, on the computer Artemis runs on, or start Artemis again there for a new link."], waiting: ["Waiting for your computer to allow this device", "On the computer Artemis runs on, open Settings, Devices, and allow the device that shows this code. The App opens here by itself once you do."], elsewhere: ["Finish the setup on your computer", "The first-run setup is done in the App on the computer Artemis runs on. The App opens here by itself once it is finished."], offline: ["Artemis cannot be reached", <>Is <code style={mono}>artemis serve</code> still running on your computer? This page tries again every few seconds.</>] }[screen] ?? ["Artemis", null];
  return <div style={stack(5)} role="status" aria-live="polite">
      <Lead title={say[0]}>{say[1]}</Lead>
      {screen === "waiting" && code && <div style={stack(1)}>
          <Text type="supporting" display="block">This device's code</Text>
          <span style={{ ...mono, fontSize: "calc(var(--t-head) * 1.8)", fontWeight: "var(--fw-title)", letterSpacing: ".18em", fontVariantNumeric: "tabular-nums" }}>{code}</span>
        </div>}
      {screen === "offline" && <Note error={error} />}
      {(screen === "offline" || screen === "waiting" || screen === "elsewhere") && <div style={row}><Button label="Check now" variant="secondary" clickAction={retry} /></div>}
    </div>;
}
function Wizard({ home, setup: first, finish }) {
  const [setup, setSetup] = useState(first), [settings, setSettings] = useState(null);
  const [at, setAt] = useState("names"), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const [name, setName] = useState(first.name ?? ""), [you, setYou] = useState(first.you ?? "");
  const [leadValue, setLeadValue] = useState(first.lead?.chosen ?? "auto");
  const [{ ask, phoneOnly }, setChoices] = useState(() => firstChoices(first)), [api, setApi] = useState(null);
  const [keyStep, setKeyStep] = useState(() => needsKey(first)), [checking, setChecking] = useState(false), [checked, setChecked] = useState(null);
  const top = useRef(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) top.current?.focus();
    moved.current = true;
  }, [at]);
  const stepsFor = (now, asked = ask) => wizardSteps(now, asked, keyStep || needsKey(now));
  const learn = (now) => {
    setSetup(now);
    if (needsKey(now)) setKeyStep(true);
    return now;
  };
  const reread = async () => {
    const [now, lead] = await Promise.all([home.setup(), home.lead()]);
    learn(now);
    setSettings(lead);
    setLeadValue(lead.model?.id ?? "auto");
    return now;
  };
  useEffect(() => {
    if (at === "lead" || !settings) reread().catch((err) => setError(err?.message ?? String(err)));
  }, [at]);
  const check = async () => {
    setChecking(true);
    setChecked(null);
    setError(null);
    try {
      const now = await reread();
      if (needsKey(now)) setChecked("Nothing is ready to lead yet.");
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setChecking(false);
    }
  };
  const steps = stepsFor(setup), index = Math.max(0, steps.indexOf(at));
  const go = (id, list = steps) => {
    setError(null);
    setAt(stepAfter(id, list));
  };
  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };
  const next = { names: () => run(async () => {
    learn(await home.save({ name: name.trim(), you: you.trim() }));
    go("names");
  }), lead: () => run(async () => {
    if (settings && leadValue !== settings.model?.id) setSettings(await home.chooseLead(leadValue));
    const now = learn(await home.setup());
    go("lead", stepsFor(now));
  }), key: () => run(async () => {
    const now = learn(await home.setup());
    go("key", stepsFor(now));
  }), ask: () => go("ask"), phone: () => go("phone"), pair: () => go("pair"), done: () => run(async () => {
    await home.save({ ask, phone_only: fitPhoneOnly(phoneOnly, ask), done: true });
    finish();
  }) };
  const skip = { ask: () => {
    const kept = firstChoices(setup);
    setChoices(kept);
    go("ask", stepsFor(setup, kept.ask));
  }, phone: () => {
    setChoices((now) => ({ ...now, phoneOnly: fitPhoneOnly(firstChoices(setup).phoneOnly, now.ask) }));
    go("phone");
  } };
  const back = () => {
    setError(null);
    setAt(stepBefore(at, steps));
  };
  const canGo = at === "names" ? namesReady(name, you) : at === "lead" ? Boolean(settings) : true;
  const leadNow = setup.lead?.label ?? "Automatic";
  const body = { names: <><Lead title="Name your lead">The lead is the agent you talk to. It takes your requests, hands work to other agents and asks you before anything that cannot be undone.</Lead>
      <NamesFields name={name} you={you} onName={setName} onYou={setYou} onEnter={() => canGo && next.names()} autoFocus /></>, lead: <><Lead title={`Which agent is ${name.trim() || "your lead"}?`}>The agents ready on this computer. You can change this later in Settings.</Lead>
      {settings ? <LeadChoice settings={settings} setup={setup} value={leadValue} onChange={setLeadValue} /> : <Note>Reading the agents on this computer…</Note>}</>, key: <>{needsKey(setup) ? <><Lead title="Give the lead a key">Nothing on this computer can lead yet. Sign in to Claude Code or Codex in a terminal and check again, or let an OpenAI-compatible API lead: name the model it runs and its key. Its provider bills each call.</Lead>
            <div style={row}><Button label="Check again" variant="secondary" isLoading={checking} clickAction={check} />{checked && <Text type="supporting">{checked}</Text>}</div></> : setup.lead?.provider === "api" ? <Lead title="Give the lead a key">{setup.lead.label} leads now{setup.api?.model ? `, running ${setup.api.model}` : ""}. Continue, or change its model or key below. Its provider bills each call.</Lead> : <Lead title="Give the lead a key">{setup.lead?.label ?? "An agent"} can lead now. Continue, or name an OpenAI-compatible API as well: the model it runs and its key. Its provider bills each call.</Lead>}
      {}
      <Vault home={home} vault={setup.vault} onOpen={reread}>{(vault) => <ApiForm home={home} setup={setup} vault={vault} keyed={setup.lead?.provider === "api"} onSaved={async (saved) => {
    setApi(saved);
    if (needsKey(setup)) await home.chooseLead("api");
    await reread();
  }} />}</Vault></>, ask: <><Lead title="What should Artemis ask you first?">It stops and waits for your yes before any of these. What you leave unticked goes ahead and shows in the timeline.</Lead>
      <AskChoice value={ask} onChange={(value) => setChoices({ ask: value, phoneOnly: fitPhoneOnly(phoneOnly, value) })} /></>, phone: <><Lead title="Which of these only your phone approves?">A paired phone is the only place these can be approved, so a yes needs it in your hand. Until a phone is paired they wait.</Lead>
      <PhoneOnlyChoice ask={ask} value={phoneOnly} onChange={(value) => setChoices((now) => ({ ...now, phoneOnly: value }))} /></>, pair: <><Lead title="Pair a phone">Approve and follow the work from your phone. A phone reaches Artemis over your network, which opens once this setup is finished:</Lead>
      <ol style={{ margin: 0, paddingInlineStart: "1.4em", listStyle: "decimal", display: "grid", gap: "var(--spacing-2)" }}>
        <li><Text>Finish this setup.</Text></li>
        <li><Text>Start it again with <code style={mono}>artemis serve --lan</code>.</Text></li>
        <li><Text>In Settings, Devices, show a pairing code and scan it with the phone.</Text></li>
      </ol></>, done: <><Lead title="Ready">Here is what you chose. All of it can be changed in Settings.</Lead>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(6em, 38%) minmax(0, 1fr)", gap: "var(--spacing-2) var(--spacing-5)", margin: 0 }}>
        {[["Lead", name.trim()], ["You", you.trim()], ["Who leads", leadNow], ...api ? [["API", api.key ? `${api.model}, its key in the vault as ${api.key}` : api.model]] : [], ["Asks you first", listed(ask, "Nothing: every action goes ahead")], ["Only your phone approves", listed(fitPhoneOnly(phoneOnly, ask), "None")]].map(([term, value]) => <div key={term} style={{ display: "contents" }}>
            <dt><Text type="supporting">{term}</Text></dt><dd style={{ margin: 0 }}><Text>{value}</Text></dd>
          </div>)}
      </dl>
      {needsKey(setup) && <Note>No AI leads yet, so answers are canned until an agent is ready. Settings shows who can lead.</Note>}</> }[at];
  return <div style={stack(6)}>
      <Stepper activeStep={index} label="Setup" density="compact" horizontalOptions={{ minimumStepWidth: 128, collapsedVariant: "withLabel" }} onStepClick={(step) => step < index && setAt(steps[step])}>
        {steps.map((id, step) => <Step key={id} step={step} label={LABEL[id]} />)}
      </Stepper>
      <section ref={top} tabIndex={-1} aria-label={LABEL[at]} style={{ ...stack(5), outline: "none" }}>{body}</section>
      <Note error={error} />
      <div style={{ ...row, justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: "var(--spacing-4)" }}>
        <div style={row}>{index > 0 && <Button label="Back" variant="ghost" onClick={back} isDisabled={busy} />}</div>
        <div style={row}>
          {SKIPPABLE.has(at) && <Button label="Skip" variant="ghost" isDisabled={busy} onClick={() => (skip[at] ?? (() => go(at)))()} />}
          <Button label={at === "done" ? "Open Artemis" : "Continue"} variant="primary" isLoading={busy} isDisabled={!canGo} clickAction={next[at]} />
        </div>
      </div>
    </div>;
}
function Setup({ screen, mark, ...rest }) {
  return <Page mark={mark} edition={screen === "wizard" ? "SETUP" : "PAIRING"}>
      {screen === "wizard" ? <Wizard {...rest} /> : <Landing screen={screen} {...rest} />}
    </Page>;
}
export const mount = island(Setup);
export { Setup, Wizard, Landing };
