// The quieter screens: the digest of what changed, lessons, secret names, settings, and the phone's More list.

import { html, useEffect, useRef, useState } from './vendor/preact-htm.js';
import {
  agoText, announce, api, Busy, chooseProject, date, Icon, Inline, Label, LABELS, loadState, plural, projectName,
  Provider, SECRET_KINDS, Segmented, set, Switch, useAction, useStore, useTick,
} from './ui.js';
import { needsYou, showCard, Tray } from './cards.js';
import { ProjectList, Team } from './chat.js';
import { when } from './board.js';

// Digest: what changed, grouped by project, each line with its label and its receipt one tap away.

const WINDOWS = [['read', 'Since you looked'], ['today', 'Today'], ['week', '7 days']];
const LABEL_ORDER = ['waiting', 'stuck', 'shipped', 'verified', 'reported', 'running', 'queued', 'decided', 'learned',
  'inferred', 'expired'];

function windowStart(choice, state) {
  if (choice === 'read' && state?.read_at) return state.read_at;
  if (choice === 'week') return Date.now() / 1000 - 7 * 86400;
  return state?.since || new Date().setHours(0, 0, 0, 0) / 1000;
}

function openRef(ref) {
  if (!ref) return;
  const number = Number(ref.slice(1));
  if (ref.startsWith('#')) set({ sheet: { kind: 'task', id: number } });
  else if (ref.startsWith('D')) set({ sheet: { kind: 'card', id: number } });
  else if (ref.startsWith('L')) location.hash = '#/lessons';
}

function Counts({ counts }) {
  if (!counts) return null;
  const parts = [`asked you ${counts.asked || 0}×`, `${counts.done || 0} done`, `${counts.stuck || 0} stuck`];
  return html`<p class="digest-counts">${parts.join(' · ')}</p>`;
}

