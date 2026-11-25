"""A demo home for the Artemis App: three projects mid-flight, cards waiting, lessons and a conversation.

    python tests/fixtures/app_demo.py [--home DIR] [--port 7411]

Seeds DIR (a fresh ARTEMIS_HOME; default .scratch/app-demo) through the ledger's own API, then serves the App on it.
The home is the real one (its config, pairing links, live feed and card round) without its other loops, so the seeded
runs stay mid-flight: no agent runs and the lead answers from a script (both labelled mock). The vault, the broker's
standing approvals and the local demo receiver are the real ones too: the vault holds obviously fake values and is
unlocked from a throwaway ARTEMIS_VAULT_PASSPHRASE (the OS keychain is never asked), and an approved web request to
the demo receiver is really sent to it on this computer. An approved command is not run: the demo marks it done,
saying so.
"""

from datetime import datetime, timedelta
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from artemis import agents, demo_receiver, httpop, vault as vault_module, web  # noqa: E402
from artemis.broker import Broker                                      # noqa: E402
from artemis.guard import SHELL                                        # noqa: E402
from artemis.home import Home, Parts, Paths                            # noqa: E402
from artemis.judge import CommandEvidence, Criterion, RuleJudge        # noqa: E402
from artemis.ledger import Check, Ledger                               # noqa: E402
from artemis.roles import Interrupt, Role, WorkflowError               # noqa: E402
from artemis.vault import PASSPHRASE_ENV, Vault                        # noqa: E402

CONFIG = """[vault]
unlock = "env"

[agents]
lead = "mock"
worker = "mock"
max_workers = 3
"""


class DemoLead:
    """The mock lead: it answers from a script, streaming the reply as the real one does."""

    def __init__(self, home: "DemoHome"):
        self.home = home

    def turn(self, message: int) -> None:
        home = self.home
        said = next(row for row in home.ledger.messages(message - 1) if row["id"] == message)
        name = agents.lead_provider(home.config, home.vault, home.ledger)   # the lead chosen now, as a real turn asks
        stands_in = "" if name == "mock" else f", standing in for {agents.LABELS[name]}"
        reply = (f"(mock lead{stands_in}) I read “{said['text'][:80]}”. A real lead would plan this into tasks now; "
                 "this demo home only shows how the App looks while that happens.")
        turn = f"demo-{message}"
        for start in range(0, len(reply), 24):
            time.sleep(0.05)
            home.publish("said.delta", {"turn": turn, "text": reply[start:start + 24]})
        home.ledger.record(Role.HOME, "lead.turn", f"{agents.LABELS[name]} answered (mock)",
                           project=said["project_id"], data={"turn": turn, "provider": name, "message": message})
        home.ledger.say(Role.LEAD, reply, project=said["project_id"], turn=turn)


class DemoBroker(Broker):
    """The real broker (its standing approvals, its door) except for carrying out cards: a web request to the local
    demo receiver is really sent, and anything else is marked done without running, as a mock."""

    def run_card(self, card: int) -> None:
        ledger = self.home.ledger
        row = ledger.card(card)
        request = demo_receiver.request_of(row) if httpop.is_http(row) else None
        if request and demo_receiver.listening(ledger, request["url"]):
            return super().run_card(card)
        if row["command"] is None:
            return
        try:
            if ledger.claim_card(Role.HOME, card):
                ledger.finish_card(Role.HOME, card, "done", "(mock) the demo home ran nothing")
        except WorkflowError:
            return


class DemoHome(Home):
    """The real home with the mock lead and the demo broker. Its loops are not started; run_cards() is one round of
    its card loop, which the demo server repeats and a test calls when it wants approved cards carried out."""

    def __init__(self, paths: Paths, port: int = 0):
        super().__init__(paths, port, Parts(vault=Vault, broker=DemoBroker, lead=DemoLead))
        self.receiver: demo_receiver.DemoReceiver | None = None

    def close(self, wait_s: float = 0) -> None:
        if self.receiver is not None:
            self.receiver.__exit__(None, None, None)
            self.receiver = None
        super().close(wait_s)


