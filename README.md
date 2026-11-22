<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/wordmark-dark.svg">
    <img src="assets/readme/wordmark-light.svg" width="100%" alt="Artemis">
  </picture>
</p>

<p align="center">
  <b>Talk to one lead. Many agents work at once.</b><br>
  You are asked only for real decisions, and you catch up in one line per task.
</p>

<p align="center">
  <a href="LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/license-Apache--2.0-e6edf3?style=flat-square&labelColor=30363d"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-1f2328?style=flat-square&labelColor=eaeef2"></picture></a>
  <a href="pyproject.toml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/python-%E2%89%A53.11-e6edf3?style=flat-square&labelColor=30363d"><img alt="Python 3.11 or newer" src="https://img.shields.io/badge/python-%E2%89%A53.11-1f2328?style=flat-square&labelColor=eaeef2"></picture></a>
  <a href="#try-it-in-a-minute"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-e6edf3?style=flat-square&labelColor=30363d"><img alt="Platform: macOS and Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-1f2328?style=flat-square&labelColor=eaeef2"></picture></a>
  <a href="#status"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/status-early%20release-e6edf3?style=flat-square&labelColor=30363d"><img alt="Status: early release" src="https://img.shields.io/badge/status-early%20release-1f2328?style=flat-square&labelColor=eaeef2"></picture></a>
  <a href="https://github.com/ianlyoo/artemis/actions/workflows/quickstart.yml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/github/actions/workflow/status/ianlyoo/artemis/quickstart.yml?style=flat-square&labelColor=30363d&color=e6edf3&label=CI&branch=main"><img alt="Quickstart CI" src="https://img.shields.io/github/actions/workflow/status/ianlyoo/artemis/quickstart.yml?style=flat-square&labelColor=eaeef2&color=1f2328&label=CI&branch=main"></picture></a>
</p>

<p align="center">
  <a href="README.ko.md">한국어</a> · <a href="docs/design.md">Design</a> · <a href="#try-it-in-a-minute">Try it</a>
</p>

<p align="center">
  <picture>
    <source media="(max-width: 1080px)" srcset="assets/readme/digest-narrow.svg">
    <img src="assets/readme/digest.svg" width="100%" alt="One sentence goes to the lead. Three workers run at once while the status line counts them down. One decision waits for you. The digest then says, in five lines, that three tasks were shipped and you were asked once.">
  </picture>
</p>

<p align="center">
  <sub>The run in <a href="docs/demo/transcript.txt">docs/demo/transcript.txt</a>, from <code>artemis demo</code>, drawn by <a href="assets/readme/render.py">assets/readme/render.py</a>.<br>
  Its workers are the mock, which makes canned changes without AI. <code>artemis demo --agent claude</code> runs the same script with Claude Code workers.</sub>
</p>

Run several coding agents at once and you soon become the bottleneck. Either you keep to as many sessions as you can follow, or you approve everything without reading it.

Artemis puts one lead between you and the workers. The lead turns what you ask into tasks that run in parallel, each in its own Git worktree. A judge checks each result against commands, and a ship lane lands the work after the checks pass on the merged result. Only the decisions you listed come back to you. When you return, the digest says in a few lines what landed, what is waiting for you and what is stuck, and how each line is known.

Every run counts what it cost you: **3 tasks done · asked you 1×**.

## Try it in a minute

