// Chat, the home screen: one conversation with the lead. The person's words, the lead's replies, cards where they
// came up, and the quiet record of what happened in between, folded into "3 updates" until opened.

import { html, useEffect, useLayoutEffect, useRef, useState } from './vendor/preact-htm.js';
import {
  api, chooseProject, clock, day, describe, Icon, Label, loadMessages, Mark, plural, Prose, projectName, Provider,
  set, store, useAction, useStore, useTick, Busy,
} from './ui.js';
import { Card, needsYou, showCard, Tray } from './cards.js';

function threadItems(s) {
  const project = s.project;
  const open = new Map((s.state?.cards || []).map((card) => [card.id, card]));
  const attached = new Set(s.messages.map((message) => message.card_id).filter(Boolean));
  const items = [];
  for (const message of s.messages) {
    if (project && message.project_id !== null && message.project_id !== project) continue;
    const card = message.card_id ? open.get(message.card_id) || message.card : null;
    items.push({ type: 'message', at: message.at, key: `m${message.id}`, message, card });
  }
  for (const event of s.updates) {
    if (project && event.project_id !== project) continue;
    const card = event.card_id && (open.get(event.card_id) || event.card);
    if (event.kind === 'card.opened' && card && !attached.has(event.card_id)) {
      items.push({ type: 'card', at: event.at, key: `c${event.card_id}`, card });
    } else {
      items.push({ type: 'update', at: event.at, key: `u${event.id}`, event });
    }
  }
  items.sort((a, b) => a.at - b.at);
  const out = [];
  let shownDay = null;
  for (const item of items) {
    const label = day(item.at);
    if (label !== shownDay) {
      out.push({ type: 'day', key: `d${item.key}`, label });
      shownDay = label;
    }
    const last = out[out.length - 1];
    const alone = item.type === 'update' && item.event.kind === 'lead.switched';   // who answers next stays in sight
    if (item.type === 'update' && last.type === 'fold' && !last.alone && !alone) last.events.push(item.event);
    else if (item.type === 'update') out.push({ type: 'fold', key: `f${item.key}`, events: [item.event], alone });
    else out.push(item);
  }
  return out;
}

function UpdateLine({ event }) {
  const [state, text] = describe(event);
  const project = !store.project && projectName(event.project_id);
  const inner = html`<time datetime=${new Date(event.at * 1000).toISOString()}>${clock(event.at)}</time>
    <${Label} state=${state}><span class="visually-hidden">${state}</span></${Label}>
    <span class="update-text">${text}</span>${project && html`<span class="update-project">${project}</span>`}`;
  return html`<li class="update">${event.task_id
    ? html`<button type="button" class="update-row" onClick=${() => set({ sheet: { kind: 'task', id: event.task_id } })}>
        ${inner}</button>`
    : html`<div class="update-row">${inner}</div>`}</li>`;
}

function Fold({ events }) {
  const [open, setOpen] = useState(false);
  if (events.length === 1) return html`<ul class="updates is-single"><${UpdateLine} event=${events[0]} /></ul>`;
  const projects = [...new Set(events.map((event) => projectName(event.project_id)).filter(Boolean))];
  const id = `fold-${events[0].id}`;
  return html`<div class=${`fold${open ? ' is-open' : ''}`}>
    <button type="button" class="fold-toggle" aria-expanded=${open} aria-controls=${id} onClick=${() => setOpen(!open)}>
      <${Icon} name="chevron" size=${16} />
      <span class="fold-count">${plural(events.length, 'update')}</span>
      <span class="fold-where">${!store.project && projects.slice(0, 3).join(', ')}</span>
      <span class="fold-when">${clock(events[0].at)}–${clock(events[events.length - 1].at)}</span>
    </button>
    ${open && html`<ul class="updates" id=${id}>${events.map((event) => html`<${UpdateLine} key=${event.id} event=${event} />`)}</ul>`}
  </div>`;
}

