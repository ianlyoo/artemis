"""Parity and edge-case tests for src/artemis/web/fences.py.

Compares segments(), choice_spec(), and same_spec() against the committed
reference outputs in tests/data/fences/ without needing Node at test time, and
verifies streaming prefix safety plus refusal codes for disallowed targets.
"""

import json
from pathlib import Path
import unittest

from artemis.web.fences import choice_spec, same_spec, segments

DATA = Path(__file__).resolve().parent / "data" / "fences"


def _canonical(value) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


class FencesParityTest(unittest.TestCase):
    """Committed corpus parity against the gateway and front-end reference outputs."""

    @classmethod
    def setUpClass(cls):
        cls.corpus = json.loads((DATA / "corpus.json").read_text("utf-8"))
        cls.expected = json.loads((DATA / "expected.json").read_text("utf-8"))
        cls.choices_corpus = json.loads((DATA / "choices_corpus.json").read_text("utf-8"))
        cls.choices_expected = json.loads((DATA / "choices_expected.json").read_text("utf-8"))

    def test_corpus_size_and_uniqueness(self):
        self.assertGreaterEqual(len(self.corpus), 40)
        ids = [case["id"] for case in self.corpus]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), set(self.expected.keys()))

    def test_segments_parity(self):
        for case in self.corpus:
            with self.subTest(case=case["id"]):
                got = segments(case["text"], streaming=case["streaming"])
                want = self.expected[case["id"]]
                self.assertEqual(_canonical(got), _canonical(want))

    def test_choice_spec_parity(self):
        for case in self.choices_corpus["choice_spec"]:
            with self.subTest(case=case["id"]):
                got = choice_spec(case["body"])
                want = self.choices_expected["choice_spec"][case["id"]]
                self.assertEqual(_canonical(got), _canonical(want))

    def test_same_spec_parity(self):
        for case in self.choices_corpus["same_spec"]:
            with self.subTest(case=case["id"]):
                got = same_spec(case["a"], case["b"])
                want = self.choices_expected["same_spec"][case["id"]]
                self.assertIs(got, want)


class FencesEdgeCasesTest(unittest.TestCase):
    """Refusal codes, environment-driven origins, streaming prefixes, and binding."""

    def test_open_refusals(self):
        cases = [
            ('{"url": "https://example.com"}', "unsupported_target: open.url"),
            ('{"file": "/tmp/report.md"}', "unsupported_target: open.file"),
            ('{"board": "b1", "title": "   "}', "invalid_value: open.title"),
            ('{"board": "b1", "title": "' + ("가" * 201) + '"}', "invalid_value: open.title"),
        ]
        for body, prefix in cases:
            with self.subTest(body=body[:40]):
                [seg] = segments(f"```open\n{body}\n```")
                self.assertEqual(seg["type"], "code")
                self.assertEqual(seg["lang"], "open")
                self.assertEqual(seg["text"], body)
                self.assertTrue(seg["reason"].startswith(prefix), seg["reason"])

    def test_secret_ref_refusals(self):
        bad = [
            ({"key": "demo.tmp", "label": "임시"}, "invalid_value: secret.key"),
            ({"key": "demo.prev", "label": "이전"}, "invalid_value: secret.key"),
            ({"key": "BAD_UPPER", "label": "대문자"}, "invalid_value: secret.key"),
            ({"key": "demo.k", "label": "첫줄\n둘째줄"}, "invalid_value: secret.label"),
            ({"key": "demo.k", "label": "가" * 61}, "invalid_value: secret.label"),
            ({"key": "demo.k", "label": "토큰", "template": "no-placeholder"}, "invalid_value: secret.template"),
            ({"key": "demo.k", "label": "토큰", "template": "{value}/{value}"}, "invalid_value: secret.template"),
            ({"key": "demo.k", "label": "토큰", "template": " {value}"}, "invalid_value: secret.template"),
            ({"key": "demo.k", "label": "토큰", "template": "https://evil.example/?v={value}"}, "invalid_value: secret.template"),
            ({"key": "demo.k", "label": "토큰", "template": "https://127.0.0.1:7411/hook?t={value}"},
             "invalid_value: secret.template"),
        ]
        for payload, prefix in bad:
            body = json.dumps(payload, ensure_ascii=False)
            with self.subTest(payload=payload):
                [seg] = segments(f"```secret\n{body}\n```")
                self.assertEqual(seg["type"], "code")
                self.assertEqual(seg["lang"], "secret")
                self.assertTrue(seg["reason"].startswith(prefix), seg["reason"])

        kept = json.dumps({"key": "demo.k", "label": "헤더", "template": "Bearer {value}"})
        [seg] = segments(f"```secret\n{kept}\n```")
        self.assertEqual((seg["type"], seg["block"]["type"]), ("block", "secret"))

    def test_streaming_every_prefix_is_safe(self):
        reply = (
            "보고를 정리했어요.\n\n"
            '```table\n{"columns":["항목","값"],"rows":[["지연","12ms"]]}\n```\n\n'
            '```choices\n{"q":"배포할까요?","options":["진행","대기"],"step":9}\n```\n\n'
            "```step 9\n```\n\n"
            '```open {"board":"release-notes","title":"릴리스"}```\n\n'
            "마무리입니다."
        )
        for cut in range(len(reply) + 1):
            chunk = reply[:cut]
            stream_segs = segments(chunk, streaming=True)
            final_segs = segments(chunk, streaming=False)
            self.assertIsInstance(stream_segs, list)
            self.assertIsInstance(final_segs, list)
            if any(s["type"] == "pending" for s in stream_segs):
                self.assertEqual(stream_segs[-1]["type"], "pending")
        self.assertEqual(segments(reply, streaming=True), segments(reply, streaming=False))

    def test_choices_fence_binds_with_same_spec(self):
        reply = (
            "확인 부탁드려요.\n\n"
            '```choices\n{"q":"어느 안이 좋을까요?","options":["A안",{"label":"B안","line":"안전한 경로"}],"guess":"B안","step":14}\n```'
        )
        segs = segments(reply)
        choices_segs = [s for s in segs if s["type"] == "code" and s["lang"] == "choices"]
        self.assertEqual(len(choices_segs), 1)
        parsed = choice_spec(choices_segs[0]["text"])
        self.assertIsNotNone(parsed)
        stored_record = {"step": 14, "options": ["A안", "B안"]}
        self.assertTrue(same_spec(parsed, stored_record))
        self.assertFalse(same_spec(parsed, {"step": 15, "options": ["A안", "B안"]}))


if __name__ == "__main__":
    unittest.main()
