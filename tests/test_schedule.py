from contextlib import contextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import time
import unittest

from artemis.judge import Criterion
from artemis.ledger import Ledger
from artemis.roles import Role
from artemis.schedule import GRAMMAR, LATE_S, instant, next_after, tick


CHECK = (Criterion("summary.csv", artifact="summary.csv"),)


def wall(when: float | None) -> datetime | None:
    return None if when is None else datetime.fromtimestamp(when).replace(microsecond=0)


@contextmanager
def zone(name: str):
    """Run in another local time zone (POSIX: TZ and tzset)."""
    before = os.environ.get("TZ")
    os.environ["TZ"] = name
    time.tzset()
    try:
        yield
    finally:
        if before is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = before
        time.tzset()


def needs_zones(test):
    """Daylight-saving tests switch the process's zone, which needs tzset and the zone database."""
    if not hasattr(time, "tzset"):
        return unittest.skip("time.tzset is POSIX only; the arithmetic itself is the same on Windows")(test)
    with zone("America/New_York"):
        known = time.tzname == ("EST", "EDT")
    return test if known else unittest.skip("no time-zone database on this machine")(test)


class Grammar(unittest.TestCase):
    """January dates: no daylight-saving change is near in any zone, so walls compare the same everywhere."""

    def test_each_form_names_its_next_slot(self):
        cases = [
            ("daily 07:30", datetime(2026, 1, 10, 8, 0), datetime(2026, 1, 11, 7, 30)),
            ("daily 07:30", datetime(2026, 1, 10, 7, 0), datetime(2026, 1, 10, 7, 30)),
            ("weekly fri 18:00", datetime(2026, 1, 14, 9, 0), datetime(2026, 1, 16, 18, 0)),
            ("weekly friday 18:00", datetime(2026, 1, 16, 18, 0), datetime(2026, 1, 23, 18, 0)),
            ("every 3d", datetime(2026, 1, 10, 9, 15), datetime(2026, 1, 13, 9, 15)),
            ("every 3d at 09:00", datetime(2026, 1, 10, 9, 0), datetime(2026, 1, 13, 9, 0)),
            ("every 3d at 09:00", datetime(2026, 1, 10, 10, 0), datetime(2026, 1, 13, 9, 0)),
            ("at 2026-12-01T09:00", datetime(2026, 1, 10, 9, 0), datetime(2026, 12, 1, 9, 0)),
        ]
        for spec, after, expected in cases:
            with self.subTest(spec=spec, after=after):
                self.assertEqual(wall(next_after(spec, after)), expected)

    def test_intervals_are_real_time_and_one_offs_end(self):
        after = datetime(2026, 1, 10, 9, 0)
        self.assertEqual(next_after("every 30m", after), after.timestamp() + 1800)
        self.assertEqual(next_after("every 2h", after), after.timestamp() + 7200)
        self.assertIsNone(next_after("at 2026-01-01T09:00", after))
        aware = next_after("at 2026-12-01T09:00+09:00", after)
        self.assertEqual(aware, datetime(2026, 12, 1, 0, 0, tzinfo=timezone.utc).timestamp())

    def test_a_spec_outside_the_grammar_says_the_grammar(self):
        for spec in ("hourly", "daily 25:00", "weekly someday 09:00", "every 2h at 09:00", "every 0m", "at soon"):
            with self.subTest(spec), self.assertRaises(ValueError) as caught:
                next_after(spec, datetime(2026, 1, 10))
            if spec in ("hourly", "every 0m"):
                self.assertIn(GRAMMAR, str(caught.exception))