class NoKeychain:
    """keyring's module functions on a computer without a keychain, so a demo vault never reads or writes one."""

    def get_password(self, service, account):
        raise RuntimeError("no keychain in the demo")

    set_password = delete_password = get_password


def home(root: Path, port: int = 0) -> DemoHome:
    """A demo home in `root`. Its vault is unlocked from ARTEMIS_VAULT_PASSPHRASE, which must be a throwaway one."""
    if not os.environ.get(PASSPHRASE_ENV):
        raise RuntimeError(f"Set {PASSPHRASE_ENV} to a throwaway passphrase before building a demo home.")
    paths = Paths.at(root)
    paths.root.mkdir(parents=True, exist_ok=True)
    paths.config.write_text(CONFIG, encoding="utf-8")
    paths.undo.mkdir(exist_ok=True)
    with mock.patch.object(vault_module, "keyring", NoKeychain()):
        return DemoHome(paths, port)


# The story the demo tells: a morning of work across three projects, told through the ledger's own API.

class Clock:
    def __init__(self, now: float):
        self.now = now

    def ago(self, minutes: float) -> None:
        self.target = self.now - minutes * 60

    def __call__(self) -> float:
        self.target += 0.001
        return self.target


def _next(now: float, hour: int, weekday: int | None = None) -> float:
    """The next time it is `hour` o'clock local time (on `weekday`, Monday 0, if given) after now, so a demo
    schedule's next run matches its spec."""
    moment = datetime.fromtimestamp(now).replace(hour=hour, minute=0, second=0, microsecond=0)
    if weekday is not None:
        moment += timedelta(days=(weekday - moment.weekday()) % 7)
    while moment.timestamp() <= now:
        moment += timedelta(days=1 if weekday is None else 7)
    return moment.timestamp()


