#!/usr/bin/env python3
"""Draw the README images from the demo transcript.

    python3 assets/readme/render.py [TRANSCRIPT]

Standard library only. The same input gives the same bytes, so a second
machine can re-run this and compare. TRANSCRIPT defaults to
docs/demo/transcript.txt, which `artemis demo` prints.
"""

from math import hypot
from pathlib import Path
import sys
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"

# Page colours follow GitHub's light and dark themes. The ledger is the one
# dark plate on the page in both. Amber and green mark outcomes, nothing else.
THEMES = {
    "light": {
        "ink": "#1f2328", "soft": "#59636e", "page": "#ffffff",
        "plate": "#14181d", "edge": None, "rule": "#2b323a",
        "on": "#e6edf3", "off": "#8b949e",
        "amber": "#9a6700", "green": "#1a7f37",
    },
    "dark": {
        "ink": "#e6edf3", "soft": "#8b949e", "page": "#0d1117",
        "plate": "#161b22", "edge": "#30363d", "rule": "#30363d",
        "on": "#e6edf3", "off": "#8b949e",
        "amber": "#e3b341", "green": "#56d364",
    },
}
PLATE_AMBER, PLATE_GREEN = "#e3b341", "#56d364"
# The terminal plate reads the same on a white page and on a dark one.
PLATE = {"plate": "#14181d", "edge": "#30363d", "rule": "#2b323a", "on": "#e6edf3", "off": "#8b949e"}
LABELS = {"shipped": PLATE_GREEN, "verified": PLATE_GREEN, "decided": PLATE_AMBER, "waiting": PLATE_AMBER,
          "stuck": PLATE_AMBER}


def n(value):
    """A coordinate with at most two decimals and no trailing zeros."""
    return f"{value:.2f}".rstrip("0").rstrip(".")


def document(width, height, label, body, style=""):
    style = f"<style>{style}</style>" if style else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{escape(label)}">'
        f"{style}{''.join(body)}</svg>\n"
    )


def text(x, y, value, fill, size, font=MONO, weight=None, anchor=None, extra=""):
    weight = f' font-weight="{weight}"' if weight else ""
    anchor = f' text-anchor="{anchor}"' if anchor else ""
    return (
        f'<text x="{n(x)}" y="{n(y)}" fill="{fill}" font-family="{font}" '
        f'font-size="{n(size)}"{weight}{anchor}{extra} xml:space="preserve">{escape(value)}</text>'
    )


def rect(x, y, w, h, fill="none", stroke=None, radius=0, extra=""):
    stroke = f' stroke="{stroke}" stroke-width="1.5"' if stroke else ""
    radius = f' rx="{n(radius)}"' if radius else ""
    return (
        f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}"{radius} '
        f'fill="{fill}"{stroke}{extra}/>'
    )


def plate(x, y, w, h, theme, radius=10):
    if theme["edge"]:
        return rect(x + .5, y + .5, w - 1, h - 1, fill=theme["plate"], radius=radius,
                    extra=f' stroke="{theme["edge"]}" stroke-width="1"')
    return rect(x, y, w, h, fill=theme["plate"], radius=radius)


# ---------------------------------------------------------------- wordmark

def slant(xt, yt, xb, yb, t=7):
    """A stroke between two points whose ends are cut flat on the cap and base lines."""
    half = t / 2 * hypot(xb - xt, yb - yt) / abs(yb - yt)
    return (f"M{n(xt - half)},{n(yt)}H{n(xt + half)}L{n(xb + half)},{n(yb)}"
            f"H{n(xb - half)}z")


def bar(x, y, w, h):
    return f"M{n(x)},{n(y)}h{n(w)}v{n(h)}h{n(-w)}z"


