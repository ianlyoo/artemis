# Design

English · [한국어](design.ko.md)

This document explains how Artemis is put together and why. Each section ends with where the idea lives in `src/artemis/`.

## The problem

One AI agent in one session is easy to follow: you read what it did and you check it. The trouble starts when one person directs several agents at once.

**The person becomes the bottleneck.** If every agent asks before every action, the person spends the day approving things they cannot evaluate, and learns to approve without reading. If no agent asks, risky actions happen unseen. Either way the number of agents a person can run is set by their attention, not by the machine.

**Context gets lost.** Each session sees only its own work. A decision made in one chat is not in the next, and the person ends up as the only place where the whole picture lives, re-reading logs to remember what happened.

**"Done" stops meaning done.** The agent that did the work is also the one that says it is finished. A report is not a check, and after a few rounds nobody can tell which results were tested and which were only described.

**Changes arrive by many roads.** One agent commits to main, another leaves a branch, a third edits in place. Nobody can say what landed, which checks it passed, or what broke it.

Artemis answers each with one structural mechanism rather than more instructions: one lead you talk to, workers that run in parallel in their own worktrees, a judge separate from the work, one ship lane, a short written list of decisions that wait for a person, and one ledger that everything else is a view of.

## The attention budget

The claim Artemis makes is about the person's attention, and it counts it. An interruption is one decision put in the person's inbox. A finished task is one task whose work reached the target branch through the ship lane. Every status line and every digest shows both numbers, for example `3 tasks done · asked you 1×`.

Three kinds of action reach the person, and nothing else:

- **money out**: a payment, a purchase, a paid plan
- **irreversible delete**: anything that cannot be restored
- **send as you**: publishing, posting, emailing or pushing in the person's name

The line is drawn at irreversibility and at acting in someone's name, because those are the mistakes the system cannot repair on its own. Below that line, asking costs attention and teaches the person to approve without reading, which is worse than not asking. A project can narrow the list in `artemis.toml`, but not extend it beyond these three.

Each decision arrives as its own card, at the point where the work reaches it: what exactly, why it needs the person, what it rests on, and what happens if they do nothing. The answer to the last is always "nothing happens". Holding one decision back does not pause the rest of the work.

Everything else belongs to the lead: a rejected result, a failed check, a merge conflict, a crash, a permission refusal. These show in the digest as `stuck`, and the lead retries or drops them. They never become questions for the person.

In the code: `src/artemis/roles.py` names the three kinds as `Interrupt`. `src/artemis/config.py` reads the project's list from `[interrupts]` in `artemis.toml` and refuses anything outside the three. `src/artemis/attention.py` computes the two counts from ledger events.

## The lead

The person talks to one agent. The lead turns what they say into tasks, starts them, keeps track of them, and tells the person what changed.

With Claude Code, the lead is the person's own interactive session, started by `artemis start` with the Artemis instructions appended to its system prompt. The lead records the person's words as they said them, splits them into tasks that can run at the same time, gives each a check, and starts them. It then runs `artemis wait` in the background, which returns when something worth telling happens: a task shipped or got stuck, a decision was asked or answered. The lead reports that in a line or two and waits again. A status line under the prompt keeps the counts in view without anyone asking.

