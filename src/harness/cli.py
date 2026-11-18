"""The local harness command and ledger views."""

import argparse
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

from .demo import demo
from .ledger import Ledger
from .roles import WorkflowError


def _line(row: sqlite3.Row) -> str:
    return f"{row['id']:02d}  {row['role']:<6}  {row['kind']:<9}  {row['detail']}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="harness", description="Explore a local delivery workflow.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Initialize the local ledger.")
    play = commands.add_parser("demo", help="Run a fictional task through every role.")
    play.add_argument("--fast", action="store_true", help="Skip the pauses between events.")
    show = commands.add_parser("show", help="Read the ledger timeline.")
    show.add_argument("--task", type=int, metavar="N", help="Show one task and its handoffs.")
    args = parser.parse_args(argv)
    ledger = Ledger(Path(".harness/ledger.db"))

    try:
        if args.command == "show":
            if not ledger.path.is_file():
                raise WorkflowError("Run harness init or harness demo first.")
            print("Ledger timeline")
            for row in ledger.timeline(args.task):
                print(_line(row))
            return 0

        ledger.initialize()
        if args.command == "init":
            print("Ledger ready at .harness/ledger.db")
            return 0

        last = ledger.timeline()
        cursor = last[-1]["id"] if last else 0

        def emit() -> None:
            nonlocal cursor
            for row in ledger.timeline():
                if row["id"] > cursor:
                    print(_line(row), flush=True)
                    cursor = row["id"]
                    if not args.fast:
                        time.sleep(0.2)

        print("Todo CLI demo", flush=True)
        task = demo(ledger, emit)
        print(f"\nLedger timeline | task {task}")
        for row in ledger.timeline(task):
            print(_line(row))
        print("\nLedger: .harness/ledger.db")
        return 0
    except WorkflowError as error:
        print(f"harness: {error}", file=sys.stderr)
    except (sqlite3.Error, subprocess.SubprocessError, OSError):
        print("harness: a local database, Git, or filesystem operation failed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