def _sha(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()


TESTS = ("python", "-m", "unittest")
SUMMARY = b'{"week": 47, "receipts": 14, "deductible": "1284.10", "currency": "EUR"}'


def _ship(ledger: Ledger, task: int, agent: str, evidence: dict, clock: Clock, minutes: float) -> None:
    clock.ago(minutes + 9)
    run = ledger.claim_run(Role.HOME, task, agent)
    clock.ago(minutes + 2)
    sha = _sha(f"task {task}")
    ledger.submit(Role.WORKER, task, sha, "Done; checks recorded.", evidence)
    ledger.judge(Role.JUDGE, task, RuleJudge())
    ledger.end_run(Role.HOME, run, "done", "verified")
    clock.ago(minutes)
    ledger.record_checks(task, sha, _sha(f"landed {task}"), (Check(TESTS, 0, "0" * 64),))
    ledger.land(task, sha, True)


def seed(built: DemoHome) -> dict[str, int]:
    """Write the demo story into an empty home ledger. Returns the ids the screenshots point at."""
    ledger, paths = built.ledger, built.paths
    clock = Clock(time.time())
    with mock.patch("time.time", clock):
        clock.ago(190)
        shop = ledger.add_project(Role.OWNER, "storefront", "repo", paths.root / "projects" / "storefront")
        taxes = ledger.add_project(Role.OWNER, "tax-2026", "folder", paths.root / "projects" / "tax-2026")
        blog = ledger.add_project(Role.OWNER, "field-notes", "repo", paths.root / "projects" / "field-notes")

        clock.ago(180)
        ask = ledger.say(Role.OWNER, "Can you get release 1.4 of the storefront out today? And sort my November "
                                     "receipts while you're at it.")
        release = ledger.request(Role.OWNER, "Ship storefront 1.4", project=shop, source="chat", message=ask)
        receipts = ledger.request(Role.OWNER, "Sort the November receipts", project=taxes, source="chat",
                                  message=ask)
        clock.ago(178)
        ledger.say(Role.LEAD, "Yes. The storefront release is three tasks: the JSON export, the rounding fix in "
                              "checkout, and the release notes. The receipts go into tax-2026; Codex takes the "
                              "totals because it did that sheet well last month. Anything that goes out under your "
                              "name waits for you.", project=shop)
        tests = Criterion("python -m unittest", command=TESTS)
        readme = Criterion("README mentions --json", command=("grep", "-q", "--json", "README.md"))
        export = ledger.add_task(Role.LEAD, release, "Add JSON export to the order list", "", (tests, readme),
                                 provider="claude")
        rounding = ledger.add_task(Role.LEAD, release, "Fix currency rounding in checkout", "", (tests,),
                                   provider="codex", review=True)
        notes = ledger.add_task(Role.LEAD, release, "Write the 1.4 release notes", "", (
            Criterion("CHANGELOG mentions 1.4", command=("grep", "-q", "1.4", "CHANGELOG.md")),), kind="docs")
        search = ledger.add_task(Role.LEAD, release, "Speed up product search", "", (tests,))
        sort = ledger.add_task(Role.LEAD, receipts, "Sort November receipts by month", "", (
            Criterion("2026-11 holds 14 files", command=("test", "-d", "2026-11")),
            Criterion("summary.csv exists", command=("test", "-f", "summary.csv"))), kind="host")
        totals = ledger.add_task(Role.LEAD, receipts, "Total the deductible expenses", "", (
            Criterion("totals.csv exists", command=("test", "-f", "totals.csv")),), kind="host", provider="codex")

        _ship(ledger, export, "claude", {1: CommandEvidence(TESTS, 0, "Ran 42 tests\n\nOK"),
                                         2: CommandEvidence(("grep", "-q", "--json", "README.md"), 0, "")}, clock, 120)
        clock.ago(150)
        run = ledger.claim_run(Role.HOME, sort, "claude")
        for name in ("IMG_2041.jpg", "IMG_2042.jpg", "receipt-hardware.pdf"):
            ledger.record(Role.HOME, "file.changed", f"moved inbox/{name} → 2026-11/{name}", task=sort)
        (paths.undo / f"task-{sort}").mkdir(exist_ok=True)
        clock.ago(141)
        ledger.submit(Role.WORKER, sort, "host:" + "c" * 64, "14 files moved; summary.csv written.", {
            1: CommandEvidence(("test", "-d", "2026-11"), 0, ""),
            2: CommandEvidence(("test", "-f", "summary.csv"), 0, "")})
        ledger.judge(Role.JUDGE, sort, RuleJudge())
        ledger.end_run(Role.HOME, run, "done", "verified")

        for attempt, minutes in ((1, 135), (2, 100)):
            clock.ago(minutes)
            run = ledger.claim_run(Role.HOME, search, "claude")
            clock.ago(minutes - 12)
            ledger.submit(Role.WORKER, search, _sha(f"search {attempt}"), "Search is faster.", {
                1: CommandEvidence(TESTS, 1, "FAIL: test_rank_keeps_exact_match_first\nRan 42 tests\nFAILED")})
            ledger.judge(Role.JUDGE, search, RuleJudge())
            ledger.end_run(Role.HOME, run, "stuck", "tests failed twice: test_rank_keeps_exact_match_first")
        (paths.logs / f"task-{search}.log").write_text(
            "$ python -m unittest\n"
            "....F.....................................\n"
            "FAIL: test_rank_keeps_exact_match_first (test_search.SearchTests)\n"
            "AssertionError: 'oak table' is not first in ['oak table lamp', 'oak table']\n"
            "Ran 42 tests in 0.84s\nFAILED (failures=1)\n"
            "$ git push --dry-run https://demo:demo-token-not-real-0000@example.com/storefront.git\n"
            "Everything up-to-date\n", encoding="utf-8")

        clock.ago(96)
        ledger.say(Role.LEAD, "The JSON export is on main with the tests green. Product search failed its own "
                              "tests twice, so I've taken it out of 1.4; it doesn't block the release and I'll come "
                              "back to it after.", project=shop)
        clock.ago(95)
        ledger.say(Role.OWNER, "ok. and the blog?")
        draft_request = ledger.request(Role.OWNER, "Write up the migration for the blog", project=blog,
                                       source="chat")
        draft = ledger.add_task(Role.LEAD, draft_request, "Draft the database migration post", "", (
            Criterion("post exists", command=("test", "-f", "posts/migration.md")),), kind="docs",
                                provider="claude")
        images = ledger.add_task(Role.LEAD, draft_request, "Compress the header images", "", (
            Criterion("images under 200 KB", command=("python", "scripts/check_images.py")),), provider="opencode")
        links = ledger.add_task(Role.LEAD, draft_request, "Check every link on the site", "", (
            Criterion("link check", command=("python", "scripts/links.py")),), kind="research")
        _ship(ledger, images, "opencode", {1: CommandEvidence(("python", "scripts/check_images.py"), 0, "6 images")},
              clock, 70)
        clock.ago(66)
        run = ledger.claim_run(Role.HOME, draft, "claude")
        clock.ago(52)
        ledger.submit(Role.WORKER, draft, _sha("draft"), "Draft written in posts/migration.md.", {})
        ledger.end_run(Role.HOME, run, "done", "reported")

        clock.ago(80)
        cleanup = ledger.open_card(Role.HOME, Interrupt.DELETE, "Delete the old build folder", "It removes "
                                   "files for good.", task=export, command=json.dumps(["rm", "-rf", "build"]),
                                   cwd=str(paths.root / "projects" / "storefront"), shell=SHELL, rule="rm -rf *")
        clock.ago(78)
        ledger.decide_card(Role.OWNER, cleanup, True)
        ledger.claim_card(Role.HOME, cleanup)
        ledger.finish_card(Role.HOME, cleanup, "done", "exit 0")
        publish = ledger.open_card(Role.HOME, Interrupt.SEND, "Publish the theme package to npm", "It publishes "
                                   "under your npm account.", task=images, command=json.dumps(["npm", "publish"]),
                                   cwd=str(paths.root / "projects" / "field-notes"), shell=SHELL, rule="npm publish*")
        clock.ago(75)
        ledger.decide_card(Role.OWNER, publish, False)

        clock.ago(60)
        rounding_run = ledger.claim_run(Role.HOME, rounding, "codex")
        clock.ago(44)
        ledger.submit(Role.WORKER, rounding, _sha("rounding"), "Rounds half to even; tests added.",
                      {1: CommandEvidence(TESTS, 0, "Ran 44 tests\n\nOK")})
        ledger.judge(Role.JUDGE, rounding, RuleJudge())
        ledger.record(Role.HOME, "review", "OpenCode reviewed it: no gaps", task=rounding,
                      data={"reviewer": "opencode", "verdict": "pass", "gaps": []})
        ledger.end_run(Role.HOME, rounding_run, "done", "verified")

        clock.ago(40)
        ledger.claim_run(Role.HOME, totals, "codex")
        clock.ago(30)
        ledger.say(Role.LEAD, "The draft of the migration post is in. Claude Code says it's done; nobody has checked "
                              "it yet. To send it to subscribers I need the newsletter key. There's a card for it, "
                              "and what you type goes to the vault, not to me.", project=blog)
        newsletter = ledger.open_card(Role.WORKER, "secret", "The newsletter API key", "The post goes out through "
                                      "the newsletter service and Artemis does not have its key yet.", task=draft,
                                      options={"name": "NEWSLETTER_API_KEY", "kind": "send", "use": "http",
                                               "origin": "https://api.newsletter.example",
                                               "note": "Newsletter service, sending only"})
        clock.ago(12)
        ledger.claim_run(Role.HOME, notes, "claude")
        clock.ago(9)
        layout = ledger.open_card(Role.LEAD, "choice", "Which layout should summary.csv use?", "Both work; your "
                                  "accountant reads it, so it's your call.", request=receipts, options=[
                                      {"id": "same", "label": "Same as last year"},
                                      {"id": "new", "label": "The accountant's new template"}])
        clock.ago(4)
        push = ledger.open_card(Role.HOME, Interrupt.SEND, "Push storefront 1.4 to GitHub", "It publishes the "
                                "release under your GitHub account.", task=rounding,
                                command=json.dumps(["git", "push", "origin", "main", "v1.4.0"]),
                                cwd=str(paths.root / "projects" / "storefront"), shell=SHELL,
                                secrets=("GITHUB_TOKEN",), rule="git push*",
                                options={"env_secrets": {"GITHUB_TOKEN": "GITHUB_TOKEN"}})
        clock.ago(3)
        ledger.say(Role.LEAD, "Release 1.4 is ready to push. That sends as you, so it waits for your yes. One "
                              "question on the receipts as well: which layout for the summary.", project=shop,
                   card=push)

        clock.ago(170)
        rule = ledger.add_lesson(Role.LEAD, "rule", "List every new command-line flag in the README.",
                                 source=[{"task": export, "criterion": "README mentions --json",
                                          "why": "judge reject"}], project=shop)
        clock.ago(60)
        check = ledger.add_lesson(Role.HOME, "check", "Run the link checker before the blog ships.",
                                  payload={"argv": ["python", "scripts/links.py"]},
                                  source=[{"task": links, "why": "judge reject"}], project=blog)
        clock.ago(74)
        ledger.add_lesson(Role.HOME, "guard", "Ask before npm publish in field-notes.",
                          payload={"kind": Interrupt.SEND, "argv": ["npm", "publish"]},
                          source=[{"card": publish, "why": "you declined"}], project=blog, state="proposed")
        clock.ago(50)
        placement = ledger.add_lesson(Role.HOME, "placement", "Prefer Codex for spreadsheet work in tax-2026.",
                                      payload={"kind": "host", "demote": "claude"},
                                      source=[{"task": totals, "why": "three failed attempts"}], project=taxes)
        clock.ago(160)
        old = ledger.add_lesson(Role.LEAD, "rule", "Keep commit subjects under 60 characters.",
                                source=[{"message": ask}])
        ledger.set_lesson(Role.OWNER, old, "retired")
        for lesson, uses, first in ((rule, 6, 5), (check, 2, 2), (placement, 3, 2)):
            for attempt in range(uses):
                ledger.lesson_used(lesson, attempt < first)

        clock.ago(118)
        ledger.secret_used("GITHUB_TOKEN", "run", task=export)
        clock.ago(20)
        ledger.secret_used("OPENAI_API_KEY", "api", task=draft)
        clock.ago(26)
        weekly = ledger.add_schedule(Role.LEAD, taxes, "Sort new receipts and send the summary", "", "host", (
            Criterion("summary.csv exists", command=("test", "-f", "summary.csv")),), "weekly fri 18:00", clock())
        slot = ledger.schedules(taxes)[0]["next_at"]
        clock.ago(25)
        summary_task = ledger.fire(weekly, slot, _next(clock.now, 18, weekday=4), False)
        summary_run = ledger.claim_run(Role.HOME, summary_task, "codex")
        built.receiver = demo_receiver.DemoReceiver(ledger, taxes).__enter__()
        hook = built.receiver.url
        clock.ago(21)
        summary = ledger.open_card(
            Role.HOME, Interrupt.SEND, f"POST {hook}", f"TEAM_WEBHOOK_TOKEN sends as you, and a POST request changes "
            f"something at {vault_module.origin(hook)}.", project=taxes, task=summary_task, run=summary_run,
            command=json.dumps({"method": "POST", "url": hook, "headers": {"Content-Type": "application/json"},
                                "body_sha256": hashlib.sha256(SUMMARY).hexdigest(), "save_to": None}),
            secrets=("TEAM_WEBHOOK_TOKEN",), expires=clock.now + httpop.HOLD)
        httpop.body_file(paths, summary).write_bytes(SUMMARY)
        ledger.note(Role.LEAD, "Search ranking probably needs exact matches boosted; I'll try that first.",
                    project=shop, task=search)

        clock.ago(170)
        daily = ledger.add_schedule(Role.LEAD, blog, "Publish the site", "", "code", (
            Criterion("site builds", command=("python", "scripts/build.py")),), "daily 07:00", clock())
        site = ledger.fire(daily, ledger.schedules(blog)[0]["next_at"], _next(clock.now, 7), False)
        _ship(ledger, site, "claude", {1: CommandEvidence(("python", "scripts/build.py"), 0, "built 31 pages")},
              clock, 140)
        clock.ago(147)
        pages = ledger.open_card(Role.HOME, Interrupt.SEND, "Publish the site to GitHub Pages", "It publishes "
                                 "under your GitHub account.", task=site,
                                 command=json.dumps(["git", "push", "origin", "gh-pages"]),
                                 cwd=str(paths.root / "projects" / "field-notes"), shell=SHELL,
                                 secrets=("GITHUB_TOKEN",), rule="git push*",
                                 options={"env_secrets": {"GITHUB_TOKEN": "GITHUB_TOKEN"}})
        ledger.decide_card(Role.OWNER, pages, True, standing=built.broker.standing_for(pages))
        ledger.claim_card(Role.HOME, pages)
        ledger.finish_card(Role.HOME, pages, "done", "(mock) the demo home ran nothing")
        clock.ago(130)
        domain = ledger.open_card(Role.LEAD, Interrupt.SPEND, "Renew storefront.example for a year", "It charges "
                                  "your card.", project=shop, expires=clock.now + 60 * 60)
        for minutes, reason in ((48, "stuck #4: tests failed twice"), (5, "card answered: layout")):
            clock.ago(minutes)
            ledger.record(Role.HOME, "lead.wake", reason)
        for provider, role, status, version in (("claude", "lead", "live", "2.4.1"),
                                                ("claude", "code", "live", "2.4.1"),
                                                ("codex", "lead", "live", "0.71.0"),
                                                ("codex", "code", "live", "0.71.0"),
                                                ("codex", "host", "unqualified", "0.71.0"),
                                                ("opencode", "research", "contract", "1.3.0"),
                                                ("opencode", "code", "live", "1.3.0")):
            ledger.set_adapter(provider, role, agents.OS_NAME, version, [], "subscription", status,
                               "demo fixture (mock): not probed on this machine")

    built.vault.set("GITHUB_TOKEN", "demo-token-not-real-0000", use="env", kind="send", note="Pushes to GitHub as you")
    built.vault.set("OPENAI_API_KEY", "demo-key-not-real-1111", use="http", origin="https://api.openai.com",
                    note="Direct API worker")
    built.vault.set("STRIPE_API_KEY", "demo-stripe-not-real-2222", use="http", kind="spend",
                    origin="https://api.stripe.com", note="Shop payments")
    built.vault.set("TEAM_WEBHOOK_TOKEN", "demo-webhook-not-real-3333", use="http", kind="send",
                    origin=vault_module.origin(hook), note="The team's inbox (here the local demo receiver)")
    ledger.expire_cards()
    paths.token.write_text("demo-home-token\n", encoding="utf-8")
    return {"push": push, "layout": layout, "newsletter": newsletter, "summary": summary, "pages": pages,
            "shop": shop, "taxes": taxes, "blog": blog, "search": search, "check": check, "rule": rule,
            "placement": placement}


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Artemis App on a seeded demo home (mock).")
    parser.add_argument("--home", type=Path, default=Path(".scratch/app-demo"))
    parser.add_argument("--port", type=int, default=7411)
    parser.add_argument("--lan", action="store_true", help="serve HTTPS on the local network too")
    parser.add_argument("--waiting-phone", action="store_true", help="add a phone that waits to be allowed")
    args = parser.parse_args()
    os.environ[PASSPHRASE_ENV] = base64.b64encode(os.urandom(18)).decode()   # a fresh demo vault each run
    if args.home.exists():
        shutil.rmtree(args.home)
    built = home(args.home.resolve(), args.port)
    seed(built)
    if args.waiting_phone:
        built.ledger.add_device("Safari on iPhone", hashlib.sha256(os.urandom(16)).hexdigest(), "4827", True)
    built.server = web.start(built, args.port, lan=args.lan, tls=None)
    print(f"App: {built.server.url('127.0.0.1')}#pair={built.new_pair_token()}", flush=True)
    print(f"Demo home at {args.home} · bearer token in {built.paths.token} · Ctrl-C to stop", flush=True)
    try:
        while not built.closing.wait(Home.DISPATCH_S):
            built.run_cards()
    except KeyboardInterrupt:
        pass
    finally:
        built.close()
    return 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    raise SystemExit(main())
