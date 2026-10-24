/**
 * Heuristic guard, not a shell sandbox. Grammar: literal tool names and paths, shell
 * words separated by whitespace/operators, grouping, command substitutions,
 * simple quoting and backslash escapes (including line continuations). Literal
 * sh/bash/zsh -c strings are inspected recursively, never executed. Quoted data
 * stays one word; echo/printf arguments are data, but their substitutions run.
 * Matches protected basenames/credential roots anywhere in literal command text,
 * common service installers, destructive commands, publishing and transaction verbs.
 * Recursive/forced deletion is exempt only for literal targets beneath configured
 * cleanup roots (OS scratch by default). The recorded cwd, its ancestors, and the
 * roots themselves are never exempt. A cwd outside those roots grants no trust.
 * Non-literal deletion targets are denied without an approval path. All systemctl starts are
 * conservatively "new"; no service is probed. Wrapper operands are scanned
 * conservatively for known command words. We do not evaluate general shell syntax,
 * aliases, functions, variable expansion, encoded programs, arbitrary interpreter
 * code, secret-file aliases, filesystem races or remote APIs. Same-user credential isolation needs the
 * later broker/hygiene work; adapters can add rules but cannot remove these.
 */
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Action, GateDecision, UserCategory } from '../types.ts';

function protectedAction(category: UserCategory): GateDecision {
  return { decision: category === 'secrets' ? 'deny' : 'approval', category, rule: `user.${category}`,
    reason: category === 'secrets' ? 'secret access is forbidden' : `user approval required: ${category}` };
}
const nonLiteralTarget = (target: string): boolean => /[$`*?{}[\]~]/.test(target);
function denyNonLiteralDelete(): GateDecision {
  return { decision: 'deny', category: 'irreversible_delete', rule: 'user.delete_targets_literal',
    reason: 'delete targets must be literal paths: expand variables and globs first (e.g. rm -rf /workspace/work/…/build)' };
}
export function secretPath(value: string): boolean {
  const path = value.replace(/\\/g, '/').replace(/["']/g, '').toLowerCase();
  return /(^|[/\s=:(])(?:\.env[^/\s,}]*|auth\.json|\.credentials\.json|\.claude\.json)(?=$|[/\s;&|,}]|\)|\])/.test(path)
    || /(^|[/\s])(?:tokens?|credentials)(?:[/._-]|$)/.test(path)
    || /(?:^|[/\s])\.ssh\/id_[^/\s]*/.test(path)
    || /(?:^|[/\s])\.(?:aws|azure|kube)(?:\/|$)/.test(path)
    || /(?:^|[/\s])\.config\/(?:gcloud|gh)(?:\/|$)/.test(path)
    || /(?:^|[/\s])(?:keychains?|credential-store)(?:\/|$)/.test(path);
}
export function cleanupRoots(roots: readonly string[] = [tmpdir(), '/tmp', '/var/tmp']): string[] {
  if (roots.some(root => !root || !isAbsolute(root))) throw new Error('Cleanup roots must be absolute directories');
  return [...new Set(roots.map(root => resolve(root)))];
}
function beneath(path: string, root: string): boolean {
  const suffix = relative(root, path);
  return !!suffix && suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix);
}
/** Walk components so link/.. follows the link before resolving its parent.
 * Missing descendants extend the last existing physical ancestor. A delete target through a dangling link has no
 * physical place, so it is never exempt (on macOS a link to /srv dangles: there is no /srv).
 */
function physicalPath(path: string, target = false): string {
  if (!isAbsolute(path)) throw new Error('Cleanup paths must be absolute');
  let physical: string = sep;
  for (const component of path.split(sep)) {
    if (!component || component === '.') continue;
    if (component === '..') physical = dirname(physical);
    else {
      physical = resolve(physical, component);
      if (existsSync(physical)) physical = realpathSync(physical);
      else if (target && lstatSync(physical, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('unresolved cleanup link');
    }
  }
  return physical;
}
function cleanup(target: string, cwd: string, agentCwd: string, roots: readonly string[]): boolean {
  if (!target || nonLiteralTarget(target)) return false;
  try {
    const path = resolve(cwd, target);
    const physical = physicalPath(isAbsolute(target) ? target : `${cwd}/${target}`, true);
    const recorded = resolve(agentCwd), recordedPhysical = physicalPath(agentCwd);
    // This veto precedes every exemption, including overlapping cleanup roots.
    if (path === recorded || beneath(recorded, path) || physical === recordedPhysical || beneath(recordedPhysical, physical)) return false;
    if (beneath(path, recorded) && !beneath(physical, recordedPhysical)) return false;
    const boundaries = roots.map(root => {
      try { return { path: root, physical: realpathSync(root) }; } catch { return { path: root, physical: null }; }
    });
    if (boundaries.some(root => path === root.path || physical === root.physical)) return false;
    const insideRoot = boundaries.some(root => root.physical && beneath(path, root.path) && beneath(physical, root.physical));
    const ownedCwd = boundaries.some(root => root.physical && beneath(recorded, root.path) && beneath(recordedPhysical, root.physical));
    return insideRoot || (ownedCwd && beneath(path, recorded) && beneath(physical, recordedPhysical));
  } catch { return false; }
}

type Word = { text: string; literal: boolean };
/** A deliberately bounded lexer, not a shell evaluator. Nested substitutions
 * become independent segments; quotes/escaped delimiters remain literal data.
 */
function shellSegments(source: string, depth = 0): Word[][] {
  if (depth > 32) throw new Error('shell nesting exceeds policy grammar');
  const text = source.replace(/\\\r?\n/g, '');
  const segments: Word[][] = [];
  let i = 0;
  function scan(stop?: string, nesting = depth): void {
    if (nesting > 32) throw new Error('shell nesting exceeds policy grammar');
    let words: Word[] = [], word: Word | undefined, quote = '';
    const append = (s: string, literal = true) => {
      word ??= { text: '', literal: true };
      word.text += s; word.literal &&= literal;
    };
    const flushWord = () => { if (word) words.push(word); word = undefined; };
    const flush = () => { flushWord(); if (words.length) segments.push(words); words = []; };
    while (i < text.length) {
      const c = text[i]!;
      if (!quote && c === stop) { i++; flush(); return; }
      if (quote === "'") {
        if (c === quote) quote = ''; else append(c);
        i++; continue;
      }
      if (c === '\\' && i + 1 < text.length) {
        const next = text[i + 1]!;
        if (!quote || /[$`"\\]/.test(next)) { append(next); i += 2; continue; }
        append(c); i++; continue;
      }
      if (c === quote) { quote = ''; i++; continue; }
      if (!quote && (c === "'" || c === '"')) { append(''); quote = c; i++; continue; }
      if ((c === '$' && text[i + 1] === '(') || c === '`') {
        append(c === '$' ? '$()' : '``', false);
        i += c === '$' ? 2 : 1;
        scan(c === '$' ? ')' : '`', nesting + 1);
        continue;
      }
      if (!quote && c === '(') { flush(); i++; scan(')', nesting + 1); continue; }
      if (!quote && /[;&|\n){}]/.test(c)) {
        // A brace inside an operand may expand it: never grant scratch exemption
        // based only on the literal prefix before that delimiter.
        if ((c === '{' || c === '}') && (word || words.length)) append(c, false);
        flush(); i++; continue;
      }
      if (!quote && /\s/.test(c)) { flushWord(); i++; continue; }
      if (!quote && c === '#' && !word) {
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
      append(c, c !== '$'); i++;
    }
    flush();
  }
  scan();
  for (const words of [...segments]) {
    if (dataCommand(words)) continue;
    for (let j = 0; j < words.length; j++) {
      if (!/^(?:sh|bash|zsh)$/.test(program(words[j]!))) continue;
      // Only literal -c arguments are shell source. No expansion or evaluation.
      let k = j + 1;
      while (words[k]?.text.startsWith('-')) {
        const option = words[k++]!.text;
        if (/^-[a-z]*c[a-z]*$/.test(option)) {
          if (words[k]?.literal) segments.push(...shellSegments(words[k]!.text, depth + 1));
          break;
        }
      }
    }
  }
  return segments;
}
function program(word: Word): string { return word.literal ? word.text.replace(/^.*\//, '') : ''; }
function dataCommand(words: Word[]): boolean {
  const first = words.find(w => !/^[A-Za-z_][A-Za-z_0-9]*=/.test(w.text));
  return !!first && /^(?:echo|printf)$/.test(program(first));
}

export function classifyUser(action: Action, options: { cleanupRoots?: readonly string[]; agentCwd?: string } = {}): GateDecision | null {
  const roots = cleanupRoots(options.cleanupRoots), agentCwd = options.agentCwd ?? action.cwd;
  const command = (action.command ?? '').replace(/\\\r?\n/g, '');
  // Strip quotes, not contents: concatenated shell literals cannot conceal a known basename.
  const text = command.replace(/\\([./_\w-])/g, '$1').replace(/["']/g, '');
  if (action.paths.some(secretPath) || secretPath(text)) return protectedAction('secrets');
  if (action.kind === 'delete' && action.paths.some(nonLiteralTarget)) return denyNonLiteralDelete();
  if (action.kind === 'delete' && (!action.paths.length || action.paths.some(p => !cleanup(p, action.cwd, agentCwd, roots)))) return protectedAction('irreversible_delete');
  const categories = new Set<UserCategory>();
  for (const words of shellSegments(command)) {
    if (dataCommand(words)) continue;
    for (let i = 0; i < words.length; i++) {
      const name = program(words[i]!).toLowerCase();
      const args = words.slice(i + 1), values = args.map(w => w.text);
      const [verb, next] = values;
      if (((name === 'systemctl' || name === 'service') && values.some(w => /^(?:(?:re)?enable|preset|link|start|restart)$/.test(w))) ||
          name === 'crontab' || (name === 'launchctl' && /^(?:load|bootstrap)$/.test(verb ?? '')) ||
          (/^schtasks(?:\.exe)?$/.test(name) && verb?.toLowerCase() === '/create') ||
          (((name === 'pm2' && /^(?:start|startup)$/.test(verb ?? '')) ||
            (name === 'docker' && (verb === 'run' || (verb === 'compose' && next === 'up')))) &&
            values.some(w => w === '-d' || /^--restart(?:=|$)/.test(w)))) categories.add('standing_service');
      if ((name === 'git' && verb === 'push' && values.some(w => /^--force(?:-with-lease)?(?:=|$)|^-[a-z]*f[a-z]*$/.test(w))) ||
          name === 'shred' || (name === 'find' && values.includes('-delete')) ||
          (name === 'drop' && /^(?:table|database|schema)$/i.test(verb ?? '')) || (name === 'truncate' && verb?.toLowerCase() === 'table'))
        categories.add('irreversible_delete');
      // SQL clients commonly take a literal statement as one argument.
      if (/\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/i.test(words[i]!.text)) categories.add('irreversible_delete');
      if (name === 'rm') {
        const end = values.indexOf('--'), options = end < 0 ? values : values.slice(0, end);
        if (options.some(w => /^-[a-z]*[rf][a-z]*$|^--(?:recursive|force)$/i.test(w))) {
          const targets = args.filter((w, n) => (end >= 0 && n > end) || !w.text.startsWith('-'));
          if (targets.some(w => !w.literal || nonLiteralTarget(w.text))) return denyNonLiteralDelete();
          if (!targets.length || targets.some(w => !cleanup(w.text, action.cwd, agentCwd, roots))) categories.add('irreversible_delete');
        }
      }
      if ((/^(?:npm|pnpm|yarn)$/.test(name) && verb === 'publish') || (name === 'gh' && verb === 'release' && next === 'create') ||
          (name === 'twine' && verb === 'upload') || (/^(?:vercel|netlify)$/.test(name) && verb === 'deploy')) categories.add('publish');
      if (/^(?:stripe|paypal|alpaca|binance|broker)$/.test(name) && values.some(w => /^(?:pay|charge|transfer|withdraw|order|buy|sell|trade)$/.test(w))) categories.add('money');
    }
  }
  if (categories.has('standing_service')) return protectedAction('standing_service');
  if (categories.has('irreversible_delete')) return protectedAction('irreversible_delete');
  if (categories.has('publish') || /(?:^|__)(?:publish|publish_post|post_tweet|send_email|send_mail|post_status|create_post)$/.test(action.tool))
    return protectedAction('publish');
  if (categories.has('money') || /(?:^|__)(?:place_order|submit_order|create_order|execute_trade|buy|sell|trade|transfer_money|make_payment|withdraw|charge_card)$/.test(action.tool))
    return protectedAction('money');
  return null;
}
