// The Artemis App: pairing, the frame every screen shares (header, Stop, tabs), routing and live updates.

import { html, render, useEffect, useState } from './vendor/preact-htm.js';
import {
  api, announce, Busy, CARD_KINDS, chooseProject, Icon, loadMessages, loadState, loadUpdates, Mark, plural, set, Sheet,
  store, useAction, useStore,
} from './ui.js';
import { Card, needsYou, showCard, Tray } from './cards.js';
import { Chat } from './chat.js';
import { AddProject, Board, TaskSheet } from './board.js';
import { applyTheme, Digest, Lessons, More, Secrets, Settings } from './pages.js';

const ROUTES = {
  '': ['Chat', Chat], board: ['Board', Board], digest: ['Digest', Digest], lessons: ['Lessons', Lessons],
  secrets: ['Secrets', Secrets], settings: ['Settings', Settings], more: ['More', More],
};
const WIDE_NAV = [['', 'Chat'], ['board', 'Board'], ['digest', 'Digest'], ['lessons', 'Lessons'], ['secrets', 'Secrets'],
  ['settings', 'Settings']];
const TABS = [['', 'chat', 'Chat'], ['board', 'board', 'Board'], ['digest', 'digest', 'Digest'], ['more', 'more', 'More']];
const phone = () => matchMedia('(max-width: 720px)').matches;

function route() {
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return name in ROUTES ? name : '';
}

function useRoute() {
  const [name, setName] = useState(route);
  useEffect(() => {
    const changed = () => {
      setName(route());
      set({ sheet: null });
      window.scrollTo(0, 0);
      // A new screen: focus goes to its main region (focusable, tabindex -1), so a screen reader starts there.
      requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
    };
    addEventListener('hashchange', changed);
    return () => removeEventListener('hashchange', changed);
  }, []);
  return name;
}

// Live updates: a stream while the tab is visible, a long poll when a stream cannot be held, a refresh after either.

const live = { source: null, polling: false, cursor: 0, timer: 0, failures: 0, retry: 0 };

function refreshSoon() {
  clearTimeout(live.timer);
  live.timer = setTimeout(() => {
    Promise.all([loadState(), loadMessages(), loadUpdates()]).catch(() => {});
  }, 150);
}

function received(data) {
  if (data.kind === 'said.delta') {
    const { turn, text } = data.data || {};
    if (turn) set((s) => ({ drafts: { ...s.drafts, [turn]: (s.drafts[turn] || '') + (text || '') } }));
    return;
  }
  if (data.id) live.cursor = Math.max(live.cursor, data.id);
  refreshSoon();
}

function connect() {
  if (live.source || live.polling || document.hidden || store.auth !== 'paired') return;
  const source = new EventSource(`/api/events?after=${live.cursor}`);
  live.source = source;
  source.onopen = () => {
    live.failures = 0;
    set({ live: 'live' });
    refreshSoon();
  };
  source.onmessage = (event) => {
    try { received(JSON.parse(event.data)); } catch { /* a malformed line is skipped */ }
  };
  source.onerror = () => {
    live.failures += 1;
    if (source.readyState === EventSource.CLOSED || live.failures >= 3) {
      source.close();
      live.source = null;
      poll();
    } else {
      set({ live: 'reconnecting' });
    }
  };
}

function disconnect() {
  live.source?.close();
  live.source = null;
}

async function poll() {
  if (live.polling) return;
  live.polling = true;
  set({ live: 'polling' });
  const started = Date.now();
  while (live.polling && store.auth === 'paired' && !document.hidden) {
    try {
      const found = await api(`/api/events?poll=1&after=${live.cursor}`);
      live.cursor = found.cursor;
      found.events.forEach(received);
      set({ live: 'polling' });
    } catch {
      set({ live: 'reconnecting' });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (Date.now() - started > 60000) break;    // try a stream again now and then
  }
  live.polling = false;
  live.failures = 0;
  connect();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { disconnect(); return; }
  refreshSoon();
  connect();
});

// Pairing: a link from `artemis serve` or Settings, then a code this computer confirms.