<!-- quickstart:begin -->
You need Python 3.11 or newer, Git and [pipx](https://pipx.pypa.io/), on macOS or Linux. No account is needed for this part. No pipx yet? `brew install pipx` on macOS, `sudo apt install pipx` on Ubuntu or Debian.

### Install

```sh
pipx install git+https://github.com/ianlyoo/artemis
```

This puts the `artemis` command on your path. The package is `artemis-harness`, so `pipx uninstall artemis-harness` removes it.

### Run the demo

```sh
artemis demo
```

The demo makes a small to-do project in a temporary folder and gives the lead one sentence. Three mock workers run at once, one decision waits for you and is approved as you, and the digest ends the run. It plays your part too; to play it yourself, use `artemis start --demo` below.
<!-- quickstart:end -->

## Use it with Claude Code

Inside a Git repository with [Claude Code](https://code.claude.com/docs/en/quickstart) installed and signed in:

```sh
artemis start
```

The first start writes `artemis.toml` with your project's test command, found from `package.json`, `Cargo.toml`, `go.mod` or your Python tests. Check it once: the ship lane runs it on every merge. Then your own Claude Code session opens as the lead, with the Artemis instructions, a status line and the `artemis` command. Tell it what you want:

> Add a --json flag and a --done filter, document both in the README, then post a release note to the team.

- The lead records your words, splits them into tasks and starts them. Each task gets a check the judge will run.
- Each worker is a headless `claude -p` in its own worktree on its own branch. Workers never touch your checkout.
- The status line keeps count without you asking: `● 3 running · 1 decision for you · asked you 1× · 0 done`. It appears once you trust the folder when Claude Code asks.
- The judge rules on each result. The ship lane merges it with the current main in a throwaway worktree, runs your checks on the merge, and moves main only if they pass. A failure or conflict goes back to the worker, and then to the lead. It never comes to you.
- Posting the release note speaks for you, so the lead asks once and waits. You answer with `! artemis approve 1`. The `!` runs the command as you; a rule in the lead's session settings denies it `approve`. That is a rule, not a wall: the lead runs as you, so do not give it other ways around it.

Ask the lead "what happened?" when you come back, or run `artemis digest`. To try all of this on a throwaway project first, run `artemis start --demo`.

## What reaches you

Artemis puts three kinds of action to you, and nothing else:

- **money out**: a payment, a purchase, a paid plan
- **irreversible delete**: anything that cannot be restored
- **send as you**: publishing, posting, emailing or pushing in your name

Each one comes as a separate card: the exact action, why it is yours to decide, and the evidence behind it. A card you ignore changes nothing, and work on other tasks carries on. Rejected work, merge conflicts, crashes and permission refusals are the lead's problem: they show as `stuck` in the digest while the lead retries or drops them. To be asked about fewer kinds, edit `[interrupts]` in `artemis.toml`. `artemis stop` halts all automatic work at once; nothing starts again until you run `artemis resume`.

## The digest

```text
Last under a minute · 3 tasks done · asked you 1× · nothing stuck
shipped   #1 Add a --json flag            main 2d1c61c · python3 -m unittest exit 0
shipped   #2 Add a --done filter          main 02446a5 · python3 -m unittest exit 0
shipped   #3 Document both in the README  main dd72f65 · README mentions --json, --done
decided   D1 Post a release note to the team  you approved · posted to the demo outbox
```

Every line starts with how it is known.

| Label | Meaning |
|---|---|
| `shipped` | on main, after the checks passed on the merged result |
| `verified` | the judge passed the evidence; not on main yet |
| `reported` | a worker says so; nothing checked yet |
| `inferred` | the lead's own reading |
| `decided` | you ruled on a decision |
| `running` | a worker is on it now |
| `stuck` | the lead is handling it: three attempts failed, or a crash |

The digest covers what changed since you last read it. `artemis status` shows the same counts at any time.

## Agents

| Agent | As the lead | As a worker | |
|---|---|---|---|
| Claude Code | `artemis start` | `claude -p`, reading and editing in its worktree and running its task's checks; anything else is refused without asking | supported |
| Codex | — | `codex exec` with its shell turned off: it reads files and runs the task's checks through Artemis tools, and edits with its own patch tool | supported |
| OpenCode | — | `opencode run` under an Artemis permission profile: read, edit and the task's checks; everything else is denied | tested against a stand-in CLI |
| OpenAI-compatible API | — | one request carrying the tracked files; Artemis checks the reply's whole-file edits and writes them | tested against a stand-in server |
| mock | built-in chat | canned edits for the demo project, no AI | for trying the flow and for CI |

Choose with `worker = "..."` under `[agents]` in `artemis.toml`. `auto` takes the first of Claude Code, Codex and OpenCode that is installed, and the mock when none is. The API worker is billed separately by its provider, so it runs only when you name it; set `model`, `base_url` and `key_env` (the name of the environment variable that holds your key) under `[api]`.

Artemis runs the CLIs you installed, unmodified, under the sign-in or API key each one manages; Artemis never sees those credentials. Workers draw on the same plan allowance as your own sessions. The API worker reads its key from the environment variable you name and sends it only to your endpoint. Artemis is independent of Anthropic, OpenAI and OpenCode.

## How it stays trustworthy

- **One ledger.** Requests, tasks, runs, evidence, verdicts, decisions and receipts live in `.artemis/ledger.db`, a SQLite file in your project. The status line, the inbox and the digest are queries over it. Events are append-only.
- **The judge is not the doer.** A worker's claim is a report. The judge rules only on what was recorded: the exit code of each check and the digest of each required file, captured in a clean checkout of the worker's commit.
- **One ship lane.** Work reaches main by one route: merge in a disposable worktree, checks on the merge, fast-forward, receipt. Artemis never pushes.
- **A stop beats every automation.** Workers, retries and the ship lane look for your stop before each step.

Workers run as you. A Claude Code worker may read and edit in its worktree, look at Git and run its task's checks, and everything else is refused without asking. The checks run agent-written code as you, in disposable worktrees, and see only PATH, HOME, locale, temp and toolchain variables from your shell; name any others your tests need under `pass_env` in `[ship]`. That keeps tokens in your environment away from the code, not your files: use Artemis on code you would run yourself.

[docs/design.md](docs/design.md) explains each idea and where it lives in `src/artemis/`.

## Commands

| You | The lead | Anyone |
|---|---|---|
| `artemis start` · `artemis approve N` · `artemis decline N` · `artemis stop` · `artemis resume` | `artemis request` · `task` · `ask` · `carried` · `retry` · `drop` · `note` · `wait` | `artemis status` · `inbox` · `digest` · `show` · `demo` |

Settings are in `artemis.toml`: which agent leads and which works, how many workers run at once, the interrupt list, the branch work lands on, and the checks.

## Status

This is an early release: the lead, parallel workers, the decision inbox and the digest. Claude Code leads; Claude Code, Codex, OpenCode, an OpenAI-compatible API and the mock work. The quickstart runs on fresh macOS and Linux machines in CI. Unit tests also run on Windows; real workers there are not supported yet.

See [NOTICES.md](NOTICES.md) for the open-source projects that informed this project.

<p align="center">
  <sub>Apache-2.0 · <a href="LICENSE">LICENSE</a></sub>
</p>
