import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
import { KINDS, fitPhoneOnly, onThisComputer } from "../../setup/flow.js";
export const column = { width: "100%", maxWidth: "40em", marginInline: "auto", boxSizing: "border-box", paddingInline: "var(--s-pad)" };
export const stack = (gap) => ({ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: `var(--spacing-${gap})`, minWidth: 0 });
export const row = { display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)", alignItems: "center" };
const prose = { overflowWrap: "anywhere", lineHeight: "var(--lh-base, 1.6)", maxWidth: "62ch" };
const mono = { fontFamily: "var(--font-mono)", overflowWrap: "anywhere" };
const bare = { backgroundColor: "transparent" };
export const NAME_ROOM = 40;
export function Page({ mark, edition, end, children }) {
  const shape = `url("${mark}") center/contain no-repeat`;
  return <div style={{ minHeight: "100%", display: "grid", gridTemplateRows: "auto 1fr", color: "var(--ink)", background: "var(--ground)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "calc(var(--ui) * 10 / 12)", minHeight: "calc(var(--ui) * 4.4)", paddingInline: "max(var(--s-pad), env(safe-area-inset-left))", paddingTop: "env(safe-area-inset-top)", borderBottom: "1px solid var(--hairline)" }}>
        {mark && <b aria-hidden="true" style={{ display: "block", flex: "none", width: "calc(var(--ui) * 22 / 12)", height: "calc(var(--ui) * 2)", background: "var(--ink)", WebkitMask: shape, mask: shape }} />}
        <strong style={{ fontSize: "calc(var(--ui) * 1.6)", letterSpacing: "calc(var(--ui) * 2 / 12)", fontWeight: 650 }}>ARTEMIS</strong>
        {edition && <span style={{ marginLeft: "calc(var(--ui) * .5)", color: "var(--muted)", fontSize: "var(--ui)", letterSpacing: "calc(var(--ui) * .1)" }}>{edition}</span>}
        {end && <span style={{ marginLeft: "auto" }}>{end}</span>}
      </header>
      <main style={{ ...column, paddingBlock: "var(--s-out)" }}>{children}</main>
    </div>;
}
export function Lead({ title, children, level = 1 }) {
  return <div style={stack(2)}>
      <Heading level={level}>{title}</Heading>
      {children && <Text type="supporting" as="p" display="block" style={prose}>{children}</Text>}
    </div>;
}
export function Note({ error, children }) {
  if (error) return <Banner status="error" title={error} />;
  return children ? <Text type="supporting" as="p" display="block" style={prose}>{children}</Text> : null;
}
export const said = (text) => String(text ?? "").split(/`([^`]+)`/).map((part, i) => i % 2 ? <code key={i} style={mono}>{part}</code> : part);
const nameStatus = (value) => value.trim().length > NAME_ROOM ? { type: "error", message: `At most ${NAME_ROOM} characters.` } : void 0;
export function NamesFields({ name, you, onName, onYou, onEnter, autoFocus = false }) {
  return <div style={stack(4)}>
      <TextInput label="Your lead's name" description="The agent you talk to. It signs its messages with this name." value={name} onChange={onName} onEnter={onEnter} status={nameStatus(name)} hasAutoFocus={autoFocus} autoComplete="off" hasSpellCheck={false} isRequired />
      <TextInput label="Your name" description="How Artemis addresses you." value={you} onChange={onYou} onEnter={onEnter} status={nameStatus(you)} autoComplete="given-name" hasSpellCheck={false} isRequired />
    </div>;
}
export const namesReady = (name, you) => [name, you].every((value) => value.trim() && value.trim().length <= NAME_ROOM);
export function LeadChoice({ settings, setup, value, onChange }) {
  const ready = settings?.models ?? [], now = setup?.lead;
  const waiting = (now?.choices ?? []).filter((choice) => choice.why);
  const about = (id) => id === "auto" ? `Artemis picks the best agent that is ready, never a billed API.${now?.chosen === "auto" && now.label ? ` Now: ${now.label}.` : ""}` : id === "mock" ? "No AI: answers are canned, for trying the App." : "Ready on this computer.";
  return <div style={stack(3)}>
      <RadioList label="Who leads" isLabelHidden value={value} onChange={onChange} isDisabled={settings?.canChange === false} disabledMessage="ARTEMIS_LEAD was set when Artemis started, and it decides who leads.">
        {ready.map((model) => <RadioListItem key={model.id} value={model.id} label={model.label} description={about(model.id)} />)}
        {waiting.map((choice) => <RadioListItem key={choice.provider} value={choice.provider} label={choice.label} description={<>Not ready: {said(choice.why)}.</>} isDisabled />)}
      </RadioList>
    </div>;
}
export function AskChoice({ value, onChange, isReadOnly = false }) {
  return <CheckboxList label="Ask me first" isLabelHidden value={value} onChange={onChange} isReadOnly={isReadOnly} hasDividers>
      {KINDS.map(([kind, label, detail]) => <CheckboxListItem key={kind} value={kind} label={label} description={detail} style={bare} />)}
    </CheckboxList>;
}
export function PhoneOnlyChoice({ ask, value, onChange, isReadOnly = false }) {
  return <CheckboxList label="Only my phone approves" isLabelHidden value={fitPhoneOnly(value, ask)} onChange={(next) => onChange(fitPhoneOnly(next, ask))} isReadOnly={isReadOnly} hasDividers>
      {KINDS.map(([kind, label, detail]) => ask.includes(kind) ? <CheckboxListItem key={kind} value={kind} label={label} description={detail} style={bare} /> : <CheckboxListItem key={kind} value={kind} label={label} description="Not asked first, so it goes ahead." isDisabled style={bare} />)}
    </CheckboxList>;
}
const fault = (error) => error?.message ?? String(error);
export function Vault({ home, vault, here = true, onOpen, children }) {
  const [state, setState] = useState(vault), [passphrase, setPassphrase] = useState(""), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => setState(vault), [vault]);
  if (!state) return <Note>This home has no vault, so a key cannot be kept here. <code style={mono}>artemis secret</code> in a terminal says how to set one up.</Note>;
  if (!state.locked) return typeof children === "function" ? children(state) : children;
  if (!here) return <Note>The vault is locked. It is unlocked in the App on the computer Artemis runs on.</Note>;
  const fresh = state.state === "new";
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await home.unlock(passphrase);
      setState(next);
      setPassphrase("");
      await onOpen?.(next);
    } catch (err) {
      setError(fault(err));
    } finally {
      setBusy(false);
    }
  };
  return <div style={stack(3)}>
      <TextInput type="password" label={fresh ? "Choose a vault passphrase" : "Vault passphrase"} description={fresh ? "The vault keeps its key under a passphrase of at least 12 characters, asked once each time Artemis starts." : "The vault is locked. Its passphrase opens it until Artemis stops."} value={passphrase} onChange={setPassphrase} onEnter={() => passphrase && open()} autoComplete={fresh ? "new-password" : "current-password"} />
      <Note error={error} />
      <div style={row}><Button label={fresh ? "Set passphrase" : "Unlock"} variant="secondary" isLoading={busy} isDisabled={!passphrase} clickAction={open} /></div>
    </div>;
}
export function KeyForm({ home, onStored, defaultName = "" }) {
  const [name, setName] = useState(defaultName), [value, setValue] = useState(""), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || !value) return;
    setBusy(true);
    setError(null);
    try {
      const info = await home.addSecret({ name: name.trim(), value, kind: "none", use: "env" });
      setName("");
      setValue("");
      await onStored?.(info);
    } catch (err) {
      setError(fault(err));
    } finally {
      setBusy(false);
    }
  };
  return <div style={stack(3)}>
      <TextInput label="Name" description="Capitals, digits and _, as the program reads it." value={name} onChange={(next) => setName(next.toUpperCase())} autoComplete="off" hasSpellCheck={false} />
      <TextInput type="password" label="Key" description="Sent once to this computer's vault and never shown again." value={value} onChange={setValue} onEnter={save} autoComplete="off" />
      <Note error={error} />
      <div style={row}><Button label="Save to the vault" variant="secondary" isLoading={busy} isDisabled={!name.trim() || !value} clickAction={save} /></div>
    </div>;
}
export function ApiForm({ home, setup, vault = setup.vault, keyed = false, onSaved }) {
  const api = setup.api ?? {}, keyName = api.key || "OPENAI_API_KEY";
  const [model, setModel] = useState(api.model ?? ""), [base, setBase] = useState(api.base_url ?? ""), [value, setValue] = useState("");
  const [error, setError] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(null);
  if (!setup.here) return <Note>{api.model ? <>{api.model} at <span style={mono}>{api.base_url}</span>. </> : "None is named. "}Changed in the App on the computer Artemis runs on.</Note>;
  const open = Boolean(vault && !vault.locked), local = onThisComputer(base.trim());
  const changed = model.trim() !== (api.model ?? "") || base.trim() !== (api.base_url ?? "") || Boolean(value);
  const ready = Boolean(model.trim() && base.trim() && changed && (value || keyed || local));
  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const sent = { model: model.trim(), base_url: base.trim() };
      await home.save({ api: sent });
      if (value) await home.addSecret({ name: keyName, value, kind: "none", use: "env" });
      const stored = value ? keyName : null;
      setValue("");
      setDone(stored ? `Saved. ${stored} is in the vault.` : "Saved.");
      await onSaved?.({ model: sent.model, key: stored });
    } catch (err) {
      setError(fault(err));
    } finally {
      setBusy(false);
    }
  };
  return <div style={stack(3)}>
      <TextInput label="Model" description="As the provider names it, like gpt-4.1-mini." value={model} onChange={setModel} onEnter={save} autoComplete="off" hasSpellCheck={false} />
      {open ? <TextInput type="password" label="Key" description={`Kept in the vault as ${keyName}, sent once and never shown again.${local ? " A model server on this computer needs none." : keyed ? " Leave it empty to keep the one stored." : ""}`} value={value} onChange={setValue} onEnter={save} autoComplete="off" /> : <Note>The key goes in the vault, which is locked: open it under Keys.</Note>}
      <TextInput label="Base URL" description="OpenAI's. For another OpenAI-compatible provider, its address: HTTPS, or http:// on this computer." value={base} onChange={setBase} onEnter={save} autoComplete="off" hasSpellCheck={false} />
      <Note error={error}>{done}</Note>
      <div style={row}><Button label="Save" variant="secondary" isLoading={busy} isDisabled={!ready || Boolean(value) && !open} clickAction={save} /></div>
    </div>;
}
const minutes = (at) => Math.max(1, Math.round((at * 1e3 - Date.now()) / 6e4));
export function PairPanel({ home, here = true }) {
  const [link, setLink] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await home.pairLink());
    } catch (err) {
      setError(fault(err));
    } finally {
      setBusy(false);
    }
  };
  if (!here) return <Note>A phone is paired from the App on the computer Artemis runs on.</Note>;
  if (link && !link.lan) return <div style={stack(3)}>
      <Note>Artemis serves only this computer now. Start it with <code style={mono}>artemis serve --lan</code> so a phone on the same network can reach it, then make a pairing code here.</Note>
      <div style={row}><Button label="Try again" variant="secondary" isLoading={busy} clickAction={make} /></div>
    </div>;
  if (link) return <div style={{ ...row, alignItems: "flex-start", gap: "var(--spacing-5)" }}>
      <img src={link.qr} alt="Pairing code for your phone" width="176" height="176" style={{ flex: "none", background: "#fff", borderRadius: "var(--highlight-radius)", imageRendering: "pixelated" }} />
      <div style={{ ...stack(2), flex: "1 1 16em" }}>
        <Text display="block" style={prose}>Scan it with your phone's camera, or open this link on it:</Text>
        <Text display="block" style={mono}>{link.url}</Text>
        {link.fingerprint && <Text type="supporting" display="block" style={prose}>The certificate's fingerprint, to check on the phone: <span style={mono}>{link.fingerprint}</span></Text>}
        <Text type="supporting" display="block">It works once, for about {minutes(link.expires)} minutes. The phone then waits until you allow it here.</Text>
        <div style={row}><Button label="New code" variant="ghost" isLoading={busy} clickAction={make} /></div>
      </div>
    </div>;
  return <div style={stack(3)}>
      <Note error={error} />
      <div style={row}><Button label="Show a pairing code" variant="secondary" isLoading={busy} clickAction={make} /></div>
    </div>;
}
const STATE = { allowed: "Allowed", pending: "Waiting for you", revoked: "Removed" };
const seen = (at) => at ? new Date(at * 1e3).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export function DeviceList({ home, here, devices, onChange, onSignedOut }) {
  const [error, setError] = useState(null), [busy, setBusy] = useState(null), [asking, setAsking] = useState(null);
  const act = async (device, action) => {
    setBusy(device.id + action);
    setError(null);
    try {
      if (device.this && action === "revoke") {
        await home.signout();
        onSignedOut?.();
        return;
      }
      await home.device(device.id, action);
      setAsking(null);
      await onChange?.();
    } catch (err) {
      setError(fault(err));
    } finally {
      setBusy(null);
    }
  };
  const shown = (devices ?? []).filter((device) => device.state !== "revoked");
  if (!shown.length) return <Note>No device is paired.</Note>;
  return <div style={stack(3)}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--hairline)" }}>
        {shown.map((device) => <li key={device.id} style={{ ...row, justifyContent: "space-between", paddingBlock: "var(--spacing-3)", borderBottom: "1px solid var(--hairline)" }}>
            <div style={{ ...stack(1), flex: "1 1 14em" }}>
              <Text weight="semibold" display="block">{device.name}{device.this ? " (this one)" : ""}</Text>
              <Text type="supporting" display="block" style={{ color: device.state === "pending" ? "var(--warn)" : void 0 }}>
                {STATE[device.state] ?? device.state}{device.code ? ` · code ${device.code}` : ""} · last seen {seen(device.last_seen)}
              </Text>
            </div>
            <div style={row}>
              {device.state === "pending" && here && <Button label={`Allow (code ${device.code ?? "—"})`} variant="primary" size="sm" isLoading={busy === device.id + "allow"} clickAction={() => act(device, "allow")} />}
              {asking === device.id ? <><Button label={device.this ? "Remove and sign out" : "Remove"} variant="destructive" size="sm" isLoading={busy === device.id + "revoke"} clickAction={() => act(device, "revoke")} />
                    <Button label="Keep" variant="ghost" size="sm" onClick={() => setAsking(null)} /></> : <Button label="Remove" variant="ghost" size="sm" onClick={() => setAsking(device.id)} />}
            </div>
          </li>)}
      </ul>
      <Note error={error} />
    </div>;
}
