// Cards: the only way anything is put to the person. Approval (money out, irreversible delete, send as you),
// choice and secret cards, shown inline in the conversation and in the "Needs you" tray.

import { html, useState } from './vendor/preact-htm.js';
import {
  api, ago, announce, Busy, CARD_KINDS, chooseProject, Icon, Label, loadMessages, loadState, loadUpdates, projectName,
  SECRET_KINDS, set, store, useAction,
} from './ui.js';

const APPROVAL = ['money out', 'irreversible delete', 'send as you'];

// Everything that waits for the person: devices asking to be let in, then cards. The header's count, the tray and
// the Digest's list all read this one place, so they always show the same number.
export function needsYou() {
  const devices = store.state?.devices_waiting || [];
  const cards = (store.state?.cards || []).filter((card) => card.state === 'waiting');
  return { devices, cards, count: devices.length + cards.length };
}

function patchCard(card) {
  set((s) => ({
    state: { ...s.state, cards: s.state.cards.map((item) => (item.id === card.id ? card : item)) },
    messages: s.messages.map((message) => (message.card_id === card.id ? { ...message, card } : message)),
    updates: s.updates.map((event) => (event.card && event.card.id === card.id ? { ...event, card } : event)),
  }));
}

function refresh() {
  return Promise.all([loadState(), loadMessages(), loadUpdates()]).catch(() => {});
}

function shortPath(path) {
  if (!path) return '';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path;
}

