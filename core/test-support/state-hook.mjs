// Synthetic hook client for the public state/channel projection contracts.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || '{}');
const origin = new URL(process.env.ARTEMIS_PLUGIN_PROXY_URL).origin;
const id = encodeURIComponent(process.env.ARTEMIS_PLUGIN_AGENT_ID);
if (process.argv[2] === 'bulletin') {
  await readFile(process.argv[3], 'utf8');
  const response = await fetch(`${origin}/channel/${id}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Channel projection unavailable');
  const { channel, userTurn } = await response.json();
  const marker = join(process.env.HOME, '.artemis', 'state', 'user-turn', createHash('sha256').update(input.session_id).digest('hex'));
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, userTurn ? 'user' : 'system');
  if (userTurn) process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: channel === 'console' ? 'User channel: Console UI, fences render' : 'User channel: app, fences show as code',
  } }));
} else {
  const response = await fetch(`${origin}/state/${id}?source=${encodeURIComponent(input.source ?? 'resume')}`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Plugin state unavailable');
  const state = await response.json();
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: state.text } }));
}
