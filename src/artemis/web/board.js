// Board: every project's tasks side by side, each with its label, who did it and the proof in one line.
// Opening a task shows its runs, evidence, review and the scrubbed end of its log.

import { html, useEffect, useState } from './vendor/preact-htm.js';
import {
  agoText, api, announce, Busy, CARD_KINDS, clock, date as dateLabel, describe, Icon, Label, LABELS, loadProjects, loadState, plural, Provider,
  set, Sheet, useAction, useStore,
} from './ui.js';

const ORDER = ['stuck', 'running', 'reported', 'queued', 'verified', 'shipped'];

function TaskRow({ task }) {
  return html`<li>
    <button type="button" class="task-row" onClick=${() => set({ sheet: { kind: 'task', id: task.id } })}>
      <span class="task-top"><${Label} state=${task.label} /><span class="task-title">${task.title}</span></span>
      <span class="task-proof"><${Provider} name=${task.provider} /><span>${task.proof}</span></span>
    </button>
  </li>`;
}

// What a project is for, what last proved itself, what is due and what is in the way, each in one line.
function Glance({ summary }) {
  const { objective, evidence, due, blocker } = summary;
  if (!objective && !evidence && !due && !blocker) return null;
  const open = (kind, id) => set({ sheet: { kind, id } });
  return html`<dl class="glance">
    ${objective && html`<div><dt>Asked</dt><dd class="glance-objective">${objective}</dd></div>`}
    ${evidence && html`<div><dt>Last proof</dt><dd><button type="button" class="link" onClick=${() => open('task', evidence.task_id)}>
      ${evidence.title}</button> <span class="fine">${evidence.proof}</span></dd></div>`}
    ${due && html`<div><dt>Due</dt><dd>${due.title} <span class="fine">${when(due.at)}</span></dd></div>`}
    ${blocker && html`<div class="is-blocker"><dt>In the way</dt><dd><button type="button" class="link"
      onClick=${() => open(blocker.kind, blocker.id)}>${blocker.kind === 'card' ? `Your answer: ${blocker.text}` : blocker.text}</button></dd></div>`}
  </dl>`;
}

