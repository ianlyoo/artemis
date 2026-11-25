import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from artemis import lessons
from artemis.guard import Match, Rules, classify
from artemis.ledger import Ledger
from artemis.roles import Interrupt, Role

SEND, DELETE, SPEND = Interrupt.SEND, Interrupt.DELETE, Interrupt.SPEND


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.path.realpath(self.enterContext(TemporaryDirectory())))
        self.paths = SimpleNamespace(rules=self.root / "home" / "rules.toml")
        self.rules = Rules.load(self.paths)
        self.cwd = self.root / "project"
        self.cwd.mkdir()

    def kind(self, argv, shell="sh", shell_ok=False):
        return classify(argv, shell, self.rules, cwd=self.cwd, shell_ok=shell_ok).kind

    def check(self, cases, shell="sh", shell_ok=False):
        for kind, commands in cases.items():
            for argv in commands:
                with self.subTest(argv=argv, shell=shell):
                    self.assertEqual(self.kind(argv, shell, shell_ok), kind)

    def test_the_template_is_seeded_once_and_then_read_as_edited(self):
        self.assertIn("[deny]", self.paths.rules.read_text(encoding="utf-8"))
        self.paths.rules.write_text('[match."send as you"]\nargv = [["say-hello", "*"]]\n', encoding="utf-8")
        rules = Rules.load(self.paths)
        self.assertEqual(classify(["say-hello", "team"], "sh", rules), Match(SEND, "say-hello *"))
        self.assertIsNone(classify(["say-hello"], "sh", rules).kind)     # "*" is exactly one argument
        self.assertIsNone(classify(["git", "push"], "sh", rules).kind)

    def test_each_kind_in_sh(self):
        self.check({
            SEND: (["git", "push", "origin", "main"], ["gh", "pr", "create", "--fill"], ["npm", "publish"],
                   ["twine", "upload", "dist/*"], ["git", "push", "--FORCE"]),
            DELETE: (["rm", "-rf", "build"], ["rm", "notes.txt"], ["git", "reset", "--hard", "HEAD~1"],
                     ["find", ".", "-name", "*.tmp", "-delete"], ["shred", "notes.txt"], ["git", "clean", "-fdx"],
                     ["rm", "-rf", "/tmp/build"]),
            SPEND: (["stripe", "payouts", "create"], ["terraform", "apply", "-auto-approve"]),
            "opaque": (["python3", "build.py"], ["python", "-m", "pytest"], ["npm", "test"], ["make"],
                       ["node", "tool.js"], ["cargo", "run"], ["bash", "deploy.sh"]),
            None: (["git", "status"], ["ls", "-la"], ["git", "commit", "-m", "rm -rf x"], ["cargo", "build"],
                   ["echo", "$(not code)"], ["terraform", "plan"]),
        })

    def test_the_deny_list(self):
        self.check({"deny": (
            ["git", "push", "--force"], ["git", "push", "origin", "main", "--force-with-lease"],
            ["git", "push", "-f"], ["git", "push", "-fu", "origin", "main"], ["git", "push", "origin", "+main"],
            ["git", "push", "--mirror"], ["artemis", "approve", "3"], ["artemis", "decline", "3"],
            ["artemis", "resume"], ["artemis", "secret", "set", "X"], ["artemis", "device", "allow", "1"],
            ["security", "find-generic-password", "-s", "x"], ["secret-tool", "lookup", "a", "b"],
            ["keyring", "get", "svc", "user"], ["python3", "-m", "keyring", "get", "svc", "user"],
            ["cmdkey", "/list"], ["rm", "-rf", "/"], ["rm", "-rf", "/*"], ["rm", "-rf", "~"], ["rm", "-rf", "$HOME"],
            ["rm", "-r", "${HOME}/"], ["sudo", "rm", "-rf", "--no-preserve-root", "/"],
        )})
        self.assertEqual(classify(["git", "push", "-f"], "sh", self.rules).rule, "git push ** -f*")
        self.assertEqual(classify(["rm", "-rf", "/"], "sh", self.rules).rule,
                         "a delete of a disk's root or your home folder")

    def test_a_relative_delete_of_the_home_folder_is_denied(self):
        user = self.root / "user"
        (user / "project").mkdir(parents=True)
        with patch.dict(os.environ, {"HOME": str(user), "USERPROFILE": str(user)}):
            self.assertEqual(classify(["rm", "-rf", ".."], "sh", self.rules, cwd=user / "project").kind, "deny")
            self.assertEqual(classify(["rm", "-rf", "old"], "sh", self.rules, cwd=user / "project").kind, DELETE)
            self.assertEqual(classify(["Remove-Item", "$env:USERPROFILE", "-Recurse"], "powershell",
                                      self.rules).kind, "deny")

    def test_each_kind_in_powershell_without_regard_to_case(self):
        self.check({
            SEND: (["git", "push"], ["Send-MailMessage", "-To", "team@example.com"],
                   ["send-mailmessage", "-to", "team@example.com"]),
            DELETE: (["Remove-Item", "dist", "-Recurse", "-Force"], ["remove-item", "-recurse", "dist"],
                     ["Clear-RecycleBin", "-Force"], ["robocopy", "src", "dst", "/mir"], ["del", "old.txt"]),
            SPEND: (["Stripe", "charges", "create"],),
            "deny": (["Remove-Item", "C:\\", "-Recurse"], ["rd", "/s", "/q", "D:\\"], ["git", "push", "--FORCE"],
                     ["Remove-Item", "%USERPROFILE%"], ["cmdkey", "/LIST"], ["VaultCmd", "/list"]),
            "opaque": (["py", "build.py"], ["pwsh", "script.ps1"], ["npm.cmd", "test"]),
            None: (["Get-ChildItem"], ["git", "status"]),
        }, shell="powershell")

    def test_paths_wrappers_and_extensions_do_not_hide_the_program(self):
        for argv, shell, kind in ((["/usr/bin/git", "push"], "sh", SEND),
                                  (["env", "GIT_TRACE=1", "git", "push"], "sh", SEND),
                                  (["GIT_TRACE=1", "git", "push"], "sh", SEND),
                                  (["sudo", "-n", "rm", "-rf", "build"], "sh", DELETE),
                                  (["nohup", "nice", "git", "push"], "sh", SEND),
                                  (["C:\\Program Files\\Git\\cmd\\git.exe", "push"], "powershell", SEND),
                                  (["/usr/local/bin/python3.12", "build.py"], "sh", "opaque")):
            with self.subTest(argv=argv):
                self.assertEqual(self.kind(argv, shell), kind)

    def test_a_shell_given_an_inline_command_needs_the_project_s_shell_flag(self):
        for argv, shell in ((["sh", "-c", "ls"], "sh"), (["bash", "-lc", "make"], "sh"),
                            (["/bin/zsh", "-c", "echo hi"], "sh"), (["cmd", "/c", "dir"], "powershell"),
                            (["cmd.exe", "/C", "dir"], "powershell"), (["pwsh", "-Command", "Get-Date"], "powershell"),
                            (["powershell", "Get-Date"], "powershell"), (["env", "bash", "-c", "ls"], "sh"),
                            (["pwsh", "-enc", "ZQBjAGgAbwA="], "powershell")):
            with self.subTest(argv=argv):
                match = classify(argv, shell, self.rules)
                self.assertEqual(match.kind, "deny")
                self.assertIn("inline command", match.rule)
                self.assertIn("shell = true", match.rule)
        self.assertEqual(self.kind(["bash", "deploy.sh"]), "opaque")      # a script file is not inline code
        self.assertEqual(self.kind(["pwsh", "-File", "deploy.ps1"], "powershell"), "opaque")

    def test_with_the_flag_every_command_in_inline_code_is_read(self):
        self.check({
            SEND: (["bash", "-lc", "make && git push"], ["bash", "-c", "echo $(date); git push"]),
            DELETE: (["zsh", "-c", "cd out; rm -rf cache"],),
            "deny": (["sh", "-c", "bash -c 'git push --force'"], ["sh", "-c", "cd /tmp && rm -rf ~"]),
            None: (["sh", "-c", "ls | wc -l"], ["bash", "-c", "echo hi > out.txt"]),
        }, shell_ok=True)
        self.check({
            DELETE: (["cmd.exe", "/c", "echo hi & del /s /q old"], ["powershell", "Remove-Item x -Recurse"]),
            SEND: (["pwsh", "-Command", "Get-Date; Send-MailMessage -To a@example.com"],),
            "deny": (["cmd", "/c", "rd /s /q C:\\"], ["powershell", "-Command", "Remove-Item C:\\ -Recurse"]),
        }, shell="powershell", shell_ok=True)

    def test_code_that_hides_what_it_runs_is_opaque(self):
        for argv, shell, marker in ((["bash", "-c", "echo $(whoami)"], "sh", "$("),
                                    (["sh", "-c", "x=`id`"], "sh", "`"),
                                    (["sh", "-c", 'eval "$CMD"'], "sh", "eval"),
                                    (["pwsh", "-c", "Invoke-Expression $text"], "powershell", "Invoke-Expression"),
                                    (["powershell", "-Command", "iex $text"], "powershell", "iex")):
            with self.subTest(argv=argv):
                match = classify(argv, shell, self.rules, shell_ok=True)
                self.assertEqual(match.kind, "opaque")
                self.assertIn(marker, match.rule)
        for argv in (["powershell", "-EncodedCommand", "ZQBjAGgAbwA="], ["pwsh", "-enc", "ZQBjAGgAbwA="],
                     ["pwsh", "-e", "ZQBjAGgAbwA="]):
            with self.subTest(argv=argv):
                self.assertEqual(classify(argv, "powershell", self.rules, shell_ok=True),
                                 Match("opaque", "an encoded command"))
        deep = ["sh", "-c", "sh -c 'sh -c \"sh -c \\\"sh -c ls\\\"\"'"]
        self.assertEqual(classify(deep, "sh", self.rules, shell_ok=True), Match("opaque", "shells nested too deep"))

    def test_guards_accepted_from_lessons_join_their_kind(self):
        ledger = Ledger(self.root / "ledger.db")
        ledger.initialize()
        ledger.add_lesson(Role.HOME, "guard", 'Ask before "rsync" to a deploy host',
                          {"kind": SEND, "argv": ["rsync", "**", "deploy@*"]})
        ledger.add_lesson(Role.HOME, "guard", 'Ask before "purge-cache"', {"kind": DELETE, "argv": ["purge-cache"]})
        lessons.sync_rules(ledger, self.paths.rules)      # writes [learned."<kind>"] into the seeded file
        self.assertIn('[learned."send as you"]', self.paths.rules.read_text(encoding="utf-8"))
        rules = Rules.load(self.paths)
        self.assertEqual(classify(["rsync", "-a", "out/", "deploy@example.com:/srv"], "sh", rules),
                         Match(SEND, "rsync ** deploy@*"))
        self.assertEqual(classify(["purge-cache", "--all"], "sh", rules), Match(DELETE, "purge-cache"))
        self.assertIsNone(classify(["rsync", "-a", "out/", "backup/"], "sh", rules).kind)
        self.assertEqual(classify(["git", "push"], "sh", rules).kind, SEND)        # the template's own still hold

    def test_a_broken_rules_file_is_refused_by_name(self):
        for text, message in (("[deny\n", "not valid TOML"), ("[share]\nargv = []\n", r"unknown section \[share\]"),
                              ('[match."spam"]\nargv = []\n', r"\[match\.'spam'\]"),
                              ('[deny]\nargv = ["x"]\n', r"\[deny\] needs argv"),
                              ('[opaque]\npatterns = [["x"]]\n', r"\[opaque\] needs argv"),
                              ('[learned."spam"]\nargv = [["x"]]\n', r"\[learned\.'spam'\]"),
                              ('[learned."send as you"]\nargv = ["x"]\n', r"\[learned\.'send as you'\] needs argv")):
            self.paths.rules.write_text(text, encoding="utf-8")
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, message):
                Rules.load(self.paths)


if __name__ == "__main__":
    unittest.main()
