# Design

English · [한국어](design.ko.md)

This document explains how Artemis is put together and why. The main text describes the private design. Each section ends with the behavior implemented by the local demo.

## The problem

A single AI agent in a single session is easy to follow. You read what it did and you check it. The trouble starts when one person directs many agents at once, over days, across sessions that forget everything when they end.

Three things go wrong, and they go wrong quietly.

**Decisions get lost.** A decision made in a chat scrolls out of view. The next session starts without it and either asks again or guesses. Two agents working in parallel can each act on a different version of the same instruction.

**"Done" stops meaning done.** The agent that did the work is also the one that says it is finished. It reports in good faith, but a report is not a check. After a few rounds the person can no longer tell which results were tested and which were only described.

**Changes arrive by many roads.** One agent commits straight to the main branch, another asks a person to merge, a third edits a file in place. Nobody can say what is running now, which checks it passed, or which change broke something.

A fourth problem sits underneath the other three: the person becomes the bottleneck. If every agent asks before every action, the person spends the day approving things they cannot evaluate, and learns to approve without reading. If no agent asks, risky actions happen unseen.

Artemis answers each of these with one structural mechanism rather than with more instructions: roles with written scope, one ledger as the only state, a judge that is separate from the work, one ship lane, and a short list of decisions that wait for a person.

## Roles and authority

Work moves down a chain of roles. Each role receives a piece of work, narrows it, and hands smaller pieces to the next.

| Role | Owns | Hands down |
|---|---|---|
| Owner | the intent and the few decisions that are theirs alone | a request |
| Lead | what is wanted and why | a goal with done criteria |
| CTO | how it will be built | projects, each with a brief |
| PM | one project, until it is done | tasks, each with a brief |
| Worker | one task | a report with evidence |
| Judge | nothing in the work | a verdict |

The judge is called the CQO (chief quality officer) in the code, and its role name there is `cqo`.

Each role has a short card describing its responsibility, its limits and the shape of what it returns. Work is handed down as a brief with five fixed parts: the task, the expected deliverable, the scope (which paths or systems may be touched), how the result will be checked, and the condition for finishing. The worker keeps going until that condition is true and then reports once. Because every report has the same fields (outcome, changes, checks run with their results, risks, suggested next step), a PM can compare them side by side. A worker that sends back a plan of things still to do has not reported; it does those things first.

Approval happens at the plan level. Once the owner has said yes to a plan, nothing inside it comes back for another yes. A PM does not ask the CTO whether it may start a worker; a worker does not ask whether it may run the tests. What does go back up the chain is a block that only the level above can lift, and the short list of owner-only decisions described below.

There is one launcher and no other way to start an agent. Before an agent runs, the launcher records its role, its brief and the agent that asked for it. That record is how a person can see every agent at work and halt any of them; an agent started some other way would leave no such record.

In the code: `src/harness/roles.py` names the roles and holds the shared check that the right role is acting. Each transition in `src/harness/ledger.py` states which role may make it. `src/harness/agents.py` hands a step to a local callback; the demo has no registry of running agents.

## The ledger as the only state

The ledger is one database. It holds everything the system knows: the requests as they were written, the goals and their criteria, the projects and tasks, the agents and their briefs, every claim and its evidence, every verdict, and every ship receipt.

Two kinds of record live in it.

**Tables** hold the current state of things. A task row says which project it belongs to, which agent holds it, and where it stands.

**Events** form an append-only history. Every change of state writes an event in the same transaction as the table change: task assigned, evidence attached, claim made, verdict given, change shipped. Nothing is edited after the fact. When something needs correcting, a new event records the correction.

Everything else is a **view**. A chat reply that says a project is waiting on review reads that from the ledger. A dashboard is a set of queries. A report file is rendered from rows. None of these is a place where state lives. If a fact appears only in a chat message, then as far as the system is concerned it does not exist, and the next session will not see it.

This rule is what makes sessions disposable. An agent can be stopped and replaced at any moment, because what it knew that mattered is already in the ledger. A new session reads its brief and the rows it needs, and carries on.

The ledger is a database rather than a folder of files for ordinary reasons: many agents write at once, a state change and its event must land together or not at all, and every role needs to ask questions such as "which tasks under this goal are still open" without reading everything.