export function Digest() {
  const s = useStore();
  const state = s.state;
  const [choice, setChoice] = useState(() => (state?.read_at ? 'read' : 'today'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [run, busy, failed] = useAction();
  const since = windowStart(choice, state);
  useEffect(() => {
    const query = new URLSearchParams({ since: String(since) });
    if (s.project) query.set('project', String(s.project));
    api(`/api/digest?${query}`).then((found) => { setData(found); setError(''); }, (failure) => setError(failure.message));
  }, [choice, s.project, state?.cursor, state?.read_at]);
  const groups = new Map();
  for (const line of data?.lines || []) {
    if (line.label === 'waiting') continue;         // what needs you is shown above, as cards you can answer
    const key = line.project || 'Across projects';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  for (const lines of groups.values()) lines.sort((a, b) => LABEL_ORDER.indexOf(a.label) - LABEL_ORDER.indexOf(b.label));
  const used = LABEL_ORDER.filter((label) => [...groups.values()].some((lines) => lines.some((line) => line.label === label)));
  const { count } = needsYou();
  const read = () => run(async () => {
    await api('/api/digest/read', {});
    await loadState();
    setChoice('read');
    announce('Marked as read. The next digest starts from here.');
  });
  const needs = count > 0 && html`<aside class="digest-needs" aria-labelledby="digest-needs">
    <h2 id="digest-needs">Needs you <span class="count">${count}</span></h2>
    <${Tray} onShow=${showCard} />
  </aside>`;
  return html`<div class=${`page digest-page${needs ? ' has-needs' : ''}`}>
    <div class="page-head">
      <h1>Digest</h1>
      <${Segmented} label="Which time" value=${choice} onChange=${setChoice}
        options=${state?.read_at ? WINDOWS : WINDOWS.slice(1)} />
    </div>
    <p class="page-lede">${choice === 'read' ? `Since you last looked, ${agoText(since)}` : choice === 'week' ? 'The last seven days'
      : 'Since midnight'}${s.project ? ` · ${projectName(s.project)} only` : ''}</p>
    <div class="digest-layout">
      ${needs}
      <div class="digest-main">
        ${error ? html`<p class="error" role="alert">${error}</p>` : !data ? html`<p class="empty">Loading…</p>` : html`
          <${Counts} counts=${data.counts} />
          ${groups.size === 0 ? html`<p class="empty">Nothing changed in this window.</p>`
            : [...groups.entries()].map(([name, lines]) => html`<section class="digest-section" key=${name}>
              <h2>${name}</h2>
              <ul class="digest-lines">${lines.map((line, index) => html`<li key=${index}>
                <${Label} state=${line.label} />
                <div class="digest-line">
                  ${line.ref ? html`<button type="button" class="digest-title link-plain" onClick=${() => openRef(line.ref)}>
                    <span class="ref">${line.ref}</span> ${line.title}</button>` : html`<span class="digest-title">${line.title}</span>`}
                  <span class="digest-proof">${line.proof}</span>
                  ${line.question && html`<${Question} line=${line} />`}
                </div>
              </li>`)}</ul>
            </section>`)}
          ${used.length > 0 && html`<details class="legend">
            <summary>What the labels mean</summary>
            <dl>${used.map((label) => html`<div key=${label}><dt><${Label} state=${label} /></dt><dd>${LABELS[label]}</dd></div>`)}</dl>
          </details>`}
          <div class="digest-foot">
            <button type="button" class="button" disabled=${busy} onClick=${read}><${Icon} name="check" size=${16} /> I’ve read this</button>
            <span class="fine">${state?.read_at ? `Last marked read ${agoText(state.read_at)}.` : 'Not marked read yet.'}</span>
          </div>
          <${Busy} error=${failed} />`}
      </div>
    </div>
  </div>`;
}

// A lesson that waits for your yes, asked in the digest: one tap says yes.

function Question({ line }) {
  const [run, busy, error] = useAction();
  const [said, setSaid] = useState(false);
  const yes = () => run(async () => {
    await api(`/api/lessons/${line.ref.slice(1)}/accept`, {});
    setSaid(true);
    announce('The lesson applies from now on.');
  });
  return html`<div class="digest-question">
    <span><${Inline} text=${line.question} /></span>
    ${said ? html`<span class="fine">Yes · it applies from now on</span>`
      : html`<button type="button" class="button small" disabled=${busy} onClick=${yes}>Yes</button>`}
    <${Busy} error=${error} />
  </div>`;
}

// Lessons: what the system took from its mistakes, where each came from and whether it has helped.

const LESSON_KINDS = { rule: 'Rule', check: 'Check', guard: 'Guard', placement: 'Placement' };

// The home says where a lesson came from ("from #12 judge reject, D7 you declined"); its task and card numbers open.
function From({ text }) {
  return html`<span>${(text || '').split(/(#\d+|D\d+)/).map((part, index) => (index % 2
    ? html`<button type="button" class="link" onClick=${() => openRef(part)}>${part}</button>` : part))}</span>`;
}

function LessonRow({ lesson, onChange }) {
  const [run, busy, error] = useAction();
  const on = lesson.state === 'active';
  const toggle = (next) => run(async () => {
    const changed = await api(`/api/lessons/${lesson.id}/${next ? 'accept' : 'retire'}`, {});
    onChange(changed);
    announce(next ? 'The lesson is in use.' : 'The lesson is set aside.');
  });
  const project = projectName(lesson.project_id);
  const state = { proposed: lesson.kind === 'check' ? 'Proposed: used once it catches the mistake it came from'
    : 'Proposed: waits for your yes', retired: 'Set aside', unproven: 'Did not help; set aside' }[lesson.state];
  return html`<li class=${`lesson${on ? '' : ' is-off'}`}>
    <div class="lesson-main">
      <p class="lesson-text"><${Inline} text=${lesson.text} /></p>
      <p class="lesson-meta">
        <span>${LESSON_KINDS[lesson.kind] || lesson.kind}</span>
        <span>${project || 'Every project'}</span>
        <${From} text=${lesson.from} />
      </p>
      <p class="lesson-use">${lesson.uses ? `used ${lesson.uses}× · ${plural(lesson.first_try, 'first-try pass', 'first-try passes')}`
        : 'not used yet'}${state ? ` · ${state}` : ''}</p>
      ${lesson.question && html`<div class="digest-question">
        <span><${Inline} text=${lesson.question} /></span>
        <button type="button" class="button small" disabled=${busy} onClick=${() => toggle(true)}>Yes</button>
      </div>`}
      <${Busy} error=${error} />
    </div>
    <${Switch} on=${on} busy=${busy} label=${`Use the lesson: ${lesson.text}`} onChange=${toggle} />
  </li>`;
}

export function Lessons() {
  const s = useStore();
  const [lessons, setLessons] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/lessons').then(setLessons, (failure) => setError(failure.message)); }, [s.state?.cursor]);
  const shown = (lessons || []).filter((lesson) => !s.project || !lesson.project_id || lesson.project_id === s.project);
  const replace = (changed) => setLessons((all) => all.map((lesson) => (lesson.id === changed.id ? changed : lesson)));
  const order = { proposed: 0, active: 1, unproven: 2, retired: 3 };
  return html`<div class="page">
    <div class="page-head"><h1>Lessons</h1></div>
    <p class="page-lede">Each lesson came from a mistake: a failed check, a declined card or your correction. An active lesson
      is given to the next task it applies to; switch one off and it is no longer given. A proposed one waits for your
      yes, and a learned check is used only once it catches the mistake it came from.</p>
    ${error ? html`<p class="error" role="alert">${error}</p>` : !lessons ? html`<p class="empty">Loading…</p>`
      : shown.length === 0 ? html`<p class="empty">No lessons yet. They appear after a mistake is caught.</p>`
      : html`<ul class="lessons">${shown.slice().sort((a, b) => order[a.state] - order[b.state] || b.created - a.created)
        .map((lesson) => html`<${LessonRow} key=${lesson.id} lesson=${lesson} onChange=${replace} />`)}</ul>`}
  </div>`;
}

// Secrets: names only. A value goes in through a password field and never comes back out.

function AddSecret({ onAdded }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('none');
  const [use, setUse] = useState('env');
  const [origin, setOrigin] = useState('');
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [run, busy, error] = useAction();
  const add = (event) => {
    event.preventDefault();
    const typed = value;
    setValue('');
    run(async () => {
      const body = { name: name.trim(), kind, use, note: note.trim(), value: typed };
      if (use === 'http') body.origin = origin.trim();
      await api('/api/secrets', body);
      announce(`Saved ${name.trim()} to the vault.`);
      setName(''); setNote(''); setOrigin('');
      onAdded();
    });
  };
  return html`<form class="form secret-add" onSubmit=${add}>
    <h2>Add a secret</h2>
    <label for="secret-name">Name</label>
    <input id="secret-name" required value=${name} autocomplete="off" autocapitalize="characters" spellcheck="false"
      placeholder="OPENAI_API_KEY" pattern="[A-Z][A-Z0-9_]*" onInput=${(event) => setName(event.currentTarget.value.toUpperCase())} />
    <label id="secret-use-label">How it is used</label>
    <${Segmented} label="How it is used" value=${use} onChange=${setUse}
      options=${[['env', 'By commands'], ['http', 'By web requests']]} />
    <p class="fine">${use === 'env' ? 'Given to a command as an environment variable of this name, only when a task needs it.'
      : 'Artemis adds it itself, as Authorization: Bearer …, only to requests for this one site. Agents and commands are not handed the value.'}</p>
    ${use === 'http' && html`<label for="secret-origin">The one site</label>
      <input id="secret-origin" required value=${origin} autocomplete="off" spellcheck="false" inputmode="url"
        placeholder="https://api.example.com" onInput=${(event) => setOrigin(event.currentTarget.value)} />`}
    <label>What using it does</label>
    <${Segmented} label="What using it does" value=${kind} onChange=${setKind}
      options=${Object.entries(SECRET_KINDS)} />
    <p class="fine">${kind === 'none' ? 'Nothing beyond reading or building: no card is asked for it.'
      : kind === 'send' ? 'Using it can send something as you, so Artemis asks before what it recognises as sending.' : 'Using it can spend money, so Artemis asks every time it recognises a payment.'}</p>
    <label for="secret-note">Note <span class="optional">optional</span></label>
    <input id="secret-note" value=${note} autocomplete="off" placeholder="What it is for" onInput=${(event) => setNote(event.currentTarget.value)} />
    <label for="secret-value">Value</label>
    <input id="secret-value" type="password" required value=${value} autocomplete="off" autocapitalize="off" spellcheck="false"
      onInput=${(event) => setValue(event.currentTarget.value)} />
    <p class="fine">The value goes straight to the vault; the lead never sees it. It is kept out of the model’s context
      and replaced by [secret:NAME] in logs.</p>
    <${Busy} error=${error} />
    <div class="form-actions"><button type="submit" class="button primary" disabled=${busy || !name || !value}>Save to vault</button></div>
  </form>`;
}

function Audit() {
  const [run, busy, error] = useAction();
  const [found, setFound] = useState(null);
  const check = () => run(async () => {
    const result = await api('/api/secrets/audit');
    setFound(result);
    announce(result.found ? `Found ${plural(result.found, 'copy', 'copies')} of a stored value.` : 'No stored value found.');
  });
  return html`<div class="audit">
    <button type="button" class="button" disabled=${busy} onClick=${check}>${busy ? 'Searching…' : 'Search for leaks'}</button>
    ${found && html`<p class=${found.found ? 'warn' : 'fine'} role="status">${found.found
      ? `${plural(found.found, 'place has', 'places have')} a stored value written out, across ${plural(found.files, 'file')}. Rotate the secret and run the search again.`
      : `Searched ${plural(found.files, 'file')} Artemis wrote for ${plural(found.values, 'stored value')}: none found.`}</p>`}
    <${Busy} error=${error} />
  </div>`;
}

// Removing asks once more, in place: the value is gone for good, and only adding it again brings it back.
function RemoveSecret({ name, onRemoved }) {
  const [asking, setAsking] = useState(false);
  const [run, busy, error] = useAction();
  const keep = useRef(null);
  useEffect(() => { if (asking) keep.current?.focus(); }, [asking]);
  const remove = () => run(async () => {
    await api(`/api/secrets/${name}/remove`, {});
    announce(`Removed ${name} from the vault.`);
    await onRemoved();
  });
  if (!asking) {
    return html`<button type="button" class="button small" aria-label=${`Remove ${name}`}
      onClick=${() => setAsking(true)}>Remove</button>`;
  }
  return html`<div class="confirm" role="group" aria-label=${`Remove ${name}?`}>
    <p>Remove ${name} for good? To use it again, you add it again.</p>
    <div class="row-actions">
      <button type="button" class="button small danger" disabled=${busy} onClick=${remove}>Remove</button>
      <button type="button" class="button small" ref=${keep} disabled=${busy} onClick=${() => setAsking(false)}>Keep it</button>
    </div>
    <${Busy} error=${error} />
  </div>`;
}

export function Secrets() {
  const s = useStore();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/api/secrets').then((found) => { setList(found); setError(''); }, (failure) => setError(failure.message));
  useEffect(() => { load(); }, [s.state?.cursor]);
  const vault = s.state?.vault;
  return html`<div class="page">
    <div class="page-head"><h1>Secrets</h1><${Audit} /></div>
    <p class="page-lede">Names and what they are for. Values go into the encrypted vault: the App never shows them again,
      and what Artemis records is scrubbed of them.</p>
    ${vault?.notice && html`<p class="notice">${vault.notice}</p>`}
    ${error ? html`<p class="error" role="alert">${error}</p>` : !list ? html`<p class="empty">Loading…</p>`
      : list.length === 0 ? html`<p class="empty">No secrets yet.</p>`
      : html`<table class="secrets">
        <caption class="visually-hidden">Stored secrets, names only</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Used by</th><th scope="col">Kind</th><th scope="col">Last used</th>
          <th scope="col"><span class="visually-hidden">Remove</span></th></tr></thead>
        <tbody>${list.map((item) => html`<tr key=${item.name}>
          <th scope="row"><code class="name">${item.name}</code>${item.note && html`<span class="fine">${item.note}</span>`}</th>
          <td>${item.use === 'http' ? html`web requests to <span class="origin">${item.origin}</span>` : 'commands'}</td>
          <td>${SECRET_KINDS[item.kind] || item.kind}</td>
          <td>${item.last_used ? html`${agoText(item.last_used)} <span class="fine">${plural(item.uses, 'use')}</span>` : 'never'}</td>
          <td class="secret-remove"><${RemoveSecret} name=${item.name} onRemoved=${load} /></td>
        </tr>`)}</tbody>
      </table>`}
    <${AddSecret} onAdded=${load} />
  </div>`;
}

// Settings: how it looks, this device and the others, standing approvals, the agents and the schedules.

const THEMES = [['system', 'Match the system'], ['light', 'Light'], ['dark', 'Dark']];

export function applyTheme(choice = localStorage.getItem('artemis.theme') || 'system') {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

function Appearance() {
  const [theme, setTheme] = useState(() => localStorage.getItem('artemis.theme') || 'system');
  const pick = (choice) => { localStorage.setItem('artemis.theme', choice); applyTheme(choice); setTheme(choice); };
  return html`<section class="settings-section" aria-labelledby="set-look">
    <h2 id="set-look">Appearance</h2>
    <${Segmented} label="Appearance" value=${theme} onChange=${pick} options=${THEMES} />
  </section>`;
}

function Pair() {
  const [link, setLink] = useState(null);
  const [run, busy, error] = useAction();
  useTick(15000);
  const make = () => run(async () => setLink(await api('/api/pair/new', {})));
  const live = link && link.expires * 1000 > Date.now();
  return html`<div class="pair">
    ${!live ? html`<button type="button" class="button" disabled=${busy} onClick=${make}><${Icon} name="link" size=${16} /> Pair a phone or another computer</button>
      <p class="fine">Makes a link that works once, for ten minutes.</p>`
      : html`<div class="pair-link">
        <img src=${link.qr} width="180" height="180" alt="QR code of the pairing link" />
        <div>
          <p>Scan it with the phone’s camera, or open the link there.</p>
          <p class="mono-wrap"><code>${link.url}</code></p>
          ${link.fingerprint && html`<p class="fine">If the browser warns about the certificate, check that it shows this
            fingerprint before continuing: <code class="mono-wrap">${link.fingerprint}</code></p>`}
          ${!link.lan && html`<p class="fine">Artemis is serving this computer only. To reach it from a phone on the
            same network, start it again with <code>artemis serve --lan</code>.</p>`}
          <p class="fine">The new device then shows a 4-digit code; allow it here only if the codes match.
            The link stops working in ${Math.max(1, Math.round((link.expires * 1000 - Date.now()) / 60000))} min.</p>
        </div>
      </div>`}
    <${Busy} error=${error} />
  </div>`;
}

function Devices({ devices, onChange }) {
  const s = useStore();
  const [run, busy, error] = useAction();
  const act = (device, action) => run(async () => {
    await api(`/api/devices/${device.id}/${action}`, {});
    await Promise.all([onChange(), loadState()]);
    announce(action === 'allow' ? `${device.name} can use Artemis now.` : `${device.name} was removed.`);
  });
  const signOut = () => run(async () => {
    await api('/api/signout', {});
    set({ auth: 'unpaired', state: null });
  });
  const shown = devices.filter((device) => device.state !== 'revoked');
  return html`<ul class="devices">${shown.map((device) => html`<li key=${device.id}>
    <div>
      <p class="device-name">${device.name}${device.this && html` <span class="fine">this device${s.state?.loopback ? ', on the computer Artemis runs on' : ''}</span>`}</p>
      <p class="fine">${device.state === 'pending' ? `waiting to be allowed${device.code ? ` · code ${device.code}` : ''}`
        : `last seen ${device.last_seen ? agoText(device.last_seen) : 'never'}`}${device.phone ? ' · phone' : ''}</p>
    </div>
    <div class="row-actions">
      ${device.state === 'pending' && s.state?.loopback && html`<button type="button" class="button primary" disabled=${busy}
        onClick=${() => act(device, 'allow')}>Allow</button>`}
      ${device.this ? html`<button type="button" class="button" disabled=${busy} onClick=${signOut}>Sign out</button>`
        : html`<button type="button" class="button" disabled=${busy} onClick=${() => act(device, 'revoke')}>
        ${device.state === 'pending' ? 'Deny' : 'Remove'}</button>`}
    </div>
  </li>`)}</ul><${Busy} error=${error} />`;
}

function standingWhat(item) {
  if (item.url) return `${item.method} ${item.url}`;
  return (item.argv || []).join(' ');
}

const tail = (path) => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path;
};

function Standing({ items, onChange }) {
  const [run, busy, error] = useAction();
  const revoke = (item) => run(async () => {
    await api(`/api/standing/${item.id}/revoke`, {});
    await onChange();
    announce('Revoked. It is asked again next time.');
  });
  if (!items.length) {
    return html`<p class="empty">None. An approval card for sending or deleting can be approved for good, for that exact
      operation only; it shows up here.</p>`;
  }
  return html`<ul class="standing">${items.map((item) => html`<li key=${item.id}>
    <div>
      <p>${item.what || standingWhat(item)}</p>
      <p class="command"><code>${standingWhat(item)}</code></p>
      <p class="fine" title=${item.cwd || ''}>${[item.cwd && `in ${tail(item.cwd)}`, item.secret && `with ${item.secret}`,
        item.schedule ? `for “${item.schedule}”` : 'any time', `since ${date(item.created)}`]
        .filter(Boolean).join(' · ')}</p>
    </div>
    <button type="button" class="button" disabled=${busy} onClick=${() => revoke(item)}>Revoke</button>
  </li>`)}</ul><${Busy} error=${error} />`;
}

const STATUS = {
  live: ['good', 'Tested here'],
  contract: ['plain', 'Built to its documented interface'],
  unqualified: ['quiet', 'Not qualified yet'],
};

function Adapters({ rows }) {
  if (!rows.length) {
    return html`<p class="empty">No agent has been qualified on this computer yet. To see how each one did,
      run <code>artemis doctor providers</code>.</p>`;
  }
  return html`<table class="adapters">
    <caption class="visually-hidden">Agents and how far each is qualified</caption>
    <thead><tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Version</th></tr></thead>
    <tbody>${rows.map((row) => {
      const [tone, said] = STATUS[row.status] || ['plain', row.status];
      return html`<tr key=${`${row.provider}-${row.role}`}>
        <th scope="row"><${Provider} name=${row.provider} /></th>
        <td>${row.role}</td>
        <td><span class=${`label tone-${tone}`}><i aria-hidden="true"></i>${said}</span>
          ${row.receipt && html`<span class="fine receipt">${row.receipt}</span>`}</td>
        <td><span class="mono">${row.version || '—'}</span></td>
      </tr>`;
    })}</tbody>
  </table>`;
}

function Schedules({ rows }) {
  if (!rows.length) return html`<p class="empty">Nothing runs on a schedule. Ask the lead for something recurring.</p>`;
  return html`<ul class="schedule-list">${rows.map((row) => html`<li key=${row.id} class=${row.active ? '' : 'is-off'}>
    <span>${row.title}</span>
    <span class="fine">${row.project || 'every project'} · ${row.spec}${row.active && row.next_at ? ` · next ${when(row.next_at)}` : row.active ? '' : ' · paused'}</span>
  </li>`)}</ul>`;
}

const KEYS = [['/', 'Write to the lead'], ['g c', 'Chat'], ['g b', 'Board'], ['g d', 'Digest'], ['Esc', 'Close a panel'],
  ['Enter', 'Send (Shift+Enter for a new line)']];

export function Settings() {
  const s = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/api/settings').then((found) => { setData(found); setError(''); }, (failure) => setError(failure.message));
  useEffect(() => { load(); }, [s.state?.cursor]);
  return html`<div class="page settings">
    <div class="page-head"><h1>Settings</h1></div>
    <${Appearance} />
    <section class="settings-section" aria-labelledby="set-devices">
      <h2 id="set-devices">Devices</h2>
      ${s.state?.loopback && html`<${Pair} />`}
      ${data && html`<${Devices} devices=${data.devices} onChange=${load} />`}
    </section>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    ${data && html`
      <section class="settings-section" aria-labelledby="set-standing">
        <h2 id="set-standing">Approved for good</h2>
        <${Standing} items=${data.standing} onChange=${load} />
      </section>
      <section class="settings-section" aria-labelledby="set-team">
        <h2 id="set-team">Agents</h2>
        <${LeadPick} lead=${data.lead} onChange=${load} />
        <${Team} state=${s.state} />
        <${Adapters} rows=${data.adapters} />
      </section>
      <section class="settings-section" aria-labelledby="set-schedules">
        <h2 id="set-schedules">Schedules</h2>
        <${Schedules} rows=${data.schedules} />
      </section>`}
    <section class="settings-section" aria-labelledby="set-keys">
      <h2 id="set-keys">Keyboard</h2>
      <dl class="keys">${KEYS.map(([key, what]) => html`<div key=${key}><dt><kbd>${key}</kbd></dt><dd>${what}</dd></div>`)}</dl>
    </section>
    <section class="settings-section" aria-labelledby="set-about">
      <h2 id="set-about">About</h2>
      <p>Artemis ${data?.version || s.state?.version}${data?.lan ? ` · on the network as ${data.lan}` : ' · this computer only'}</p>
      <p class="fine">Agents run as you, on this computer. Artemis asks before what it recognises as spending money,
        deleting for good or sending something as you, and keeps secret values out of the model’s context.</p>
      <p class="fine">Made with <a href="/vendor/LICENSE-preact.txt">Preact</a> (MIT)
        and <a href="/vendor/LICENSE-htm.txt">htm</a> (Apache-2.0); each name opens its licence.</p>
    </section>
  </div>`;
}

// Who leads: Automatic or one agent, written to the [agents] lead line of config.toml. The next answer comes from
// the one chosen, with no restart. An agent that cannot lead here is shown with the reason, and cannot be picked.
function LeadPick({ lead, onChange }) {
  const [run, busy, error] = useAction();
  if (!lead) return null;
  const pick = (name) => run(async () => {
    try {
      const now = await api('/api/settings/lead', { lead: name });
      announce(`${now.label} leads from the next answer.`);
    } finally {
      await Promise.all([onChange(), loadState()]);
    }
  });
  const option = (name, label, why, note) => html`<label key=${name} class=${`lead-option${why ? ' is-off' : ''}`}>
    <input type="radio" name="lead" value=${name} checked=${lead.chosen === name}
      disabled=${busy || lead.fixed || (Boolean(why) && lead.chosen !== name)} onChange=${() => pick(name)} />
    <span class="lead-name">${label}</span>
    ${(why || note) && html`<span class="lead-why"><${Inline} text=${why || note} /></span>`}
  </label>`;
  return html`<fieldset class="lead-pick">
    <legend>Who leads</legend>
    <p class="fine">${lead.fixed
      ? 'ARTEMIS_LEAD was set when Artemis started, so it decides. Start Artemis without it to choose here.'
      : 'The next answer comes from the one you pick.'}</p>
    ${option('auto', 'Automatic', null, lead.chosen === 'auto'
      ? `${lead.label} now: the first of Claude Code, Codex and the mock that can lead here`
      : 'The first of Claude Code, Codex and the mock that can lead here')}
    ${lead.choices.map((choice) => option(choice.provider, choice.label, choice.why,
      lead.chosen === choice.provider && 'Leads now'))}
    <${Busy} error=${error} />
  </fieldset>`;
}

// More, on a phone: the screens that do not fit in the tab bar, and the projects.

export function More() {
  const s = useStore();
  const links = [['#/lessons', 'lesson', 'Lessons', `${(s.state?.lessons || []).length} in use`],
    ['#/secrets', 'key', 'Secrets', 'Names only'], ['#/settings', 'settings', 'Settings', 'Devices, agents, schedules']];
  return html`<div class="page more">
    <h1 class="visually-hidden">More</h1>
    <ul class="more-links">${links.map(([href, icon, title, sub]) => html`<li key=${href}><a href=${href}>
      <${Icon} name=${icon} /><span>${title}</span><span class="fine">${sub}</span><${Icon} name="chevron" size=${16} /></a></li>`)}</ul>
    <section class="settings-section"><h2>Projects</h2>
      <${ProjectList} onPick=${(id) => { chooseProject(s.project === id ? null : id); location.hash = '#/board'; }} /></section>
    <section class="settings-section"><h2>Team</h2><${Team} state=${s.state} /></section>
  </div>`;
}