async function boot() {
  applyTheme();
  const token = location.hash.startsWith('#pair=') ? location.hash.slice(6) : null;
  if (token) {
    history.replaceState(null, '', location.pathname);
    set({ auth: 'pairing' });
    try {
      await api('/api/pair', { token });
    } catch (failure) {
      set({ auth: 'unpaired', pairError: failure.message });
      return;
    }
  }
  try {
    const me = await api('/api/me');
    set({ me });
    if (me.device && me.device.state !== 'allowed') { set({ auth: 'waiting' }); return; }
  } catch {
    if (store.auth !== 'unpaired') set({ auth: 'unpaired' });
    return;
  }
  await start();
}

async function start() {
  const state = await loadState();
  live.cursor = state.cursor;
  await Promise.all([loadMessages(), loadUpdates()]);
  if (phone() && !location.hash) {        // opening the App on a phone: what needs you and what changed come first
    const changed = (store.updates || []).some((event) => !state.read_at || event.at > state.read_at);
    if (needsYou().count || changed) location.hash = '#/digest';
  }
  connect();
}

function Unpaired() {
  const s = useStore();
  const [link, setLink] = useState('');
  const go = (event) => {
    event.preventDefault();
    const found = link.match(/#pair=([\w-]+)/);
    if (!found) { set({ pairError: 'That is not a pairing link. It ends with #pair= and a code.' }); return; }
    location.hash = `#pair=${found[1]}`;
    boot();
  };
  return html`<main class="gate">
    <${Mark} size=${44} />
    <h1>Pair this browser</h1>
    <p>Open the link Artemis printed when it started on your computer, or scan its QR code with this phone.
      A link works once, for ten minutes; a paired App can make a new one in Settings.</p>
    ${s.pairError && html`<p class="error" role="alert">${s.pairError}</p>`}
    <form class="gate-form" onSubmit=${go}>
      <label for="pair-link">Pairing link</label>
      <input id="pair-link" value=${link} autocomplete="off" spellcheck="false" placeholder="https://…/#pair=…"
        onInput=${(event) => setLink(event.currentTarget.value)} />
      <button type="submit" class="button primary" disabled=${!link.trim()}>Pair</button>
    </form>
  </main>`;
}

function Waiting() {
  const s = useStore();
  const code = s.me?.device?.code;
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const me = await api('/api/me');
        set({ me });
        if (me.device?.state === 'allowed') { clearInterval(timer); set({ auth: 'paired' }); start(); }
        if (!me.device || me.device.state === 'revoked') { clearInterval(timer); set({ auth: 'unpaired', pairError: 'This device was turned away.' }); }
      } catch { /* the computer may be asleep; keep asking */ }
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  return html`<main class="gate">
    <${Mark} size=${44} />
    <h1>Allow this device on your computer</h1>
    <p>On the computer Artemis runs on, the App shows a request from ${s.me?.device?.name || 'this device'}.
      Allow it there if it shows the same code.</p>
    ${code && html`<p class="code" aria-label=${`Code ${code.split('').join(' ')}`}>${code}</p>`}
    <p class="fine">Or run <code>artemis device allow ${code || '<code>'}</code> on that computer. This page moves on by itself.</p>
  </main>`;
}

// The frame every screen shares.

function Counter() {
  const s = useStore();
  const c = s.state?.counts;
  if (!c) return null;
  const text = `asked you ${c.asked || 0}× today · ${c.done || 0} done · ${c.stuck || 0} stuck · ${plural(c.wakes || 0, 'wake')}`;
  return html`<p class="counter" title="Today, since midnight">${text}</p>`;
}

function StopButton() {
  const s = useStore();
  const [run, busy, error] = useAction();
  const stopped = Boolean(s.state?.stopped);
  const flip = () => run(async () => {
    await api(stopped ? '/api/resume' : '/api/stop', {});
    await loadState();
    announce(stopped ? 'Resumed. Work picks up again.' : 'Stopped. Nothing new starts until you resume.');
  });
  return html`<button type="button" class=${`stop${stopped ? ' is-stopped' : ''}`} disabled=${busy || !s.state}
      onClick=${flip} title=${error || (stopped ? 'Let work start again' : 'Stop the agents and start nothing new')}>
    <${Icon} name=${stopped ? 'play' : 'stop'} size=${16} /><span>${stopped ? 'Resume' : 'Stop'}</span></button>`;
}