class Ticks(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        self.project = self.ledger.add_project(Role.OWNER, "film", "folder", root)

    def schedule(self, spec: str, slot: float) -> int:
        return self.ledger.add_schedule(Role.OWNER, self.project, "Sort the week", "", "host", CHECK, spec, slot)

    def test_a_missed_slot_fires_once_late_and_skips_ahead(self):
        slot = datetime(2026, 1, 5, 7, 30).timestamp()
        schedule = self.schedule("daily 07:30", slot)
        now = datetime(2026, 1, 8, 12, 0).timestamp()          # the home was off for three slots
        made = tick(self.ledger, now)
        self.assertEqual(len(made), 1)
        self.assertEqual(tick(self.ledger, now), [])
        row = self.ledger.schedules()[0]
        self.assertEqual(wall(row["next_at"]), datetime(2026, 1, 9, 7, 30))
        fired = [event for event in self.ledger.events() if event["kind"] in ("schedule.fired", "schedule.late")]
        self.assertEqual([event["kind"] for event in fired], ["schedule.late"])
        self.assertEqual(self.ledger.work(made[0])[0]["schedule_id"], schedule)

    def test_an_on_time_slot_is_not_late(self):
        slot = datetime(2026, 1, 5, 7, 30).timestamp()
        self.schedule("daily 07:30", slot)
        tick(self.ledger, slot + LATE_S - 1)
        self.assertEqual([e["kind"] for e in self.ledger.events() if e["kind"] in ("schedule.fired", "schedule.late")],
                         ["schedule.fired"])

    def test_a_one_off_fires_once_and_goes_quiet(self):
        slot = datetime(2026, 1, 5, 7, 30).timestamp()
        self.schedule("at 2026-01-05T07:30", slot)
        self.assertEqual(len(tick(self.ledger, slot + 1)), 1)
        self.assertEqual(self.ledger.schedules()[0]["active"], 0)
        self.assertEqual(tick(self.ledger, slot + 86400), [])

    def test_two_homes_racing_for_a_slot_make_one_task(self):
        slot = time.time() - 5
        self.schedule("every 30m", slot)
        others = [Ledger(self.ledger.path) for _ in range(4)]
        barrier = threading.Barrier(len(others))
        made: list[int] = []

        def race(ledger):
            barrier.wait()
            made.extend(tick(ledger, slot + 10))

        threads = [threading.Thread(target=race, args=(ledger,)) for ledger in others]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(10)
        self.assertEqual(len(made), 1)
        self.assertIsNone(self.ledger.fire(1, slot, slot + 1800, False))   # the slot is gone

    def test_a_stop_holds_schedules(self):
        slot = time.time() - 5
        self.schedule("every 30m", slot)
        self.ledger.stop(Role.OWNER, "away")
        self.assertEqual(tick(self.ledger), [])
        self.ledger.resume(Role.OWNER, "back")
        self.assertEqual(len(tick(self.ledger)), 1)


@needs_zones
class DaylightSaving(unittest.TestCase):
    """New York: clocks jump 02:00 → 03:00 on 8 March 2026 and fall 02:00 → 01:00 on 1 November 2026."""

    def setUp(self):
        self.enterContext(zone("America/New_York"))
        root = Path(self.enterContext(TemporaryDirectory()))
        self.ledger = Ledger(root / "ledger.db")
        self.ledger.initialize()
        self.project = self.ledger.add_project(Role.OWNER, "film", "folder", root)

    def test_a_skipped_time_runs_at_the_next_minute_that_exists(self):
        slot = next_after("daily 02:30", datetime(2026, 3, 7, 3, 0))
        self.assertEqual(wall(slot), datetime(2026, 3, 8, 3, 0))
        self.assertEqual(wall(next_after("daily 02:30", datetime.fromtimestamp(slot))), datetime(2026, 3, 9, 2, 30))
        self.assertEqual(instant(datetime(2026, 3, 8, 2, 15)), datetime(2026, 3, 8, 3, 0).timestamp())

    def test_a_repeated_time_runs_once(self):
        first = next_after("daily 01:30", datetime(2026, 10, 31, 2, 0))
        self.assertEqual(first, datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc).timestamp())   # 01:30 EDT
        following = next_after("daily 01:30", datetime.fromtimestamp(first))
        self.assertEqual(wall(following), datetime(2026, 11, 2, 1, 30))
        self.ledger.add_schedule(Role.OWNER, self.project, "Sort", "", "host", CHECK, "daily 01:30", first)
        self.assertEqual(len(tick(self.ledger, first + 10)), 1)
        self.assertEqual(tick(self.ledger, first + 3600 + 10), [])         # 01:30 EST, an hour later
        self.assertEqual(wall(self.ledger.schedules()[0]["next_at"]), datetime(2026, 11, 2, 1, 30))

    def test_intervals_count_real_time_across_the_change(self):
        after = datetime(2026, 11, 1, 1, 45)                                 # EDT, the first 01:45
        self.assertEqual(next_after("every 30m", after), after.timestamp() + 1800)

    def test_day_specs_keep_their_clock_time_across_the_change(self):
        slot = next_after("weekly sat 09:00", datetime(2026, 10, 30, 12, 0))
        self.assertEqual(wall(next_after("weekly sat 09:00", datetime.fromtimestamp(slot))),
                         datetime(2026, 11, 7, 9, 0))
        self.assertEqual(wall(next_after("every 1d at 09:00", datetime(2026, 3, 7, 9, 0))),
                         datetime(2026, 3, 8, 9, 0))


@needs_zones
class ZoneChange(unittest.TestCase):
    def test_a_planned_slot_keeps_its_instant_and_the_next_follows_the_new_zone(self):
        with zone("Asia/Tokyo"):
            slot = next_after("daily 09:00", datetime(2026, 1, 10, 10, 0))     # 09:00 JST = 00:00 UTC
        with TemporaryDirectory() as scratch, zone("Europe/London"):
            ledger = Ledger(Path(scratch) / "ledger.db")
            ledger.initialize()
            project = ledger.add_project(Role.OWNER, "film", "folder", Path(scratch))
            ledger.add_schedule(Role.OWNER, project, "Sort", "", "host", CHECK, "daily 09:00", slot)
            self.assertEqual(tick(ledger, slot - 60), [])
            self.assertEqual(len(tick(ledger, slot + 1)), 1)
            self.assertEqual(wall(ledger.schedules()[0]["next_at"]), datetime(2026, 1, 11, 9, 0))   # London


if __name__ == "__main__":
    unittest.main()
