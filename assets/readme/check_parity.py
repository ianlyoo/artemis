#!/usr/bin/env python3
"""Check that README.md and README.ko.md have the same shape.

    python3 assets/readme/check_parity.py

Same heading levels in the same order, the same images, the same link
targets apart from the language switch, and identical quickstart shell blocks.
"""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
SWITCH = {"README.md", "README.ko.md", "docs/design.md", "docs/design.ko.md"}


def shape(name):
    text = (ROOT / name).read_text(encoding="utf-8")
    prose = re.sub(r"```.*?```", "", text, flags=re.S)
    targets = re.findall(r'(?:href|src|srcset)="([^"]+)"', prose) + re.findall(r"\]\(([^)]+)\)", prose)
    block = re.search(r"<!-- quickstart:begin -->\n(.*?)<!-- quickstart:end -->", text, flags=re.S)
    quickstart = block[1] if block else ""
    shell_blocks = re.findall(r"^```sh\n(.*?)^```$", quickstart, flags=re.S | re.M)
    return {
        "headings": [len(mark) for mark in re.findall(r"^(#{1,6}) ", prose, flags=re.M)],
        "images": sorted(t for t in targets if t.endswith(".svg") or "img.shields.io" in t),
        "links": sorted(t for t in targets if not t.startswith("#") and t not in SWITCH
                        and not t.endswith(".svg") and "img.shields.io" not in t),
        "anchors": len([t for t in targets if t.startswith("#")]),
        "markers": re.findall(r"<!-- [a-z:-]+ -->", text),
        "quickstart": shell_blocks,
    }


def main():
    english, korean = shape("README.md"), shape("README.ko.md")
    wrong = [key for key in english if english[key] != korean[key]]
    if not english["quickstart"]:
        wrong.append("quickstart shell blocks missing")
    if wrong:
        sys.exit("README.md and README.ko.md differ in: " + ", ".join(wrong))
    print(f"parity ok: {len(english['headings'])} headings, {len(english['images'])} images, "
          f"{len(english['links'])} links, {len(english['markers'])} markers")


if __name__ == "__main__":
    main()