In the code: `src/harness/ledger.py` keeps the records in a local SQLite file. Each transition opens one write transaction, checks for a stop, and saves the change together with its event; database triggers refuse any edit or delete of an event. `src/harness/cli.py` prints the timeline by querying those rows.

## Evidence and the judge

The agent that did the work does not decide whether the work is done. A separate judge does.

When a PM believes a project is finished, it makes a **done claim**: for each criterion, the evidence that meets it. Evidence here means one of two things. Either a command that was run, kept with what it printed, or a thing that can be inspected directly, such as a commit, a file, a screenshot or a ship receipt. A sentence saying that something works does not qualify; it is a report.

Every factual statement in the system carries one of four labels:

- **shipped**: came in through the ship lane and is live
- **verified**: the writer can point to the command output or artifact
- **reported**: stated by someone, checked by no one
- **inferred**: concluded from other facts, not seen directly

The labels keep a report honest about how much is known. A summary full of "reported" lines reads very differently from one full of "verified" lines, and the reader can tell at a glance.

The judge is a fresh session that took no part in the work. It cannot change anything; it can only read the claim, the criteria, the evidence, and the original request, and give one verdict.

- **Pass.** Every criterion is met by evidence. The claim becomes fact in the ledger.
- **Reject with gaps.** One or more criteria are not met. Each gap names the criterion and quotes what in the evidence falls short. The gaps go back to the doer as a fixed list.
- **Stop.** The judge cannot rule. The request can be read two ways that lead to different verdicts, or a criterion depends on something the evidence does not show. The question goes to the lead, and the judge does not guess.

Criteria come in two kinds, and each is tested against what was recorded. A command criterion is met when the recorded exit code is zero and, if the criterion names some expected text, the recorded output contains it. A file criterion is met when the evidence names the expected path and carries a well-formed digest. Any criterion left unmet becomes a gap, and the gaps together make a reject. A task with no criteria at all cannot be judged, so the judge stops.

The repair round has a rule that keeps it finite. After a reject, the doer fixes the named gaps and claims again. The second judge rules only on those gaps, and on anything the repair broke. If it notices something the first judge missed, that goes to the lead as a question, not back to the doer as a new list. The doer is never chasing a target that moves each round.

In the code: `src/harness/judge.py` defines the evidence records, the case, the judge interface and the three verdicts. Its rule-based judge reads the commit, the claim, the criteria and the recorded evidence, and gives the same verdict on every run. It does not reopen files or run anything, and it checks every criterion on each submission; the case carries neither the original request nor an earlier gap list.

## The ship lane

Every change reaches the main branch through one command. No agent and no person edits main directly.

1. The lane takes a branch, pinned at one commit, so that what is checked is exactly what lands.
2. It reads the ledger for a person's stop. If one is in force, nothing runs.
3. It creates a disposable worktree and merges the branch onto main there.
4. It runs the checks this change needs: the tests the changed files can affect, and a scan for secrets in the new commits.
5. **Green:** main is fast-forwarded to the tested commit, and a receipt goes into the ledger with the commit, the checks run, their results and their timings.
6. **Red:** main is not touched. The failure, with the check that failed, goes into the ledger.
7. The worktree is removed either way.

A branch ships whole or not at all. The receipt describes the tested tip, so landing only some of its commits would leave a receipt describing something that never ran.

The value of one lane is that the main branch always has an explanation. For any commit on main there is a receipt that says which checks it passed and when. A failure is equally visible: it is a row, not a message someone may or may not have read.

In the code: `src/harness/ship.py` checks out the pinned commit, detached, in a disposable worktree, runs the checks there, removes the worktree and fast-forwards main in the local repository. `src/harness/ledger.py` will not record checks or apply a commit unless the latest verdict passed that exact commit. Deploying to services, restarting them and migrating live data belong to the private system and are not part of this code. The ship checks are the commands listed under `[ship]` in the operator's harness.toml; they run against the pinned commit. Each check record contains the command, exit code and output digest.

## Owner-only decisions and the stop

Three kinds of action wait for the owner's explicit yes:

