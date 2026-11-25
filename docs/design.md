# Design

English · [한국어](design.ko.md)

This document explains how Artemis is put together and why. Each section ends with where the idea lives in `src/artemis/`.

## The problem

One AI agent in one session is easy to follow: you read what it did and you check it. The trouble starts when one person directs several agents across several projects, on their own computer.

**The person becomes the bottleneck.** If every agent asks before every action, the person spends the day approving things they cannot evaluate, and learns to approve without reading. If no agent asks, risky actions happen unseen.

**Context gets lost.** Each session sees only its own work. A decision made in one chat is not in the next, and changing to another company's model starts from nothing. The person ends up as the only place where the whole picture lives.

**"Done" stops meaning done.** The agent that did the work is also the one that says it is finished. A report is not a check.

**Real work needs real access, and real access is risky.** Sorting files, running programs and posting results need the person's computer and keys. Pasting a key into a prompt puts it in a transcript; giving an agent a shell gives it everything the person can do.

**The same mistake comes back.** A correction made today is gone in the next session.

Artemis answers each with a structure rather than more instructions: one home process with one ledger, one lead you talk to, workers from several companies behind one gate, a judge separate from the work, one ship lane, a vault used by name, a short written list of actions that wait for a person, and lessons that change the next run.

## The home

Artemis is one always-on process per user, `artemis serve`. It holds the ledger, runs the lead and the workers, fires schedules, keeps the vault and serves the App. Everything it owns lives in one folder: `~/.artemis` (`%USERPROFILE%\.artemis` on Windows), or `ARTEMIS_HOME`. A lock file keeps it to one home per folder. Supervisors run as threads inside it, so there are no pid files to go stale.

A project is a row in the home's ledger: a Git repository (tasks run in worktrees and land through the ship lane) or any folder (workers act there through Artemis's file tools). `artemis project add` registers one; `--no-run` takes away the tool that runs programs, `--root` lets workers reach another folder.

When the home starts after a crash, it marks the runs it left open as stuck with the reason, and the lead retries them. A slot a schedule missed while the computer was off runs once, labelled `late`.

In the code: `src/artemis/home.py` (`Paths`, `Home`, `open`, the lock and the port file), `src/artemis/supervise.py` (one supervisor per task), `src/artemis/schedule.py` (the 30-second tick and the slot claim), `src/artemis/process.py` (child environments and ending a whole process tree).

## The ledger as the only state

The ledger is one SQLite file, `~/.artemis/ledger.db`. It holds everything Artemis knows: projects, the person's messages and requests as they wrote them, tasks and their criteria, runs, submissions, evidence, verdicts, cards, standing approvals, lessons, schedules, jobs, devices, receipts and secret uses (names and times, never values).

Two kinds of record live in it. **Tables** hold the current state of things. **Events** form an append-only history: every change of state writes an event in the same transaction, and triggers refuse any edit or delete of an event.

Everything the person sees is a **view** over those rows: the App, the board, the status line, the digest, `artemis show`. None of them holds state of its own. That is what makes every session disposable, the lead's included.

In the code: `src/artemis/ledger.py` keeps the tables, the events, the triggers and the `work` view that gives every task one current state. Each transition opens one write transaction, checks the person's stop and the actor's role, and saves the change with its event. `src/artemis/roles.py` says who may make which transition.

## The lead

The person talks to one agent. The lead turns what they say into tasks, picks who does each, keeps track of every project, and tells the person what changed.

The lead is cold. Each message from the person, and each wake from the home (a task shipped or got stuck, a card was answered, a schedule fired), starts one new headless turn. The home hands it a context packet read fresh from the ledger: the projects and what each is doing now, open cards, due schedules, the lessons in scope, the lead's own recent notes and the last twenty messages. There is no vendor session to resume. That is why the lead's model can change between two messages and the next turn still knows both projects: its memory is the ledger, not a transcript.

The lead has no shell and no file tools of its own. Its tools are the lead tools of the gate: read the projects, their status and evidence, read files, create, retry and drop tasks, schedule work, ask a card, request a secret, write a lesson or a note. Any qualified provider can lead; `artemis doctor providers` says which ones qualified here. The home limits how often the lead wakes on its own (`wake_per_hour`, 6 by default).

