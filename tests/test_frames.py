"""What the home is doing, on GET /events: the dashboard frame and the Workspace's owner_views."""

import json
import unittest
from unittest import mock

from test_conversation import Frames, kinds
from test_web import AppCase, setUpModule  # noqa: F401  (the module's vault passphrase)

from artemis.roles import Interrupt, Role
from artemis import web
from artemis.web import frames, owner
from artemis.web.frames import start_of_day
from artemis.web.secret_requests import request_for_card


class DashboardTest(AppCase):
    def setUp(self):
        super().setUp()
        self.cookie = self.owner()

    def test_requests_are_goals_with_their_tasks_runs_and_this_computer(self):
        frames = Frames(self, self.cookie).until(lambda found: kinds(found, "dashboard"))
        board = kinds(frames, "dashboard")[0]["dashboard"]
        requests = self.home.ledger.requests()
        self.assertEqual([goal["id"] for goal in board["goals"]], [row["id"] for row in requests])
        work = self.home.ledger.work()
        for goal in board["goals"]:
            self.assertEqual([project["id"] for project in goal["projects"]],
                             [row["id"] for row in work if row["request_id"] == goal["id"]])
        running = {f"run-{row['run_id']}" for row in work if row["run_id"] and row["ended"] is None}
        mine = board["owner_work"]
        self.assertTrue(mine["requests"] and all(row["state"]["kind"] != "done" for row in mine["requests"]))
        self.assertEqual([group["key"] for group in mine["work_groups"]],
                         [f"goal:{row['id']}" for row in mine["requests"]])
        self.assertEqual(sum(mine["goal_counts"].values()), len(requests))
        agents = {agent["id"]: agent for agent in board["agents"]}
        self.assertEqual(set(agents), {"lead"} | running)
        self.assertTrue(all(agents[name]["parent_id"] == "lead" for name in running))
        self.assertEqual([host["key"] for host in board["resources"]["hosts"]], ["local"])
        self.assertEqual(board["host_labels"], {"local": "This computer"})
        self.assertEqual(board["owner_turn"], owner.turn(self.home.ledger))
        self.assertEqual([group["key"] for group in board["owner_groups"]],
                         [group["key"] for group in owner.groups(self.home.ledger)])
        waiting = [card["id"] for card in self.home.ledger.cards(state="waiting")
                   if card["kind"] in {kind.value for kind in Interrupt}]
        self.assertEqual([approval["id"] for approval in board["approvals"]], waiting)
        day = self.home.ledger.counts(start_of_day())
        self.assertEqual({key: board["day"][key] for key in ("asked", "done", "stuck")},
                         {key: day[key] for key in ("asked", "done", "stuck")}, "the day's count of asks and work done")
        status, _, page = self.call("GET", "/completed", cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual([item["goal_id"] for item in board["completed"]["items"]],
                         [item["goal_id"] for item in page["items"]], "Completed's first page, as GET /completed gives it")
        self.assertEqual(board["completed"]["total"], page["total"])
        self.assertFalse(kinds(frames, "owner_views"), "owner_views goes only to a stream that asked for it")

    def test_status_timeline_and_the_jobs_rail_name_and_count_the_same_agents(self):
        board = kinds(Frames(self, self.cookie).until(lambda found: kinds(found, "dashboard")), "dashboard")[0]["dashboard"]
        work = {row["run_id"]: row for row in self.home.ledger.work() if row["run_id"] and row["ended"] is None}
        jobs = self.call("GET", "/runs", cookie=self.cookie)[2]["running"]
        self.assertEqual(sorted(job["id"] for job in jobs), sorted(work), "the demo's jobs are its open runs")
        agents = {agent["id"]: agent for agent in board["agents"]}
        busy = {key for key, agent in agents.items() if agent["network_state"] == "running"}
        self.assertEqual(busy, {f"run-{run}" for run in work}, "Status runs what the Jobs rail runs; the lead is idle")
        self.assertEqual(agents["lead"]["title"], "Lead")
        labels = {"claude": "Claude Code", "codex": "Codex"}
        for run, row in work.items():
            agent = agents[f"run-{run}"]
            self.assertEqual((agent["title"], agent["seat"], agent["project_id"], agent["goal_id"]),
                             (f"{labels[row['agent']]} · {row['title']}", labels[row["agent"]], row["id"],
                              row["request_id"]))
        projects = {project["id"]: project for goal in board["goals"] for project in goal["projects"]}
        self.assertTrue(all("agents" not in project for project in projects.values()),
                        "an agent names its project; a project lists no agent of its own")
        self.assertEqual({projects[row["id"]]["seat"] for row in work.values()}, {"Claude Code", "Codex"})
        self.assertEqual({projects[row["id"]]["network_state"] for row in work.values()}, {"running"})
        timeline = self.call("GET", "/timeline", cookie=self.cookie)[2]["agents"]
        keys = ("title", "seat", "network_state", "project_id", "goal_id")
        self.assertEqual({row["id"]: tuple(row[key] for key in keys) for row in timeline if row["id"] in busy},
                         {key: tuple(agents[key][key2] for key2 in keys) for key in busy})

    def test_every_item_on_my_turn_is_answered_where_it_shows(self):
        board = kinds(Frames(self, self.cookie).until(lambda found: kinds(found, "dashboard")), "dashboard")[0]["dashboard"]
        turn = board["owner_turn"]
        self.assertEqual({item["kind"] for item in turn}, {"approval", "question", "step"},
                         "the kinds the App opens a card for, in To-do and from Admin")
        said = {row["card_id"]: row["text"] for row in self.home.ledger.messages(limit=500)
                if row["role"] == "lead" and row["card_id"]}
        asked = {item["id"]: item for item in self.call("GET", "/questions", cookie=self.cookie)[2]["items"]}
        cards = {item["id"]: self.home.ledger.card(item["id"]) for item in turn}
        self.assertTrue({"secret", "choice"} <= {card["kind"] for card in cards.values()})
        for item in turn:
            card = cards[item["id"]]
            if card["kind"] == "choice":
                self.assertEqual(asked[card["id"]]["status"], "open", "To-do's card reads it from /questions")
                self.assertTrue(said[card["id"]].startswith("```choices\n"), "Admin's link finds it in the chat")
            if card["kind"] == "secret":
                request = request_for_card(self.home.ledger, card["id"])["id"]
                self.assertEqual(item["link"], f"/#/lead/secret/{request}", "its Open goes to its card in the chat")
                self.assertIn(f"```secret {request}\n```", said[card["id"]])
                status, _, step = self.call("GET", f"/db/read?kind=owner_steps&id={card['id']}", cookie=self.cookie)
                self.assertEqual((status, step["item"]["status"], step["item"]["link"]), (200, "live", item["link"]))
                status, _, refused = self.call("POST", f"/owner-steps/{card['id']}/done", {}, cookie=self.cookie)
                self.assertEqual(status, 409, "it clears when the secret is saved, not by a tick")
        guard = next(item for item in turn if item["what"].startswith("You said no to"))
        self.assertEqual(guard["what"], "You said no to “Publish the theme package to npm”. "
                                        "Always ask before running npm publish?")
        self.assertEqual((guard["kind"], guard["title"]), ("question", guard["what"]))
        self.assertEqual(asked[guard["id"]]["spec"]["options"], ["Yes", "No"])
        lesson = next(row for row in self.home.ledger.lessons(state=None) if row["kind"] == "guard")
        status, _, _ = self.call("POST", f"/questions/{guard['id']}/answer", {"picks": ["No"]}, cookie=self.cookie)
        self.assertEqual(status, 200)
        self.assertEqual(next(row["state"] for row in self.home.ledger.lessons(state=None) if row["id"] == lesson["id"]),
                         "retired", "No retires the guard, as POST /api/lessons/:id/retire does")

    def test_a_web_request_card_says_what_it_does_and_shows_the_request_under_it(self):
        status, _, card = self.call("GET", f"/approvals/{self.ids['summary']}", cookie=self.cookie)
        self.assertEqual(status, 200)
        lines = card["scope_text"].splitlines()
        self.assertEqual(lines[0], "Post the receipts summary to the team channel", "the App's title is its first line")
        hook = json.loads(self.home.ledger.card(self.ids["summary"])["command"])["url"]
        self.assertTrue(any(line.startswith(f"Request: POST {hook} (sha256 ") for line in lines[1:]))

    def test_a_new_card_reaches_the_dashboard_and_the_workspace(self):
        stream = Frames(self, self.cookie, "?ide=1")
        first = stream.until(lambda found: kinds(found, "owner_views") and kinds(found, "dashboard"))
        views = kinds(first, "owner_views")[0]
        self.assertEqual(views["state"], "ready")
        self.assertEqual([goal["id"] for goal in views["ledgers"]["goals"]],
                         [row["id"] for row in self.home.ledger.requests()])
        request = self.home.ledger.requests()[0]["id"]
        card = self.home.ledger.open_card(Role.LEAD, Interrupt.SEND, "Post the release note", "It is ready",
                                          request=request)
        frames = stream.until(lambda found: any(item["id"] == card for payload in kinds(found, "dashboard")
                                                for item in payload["dashboard"]["owner_turn"]))
        goal = next(goal for goal in kinds(frames, "dashboard")[-1]["dashboard"]["goals"] if goal["id"] == request)
        self.assertEqual(goal["status"], "awaiting_approval")
        later = stream.until(lambda found: any(approval["id"] == card for payload in kinds(found, "owner_views")
                                               for approval in payload["ledgers"]["approvals"]))
        self.assertGreater(kinds(later, "owner_views")[-1]["revision"], views["revision"])


    def test_a_request_is_named_by_its_whole_first_line(self):
        first = ("Move every invoice from the shared inbox into the right month folder, then total each month "
                 "and write the totals to a summary sheet the accountant can open")
        request = self.home.ledger.request(Role.OWNER, f"{first}\nThe second line is detail.", source="chat")
        card = self.home.ledger.open_card(Role.LEAD, Interrupt.SEND, "Mail the summary sheet", "It is ready",
                                          request=request)
        frames = Frames(self, self.cookie, "?ide=1").until(
            lambda found: kinds(found, "dashboard") and kinds(found, "owner_views"))
        board = kinds(frames, "dashboard")[-1]["dashboard"]
        goal = next(goal for goal in board["goals"] if goal["id"] == request)
        self.assertEqual((goal["title"], goal["short_name"]), (first, first), "the screen ellipsizes, not the server")
        self.assertEqual(next(item["title"] for item in board["owner_turn"] if item["id"] == card), first)
        self.assertEqual(next(item["goal_title"] for item in board["approvals"] if item["id"] == card), first)
        views = kinds(frames, "owner_views")[-1]
        self.assertEqual(next(goal["title"] for goal in views["ledgers"]["goals"] if goal["id"] == request), first)


    def test_a_quiet_home_still_says_its_data_is_fresh(self):
        with mock.patch.object(web, "FRESH_SECONDS", 1.0):
            stream = Frames(self, self.cookie, "?ide=1")
            first = stream.until(lambda found: kinds(found, "owner_views"))
            after = self.home.ledger.latest_events(1)[0]["id"]
            later = stream.until(lambda found: len(kinds(found, "dashboard")) > 1 and len(kinds(found, "owner_views")) > 1)
        self.assertFalse(self.home.ledger.events(after), "nothing happened in the home meanwhile")
        boards = kinds(later, "dashboard")
        self.assertGreater(boards[-1]["fetched_at"], boards[0]["fetched_at"], "the App warns of data over 90 s old")
        views = kinds(later, "owner_views")
        self.assertGreater(views[-1]["fetched_at"], views[0]["fetched_at"])
        self.assertEqual(kinds(first, "owner_views")[0]["epoch"], views[-1]["epoch"])


class SettingsTest(AppCase):
    def test_the_names_and_panels_open_the_stream_and_follow_the_setup(self):
        cookie = self.owner()
        stream = Frames(self, cookie)
        first = stream.until(lambda found: kinds(found, "home.settings"))
        self.assertEqual(first[0]["kind"], "home.settings", "the names come before anything that says them")
        shown = kinds(first, "home.settings")[0]
        self.assertEqual((shown["lead"], shown["user"]), ({"name": "Lead", "role": "lead"}, {"name": "You"}))
        self.assertEqual(shown["capabilities"], list(frames.CAPABILITIES))
        self.assertEqual(shown["lang"], "en")
        self.assertEqual(self.call("POST", "/api/setup", {"name": "Juno", "you": "Sam"}, cookie=cookie)[0], 200)
        later = stream.until(lambda found: any(item["lead"]["name"] == "Juno" for item in kinds(found, "home.settings")))
        self.assertEqual(kinds(later, "home.settings")[-1]["user"], {"name": "Sam"})


if __name__ == "__main__":
    unittest.main()