function when(seconds) {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  const days = Math.round((date - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const time = clock(seconds);
  if (days <= 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  return `${dateLabel(seconds)} ${time}`;
}

function Column({ summary, detail }) {
  const s = useStore();
  const tasks = (detail?.tasks || []).slice().sort((a, b) =>
    ORDER.indexOf(a.label) - ORDER.indexOf(b.label) || (b.started || 0) - (a.started || 0) || b.id - a.id);
  const cards = (s.state?.cards || []).filter((card) => card.project_id === summary.id && card.state === 'waiting');
  const counts = summary.counts || {};
  const line = ['running', 'stuck', 'verified', 'shipped'].filter((key) => counts[key])
    .map((key) => `${counts[key]} ${key}`).join(' · ');
  return html`<section class="column" aria-labelledby=${`project-${summary.id}`}>
    <header class="column-head">
      <h2 id=${`project-${summary.id}`}>${summary.name}</h2>
      <p class="column-where">${summary.kind === 'repo' ? 'Git repository' : 'Folder'}${line && ` · today ${line}`}</p>
      <${Glance} summary=${summary} />
    </header>
    ${cards.length > 0 && html`<ul class="column-waiting" aria-label="Waiting for your answer">${cards.map((card) => html`<li key=${card.id}>
      <button type="button" class="waiting-row" onClick=${() => set({ sheet: { kind: 'card', id: card.id } })}>
        <${Label} state="waiting">for you</${Label}><span class="waiting-what">${card.what}</span>
        <span class="waiting-kind">${CARD_KINDS[card.kind]}</span></button></li>`)}</ul>`}
    ${detail === undefined ? html`<p class="empty">Loading…</p>`
      : tasks.length === 0 ? html`<p class="empty">No tasks yet. Ask the lead for something in this project.</p>`
      : html`<ul class="tasks">${tasks.map((task) => html`<${TaskRow} key=${task.id} task=${task} />`)}</ul>`}
    ${detail?.schedules?.length > 0 && html`<div class="schedules">
      <h3>On a schedule</h3>
      <ul>${detail.schedules.map((item) => html`<li class=${item.active ? '' : 'is-off'}>
        <span>${item.title}</span><span class="schedule-when">${item.spec}${item.next_at ? ` · next ${when(item.next_at)}` : ''}</span>
      </li>`)}</ul>
    </div>`}
  </section>`;
}

export function Board() {
  const s = useStore();
  const projects = (s.state?.projects || []).filter((project) => !s.project || project.id === s.project);
  useEffect(() => { loadProjects().catch(() => {}); }, [s.state?.cursor]);
  return html`<div class="board-page">
    <div class="page-head">
      <h1>Board</h1>
      <button type="button" class="button" onClick=${() => set({ sheet: { kind: 'project' } })}>
        <${Icon} name="plus" size=${16} /> Add a project</button>
    </div>
    ${projects.length === 0 ? html`<p class="empty">No projects yet. Add a folder or a Git repository on this computer.</p>`
      : html`<div class=${`board${projects.length === 1 ? ' is-single' : ''}`}>
        ${projects.map((project) => html`<${Column} key=${project.id} summary=${project} detail=${s.projects[project.id]} />`)}
      </div>`}
  </div>`;
}

function Evidence({ items, verdicts }) {
  if (!items.length) return html`<p class="empty">No evidence recorded yet.</p>`;
  const last = Math.max(...items.map((item) => item.submission));
  const verdict = verdicts.find((item) => item.submission === last);
  return html`<ul class="evidence">${items.filter((item) => item.submission === last).map((item) => {
    const failed = item.exit_code !== null && item.exit_code !== undefined && item.exit_code !== 0;
    return html`<li class=${failed ? 'is-failed' : ''}>
      <details>
        <summary><${Icon} name=${failed ? 'cross' : 'check'} size=${16} /><span>${item.summary}</span>
          <span class="evidence-kind">${item.kind}</span></summary>
        ${item.output ? html`<pre class="output">${item.output}</pre>` : html`<p class="fine">No output recorded.</p>`}
      </details>
    </li>`;
  })}</ul>
  ${verdict && html`<p class=${`verdict is-${verdict.kind}`}>${verdict.kind === 'pass'
    ? 'The judge passed this evidence.' : `The judge did not pass it: ${verdict.gaps.join('; ') || verdict.kind}.`}</p>`}`;
}

function Undo({ task, files }) {
  const [asking, setAsking] = useState(false);
  const [run, busy, error] = useAction();
  const [done, setDone] = useState(null);
  const undo = () => run(async () => {
    const result = await api(`/api/undo/${task.id}`, {});
    setDone(result.restored || []);
    announce('The files are back as they were.');
  });
  if (done) return html`<p class="fine">Put back ${plural(done.length, 'file')} as they were before this task.</p>`;
  return html`<div class="undo">
    ${!asking ? html`<button type="button" class="button" onClick=${() => setAsking(true)}>
        <${Icon} name="undo" size=${16} /> Undo this task’s file changes</button>`
      : html`<p>This puts ${plural(files.length, 'file')} back as they were before the task ran.</p>
        <div class="card-actions">
          <button type="button" class="button primary" disabled=${busy} onClick=${undo}>Put them back</button>
          <button type="button" class="button" onClick=${() => setAsking(false)}>Keep them</button>
        </div>`}
    <${Busy} error=${error} />
  </div>`;
}

export function TaskSheet({ id }) {
  const s = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/tasks/${id}`).then(setData, (failure) => setError(failure.message));
  }, [id, s.state?.cursor]);
  const close = () => set({ sheet: null });
  if (error) return html`<${Sheet} title="Task" onClose=${close}><p class="error">${error}</p></${Sheet}>`;
  if (!data) return html`<${Sheet} title="Task" onClose=${close}><p class="empty">Loading…</p></${Sheet}>`;
  const { task } = data;
  return html`<${Sheet} title=${task.title} onClose=${close} wide>
    <div class="task-sheet">
      <p class="task-status"><${Label} state=${task.label} /><${Provider} name=${task.provider} />
        <span>${task.proof}</span></p>
      <p class="fine">${LABELS[task.label] || ''}</p>
      ${task.brief && html`<section><h3>The brief</h3><p class="brief">${task.brief}</p></section>`}
      ${task.criteria.length > 0 && html`<section><h3>Done means</h3>
        <ul class="criteria">${task.criteria.map((label) => html`<li>${label}</li>`)}</ul></section>`}
      <section><h3>Evidence</h3><${Evidence} items=${data.evidence} verdicts=${data.verdicts} /></section>
      ${data.review && html`<section><h3>Review</h3><p>${data.review.detail}</p></section>`}
      ${data.runs.length > 0 && html`<section><h3>Runs</h3>
        <ol class="runs">${data.runs.map((item) => html`<li>
          <span class="run-who">${item.label}</span>
          <span class="run-when">${clock(item.started)}${item.ended ? `–${clock(item.ended)}` : ', still running'}</span>
          <span class="run-outcome">${item.outcome || 'running'}${item.note ? ` · ${item.note}` : ''}</span>
        </li>`)}</ol></section>`}
      ${data.files_changed.length > 0 && html`<section><h3>Files it changed</h3>
        <ul class="files">${data.files_changed.map((file) => html`<li><code>${file}</code></li>`)}</ul>
        ${data.undo && html`<${Undo} task=${task} files=${data.files_changed} />`}</section>`}
      ${data.log_tail && html`<section><h3>End of the log</h3>
        <pre class="log" tabindex="0">${data.log_tail}</pre>
        <p class="fine">Secrets in the log show as [secret:NAME].</p></section>`}
      ${task.landed && html`<p class="fine">Landed on ${task.target} as ${task.landed.slice(0, 7)} ${agoText(task.ended || task.started)}.</p>`}
    </div>
  </${Sheet}>`;
}

export function AddProject() {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [run, busy, error] = useAction();
  const close = () => set({ sheet: null });
  const add = (event) => {
    event.preventDefault();
    run(async () => {
      const added = await api('/api/projects', name.trim() ? { path: path.trim(), name: name.trim() } : { path: path.trim() });
      await loadState();
      await loadProjects();
      announce(`Added ${added.name}.`);
      close();
    });
  };
  return html`<${Sheet} title="Add a project" onClose=${close}>
    <form class="form" onSubmit=${add}>
      <label for="project-path">Folder on this computer</label>
      <input id="project-path" required value=${path} autocomplete="off" spellcheck="false" placeholder="~/code/shop"
        onInput=${(event) => setPath(event.currentTarget.value)} />
      <p class="fine">The full path. A Git repository is worked on in branches and lands after its checks pass;
        a plain folder is changed in place, with a copy kept so a task can be undone.</p>
      <label for="project-name">Name <span class="optional">optional</span></label>
      <input id="project-name" value=${name} autocomplete="off" onInput=${(event) => setName(event.currentTarget.value)} />
      <${Busy} error=${error} />
      <div class="form-actions"><button type="submit" class="button primary" disabled=${busy || !path.trim()}>Add</button></div>
    </form>
  </${Sheet}>`;
}

export { when };

export function lastLine(project) {
  return project.last ? describe(project.last)[1] : '';
}
