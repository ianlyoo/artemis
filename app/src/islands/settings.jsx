import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { island } from "./lib/mount.jsx";
import { Page, Lead, Note, NamesFields, namesReady, LeadChoice, AskChoice, PhoneOnlyChoice, Vault, KeyForm, ApiForm, PairPanel, DeviceList, stack, row } from "./lib/setup-parts.jsx";
import { fitPhoneOnly, kindLabel } from "../setup/flow.js";
const same = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const when = (at) => at ? new Date(at * 1e3).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";
const KIND = { none: "Used freely", send: "Counts as sending as you", spend: "Counts as money going out" };
function Section({ title, children, about }) {
  return <section style={{ ...stack(4), borderTop: "1px solid var(--hairline)", paddingTop: "var(--spacing-5)" }}>
      <Lead title={title} level={2}>{about}</Lead>
      {children}
    </section>;
}
function useSaver() {
  const [state, setState] = useState({ busy: false, error: null, done: null });
  const save = async (work, done) => {
    setState({ busy: true, error: null, done: null });
    try {
      await work();
      setState({ busy: false, error: null, done });
    } catch (err) {
      setState({ busy: false, error: err?.message ?? String(err), done: null });
    }
  };
  return [state, save];
}
function Stop({ home, setup }) {
  const [stopped, setStopped] = useState(Boolean(setup.stopped)), [state, save] = useSaver();
  useEffect(() => setStopped(Boolean(setup.stopped)), [setup.stopped]);
  const flip = () => save(async () => setStopped((await (stopped ? home.resume() : home.stop())).stopped), null);
  return <Section title={stopped ? "Automatic work is stopped" : "Automatic work"} about={stopped ? "Nothing runs and nothing new starts until you resume." : "Stopping it stops the work that is running, and nothing new starts until you resume."}>
      <Note error={state.error} />
      <div style={row}><Button label={stopped ? "Resume" : "Stop all automatic work"} variant={stopped ? "primary" : "destructive"} isLoading={state.busy} clickAction={flip} /></div>
    </Section>;
}
function Names({ home, setup, onSaved }) {
  const [name, setName] = useState(setup.name ?? ""), [you, setYou] = useState(setup.you ?? ""), [state, save] = useSaver();
  const changed = name.trim() !== (setup.name ?? "") || you.trim() !== (setup.you ?? "");
  const go = () => changed && namesReady(name, you) && save(async () => onSaved(await home.save({ name: name.trim(), you: you.trim() })), "Saved.");
  return <Section title="Names">
      <NamesFields name={name} you={you} onName={setName} onYou={setYou} onEnter={go} />
      <Note error={state.error}>{state.done}</Note>
      <div style={row}><Button label="Save names" variant="secondary" isLoading={state.busy} isDisabled={!changed || !namesReady(name, you)} clickAction={go} /></div>
    </Section>;
}
function Leader({ home, setup, settings, onSaved }) {
  const [state, save] = useSaver();
  const choose = (model) => save(async () => onSaved(await home.chooseLead(model)), "Saved. The next turn uses it.");
  return <Section title="Who leads" about="The agents ready on this computer.">
      <LeadChoice settings={settings} setup={setup} value={settings.model?.id ?? "auto"} onChange={choose} />
      <Note error={state.error}>{state.done}</Note>
    </Section>;
}
function Asks({ home, setup, onSaved }) {
  const [ask, setAsk] = useState(setup.ask), [phoneOnly, setPhoneOnly] = useState(setup.phone_only), [state, save] = useSaver();
  const fitted = fitPhoneOnly(phoneOnly, ask), changed = !same(ask, setup.ask) || !same(fitted, setup.phone_only);
  const go = () => save(async () => onSaved(await home.save({ ask, phone_only: fitted })), "Saved.");
  return <Section title="What Artemis asks you first" about={setup.here ? "It stops and waits for your yes before these. What you leave unticked goes ahead and shows in the timeline." : "Changed in the App on the computer Artemis runs on."}>
      <AskChoice value={ask} onChange={(next) => setAsk(next)} isReadOnly={!setup.here} />
      <Lead title="Only your phone approves" level={3}>A paired phone is the only place these can be approved. Until a phone is paired they wait.</Lead>
      <PhoneOnlyChoice ask={ask} value={fitted} onChange={setPhoneOnly} isReadOnly={!setup.here} />
      {setup.here && <>
        <Note error={state.error}>{state.done}</Note>
        <div style={row}><Button label="Save" variant="secondary" isLoading={state.busy} isDisabled={!changed} clickAction={go} /></div>
      </>}
    </Section>;
}
const operation = (row2) => row2.method && row2.url ? `${row2.method} ${row2.url}` : row2.argv ? row2.argv.join(" ") : row2.secret ? `the key ${row2.secret}` : null;
function Standing({ home }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(null);
  const load = useCallback(() => home.standing().then(setRows, (err) => setError(err.message)), [home]);
  useEffect(() => {
    load();
  }, [load]);
  const revoke = async (id) => {
    setBusy(id);
    setError(null);
    try {
      await home.revokeStanding(id);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(null);
      await load();
    }
  };
  return <Section title="Approved for good" about="Operations you approved for good on a card. Each goes ahead without asking you until you revoke it.">
      {rows && (rows.length ? <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--hairline)" }}>
          {rows.map((approval) => <li key={approval.id} style={{ ...row, justifyContent: "space-between", paddingBlock: "var(--spacing-3)", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ ...stack(1), flex: "1 1 14em" }}>
                <Text weight="semibold" display="block" style={{ overflowWrap: "anywhere" }}>{approval.what ?? operation(approval) ?? "An operation"}</Text>
                {approval.what && operation(approval) && <Text type="supporting" display="block" style={{ fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{operation(approval)}</Text>}
                <Text type="supporting" display="block">{kindLabel(approval.kind)} · since {when(approval.created)}{approval.schedule ? ` · ${approval.schedule}` : ""}</Text>
              </div>
              <Button label="Revoke" variant="ghost" size="sm" isLoading={busy === approval.id} clickAction={() => revoke(approval.id)} />
            </li>)}
        </ul> : <Note>Nothing is approved for good: each asked action waits for you every time.</Note>)}
      {!rows && !error && <Note>Reading the approvals…</Note>}
      <Note error={error} />
    </Section>;
}
function Api({ home, setup, onSaved }) {
  return <Section title="The API" about="An OpenAI-compatible API leads once it is chosen under Who leads; Automatic never picks it. Its provider bills each call.">
      <ApiForm home={home} setup={setup} keyed={Boolean(setup.api?.model)} onSaved={onSaved} />
    </Section>;
}
function KeyList({ home }) {
  const [secrets, setSecrets] = useState(null), [error, setError] = useState(null), [asking, setAsking] = useState(null), [busy, setBusy] = useState(null);
  const load = useCallback(() => home.secrets().then((list) => {
    setSecrets(list);
    setError(null);
  }, (err) => setError(err.message)), [home]);
  useEffect(() => {
    load();
  }, [load]);
  const remove = async (name) => {
    setBusy(name);
    setError(null);
    try {
      await home.removeSecret(name);
      setAsking(null);
      await load();
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  };
  return <div style={stack(4)}>
      {secrets && (secrets.length ? <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--hairline)" }}>
          {secrets.map((secret) => <li key={secret.name} style={{ ...row, justifyContent: "space-between", paddingBlock: "var(--spacing-3)", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ ...stack(1), flex: "1 1 14em" }}>
                <Text weight="semibold" display="block" style={{ fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>{secret.name}</Text>
                <Text type="supporting" display="block">{KIND[secret.kind] ?? secret.kind} · last used {when(secret.last_used)}{secret.note ? ` · ${secret.note}` : ""}</Text>
              </div>
              <div style={row}>
                {asking === secret.name ? <><Button label="Remove for good" variant="destructive" size="sm" isLoading={busy === secret.name} clickAction={() => remove(secret.name)} />
                      <Button label="Keep" variant="ghost" size="sm" onClick={() => setAsking(null)} /></> : <Button label="Remove" variant="ghost" size="sm" onClick={() => setAsking(secret.name)} />}
              </div>
            </li>)}
        </ul> : <Note>No key is stored.</Note>)}
      <Note error={error} />
      <KeyForm home={home} onStored={load} />
    </div>;
}
function Keys({ home, setup, onOpen }) {
  return <Section title="Keys" about="Keys in this computer's vault. Agents use them by name and never see a value.">
      <Vault home={home} vault={setup.vault} here={setup.here} onOpen={onOpen}><KeyList home={home} /></Vault>
    </Section>;
}
function Devices({ home, here, onSignedOut }) {
  const [devices, setDevices] = useState(null), [error, setError] = useState(null);
  const load = useCallback(() => home.devices().then((list) => {
    setDevices(list);
    setError(null);
  }, (err) => {
    if (err.status === 401) onSignedOut();
    else setError(err.message);
  }), [home, onSignedOut]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 4e3);
    return () => clearInterval(timer);
  }, [load]);
  return <Section title="Devices" about={here ? "The browsers and phones that open this App. A new one waits until you allow it here; check that its code matches." : "The browsers and phones that open this App. A new one is allowed on the computer Artemis runs on."}>
      {devices ? <DeviceList home={home} here={here} devices={devices} onChange={load} onSignedOut={onSignedOut} /> : !error && <Note>Reading the devices…</Note>}
      <Note error={error} />
      <Lead title="Pair a phone" level={3} />
      <PairPanel home={home} here={here} />
    </Section>;
}
const reload = () => globalThis.location.reload();
function Settings({ home, mark, back = "#/", signedOut = reload }) {
  const [setup, setSetup] = useState(null), [settings, setSettings] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([home.setup(), home.lead()]).then(([setupNow, lead]) => {
      setSetup(setupNow);
      setSettings(lead);
    }, (err) => setError(err.message));
  }, [home]);
  const reread = () => home.setup().then(setSetup, () => {
  });
  const rereadBoth = () => Promise.all([home.setup(), home.lead()]).then(([setupNow, lead]) => {
    setSetup(setupNow);
    setSettings(lead);
  });
  return <Page mark={mark} edition="SETTINGS" end={<Button label="Back to the App" variant="ghost" href={back} />}>
      <div style={stack(6)}>
        <Lead title="Settings">{setup && setup.lead ? `${setup.name || "Your lead"} leads with ${setup.lead.label}.` : null}</Lead>
        {!setup || !settings ? <Note error={error}>Reading this home's settings…</Note> : <>
          <Stop home={home} setup={setup} />
          <Names home={home} setup={setup} onSaved={setSetup} />
          <Leader home={home} setup={setup} settings={settings} onSaved={(next) => {
    setSettings(next);
    return reread();
  }} />
          <Api home={home} setup={setup} onSaved={rereadBoth} />
          <Asks home={home} setup={setup} onSaved={setSetup} />
          <Standing home={home} />
          <Keys home={home} setup={setup} onOpen={reread} />
          <Devices home={home} here={setup.here} onSignedOut={signedOut} />
        </>}
      </div>
    </Page>;
}
export const mount = island(Settings);
export { Settings };