- **spending money**, such as paying for something or placing a trade
- **deleting something that cannot be restored**
- **speaking in the owner's name**, such as sending a message or publishing

The owner never receives a bundle of approvals. A payment, a deletion or a message to send each arrives as a separate question at the point where the work reaches it, and holding one of them back does not pause anything else in the project.

Below that bar, agents act first and tell the owner afterwards, and that covers edits to the system's own role cards and runbooks too. The line is drawn at irreversibility and at acting in the owner's name, because those are the cases where a mistake cannot be repaired by the system itself. Below that line, asking costs the owner attention and teaches them to approve without reading, which is worse than not asking.

The **stop** works the other way. A person can stop any work, at any level, and the stop is written to the ledger. Anything that acts on its own, whether a scheduled job, a retry, a queued task, crash recovery or the ship lane, looks for a stop before doing anything and does nothing while one is set. A stop has no expiry and no automatic release; a person clears it. In the same spirit, the lead and the CTO can be halted by a person but not by another agent.

When a step needs a person, the system waits.

In the code: `src/harness/roles.py` lists the three owner-only actions. `src/harness/ledger.py` checks for the owner's stop inside every write, the final fast-forward included, and lets an owner-only action run once for each approval granted. `harness show`, in `src/harness/cli.py`, prints the timeline.

## On-demand runbooks

An agent's instructions compete for its attention. Every rule placed in every prompt makes the other rules a little weaker, and most rules apply only at a particular moment: before deleting something, before shipping, before writing a brief for another agent.

So a role card is short, and procedures live in separate runbooks. Each runbook starts with a few lines of metadata: its name, the roles it applies to, and a one-line trigger that names the moment, such as "before changing a database schema". From that metadata the system builds, for each role, an index of one line per runbook. The index goes into the role's prompt. The full procedure does not.

An agent that finds itself at one of those moments opens the matching runbook and works through it. A worker sees a short index; a PM sees a longer one; the judge sees none, because judging has no procedure beyond its card.

Adding a procedure is adding one file. The index is regenerated from the metadata, so there is no second list to keep in step.

In the code: just before a step is handed to a role, `src/harness/agents.py` asks `src/harness/roles.py` for that role's card, one packaged TOML file per role, with examples in `examples/runbooks/`. The demo's scripted steps receive the card but do not act on it, and the per-role index described above is not built here.

## Failure handling

When something fails, the fix goes where the failure came from.

The usual reflex with agents is to add a guard where the problem showed: a retry, a wait, a check for this one case, an extra instruction in the prompt. Each guard works for a while. Together they make a system that nobody can reason about, where each guard hides the next failure and the original cause is still there.

The rule in Artemis is to ask what in the design produced the failure, and to change that. If a role keeps misreading a brief, the brief's shape changes. If two places hold the same fact and drift apart, one of them is removed. A new capability goes into a single place, and the commit that adds it also removes whatever it makes redundant, such as an older code path and the code that called it, or a manual step. Nobody tries to keep such commits small; a change is as large as the cause requires.

Reports state failures plainly. A failing test comes with the output that shows it failing, and work that did not happen is listed as not done rather than left out. A hidden failure costs more later than the failure did.

Closing a project includes a short note from the PM on what should change next time; if nothing should, the note says why. These notes are ledger rows too. When a lesson shows that a role card or a runbook should change, the change goes through the ship lane like any other.

In the code: no single module holds this. It can be seen in three places: a failed transition rolls back together with its event, a red check is saved as a row, and a ship that moved main but failed to save its receipt is completed on the next run. The demo keeps no project notes.

## What was deliberately left out

This repository is a rewritten showcase of a private system. Some parts of that system are absent on purpose.

- **Agents.** The showcase runs scripted steps locally.
- **Deployment.** The private ship lane also deploys services, restarts them and migrates live data. The showcase ship lane stops at the main branch of a local repository.
- **The interface.** The private system has chat and dashboard front ends. Here the views are the command line and the demo's printed timeline.
- **Real data.** No row from the private ledger is here. Every request, task, name and number in the code, the tests and the demo is invented.

What remains is the part worth reading: the roles, the ledger, the judge, the ship lane, and the rules that connect them.