function NeedsButton() {
  useStore();
  const { count } = needsYou();
  return html`<button type="button" class=${`needs${count ? ' has-some' : ''}`} onClick=${() => set({ sheet: { kind: 'tray' } })}
      aria-label=${count ? `${plural(count, 'thing needs', 'things need')} you` : 'Nothing needs you'}>
    <span class="needs-count">${count}</span><span class="needs-word">need${count === 1 ? 's' : ''} you</span></button>`;
}

function ProjectSwitch() {
  const s = useStore();
  const projects = s.state?.projects || [];
  return html`<label class="project-switch">
    <span class="visually-hidden">Project</span>
    <select value=${s.project || ''} onChange=${(event) => chooseProject(Number(event.currentTarget.value) || null)}>
      <option value="">All projects</option>
      ${projects.map((project) => html`<option value=${project.id}>${project.name}</option>`)}
    </select>
    <${Icon} name="chevron" size=${14} />
  </label>`;
}

function Header({ name }) {
  const s = useStore();
  const vault = s.state?.vault;
  return html`<header class="top">
    <div class="top-inner">
      <a class="brand" href="#/" aria-label="Artemis, the conversation"><${Mark} size=${22} /><span>Artemis</span></a>
      <${ProjectSwitch} />
      <nav class="top-nav" aria-label="Screens">${WIDE_NAV.map(([key, label]) => html`<a href=${`#/${key}`}
        aria-current=${name === key ? 'page' : undefined}>${label}</a>`)}</nav>
      <div class="top-status">
        <${Counter} />
        ${vault?.notice && html`<p class="vault-note" title=${vault.notice}>${vault.notice}</p>`}
        ${s.live !== 'live' && s.live !== 'polling' && html`<p class="live-note" role="status">${s.live === 'connecting' ? 'connecting…' : 'reconnecting…'}</p>`}
      </div>
      <div class="top-end">
        <${NeedsButton} />
        <${StopButton} />
      </div>
    </div>
  </header>`;
}

function Stopped() {
  const s = useStore();
  if (!s.state?.stopped) return null;
  return html`<div class="banner" role="status">
    <p><strong>Stopped.</strong> Nothing new starts until you resume. You can still talk to the lead and answer cards.</p>
  </div>`;
}

function Unlock() {
  const s = useStore();
  const [passphrase, setPassphrase] = useState('');
  const [run, busy, error] = useAction();
  if (!s.state?.vault?.locked) return null;
  if (!s.state.loopback) {
    return html`<div class="banner"><p><strong>The vault is locked.</strong> Unlock it in the App on the computer Artemis runs
      on. Work that needs no secret goes on.</p></div>`;
  }
  const unlock = (event) => {
    event.preventDefault();
    const typed = passphrase;
    setPassphrase('');
    run(async () => {
      await api('/api/vault/unlock', { passphrase: typed });
      await loadState();
      announce('The vault is unlocked.');
    });
  };
  const fresh = s.state.vault.state === 'new';
  return html`<article class="card kind-vault" aria-labelledby="unlock-title">
    <h3 id="unlock-title">${fresh ? 'Choose a vault passphrase' : 'The vault is locked'}</h3>
    <p class="why">${fresh
      ? 'The vault keeps its key under this passphrase. Artemis asks for it once each time it starts. At least 12 characters.'
      : 'Work that needs a secret waits until it is unlocked. Only this computer can unlock it.'}</p>
    <form class="secret-form" onSubmit=${unlock}>
      <label class="visually-hidden" for="unlock-pass">Vault passphrase</label>
      <input id="unlock-pass" type="password" autocomplete=${fresh ? 'new-password' : 'current-password'} value=${passphrase}
        placeholder="Passphrase" onInput=${(event) => setPassphrase(event.currentTarget.value)} />
      <button type="submit" class="button primary" disabled=${busy || !passphrase}>Unlock</button>
    </form>
    <${Busy} error=${error} />
  </article>`;
}

function Tabs({ name }) {
  return html`<nav class="tabs" aria-label="Screens">${TABS.map(([key, icon, label]) => html`<a href=${`#/${key}`}
      aria-current=${name === key || (key === 'more' && ['lessons', 'secrets', 'settings'].includes(name)) ? 'page' : undefined}>
    <${Icon} name=${icon} size=${22} /><span>${label}</span>
  </a>`)}</nav>`;
}