The lead is denied approving its own questions. Its session is started with settings that deny `artemis approve`, `artemis decline` and `artemis resume` to the agent. This is a rule, not a security boundary: the lead runs as the same user and could in principle write the ledger another way, so Artemis does not claim that only the person can approve. The person runs them directly (in Claude Code, `! artemis approve 1` runs the command as the person, outside the agent's permissions). After an approval the lead carries the action out and records what it did.

The demo uses a built-in chat lead with a fixed rule-based planner, so the whole flow can be tried without an account. It prints `mock` on every line it speaks.

In the code: `src/artemis/lead.py` starts the lead session (`start_cli`, `session_settings`) and holds the chat lead and its planner (`plan`, `chat`). `src/artemis/templates/lead.md` is the lead's instructions. `artemis wait` and `artemis statusline` are in `src/artemis/attention.py`.

## Workers in parallel

Each task runs in its own Git worktree on its own branch (`artemis/task-N`), so workers never touch the person's checkout or each other's files. Up to `max_workers` run at once; the rest queue and start as others finish.

A detached supervisor runs each task to its end without the person. It gives the worker the task on standard input, waits for it, and treats what the worker printed as a claim, not as a result. Then the supervisor, not the worker, commits whatever the worker changed. Workers only edit. They need no write access to Git's shared files, and a worker that wrote conflict markers or nothing at all is caught before anything is judged.

If the judge rejects the work, a check fails on the merged result, or the target branch moved and the branch now conflicts, the supervisor tries again with the reason attached: up to three attempts per task. For a conflict, the supervisor merges the current target into the task branch and asks the worker to resolve it. After the last attempt the task is `stuck` and goes to the lead.

Headless workers run as the person, so they are fenced. A Claude Code worker may read and edit files in its worktree, look at Git, and run its task's checks; anything else is refused without asking anyone, because nobody is there to approve.

In the code: `src/artemis/supervise.py` (`dispatch`, `supervise`, the retry loop, `_commit`, `_merge_target`). `src/artemis/agents.py` lists the agents and builds each worker's command, including the Claude Code allowlist. `src/artemis/mock_worker.py` is the worker without AI used by the demo and CI.

## The ledger as the only state

The ledger is one SQLite file, `.artemis/ledger.db`, in the project. It holds everything Artemis knows: the person's requests as they wrote them, tasks and their criteria, runs, submissions, evidence, verdicts, decisions and ship receipts.

Two kinds of record live in it. **Tables** hold the current state of things. **Events** form an append-only history: every change of state writes an event in the same transaction as the table change, and database triggers refuse any edit or delete of an event.

Everything the person sees is a **view** over those rows: the status line, the inbox, the digest, `artemis show`. None of them holds state of its own. That is what makes sessions disposable. The lead can be closed and reopened, a supervisor can crash, and the next reader finds the same facts.

In the code: `src/artemis/ledger.py` keeps the tables, the events, the triggers and the `work` view that gives every task one current state. Each transition opens one write transaction, checks the person's stop, and saves the change with its event.

## Evidence and the judge

The agent that did the work does not decide whether it is done. A judge does, and it rules only on what was recorded.

Each task has criteria. A command criterion is met when the command, run in a clean checkout of the worker's commit, exits 0 (and prints the expected text, if one is named). A file criterion is met when the commit contains the file; its digest is recorded. The supervisor captures this evidence itself; the worker's claim is kept but carries no weight. The judge gives one of three verdicts: pass, reject with the list of unmet criteria, or stop when the case cannot be judged (a task with no criteria, for instance).

Every line the person reads says how it is known:

| Label | Meaning |
|---|---|
| `shipped` | on the target branch, after the checks passed on the merged result |
| `verified` | the judge passed the evidence; not landed yet |
| `reported` | a worker says so; nothing checked yet |
| `inferred` | the lead's own reading |
| `decided` | the person ruled on a decision |
| `running` | a worker is on it now |
| `stuck` | the lead is handling it |

In the code: `src/artemis/judge.py` defines the evidence records, the criteria and the rule-based judge, which reads only recorded evidence and gives the same verdict on every run. The labels are computed in `src/artemis/attention.py` from the `work` view.

## The ship lane

Work reaches the target branch by one route.

1. Take the judged commit, pinned, so that what was checked is exactly what lands.
2. Look for the person's stop. If one is set, nothing runs.
3. Merge the commit onto the current target in a disposable worktree.
4. Run the project's checks on that merge.
5. **Green:** move the target to the tested commit, only if it has not moved since step 3, and save a receipt with the commit, the target, and each check's command, exit code and output digest.
6. **Red or conflict:** leave the target alone and send the reason back to the task's supervisor.

Landings are serial: one lock per project, so two tasks never race to move the same branch. If the target is the branch checked out in the person's working copy, the lane fast-forwards it only when no local edits are in the way; otherwise it moves the branch reference with a compare-and-swap. Artemis never pushes. Publishing your branch is a decision of the `send as you` kind.

The target is `main` by default and is set under `[ship] target` in `artemis.toml`. A commit that tracks files under `.artemis/` is refused.

In the code: `src/artemis/ship.py` (`ship`, `_merge`, `_advance`, `lane`). `src/artemis/ledger.py` will not record checks or a receipt unless the latest verdict passed that exact commit.

## The decision inbox and the stop

A decision is created by the lead (`artemis ask`) with its kind, what exactly, and why it needs the person. It waits in the inbox until the person approves or declines it; the card also says what the request's tasks have done so far, so the person decides with the evidence in front of them. An approval lets the action happen once.

The **stop** works the other way. `artemis stop` writes a stop to the ledger. Supervisors, retries and the ship lane look for it before every step and do nothing while it is set; nothing new can be started. A stop has no expiry and no automatic release. Only the person clears it with `artemis resume`, which the lead's session cannot run.

In the code: decisions and the stop are ledger transitions in `src/artemis/ledger.py`; the cards and the inbox are drawn by `src/artemis/attention.py`; `src/artemis/cli.py` exposes `approve`, `decline`, `stop` and `resume`.

## The digest

The digest is how a person catches up. It covers what changed since they last read it: one header line with the window, the counts and whether anything is stuck, then one line per task touched and per decision made, each starting with its label.

```text
Last 9 min · 3 tasks done · asked you 1× · nothing stuck
shipped   #1 Add a --json flag            main 2d1c61c · python3 -m unittest exit 0
shipped   #2 Add a --done filter          main 02446a5 · python3 -m unittest exit 0
shipped   #3 Document both in the README  main dd72f65 · README mentions --json, --done
decided   D1 Post a release note to the team  you approved · posted to the demo outbox
```

Reading it marks the window as read, so the next digest starts from there. The window is relative ("Last 9 min"), not a clock time. A task line names its evidence by the check's label, so the person sees what was checked without opening anything.

In the code: `src/artemis/attention.py` (`digest`, `window`, `counts`, `status`, `statusline`).

## Failure handling

When something fails, the fix goes where the failure came from. The reflex with agents is to add a guard where the problem showed: a retry, a wait, a special case, another line in the prompt. Each guard works for a while; together they make a system nobody can reason about. Artemis asks what in the design produced the failure and changes that. For example, workers once committed their own changes, and one agent's sandbox could not write Git's shared files. The fix was not a permission exception: the supervisor now owns commits, and workers only edit.

Failures are recorded, not swallowed. A red check is a row with its output digest, a stuck task carries its reason, and the digest shows both.

In the code: a failed transition rolls back together with its event (`src/artemis/ledger.py`); a red check and a conflict are recorded and handed back (`src/artemis/ship.py`, `src/artemis/supervise.py`); a supervisor whose process died is marked stuck the next time anyone reads the ledger (`reap` in `src/artemis/attention.py`).

## What was left out

Artemis began as a larger personal system. This repository is its open version, and some parts are absent on purpose.

- **Pushing and deploying.** The ship lane stops at a local branch. Pushing is the person's call.
- **More agents.** Claude Code and the mock work today; Codex, OpenCode and an OpenAI-compatible API worker are next.
- **Windows workers.** The unit tests run on Windows; real workers there are not supported yet.
- **Real data.** Every request, task and name in the code, the tests and the demo is invented.