# Each letter: advance width, filled outline, stroked centre line (7 units wide).
LETTERS = {
    "A": (60, slant(30, 0, 3.8, 64) + slant(30, 0, 56.2, 64) + bar(14, 40, 32, 7), ""),
    "R": (46, bar(0, 0, 7, 64) + slant(24, 33, 42.2, 64),
          "M3.5,3.5H28.25A14.25,14.25 0 0 1 28.25,32H3.5"),
    "T": (48, bar(0, 0, 48, 7) + bar(20.5, 0, 7, 64), ""),
    "E": (38, bar(0, 0, 7, 64) + bar(0, 0, 38, 7) + bar(0, 28.5, 32, 7) + bar(0, 57, 38, 7), ""),
    "M": (64, bar(0, 0, 7, 64) + bar(57, 0, 7, 64)
          + slant(3.82, 0, 32, 64) + slant(60.18, 0, 32, 64), ""),
    "I": (7, bar(0, 0, 7, 64), ""),
    "S": (42, "", "M40,3.5H17.75A14.25,14.25 0 0 0 17.75,32H24.25"
                  "A14.25,14.25 0 0 1 24.25,60.5H2"),
}
GAPS = {"AR": 22, "RT": 20, "TE": 22}


def wordmark(theme, word="ARTEMIS", width=840, height=156, scale=1.12):
    x, parts = 0, []
    for index, letter in enumerate(word):
        advance, filled, stroked = LETTERS[letter]
        if filled:
            parts.append(f'<path transform="translate({n(x)})" d="{filled}" fill="{theme["ink"]}"/>')
        if stroked:
            parts.append(f'<path transform="translate({n(x)})" d="{stroked}" fill="none" '
                         f'stroke="{theme["ink"]}" stroke-width="7"/>')
        x += advance
        if index < len(word) - 1:
            x += GAPS.get(word[index:index + 2], 28)
    left = (width - x * scale) / 2
    top = (height - 64 * scale) / 2 + 4
    group = f'<g transform="translate({n(left)},{n(top)}) scale({scale})">{"".join(parts)}</g>'
    return document(width, height, "Artemis", [group])


# -------------------------------------------------------------------- hero

def sections(transcript):
    """The banner, then each exchange: a block that starts with `you ›`."""
    lines = transcript.splitlines()
    first = next(index for index, line in enumerate(lines) if line.startswith("you › "))
    banner = [line for line in lines[:first] if line.strip()]
    return banner, lines[first:]


def wrap(line, width, indent):
    """Break a line so no row is wider than width, after a ` · ` where one fits, else at a space."""
    lead = len(line) - len(line.lstrip(" "))
    rows, rest = [], line
    while len(rest) > width:
        cut = rest.rfind(" · ", lead + 1, width - 1)
        cut = cut + 2 if cut > lead else rest.rfind(" ", lead + 1, width + 1)
        if cut <= lead:
            break
        rows.append(rest[:cut].rstrip())
        rest = " " * (lead + indent) + rest[cut:].lstrip()
    return rows + [rest]


def spans(line, theme):
    """Split a transcript line into coloured runs: (text, colour, bold)."""
    on, off = theme["on"], theme["off"]
    for prompt in ("you › ", "lead (mock) › "):
        if line.startswith(prompt):
            return [(prompt, on if prompt.startswith("you") else off, True), (line[len(prompt):], on, False)]
    if line.startswith("● ") or line.startswith("■ "):
        return [(line[:2], PLATE_GREEN if line[0] == "●" else PLATE_AMBER, True), (line[2:], off, False)]
    if line.startswith("Decision "):
        return [(line, PLATE_AMBER, True)]
    if line.startswith("Last "):
        return [(line, on, True)]
    word = line.split(" ", 1)[0]
    if word in LABELS and len(line) > 10 and line[10] in "#D":
        return [(line[:10], LABELS[word], True), (line[10:], on, False)]
    if line.startswith("  "):
        return [(line, off if "artemis approve" in line or "nothing happens" in line else on, False)]
    return [(line, off, False)]


def runs(x, y, parts, size):
    """One text row whose runs keep monospace columns."""
    pieces = []
    for value, colour, bold in parts:
        if value:
            weight = ' font-weight="700"' if bold else ""
            pieces.append(f'<tspan fill="{colour}"{weight}>{escape(value)}</tspan>')
    return (f'<text x="{n(x)}" y="{n(y)}" font-family="{MONO}" font-size="{n(size)}" '
            f'xml:space="preserve">{"".join(pieces)}</text>')


def reveal(count, start=.6, step=.28):
    """Rows appear in order, once, as the run printed them. Without animation every row is shown."""
    delays = "".join(f".d{index}{{animation-delay:{n(start + index * step)}s}}" for index in range(count))
    return ("g.r{animation:a .35s ease-out both}@keyframes a{from{opacity:0}}" + delays +
            "@media (prefers-reduced-motion:reduce){g.r{animation:none}}")


