// Shared pieces of the Artemis App: the store, the API client, words for the ledger's states, icons and controls.

import { html, useEffect, useReducer, useRef, useState } from './vendor/preact-htm.js';

export { html };

// The store: one object, replaced field by field; views re-render when it changes.

const listeners = new Set();
export const store = {
  auth: 'checking',          // checking | paired | waiting | unpaired | pairing
  state: null,               // GET /api/state
  messages: [],
  updates: [],
  drafts: {},                // turn -> streamed text of a reply in progress
  waitingReply: 0,           // the id of the person's message the lead has not answered yet
  live: 'connecting',        // connecting | live | reconnecting
  projects: {},              // id -> GET /api/projects/{id}
  sheet: null,               // {kind: 'task', id} | {kind: 'tray'} | {kind: 'project'}
  me: null,                  // GET /api/me: this device
  project: Number(localStorage.getItem('artemis.project')) || null,
  announce: '',
  stamp: 0,
};

export function set(patch) {
  Object.assign(store, typeof patch === 'function' ? patch(store) : patch);
  store.stamp += 1;
  listeners.forEach((listener) => listener());
}

export function useStore() {
  const [, render] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    listeners.add(render);
    return () => listeners.delete(render);
  }, []);
  return store;
}

export function chooseProject(id) {
  localStorage.setItem('artemis.project', id ? String(id) : '');
  set({ project: id || null });
}

export function announce(text) {
  set({ announce: '' });
  setTimeout(() => set({ announce: text }), 50);
}

// The API: same origin, the session cookie rides along; an error carries the home's own sentence. Every write
// carries a request id, so a write retried after a dropped connection is done once.