function SheetLayer() {
  const s = useStore();
  if (!s.sheet) return null;
  if (s.sheet.kind === 'task') return html`<${TaskSheet} id=${s.sheet.id} />`;
  if (s.sheet.kind === 'project') return html`<${AddProject} />`;
  if (s.sheet.kind === 'tray') return html`<${TraySheet} />`;
  if (s.sheet.kind === 'card') return html`<${CardSheet} id=${s.sheet.id} />`;
  return null;
}

// One card on its own, from the Board or a digest line: as it is now if it is still open, else as it was last seen.
function CardSheet({ id }) {
  const s = useStore();
  const found = (s.state?.cards || []).find((card) => card.id === id)
    || s.messages.map((message) => message.card).find((card) => card && card.id === id)
    || s.updates.map((event) => event.card).find((card) => card && card.id === id);
  const close = () => set({ sheet: null });
  return html`<${Sheet} title=${found ? CARD_KINDS[found.kind] : 'Card'} onClose=${close}>
    ${found ? html`<${Card} card=${found} />` : html`<p class="empty">This card is older than what the App keeps loaded.
      The digest line above it says how it ended.</p>`}
  </${Sheet}>`;
}

function TraySheet() {
  return html`<div class="sheet-layer" onClick=${(event) => event.target === event.currentTarget && set({ sheet: null })}>
    <${TrayPanel} />
  </div>`;
}

function TrayPanel() {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') set({ sheet: null }); };
    document.addEventListener('keydown', onKey);
    const before = document.activeElement;
    document.querySelector('.sheet h2')?.focus();
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.(); };
  }, []);
  return html`<section class="sheet" role="dialog" aria-modal="true" aria-label="Needs you">
    <header class="sheet-head"><h2 tabindex="-1">Needs you</h2>
      <button type="button" class="icon-button" aria-label="Close" onClick=${() => set({ sheet: null })}><${Icon} name="cross" /></button>
    </header>
    <div class="sheet-body"><${Tray} onShow=${showCard} /></div>
  </section>`;
}

function useKeys() {
  useEffect(() => {
    let prefix = false;
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        if (route() !== '') location.hash = '#/';
        setTimeout(() => document.getElementById('composer')?.focus(), 30);
      } else if (prefix) {
        const go = { c: '#/', b: '#/board', d: '#/digest', l: '#/lessons', s: '#/settings' }[event.key];
        if (go) location.hash = go;
        prefix = false;
      } else if (event.key === 'g') {
        prefix = true;
        setTimeout(() => { prefix = false; }, 1200);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

function Frame() {
  const name = useRoute();
  useKeys();
  const [title, Screen] = ROUTES[name];
  useEffect(() => { document.title = name ? `${title} · Artemis` : 'Artemis'; }, [name]);
  const s = useStore();
  return html`<div class=${`frame route-${name || 'chat'}`}>
    <a class="skip" href="#main" onClick=${(event) => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to the content</a>
    <${Header} name=${name} />
    <main id="main" tabindex="-1">
      <${Stopped} />
      <${Unlock} />
      <${Screen} />
    </main>
    <${Tabs} name=${name} />
    <${SheetLayer} />
    <div class="visually-hidden" aria-live="polite" role="status">${s.announce}</div>
  </div>`;
}

function App() {
  const s = useStore();
  if (s.auth === 'checking' || s.auth === 'pairing') {
    return html`<main class="gate is-quiet"><${Mark} size=${44} /><p>${s.auth === 'pairing' ? 'Pairing…' : 'Opening…'}</p></main>`;
  }
  if (s.auth === 'unpaired') return html`<${Unpaired} />`;
  if (s.auth === 'waiting') return html`<${Waiting} />`;
  if (!s.state) return html`<main class="gate is-quiet"><${Mark} size=${44} /><p>Opening…</p></main>`;
  return html`<${Frame} />`;
}

render(html`<${App} />`, document.getElementById('app'));
boot().catch((failure) => set({ auth: 'unpaired', pairError: failure.message }));