def screen(rows, width, size, step, title, note, theme, label):
    """A terminal plate: a title bar, then (line, group, card, gap) rows; a group appears together."""
    pad, top, gap = size * 2.3, size * 4.6, step * .45
    height = top + len(rows) * step + sum(row[3] for row in rows) * gap + size * 3.4
    body = [plate(0, 0, width, height, theme, radius=12),
            text(pad, size * 2.55, "$", theme["off"], size),
            text(pad + size * 1.3, size * 2.55, title, theme["on"], size, weight=600),
            text(width - pad, size * 2.55, note, theme["off"], size * .86, anchor="end"),
            rect(pad, size * 3.6, width - 2 * pad, 1, fill=theme["rule"])]
    groups, y = {}, top + size
    for line, group, card, space in rows:
        y += space * gap
        bar = rect(pad - size * .9, y - size * 1.05, 3, step, fill=PLATE_AMBER) if card else ""
        groups.setdefault(group, []).append(bar + runs(pad, y, spans(line, theme), size))
        y += step
    order = sorted(groups)
    for position, group in enumerate(order):
        body.append(f'<g class="r d{position}">' + "".join(groups[group]) + "</g>")
    return document(width, n(height), label, body, reveal(len(order)))


LABEL = ("One sentence goes to the lead, which splits it into three tasks with checks and holds back the "
         "release note because it speaks for you. Three mock workers run at once while the status line counts "
         "them down. One decision card waits for you; you approve it. The digest then says that three tasks "
         "shipped to main and you were asked once.")


def rows_of(lines, width, keep=lambda line: True):
    """Transcript lines from the first `you ›`, wrapped, each tagged with the group that reveals it.
    A row of a decision card carries the card's bar; each `you ›` after the first opens a gap."""
    rows, group, in_card = [], 0, False
    for line in lines:
        if not line.strip():
            in_card = False
            continue
        if not keep(line):
            continue
        if line.startswith(("you › ", "lead (mock) › ", "● ", "■ ", "Decision ", "Last ")) or (
                line.split(" ", 1)[0] in LABELS and not in_card):
            group += 1
        in_card = in_card or line.startswith("Decision ")
        space = 1 if line.startswith("you › ") and rows else 0
        for index, row in enumerate(wrap(line, width, 2 if line.startswith(" ") else 6)):
            rows.append((row, group, in_card, space if index == 0 else 0))
    return rows


def hero(transcript, theme=PLATE):
    banner, lines = sections(transcript)
    return screen(rows_of(lines, 94), 900, 14, 22, "artemis demo", banner[0].split(" · ", 1)[1], theme, LABEL)


def narrow_lines(lines):
    """For phones: the sentence, the first and last status line, the decision and the digest. A digest line
    puts its evidence on a second row."""
    dropped = ("lead (mock) › ", "  #", "approved:", "  Post a", "  Why you", "  If you", "  Ready because")
    statuses = [line for line in lines if line.startswith("● ")]
    for line in lines:
        if line.startswith(dropped) or line.startswith("● ") and line not in (statuses[0], statuses[-1]):
            continue
        if line.split(" ", 1)[0] in LABELS and line[10:11] in ("#", "D"):
            title, detail = (part.strip() for part in line[10:].split("  ", 1))
            yield line[:10] + title
            yield "  " + detail
        elif line.startswith("  "):
            yield "  " + " ".join(line.split())
        else:
            yield line


def hero_narrow(transcript, theme=PLATE):
    _, lines = sections(transcript)
    return screen(rows_of(list(narrow_lines(lines)), 44), 360, 11.5, 18, "artemis demo", "mock ×3", theme, LABEL)


def main(argv):
    source = Path(argv[1]) if len(argv) > 1 else ROOT / "docs" / "demo" / "transcript.txt"
    transcript = source.read_text(encoding="utf-8").strip("\n")
    images = {"digest": hero(transcript), "digest-narrow": hero_narrow(transcript)}
    for name, theme in THEMES.items():
        images[f"wordmark-{name}"] = wordmark(theme)
    for stem, image in images.items():
        (HERE / f"{stem}.svg").write_text(image, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main(sys.argv)