function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function api(path, body, id = requestId()) {
  const options = { credentials: 'same-origin', cache: 'no-store' };
  if (body !== undefined) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json', 'X-Request-Id': id };
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch (failure) {
    if (body === undefined) throw new Error('The home did not answer. Is Artemis still running?');
    response = await fetch(path, options).catch(() => null);   // the same id: done once even if the first arrived
    if (!response) throw new Error('The home did not answer. Is Artemis still running?');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/pair') set({ auth: 'unpaired' });
    if (response.status === 403 && data.waiting) set({ auth: 'waiting' });
    const error = new Error(data.error || `The home answered ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// Time, in the few shapes the App uses.

export function ago(seconds) {
  const minutes = Math.round((Date.now() / 1000 - seconds) / 60);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

// The words are English, so dates are too: "Fri 27 Nov", and a 24-hour clock that reads the same everywhere.
// "5 min ago", or "just now"; ago() alone is the short form a card's corner uses.
export const agoText = (seconds) => (ago(seconds) === 'now' ? 'just now' : `${ago(seconds)} ago`);

export function clock(seconds) {
  const date = new Date(seconds * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function date(seconds, long = false) {
  return new Date(seconds * 1000).toLocaleDateString('en-GB', long
    ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
}

export function day(seconds) {
  const date = new Date(seconds * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function useTick(ms = 30000) {
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  }, [ms]);
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// Words for what the ledger records.

// The home names its agents (state.agents); a name it does not know is shown as it is.
export const providerLabel = (name) => store.state?.agents?.[name] || name || 'unassigned';

export const LABELS = {
  shipped: 'Landed on the target branch after its checks passed again there. A receipt is saved.',
  verified: 'A judge that is not the worker read the evidence and passed it.',
  reported: 'The worker says it is done. Nobody has checked it yet.',
  running: 'A worker is on it now.',
  queued: 'Waiting for a free worker.',
  stuck: 'It did not pass. The lead decides the next try; you are not asked unless it needs you.',
  waiting: 'A card is waiting for your answer.',
  expired: 'A card nobody answered in time. Nothing ran.',
  decided: 'You answered a card, and this is what came of it.',
  learned: 'A lesson taken from a mistake. It changes what the next task is given.',
  inferred: 'The lead’s own reading, not checked evidence.',
};

export const TONES = {
  shipped: 'good', verified: 'good', reported: 'plain', running: 'accent', queued: 'quiet', stuck: 'warn',
  waiting: 'accent', decided: 'plain', learned: 'accent', inferred: 'quiet', dropped: 'quiet', expired: 'quiet',
};

export const CARD_KINDS = {
  'money out': 'Spends money',
  'irreversible delete': 'Deletes for good',
  'send as you': 'Sends as you',
  choice: 'Your choice',
  secret: 'A secret',
};

export const SECRET_KINDS = { none: 'Plain', send: 'Sends as you', spend: 'Spends money' };

export function projectName(id) {
  const found = store.state?.projects.find((project) => project.id === id);
  return found ? found.name : null;
}

// Icons: one hand-drawn set, 1.5 stroke on a 20 grid, coloured by the text around them.

const PATHS = {
  chat: 'M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5A1.5 1.5 0 0 1 16 15H9l-3.5 3v-3H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Z',
  board: 'M3.5 4.5h3.5v11H3.5zM8.25 4.5h3.5v7h-3.5zM13 4.5h3.5v9H13z',
  digest: 'M4 5.5h12M4 9h12M4 12.5h8M4 16h5',
  more: 'M4.5 10a1 1 0 1 0 2 0a1 1 0 1 0-2 0M9 10a1 1 0 1 0 2 0a1 1 0 1 0-2 0M13.5 10a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  stop: 'M6 6h8v8H6z',
  play: 'M7 5.5v9l7.5-4.5z',
  chevron: 'M6 8l4 4 4-4',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  cross: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  plus: 'M10 4.5v11M4.5 10h11',
  send: 'M10 15.5v-11M5.5 9l4.5-4.5L14.5 9',
  key: 'M7 3.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7ZM9.5 9.5L16 16M13 13l1.75-1.75M15 15l1.5-1.5',
  lesson: 'M5 3.5h8.5A1.5 1.5 0 0 1 15 5v11.5l-5-2.5-5 2.5z',
  settings: 'M4 6h7M14 6h2M4 14h2M9 14h7M11 4v4M7 12v4',
  undo: 'M7.5 6L4.5 9l3 3M4.5 9h7a4 4 0 0 1 0 8h-2',
  link: 'M8.5 11.5l3-3M7 9.5L5.5 11a2.5 2.5 0 0 0 3.5 3.5l1.5-1.5M13 10.5l1.5-1.5A2.5 2.5 0 0 0 11 5.5L9.5 7',
};

export function Icon({ name, size = 18, label }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden=${label ? undefined : 'true'}
    role=${label ? 'img' : undefined} aria-label=${label}><path d=${PATHS[name]} /></svg>`;
}

export function Mark({ size = 22 }) {
  return html`<svg class="mark" width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M14.29 5.13A11 11 0 1 0 26.23 20.05A9.6 9.6 0 0 1 14.29 5.13Z" fill="currentColor" /></svg>`;
}

// Small controls.

export function Label({ state, children }) {
  return html`<span class=${`label tone-${TONES[state] || 'plain'}`}><i aria-hidden="true"></i>${children || state}</span>`;
}

export function Provider({ name }) {
  if (!name) return null;
  return html`<span class=${`provider${name === 'mock' ? ' is-mock' : ''}`}>${providerLabel(name)}</span>`;
}

export function Segmented({ value, options, onChange, label }) {
  return html`<div class="segmented" role="radiogroup" aria-label=${label}>
    ${options.map(([key, text]) => html`<button type="button" role="radio" aria-checked=${value === key}
      class=${value === key ? 'is-on' : ''} onClick=${() => onChange(key)}>${text}</button>`)}
  </div>`;
}

export function Switch({ on, onChange, label, busy }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${on} aria-label=${label}
    disabled=${busy} onClick=${() => onChange(!on)}><i aria-hidden="true"></i></button>`;
}

export function Busy({ error }) {
  return error ? html`<p class="error" role="alert">${error}</p>` : null;
}

// A sheet: a side panel on wide screens and a bottom sheet on phones; Esc closes it and focus returns.

export function Sheet({ title, onClose, children, wide }) {
  const panel = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.querySelector('h2')?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before && before.focus) before.focus();
    };
  }, []);
  return html`<div class="sheet-layer" onClick=${(event) => event.target === event.currentTarget && onClose()}>
    <section class=${`sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title} ref=${panel}>
      <header class="sheet-head">
        <h2 tabindex="-1">${title}</h2>
        <button type="button" class="icon-button" onClick=${onClose} aria-label="Close"><${Icon} name="cross" /></button>
      </header>
      <div class="sheet-body">${children}</div>
    </section>
  </div>`;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      return await work();
    } catch (failure) {
      setError(failure.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy, error, setError];
}

// One ledger event as a quiet line: the state it reads as (for its colour) and a sentence.

const quote = (title) => (title ? `“${title}”` : 'a task');
const before = (text, mark) => (text || '').split(mark)[0];

export function describe(event) {
  const { kind, detail, title } = event;
  const task = quote(title);
  switch (kind) {
    case 'project.added': return ['plain', `Added the project ${before(detail, ' (')}`];
    case 'task': return ['queued', `New task ${quote(before(detail, ' ['))}`];
    case 'started': return ['running', `${providerLabel(before(detail, ' '))} started ${task}`];
    case 'reported': return ['reported', `${task} reported done, not checked yet`];
    case 'pass': return ['verified', `${task} passed the judge`];
    case 'reject': return ['stuck', `${task} did not pass: ${detail}`];
    case 'red': return ['stuck', `${task} failed its checks on the target: ${detail}`];
    case 'stale': return ['plain', `${task} is checked again: the target moved`];
    case 'applied': return ['shipped', `${task} shipped: ${detail}`];
    case 'stuck': return ['stuck', `${task} is stuck: ${detail}`];
    case 'stopped': return ['quiet', `${task} stopped: ${detail}`];
    case 'dropped': return ['quiet', `${task} dropped: ${detail}`];
    case 'card.opened': return ['waiting', `Asked you: ${before(detail, ' (')}`];
    case 'card.approved': return ['decided', `You approved: ${detail}`];
    case 'card.declined': return ['decided', `You declined: ${detail}`];
    case 'card.answered': return ['decided', `You chose: ${detail}`];
    case 'card.done': return ['decided', `The step you approved finished: ${detail}`];
    case 'card.failed': return ['stuck', `The step you approved failed: ${detail}`];
    case 'card.unknown': return ['stuck', 'The step you approved has an unknown outcome; it is not retried'];
    case 'card.expired': return ['expired', `Expired before you answered: ${detail}. Nothing ran`];
    case 'device.pending': return ['waiting', `${detail}`];
    case 'device.allowed': return ['decided', `You allowed ${detail}`];
    case 'device.revoked': return ['decided', `Removed ${detail}`];
    case 'standing.revoked': return ['decided', 'You revoked a standing approval'];
    case 'secret.set': return ['decided', `${detail} is in the vault`];
    case 'secret.requested': return ['waiting', `Asked for the secret ${detail}`];
    case 'run.held': return ['waiting', `Held for your answer: ${detail}`];
    case 'run.denied': return ['quiet', `Refused: ${detail}`];
    case 'lesson.added': return ['learned', `Proposed a lesson: ${detail}`];
    case 'lesson.active': return ['learned', `Learned: ${detail}`];
    case 'lesson.retired': return ['quiet', `Retired a lesson: ${detail}`];
    case 'lesson.unproven': return ['quiet', `A lesson did not help and was set aside: ${detail}`];
    case 'schedule.fired': return ['queued', `A scheduled task started: ${detail}`];
    case 'schedule.late': return ['queued', `A scheduled task started late: ${detail}`];
    case 'review': return ['plain', `${task}: ${detail}`];
    case 'undo': return ['plain', `Undone: ${detail}`];
    case 'halt': return ['quiet', detail ? `You stopped everything: ${detail}` : 'You stopped everything'];
    case 'resume': return ['quiet', 'You resumed'];
    case 'lead.switched': return ['quiet', detail];
    default: return ['plain', detail || kind];
  }
}

// Loading from the home. Each loader replaces one part of the store.

export async function loadState() {
  const state = await api('/api/state');
  set({ state, auth: 'paired' });
  return state;
}

export async function loadMessages() {
  const messages = await api('/api/messages');
  const said = new Set(messages.map((message) => message.turn).filter(Boolean));
  const drafts = Object.fromEntries(Object.entries(store.drafts).filter(([turn]) => !said.has(turn)));
  const answered = store.waitingReply && messages.some((message) =>
    message.role !== 'you' && message.id > store.waitingReply);
  set({ messages, drafts, waitingReply: answered ? 0 : store.waitingReply });
}

export async function loadUpdates() {
  set({ updates: await api('/api/updates?limit=400') });
}

export async function loadProjects() {
  const ids = (store.state?.projects || []).map((project) => project.id);
  const found = await Promise.all(ids.map((id) => api(`/api/projects/${id}`).catch(() => null)));
  set({ projects: Object.fromEntries(found.filter(Boolean).map((item) => [item.project.id, item])) });
}

// Text the home and the lead write: paragraphs, line breaks, lists, **bold** and `code`. Nothing else is interpreted,
// and the text only ever becomes text nodes inside these elements.

export function Inline({ text }) {
  return (text || '').split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((part) =>
    (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? html`<code>${part.slice(1, -1)}</code>`
      : part.length > 4 && part.startsWith('**') && part.endsWith('**') ? html`<strong>${part.slice(2, -2)}</strong>`
        : part));
}

const ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;   // "- x", "* x", "• x" or "1. x" / "1) x"

// Blocks: a run of list lines is a list, a run of other lines a paragraph; a blank line ends either. A list may
// follow a paragraph line directly, as a model writes it.
function blocks(text) {
  const found = [];
  let open = null;
  for (const line of (text || '').split('\n')) {
    const item = line.match(ITEM);
    if (!line.trim()) {
      open = null;
    } else if (item) {
      const ordered = item[1] !== undefined;
      if (!open || !open.list || open.ordered !== ordered) {
        open = { list: true, ordered, start: ordered ? Number(item[1]) : 1, lines: [] };
        found.push(open);
      }
      open.lines.push(item[2]);
    } else {
      if (!open || open.list) {
        open = { list: false, lines: [] };
        found.push(open);
      }
      open.lines.push(line);
    }
  }
  return found;
}

export function Prose({ text }) {
  return blocks(text).map((block) => {
    if (!block.list) {
      return html`<p>${block.lines.map((line, index) => html`${index > 0 && html`<br />`}<${Inline} text=${line} />`)}</p>`;
    }
    const items = block.lines.map((line) => html`<li><${Inline} text=${line} /></li>`);
    return block.ordered ? html`<ol start=${block.start}>${items}</ol>` : html`<ul>${items}</ul>`;
  });
}