function Said({ message, card }) {
  const project = !store.project && projectName(message.project_id);
  const time = html`<time datetime=${new Date(message.at * 1000).toISOString()}>${clock(message.at)}</time>`;
  if (message.role === 'you') {
    return html`<article class="said said-you" aria-label="You said">
      <div class="said-body"><${Prose} text=${message.text} /></div>
      <div class="said-meta">${project && html`<span>about ${project}</span>`}${time}</div>
    </article>`;
  }
  if (message.role !== 'lead') {
    return html`<article class="said said-home" aria-label="Artemis said">
      <div class="said-body"><${Prose} text=${message.text} /></div><div class="said-meta">${time}</div>
    </article>`;
  }
  const by = message.by && html`<span>${message.by}</span>`;   // which agent led when this was written
  return html`<article class="said said-lead" aria-label=${message.by ? `${message.by}, the lead, said` : 'The lead said'}>
    <span class="said-mark" aria-hidden="true"><${Mark} size=${18} /></span>
    <div class="said-main">
      <div class="said-body"><${Prose} text=${message.text} /></div>
      <div class="said-meta">${by}${project && html`<span>${project}</span>`}${time}</div>
      ${card && html`<${Card} card=${card} />`}
    </div>
  </article>`;
}

function Draft({ text }) {
  return html`<article class="said said-lead is-draft" aria-label="The lead is writing" aria-busy="true">
    <span class="said-mark" aria-hidden="true"><${Mark} size=${18} /></span>
    <div class="said-main"><div class="said-body"><${Prose} text=${text} /><span class="caret" aria-hidden="true"></span></div></div>
  </article>`;
}

function Reading() {
  return html`<p class="reading" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
    The lead is reading your message</p>`;
}

function Empty() {
  return html`<div class="thread-empty">
    <${Mark} size=${40} />
    <h2>Tell the lead what you need.</h2>
    <p>It plans the work, gives each part to a suitable agent and comes back with evidence. It asks you first before
      what it recognises as spending money, deleting for good or sending something as you.</p>
  </div>`;
}