In the code: `src/artemis/lead.py` (`LeadRunner`, one turn per message or wake), `src/artemis/packet.py` (the context packet), `src/artemis/templates/lead.md` (the lead's instructions).

## One gate

Every agent, lead or worker, reaches the computer through one door. Each vendor's own shell and file tools are turned off, and the agent gets the Artemis tools over MCP: `artemis mcp --run <token-file>` is a small stdio server that forwards each call to the home, which carries it out. The token names the run, and the home looks up what that run may do.

Before any call is carried out, the gate checks the person's stop, checks that every path is inside the folders the project registered, matches the command against the rules, puts any secret in by name, and scrubs every vault value out of the result. Then it records the call.

Worker tools: `run`, `job`, `job_stop`, `http_request`, `read_file`, `list_dir`, `search`, `write_file`, `move`, `trash`, `secret_names`, `secret_request`, `ask`, `note`, `check`. Lead tools: `projects`, `status`, `evidence`, `read_file`, `list_dir`, `search`, `task_create`, `task_retry`, `task_drop`, `schedule`, `ask`, `secret_request`, `lesson`, `note`.

- `run` takes a program and its arguments, never a shell line (unless the project was added with `--shell`). It runs for up to 45 seconds and then becomes a background `job`.
- `http_request` makes a web request for the agent. A key stored for a website is added by the home, only for that website's origin, so no agent process ever receives it.
- `write_file`, `move` and `trash` journal what they replace. Nothing is deleted.

How each vendor is fenced:

| Agent | Fence |
|---|---|
| Claude Code | `claude -p --restricted --strict-mcp-config`, built-in tools limited to reading and editing in a worktree, none for the lead and host tasks; the Artemis server is the only MCP server |
| Codex | `codex exec` with the shell tool and other listed features disabled, the OS sandbox by mode, instructions on stdin |
| Gemini CLI | a per-run home and system settings with an admin policy that denies every built-in tool but the Artemis ones |
| OpenCode | a deny-first agent passed in `OPENCODE_CONFIG_CONTENT`, the project's own config ignored |
| API | a tool loop the home runs itself; the model sees only the Artemis tools |

Fences are checked, not assumed. `artemis doctor providers` starts each installed agent once per role against a throwaway probe: a repository, a folder, a file outside both holding a random marker, a web page that records visits, and a stand-in tool server that records calls. The model is asked to try what its fence should stop, and the qualification believes only what it sees afterwards. An agent is `live` for a role only when every check held and one Artemis call went through; `unqualified` when a check failed, and placement never uses it; `contract` when it is built to the contract but has not been shown live on this computer. A new version moves a live agent back to `contract` until it is probed again.

In the code: `src/artemis/broker.py` (the tools and their checks), `src/artemis/mcp.py` (the stdio server), `src/artemis/guard.py` (reading a command against the rules), `src/artemis/httpop.py` (`http_request`), `src/artemis/undo.py` (the journal), `src/artemis/agents.py` and `src/artemis/worker_adapters.py` (how each vendor starts fenced), `src/artemis/qualify.py` (the qualification).

## What reaches the person

Three kinds of action reach the person, and nothing else:

- **money out**: a payment, a purchase, a paid plan
- **irreversible delete**: anything that cannot be restored
- **send as you**: publishing, posting, emailing or pushing in the person's name

The line is drawn at irreversibility and at acting in someone's name, because those are the mistakes the system cannot repair on its own. Below that line, asking costs attention and teaches the person to approve without reading.

Artemis recognises these actions three ways, and the README says which part is which:

1. **By the key an action uses.** A secret is stored with a kind. A `spend` key makes every use a money-out card; a `send` key makes every changing request a send-as-you card. This holds as long as the credential lives only in the vault.
2. **By its own file tools.** They never delete; `trash` moves a file into the task's undo folder.
3. **By a list of command patterns** in `~/.artemis/rules.toml`, matched on the program and its arguments. This is a tripwire: a program the list does not recognise runs. A project added with `--no-run`, a sandbox in `[run] wrap`, or a separate OS user turns it into a wall.

A matched action becomes a card with the exact operation recorded. Approving it runs that recorded operation once, through the gate, and never again. A card the person ignores changes nothing, and other work carries on. For a recurring send the person asked for, the card can offer a standing approval bound to one schedule, one exact address and one key, revocable at any time; money out never gets one. Cards also carry choices and secret requests, the two other things only the person can give.

Everything else belongs to the lead: a rejected result, a failed check, a merge conflict, a crash, a refused call. These show in the digest as `stuck`, and the lead retries or drops them.

The **stop** works the other way. `artemis stop` (or the Stop button in the App) writes a stop to the ledger. Supervisors, schedules, retries, the gate and the ship lane look for it before every step; running work is ended. Only the person clears it with `artemis resume`.

In the code: `src/artemis/roles.py` names the three kinds as `Interrupt`; `src/artemis/guard.py` and `src/artemis/templates/rules.toml` hold the patterns; cards, standing approvals and the stop are ledger transitions in `src/artemis/ledger.py`; `Broker.run_card` in `src/artemis/broker.py` carries out an approved card exactly once.

## Secrets

Values live in `~/.artemis/vault.db`, each encrypted with AES-256-GCM. The vault's key is kept in the OS keychain through `keyring`. Without a keychain, or with `[vault] unlock = "passphrase"`, the key is wrapped with a passphrase (scrypt) that the person types when the home starts; `unlock = "env"` reads it from the environment, for CI. There is no key file.

A value enters only through a hidden prompt (`artemis secret set`) or a secret card in the App, and agents see only its name and the person's note. A key for a website goes out only through `http_request`, to its origin. A key for a command is given to that command in its environment or on stdin, never in its arguments, and the README says plainly that the command can then do what it likes with it.

The scrubber replaces every stored value, and its common encodings (base64, base64url, hex, percent, JSON, line-end variants, and base64 inside a longer encoding), with `[secret:NAME]` in tool results, logs and ledger text. `artemis secret audit` searches the ledger, the logs and the worktrees for every value and prints how many it found.

In the code: `src/artemis/vault.py`, `src/artemis/scrub.py`, `src/artemis/httpop.py`.

## Host tasks and undo

A host task is a task on a folder project. Its worker reads, writes and runs only through the gate. "Full control" means: programs you could run yourself, as you, in the folders you register. Artemis does not move the mouse or read the screen.

`write_file`, `move` and `trash` record what they replaced under `undo/task-N/` with a manifest. `artemis undo N` puts everything back, newest first, and refuses, naming the file, if a file was changed again after the task. What a program does when `run` starts it is outside the journal.

At the start of a host task the supervisor snapshots the names, sizes and digests of the declared inputs. The judge then rules on properties the person can check: a command exits 0, a file exists and changed, a file contains a text, a folder holds at least N files, every file's digest was preserved from one place to another.

In the code: `src/artemis/undo.py`, `snapshot` and `capture` in `src/artemis/judge.py`.

## Evidence and the judge

The agent that did the work does not decide whether it is done. A judge does, and it rules only on what was recorded.

Each task has criteria. A command criterion is met when the command, run in a clean checkout of the worker's commit (or in the folder, for a host task), exits 0. A file criterion records the file's digest. The supervisor captures this evidence itself; the worker's claim is kept but carries no weight. The judge gives one of three verdicts: pass, reject with the unmet criteria, or stop when the case cannot be judged.

A second opinion can be asked for (`review = true`). It comes from a model made by a different company than the worker's, and it can only add gaps: it cannot pass work the judge failed.

Every line the person reads says how it is known:

| Label | Meaning |
|---|---|
| `shipped` | on the target branch, after the checks passed on the merged result |
| `verified` | the judge passed the evidence; for a host task, the result |
| `reported` | a worker says so; nothing checked yet |
| `inferred` | the lead's own reading |
| `decided` | the person ruled on a card |
| `running` | a worker is on it now |
| `stuck` | the lead is handling it |

In the code: `src/artemis/judge.py`, `src/artemis/review.py`; the labels are computed in `src/artemis/attention.py`.

## The ship lane

Code reaches the target branch by one route.

1. Take the judged commit, pinned, so that what was checked is exactly what lands.
2. Look for the person's stop.
3. Merge the commit onto the current target in a disposable worktree.
4. Run the project's checks on that merge.
5. **Green:** move the target to the tested commit, only if it has not moved since step 3, and save a receipt.
6. **Red or conflict:** leave the target alone and send the reason back to the task's supervisor, which retries with the reason attached, up to three attempts.

Landings are serial per project. Artemis never pushes on its own; `git push` is a send-as-you action.

In the code: `src/artemis/ship.py`.

## The team

Five kinds of agent can work: Claude Code, Codex, Gemini CLI, OpenCode and an OpenAI-compatible API, plus a labelled mock for the demo and CI. Each task has a kind (code, review, research, docs, host), and `[placement]` in `config.toml` gives each kind an order of providers. The first qualified, available one takes it. Several run at once, each in its own worktree or under its own run token.

Placement can learn: when one provider fails the same kind of task three times on a project, a placement lesson moves it last for that kind there.

Artemis runs the CLIs the person installed, unmodified, under the sign-in each one manages, and never reads those credentials. The API worker is billed separately by its provider, so it runs only when the person names it.

In the code: `src/artemis/agents.py` (`place`, `launch`, `available`), `src/artemis/worker_adapters.py`, `src/artemis/api_worker.py`, `src/artemis/mock_worker.py`, `src/artemis/qualify.py`.

## Lessons

A mistake should change the next run, not just the next apology. A lesson is a ledger row with a kind, a scope (one project or all), its source events and two counters.

- **Triggers.** A judge reject followed by a pass, and a correction the person makes in chat, are written up by the lead. Three failures by one provider on one kind of task become a placement lesson. A card the person declines becomes a proposed guard. Workers cannot write lessons.
- **Becoming a change.** A `rule` is a line in the next instructions for its scope (the newest ten). A `check` becomes a project check only if it passes on the current target and fails on the rejected submission that produced it. A `placement` reorders providers. A `guard` is a new pattern in `rules.toml`, added only when the person says yes to "Always ask before …?".
- **Visible.** The digest shows `learned L4 … from #12 judge reject`, and each lesson counts its uses and the first-try passes after them. A lesson used five times without beating the project's first-try rate is marked `unproven`.
- **Only the person loosens.** A lesson is retired by the person, in the App or with `artemis lesson`. Artemis never patches its own installed code; a code change goes through a normal task, the judge and the ship lane.

`tests/test_lessons.py` shows the mechanism: a scripted worker fails, a lesson is written, the next task passes on the first try, and retiring the lesson makes it fail again.

In the code: `src/artemis/lessons.py`.

## The App

The App is the person's main surface, served by the home from `src/artemis/web/`: a standard-library HTTP server with server-sent events and a long-poll fallback, and a frontend of plain modules with Preact and htm vendored, so there is no build step.

Screens: the chat with the lead (cards appear inline where they arose, and in a "Needs you" tray), the board of every project, the digest, lessons, secrets (names, kinds, origins and last use, never a value), and settings (agents, placement, standing approvals, devices, schedules). Stop and Resume are on every screen. The header keeps the count: `asked you 1× today · 7 done · 0 stuck`.

On this computer the App is served on loopback with a token. `--lan` serves it over HTTPS only, with a self-signed certificate made by the home; the terminal shows the address, a QR code and the fingerprint. The pairing link is single-use and short-lived. After scanning, the phone shows four digits, and the person confirms them on the computer before the phone gains any authority. Devices can be listed and revoked.

In the code: `src/artemis/web/` (`__init__.py` is the server and its API; `index.html`, `app.js`, `chat.js`, `cards.js`, `board.js` and `pages.js` are the screens; `vendor/` holds Preact and htm with their licences), `src/artemis/tls.py` (the certificate and the QR code).

## The digest

The digest is how a person catches up: one header line with the window, the counts and whether anything is stuck, then one line per task touched and per card decided, each starting with its label and ending with its evidence.

```text
Last 1 min · asked you 1× · 3 done · 0 stuck · 0 wakes
shipped   #1 Add a --json flag                 main 0796fa7 · python3 -m unittest exit 0
shipped   #2 Add a --done filter               main b319430 · python3 -m unittest exit 0
shipped   #3 Document both in the README       main e0dff1f · README mentions --json, --done
decided   D1 POST to the local demo receiver   you approved · 204 No Content · body matches the card
```

Only the person's reading marks the window as read.

In the code: `src/artemis/attention.py` (`digest`, `status`, `statusline`).

## Failure handling

When something fails, the fix goes where the failure came from. The reflex with agents is to add a guard where the problem showed: a retry, a wait, a special case, another line in the prompt. Each guard works for a while; together they make a system nobody can reason about. Artemis asks what in the design produced the failure and changes that, and the lesson loop exists so that the system does the same with its own mistakes.

Failures are recorded, not swallowed. A red check is a row with its output digest, a stuck task carries its reason, a refused call is an event, and the digest shows them.

## What was left out

Artemis began as a larger personal system. This repository is its open version, written fresh, and some parts are absent on purpose.

- **Screen and mouse control.** Host tasks run programs; they do not drive the desktop.
- **An OS service.** The home runs while `artemis serve` runs.
- **More than one user, push notifications and a native app.**
- **Self-patching.** Lessons change prompts, checks, placement and rules, never Artemis's installed code.
- **Real data.** Every request, task and name in the code, the tests and the demo is invented.