function until(seconds) {
  const minutes = Math.round((seconds - Date.now() / 1000) / 60);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

export function Card({ card, compact = false, onShow }) {
  const [run, busy, error] = useAction();
  const project = projectName(card.project_id);
  const titleId = `card-${card.id}-${compact ? 'tray' : 'thread'}`;
  const act = (action, body = {}) => run(async () => {
    try {
      const updated = await api(`/api/cards/${card.id}/${action}`, body);
      patchCard(updated);
      announce(action === 'decline' ? 'Declined. Nothing runs.' : 'Answered.');
    } catch (failure) {
      if (failure.status === 409) refresh();
      throw failure;
    }
  });
  return html`<article class=${`card kind-${card.kind.split(' ')[0]}${compact ? ' is-compact' : ''}`}
      aria-labelledby=${titleId}>
    <div class="card-meta">
      <span class="card-kind">${CARD_KINDS[card.kind]}</span>
      ${project && html`<span>${project}</span>`}
      <time datetime=${new Date(card.created * 1000).toISOString()}>${ago(card.created)}</time>
      ${card.state === 'waiting' && card.expires && html`<span>expires in ${until(card.expires)}</span>`}
    </div>
    <h3 id=${titleId}>${card.what}</h3>
    ${card.command && html`<div class="command">
      <code>${card.command}</code>
      ${(card.cwd || card.rule) && html`<div class="command-where">${[card.cwd && `in ${shortPath(card.cwd)}`,
        card.rule && `matched ${card.rule}`].filter(Boolean).join(' · ')}</div>`}
    </div>`}
    ${card.request && html`<div class="command">
      <code>${card.request.method} ${card.request.url}</code>
      <div class="command-where">${[card.receiver && `${card.receiver} on this computer (it stands in for the real address)`,
        'sent by Artemis itself', card.request.save_to && `the answer is saved to ${shortPath(card.request.save_to)}`]
        .filter(Boolean).join(' · ')}</div>
    </div>`}
    ${card.state === 'waiting' ? html`
      ${APPROVAL.includes(card.kind) && html`<${Approval} card=${card} compact=${compact} busy=${busy} act=${act} />`}
      ${card.kind === 'choice' && html`<${Choice} card=${card} busy=${busy} act=${act} />`}
      ${card.kind === 'secret' && html`<${Secret} card=${card} compact=${compact} />`}
      <${Busy} error=${error} />
      ${compact && onShow && html`<button type="button" class="link" onClick=${() => onShow(card)}>
        Show where it came up</button>`}
    ` : html`<${Outcome} card=${card} />`}
  </article>`;
}

function Evidence({ task }) {
  return html`<span class="card-evidence"><${Label} state=${task.label} />
    <button type="button" class="link" onClick=${() => set({ sheet: { kind: 'task', id: task.id } })}>${task.title}</button>
    ${task.proof && html`<span class="fine">${task.proof}</span>`}</span>`;
}

function Approval({ card, compact, busy, act }) {
  const [standing, setStanding] = useState(false);
  const phone = Boolean(store.me?.device?.phone);
  const blocked = card.phone_only && !phone;
  const names = card.secrets.map((name) => html`<code class="name">${name}</code> `);
  return html`
    ${compact ? html`<p class="why">${card.why}</p>` : html`<dl class="facts">
      <div><dt>Why it’s yours</dt><dd>${card.why}</dd></div>
      ${card.task && html`<div><dt>Evidence so far</dt><dd><${Evidence} task=${card.task} /></dd></div>`}
      <div><dt>Secrets it uses</dt><dd>${card.secrets.length ? names : 'None'}</dd></div>
      <div><dt>If you do nothing</dt><dd>Nothing happens. It waits here.</dd></div>
    </dl>`}
    ${compact && card.secrets.length > 0 && html`<p class="fine">Uses ${names}</p>`}
    <div class="card-actions">
      <button type="button" class="button primary" disabled=${busy || blocked}
        onClick=${() => act('approve', standing ? { standing: true } : {})}>${standing ? 'Approve for good' : 'Approve'}</button>
      <button type="button" class="button" disabled=${busy} onClick=${() => act('decline')}>Decline</button>
    </div>
    ${blocked && html`<p class="fine">Payments are approved on your paired phone. You can decline it here.</p>`}
    ${card.allow_standing && !compact && html`<label class="check">
      <input type="checkbox" checked=${standing} onChange=${(event) => setStanding(event.currentTarget.checked)} />
      <span>Always for this exact operation <span class="fine">${card.request ? 'Only this request to this address'
        : 'Only this command, in this folder'}${card.secrets.length ? ', with this secret' : ''}.
          You can revoke it in Settings.</span></span></label>`}
    ${card.kind === 'money out' && !blocked && html`<p class="fine">Money out is asked every time, one card per payment.</p>`}
    ${compact && html`<p class="fine">If you do nothing, nothing happens.</p>`}`;
}

function Choice({ card, busy, act }) {
  return html`<p class="why">${card.why}</p>
    <div class="options" role="group" aria-label="Options">
      ${(card.options || []).map((option) => html`<button type="button" class="button option" disabled=${busy}
        onClick=${() => act('choose', { option: option.id })}>${option.label}</button>`)}
    </div>`;
}

function Secret({ card, compact }) {
  const wanted = card.options || {};
  const [value, setValue] = useState('');
  const [run, busy, error] = useAction();
  const save = (event) => {
    event.preventDefault();
    const typed = value;
    setValue('');
    run(async () => {
      const updated = await api(`/api/cards/${card.id}/secret`, { value: typed });
      patchCard(updated);
      announce(`Saved ${wanted.name} to the vault.`);
    });
  };
  const field = `secret-${card.id}-${compact ? 'tray' : 'thread'}`;
  return html`${!compact && html`<p class="why">${card.why}</p>`}
    <p class="secret-name"><code class="name">${wanted.name}</code>
      <span>${SECRET_KINDS[wanted.kind] || wanted.kind}</span>
      ${wanted.origin && html`<span>only to ${wanted.origin}</span>`}
      ${wanted.note && html`<span>${wanted.note}</span>`}</p>
    <form class="secret-form" onSubmit=${save}>
      <label class="visually-hidden" for=${field}>Value for ${wanted.name}</label>
      <input id=${field} type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Paste the value" value=${value} onInput=${(event) => setValue(event.currentTarget.value)} />
      <button type="submit" class="button primary" disabled=${busy || !value}>Save to vault</button>
    </form>
    <${Busy} error=${error} />
    <p class="fine">The value goes straight to the vault; the lead never sees it.</p>`;
}

function Outcome({ card }) {
  const [open, setOpen] = useState(false);
  const chosen = card.kind === 'choice' && (card.options || []).find((option) => option.id === card.answer);
  const said = {
    approved: 'You approved it. It runs once, now.',
    running: 'You approved it. Running now.',
    done: card.kind === 'secret' ? `Saved to the vault as ${card.options?.name}.`
      : chosen ? `You chose “${chosen.label}”.` : 'You approved it. Done.',
    failed: 'You approved it. It failed.',
    unknown: 'You approved it, and the home stopped while it ran. The outcome is unknown; it is not retried by itself.',
    declined: 'You declined. Nothing ran.',
    expired: 'Expired before you answered. Nothing ran.',
  }[card.state];
  const quiet = card.state === 'declined' || card.state === 'expired';
  return html`<div class=${`outcome state-${card.state}`}>
    <p><${Icon} name=${quiet ? 'cross' : 'check'} size=${16} /> ${said}</p>
    ${card.result && html`<button type="button" class="link" aria-expanded=${open} onClick=${() => setOpen(!open)}>
      ${open ? 'Hide the output' : 'Show the output'}</button>
      ${open && html`<pre class="output">${card.result}</pre>`}`}
  </div>`;
}

function DeviceCard({ device }) {
  const [run, busy, error] = useAction();
  const local = store.state?.loopback;
  const act = (action) => run(async () => {
    await api(`/api/devices/${device.id}/${action}`, {});
    await loadState();
    announce(action === 'allow' ? `${device.name} can use Artemis now.` : `${device.name} was turned away.`);
  });
  return html`<article class="card kind-device is-compact" aria-labelledby=${`device-${device.id}`}>
    <div class="card-meta"><span class="card-kind">A new device</span><span>${ago(device.created)}</span></div>
    <h3 id=${`device-${device.id}`}>${device.name} wants access</h3>
    ${local ? html`
      <p class="why">Allow it only if its screen shows this code.</p>
      <p class="code" aria-label=${`Code ${device.code.split('').join(' ')}`}>${device.code}</p>
      <div class="card-actions">
        <button type="button" class="button primary" disabled=${busy} onClick=${() => act('allow')}>Allow</button>
        <button type="button" class="button" disabled=${busy} onClick=${() => act('revoke')}>Deny</button>
      </div>` : html`<p class="why">Allow it in the App on the computer Artemis runs on, after comparing the code.</p>
      <div class="card-actions"><button type="button" class="button" disabled=${busy} onClick=${() => act('revoke')}>Deny</button></div>`}
    <${Busy} error=${error} />
  </article>`;
}

// What waits for an answer, from every project: a choice of project narrows the conversation, not what needs you.
export function Tray({ onShow }) {
  const { devices, cards } = needsYou();
  if (!devices.length && !cards.length) {
    return html`<p class="empty">Nothing needs you. Work that needs no decision keeps going.</p>`;
  }
  return html`<div class="tray">${devices.map((device) => html`<${DeviceCard} key=${device.id} device=${device} />`)}
    ${cards.map((card) => html`<${Card} key=${card.id} card=${card} compact onShow=${onShow} />`)}</div>`;
}

export function showCard(card) {
  set({ sheet: null });
  // A card lives in its own project's thread: narrowed to another project, the conversation moves to the card's.
  if (store.project && card.project_id && store.project !== card.project_id) chooseProject(card.project_id);
  location.hash = '#/';
  const until = Date.now() + 2000;      // the thread may still be loading that project's lines
  const look = () => {
    const found = document.getElementById(`card-${card.id}-thread`)?.closest('.card');
    if (!found) {
      if (Date.now() < until) setTimeout(look, 80);
      return;
    }
    found.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    found.classList.add('is-called');
    setTimeout(() => found.classList.remove('is-called'), 1600);
  };
  setTimeout(look, 80);
}