function Composer() {
  const s = useStore();
  const [text, setText] = useState(() => sessionStorage.getItem('artemis.draft') || '');
  const [run, busy, error] = useAction();
  const field = useRef(null);
  const grow = () => {
    const area = field.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 200)}px`;
  };
  useLayoutEffect(grow, [text]);
  const send = (event) => {
    event?.preventDefault();
    const said = text.trim();
    if (!said || busy) return;
    run(async () => {
      const { id } = await api('/api/messages', s.project ? { text: said, project_id: s.project } : { text: said });
      setText('');
      sessionStorage.removeItem('artemis.draft');
      set({ waitingReply: id });
      await loadMessages();
      requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    });
  };
  const onKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(pointer: fine)').matches) send(event);
  };
  // Pressing Send (or anything else in the composer) leaves the cursor in the message, as messaging apps do. On a
  // phone the tabs hide while you type, so moving focus would move the button out from under the finger mid-press.
  const keepTyping = (event) => { if (event.target !== field.current) event.preventDefault(); };
  const project = projectName(s.project);
  return html`<form class="composer" onSubmit=${send} onMouseDown=${keepTyping}>
    ${project && html`<div class="composer-about">About <strong>${project}</strong>
      <button type="button" class="link" onClick=${() => chooseProject(null)}>Talk about everything</button></div>`}
    <div class="composer-box">
      <label class="visually-hidden" for="composer">Message to the lead</label>
      <textarea id="composer" ref=${field} rows="1" value=${text} placeholder="Tell the lead what you need"
        onInput=${(event) => { setText(event.currentTarget.value); sessionStorage.setItem('artemis.draft', event.currentTarget.value); }}
        onKeyDown=${onKey}
        onFocus=${() => document.documentElement.classList.add('is-typing')}
        onBlur=${() => document.documentElement.classList.remove('is-typing')}></textarea>
      <button type="submit" class="send" disabled=${busy || !text.trim()} aria-label="Send"><${Icon} name="send" /></button>
    </div>
    <${Busy} error=${error} />
  </form>`;
}

export function Team({ state }) {
  if (!state) return null;
  return html`<ul class="team">
    <li><span class="team-role">Lead</span>${state.lead.answers
      ? html`<${Provider} name=${state.lead.provider} />`
      : html`<span class="team-state">none in this home yet</span>`}</li>
    ${state.workers.map((worker) => html`<li class=${worker.available ? '' : 'is-off'}>
      <span class="team-role">${worker.label}</span>
      <span class="team-state">${!worker.available ? 'not set up' : worker.live ? `${worker.live} working` : 'ready'}</span>
    </li>`)}
  </ul>`;
}

export function ProjectList({ onPick }) {
  const s = useStore();
  return html`<ul class="project-list">${(s.state?.projects || []).map((project) => {
    const counts = project.counts || {};
    const bits = [counts.running && `${counts.running} running`, counts.stuck && `${counts.stuck} stuck`,
      counts.waiting && `${counts.waiting} for you`].filter(Boolean);
    const last = project.last && describe(project.last)[1];
    return html`<li><button type="button" class=${`project-row${s.project === project.id ? ' is-on' : ''}`}
        aria-pressed=${s.project === project.id} onClick=${() => onPick(project.id)}>
      <span class="project-name">${project.name}</span>
      <span class="project-counts">${bits.join(' · ') || 'quiet'}</span>
      ${last && html`<span class="project-last">${last}</span>`}
    </button></li>`;
  })}</ul>`;
}

function Aside() {
  const s = useStore();
  const { count } = needsYou();
  return html`<aside class="chat-aside" aria-label="At a glance">
    <section>
      <h2>Needs you${count > 0 && html` <span class="count">${count}</span>`}</h2>
      <${Tray} onShow=${showCard} />
    </section>
    <section>
      <h2>Projects</h2>
      <${ProjectList} onPick=${(id) => chooseProject(s.project === id ? null : id)} />
    </section>
    <section>
      <h2>Team</h2>
      <${Team} state=${s.state} />
    </section>
  </aside>`;
}

// The page's end is the thread's newest line just above the composer, so that is where the thread is read from.
// While you are there, whatever arrives (the first loads, a streamed reply) keeps it in view; scroll up to read and
// it stays where you are until you come back down or send.
function useFollowEnd() {
  useEffect(() => {
    let following = true;
    let lastY = window.scrollY;
    const end = () => window.scrollTo({ top: document.documentElement.scrollHeight });
    // Only the reader moves the page up; the App's own scrolls and the thread growing below never do.
    const onScroll = () => {
      const root = document.documentElement;
      const atEnd = root.scrollHeight - window.innerHeight - window.scrollY < 64;
      if (window.scrollY < lastY) following = atEnd;
      else if (atEnd) following = true;
      lastY = window.scrollY;
    };
    const growth = new ResizeObserver(() => { if (following) end(); });
    growth.observe(document.documentElement);   // the thread, the composer, the room kept for the tabs: any can change
    addEventListener('scroll', onScroll, { passive: true });
    end();
    return () => { growth.disconnect(); removeEventListener('scroll', onScroll); };
  }, []);
}

export function Chat() {
  const s = useStore();
  useTick(60000);
  const items = threadItems(s);
  const said = new Set(s.messages.map((message) => message.turn).filter(Boolean));
  const drafts = Object.entries(s.drafts).filter(([turn]) => !said.has(turn));
  useFollowEnd();
  return html`<div class="chat">
    <div class="chat-main">
      <section class="thread" aria-label="Conversation with the lead">
        ${items.length === 0 && drafts.length === 0 ? html`<${Empty} />` : items.map((item) => {
          if (item.type === 'day') return html`<h2 class="day" key=${item.key}>${item.label}</h2>`;
          if (item.type === 'fold') return html`<${Fold} key=${item.key} events=${item.events} />`;
          if (item.type === 'card') return html`<div class="thread-card" key=${item.key}><${Card} card=${item.card} /></div>`;
          return html`<${Said} key=${item.key} message=${item.message} card=${item.card} />`;
        })}
        ${drafts.map(([turn, text]) => html`<${Draft} key=${turn} text=${text} />`)}
        ${s.waitingReply > 0 && drafts.length === 0 && html`<${Reading} />`}
      </section>
      <${Composer} />
    </div>
    <${Aside} />
  </div>`;
}
