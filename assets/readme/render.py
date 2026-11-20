#!/usr/bin/env python3
"""Draw the README images from the demo transcript.

    python3 assets/readme/render.py [TRANSCRIPT]

Standard library only. The same input gives the same bytes, so a second
machine can re-run this and compare. TRANSCRIPT defaults to
docs/demo/transcript.txt, which `harness demo` prints.
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
# The ledger plate reads the same on a white page and on a dark one.
PLATE = {"plate": "#14181d", "edge": "#30363d", "rule": "#2b323a", "on": "#e6edf3", "off": "#8b949e"}
# Narrow drawings sit on a card of the plate's colour, so one file serves both themes.
CARD = {
    "ink": "#e6edf3", "soft": "#8b949e", "page": "#14181d",
    "plate": "#21262d", "edge": "#3d444d", "rule": "#3d444d",
    "on": "#e6edf3", "off": "#8b949e", "amber": PLATE_AMBER, "green": PLATE_GREEN,
}
VERDICTS = {"reject": PLATE_AMBER, "pass": PLATE_GREEN, "applied": PLATE_GREEN}
ROLES = ("Owner", "Lead", "CTO", "PM", "Worker")
WRITES = ("request", "goal", "plan", "project", "reported")
HOLDS = ("requests", "goals", "projects", "tasks", "claims", "evidence", "verdicts", "receipts")


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
        f'font-size="{n(size)}"{weight}{anchor}{extra}>{escape(value)}</text>'
    )


def rect(x, y, w, h, fill="none", stroke=None, radius=0, extra=""):
    stroke = f' stroke="{stroke}" stroke-width="1.5"' if stroke else ""
    radius = f' rx="{n(radius)}"' if radius else ""
    return (
        f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}"{radius} '
        f'fill="{fill}"{stroke}{extra}/>'
    )


def arrow(x1, y1, x2, y2, colour, both=False):
    """A straight line with an 8 px head at the far end, or at both ends."""
    length = hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / length, (y2 - y1) / length

    def head(x, y, dx, dy):
        bx, by = x - 8 * dx, y - 8 * dy
        return (f'<path d="M{n(x)},{n(y)}L{n(bx - 4 * dy)},{n(by + 4 * dx)}'
                f'L{n(bx + 4 * dy)},{n(by - 4 * dx)}z" fill="{colour}"/>')

    sx, sy = (x1 + 6 * ux, y1 + 6 * uy) if both else (x1, y1)
    parts = [
        f'<path d="M{n(sx)},{n(sy)}L{n(x2 - 6 * ux)},{n(y2 - 6 * uy)}" '
        f'stroke="{colour}" stroke-width="1.5" fill="none"/>',
        head(x2, y2, ux, uy),
    ]
    if both:
        parts.append(head(x1, y1, -ux, -uy))
    return "".join(parts)


def labelled(x, y1, y2, label, theme, both=False, size=15):
    """A vertical arrow from y1 to y2 that breaks around its label."""
    ink, middle = theme["ink"], (y1 + y2) / 2
    upper = (arrow(x, middle - size * .8, x, y1, ink) if both else
             f'<path d="M{n(x)},{n(y1)}V{n(middle - size * .8)}" stroke="{ink}" stroke-width="1.5"/>')
    return (upper + arrow(x, middle + size * .8, x, y2, ink)
            + text(x, middle + size * .34, label, theme["soft"], size, anchor="middle"))


def box(x, y, w, h, label, theme, kind="role", size=15):
    """kind: role (outlined), person or main (solid ink), amber or green (an outcome)."""
    if kind in ("person", "main"):
        shape = rect(x, y, w, h, fill=theme["ink"], radius=8)
        colour = theme["page"]
    elif kind in ("amber", "green"):
        shape = rect(x + .75, y + .75, w - 1.5, h - 1.5, stroke=theme[kind], radius=8)
        colour = theme[kind]
    else:
        shape = rect(x + .75, y + .75, w - 1.5, h - 1.5, stroke=theme["ink"], radius=8)
        colour = theme["ink"]
    literal = kind in ("main", "amber", "green", "literal")
    return shape + text(
        x + w / 2, y + h / 2 + size * .36, label, colour, size,
        font=MONO if literal else SANS, weight=600, anchor="middle",
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

def ledger_rows(transcript):
    """The first run of numbered rows: (number, role, kind, detail)."""
    rows = []
    for line in transcript.splitlines():
        fields = line.split(maxsplit=3)
        if len(fields) == 4 and fields[0].isdigit():
            if rows and int(fields[0]) <= int(rows[-1][0]):
                break
            rows.append(tuple(fields))
    if not rows:
        raise SystemExit("The transcript holds no numbered ledger rows.")
    return rows


def reveal(count, start=.9, step=.42):
    """Rows start dim and brighten in order, once. Where animation does not run,
    every row is simply at full strength."""
    delays = "".join(
        f".d{index}{{animation-delay:{n(start + index * step)}s}}" for index in range(count)
    )
    return (
        ".r{animation:a .5s ease-out both}.b{animation:b .5s ease-out both}"
        "@keyframes a{from{opacity:.42}}@keyframes b{from{opacity:0}}" + delays +
        "@media (prefers-reduced-motion:reduce){.r,.b{animation:none}}"
    )


def hero(transcript, theme=PLATE):
    rows = ledger_rows(transcript)
    title = transcript.splitlines()[0]
    footer = transcript.splitlines()[-1]
    width, pad, first, step = 840, 36, 108, 31
    last = first + (len(rows) - 1) * step
    height = last + 82
    body = [
        plate(0, 0, width, height, theme, radius=12),
        text(pad, 52, "$", theme["off"], 16),
        text(pad + 20, 52, "harness demo", theme["on"], 16, weight=600),
        text(width - pad, 52, title, theme["off"], 14, anchor="end"),
        rect(pad, 72, width - 2 * pad, 1, fill=theme["rule"]),
    ]
    for index, (number, role, kind, detail) in enumerate(rows):
        y = first + index * step
        hue = VERDICTS.get(kind)
        if hue:
            body.append(rect(20, y - 21, width - 40, step, fill=hue, radius=6,
                             extra=f' fill-opacity=".13" class="b d{index}"'))
        body.append(
            f'<g class="r d{index}">'
            + text(pad, y, number, theme["off"], 16)
            + text(pad + 48, y, role, theme["on"], 16)
            + text(pad + 140, y, kind, hue or theme["on"], 16, weight=700 if hue else None)
            + text(pad + 264, y, detail, theme["on"], 16)
            + "</g>"
        )
    body.append(rect(pad, last + 24, width - 2 * pad, 1, fill=theme["rule"]))
    body.append(text(pad, last + 54, footer, theme["off"], 14))
    label = "The demo ledger: " + "; ".join(f"{r[1]} {r[2]}" for r in rows)
    return document(width, height, label, body, reveal(len(rows)))


def hero_narrow(transcript, span=(7, 12), theme=PLATE):
    """The claim, the rejection, the second claim, the pass and the receipt, for phones."""
    rows = ledger_rows(transcript)
    shown = [row for row in rows if span[0] <= int(row[0]) <= span[1]]
    footer = transcript.splitlines()[-1]
    width, pad, top, step = 328, 12, 54, 48
    height = top + len(shown) * step + 46
    body = [
        plate(0, 0, width, height, theme, radius=10),
        text(pad, 33, "$", theme["off"], 12.5),
        text(pad + 15, 33, "harness demo", theme["on"], 12.5, weight=600),
        text(width - pad, 33, f"rows {shown[0][0]}–{shown[-1][0]} of {len(rows)}",
             theme["off"], 11.5, anchor="end"),
        rect(pad, 46, width - 2 * pad, 1, fill=theme["rule"]),
    ]
    for index, (number, role, kind, detail) in enumerate(shown):
        y = top + index * step
        hue = VERDICTS.get(kind)
        if hue:
            body.append(rect(5, y + 2, width - 10, step - 4, fill=hue, radius=6,
                             extra=f' fill-opacity=".13" class="b d{index}"'))
        body.append(
            f'<g class="r d{index}">'
            + text(pad, y + 20, number, theme["off"], 12.5)
            + text(pad + 22, y + 20, role, theme["on"], 12.5)
            + text(pad + 82, y + 20, kind, hue or theme["on"], 12.5, weight=700 if hue else None)
            + text(pad + 22, y + 37, detail, theme["on"], 11.5, extra=' fill-opacity=".86"')
            + "</g>"
        )
    end = top + len(shown) * step
    body.append(rect(pad, end + 6, width - 2 * pad, 1, fill=theme["rule"]))
    body.append(text(pad, end + 28, footer, theme["off"], 11.5))
    label = "The demo ledger, rows %s to %s: " % (shown[0][0], shown[-1][0]) + "; ".join(
        f"{r[1]} {r[2]}" for r in shown)
    return document(width, height, label, body, reveal(len(shown), step=.6))


# ------------------------------------------------------------------- roles

ROLES_LABEL = (
    "Owner, lead, CTO, PM and worker hand work down a chain and each writes to one "
    "ledger. A judge outside the chain reads claims and writes verdicts. The ship "
    "lane writes a receipt and moves main."
)


def roles(theme):
    width, w, h, gap = 840, 136, 52, 40
    ink, soft = theme["ink"], theme["soft"]
    body = []
    for index, name in enumerate(ROLES):
        x = index * (w + gap)
        body.append(box(x, 2, w, h, name, theme, "person" if index == 0 else "role", 16))
        if index:
            body.append(arrow(x - gap + 5, 28, x - 5, 28, ink))
        centre = x + w / 2
        body.append(labelled(centre, 2 + h + 5, 135, WRITES[index], theme))
    body.append(plate(0, 140, width, 70, theme))
    body.append(text(28, 181, "ledger.db", theme["on"], 16, weight=600))
    body.append(text(width - 28, 180, " · ".join(HOLDS), theme["off"], 13.5, anchor="end"))
    judge, lane, main = 1 * (w + gap), 3 * (w + gap), 4 * (w + gap)
    body.append(box(judge, 290, w, h, "Judge", theme, "role", 16))
    body.append(labelled(judge + w / 2, 215, 285, "pass · reject · stop", theme, both=True))
    body.append(box(lane, 290, w, h, "Ship lane", theme, "role", 16))
    body.append(labelled(lane + w / 2, 215, 285, "receipt", theme, both=True))
    body.append(arrow(lane + w + 5, 316, main - 5, 316, ink))
    body.append(box(main, 290, w, h, "main", theme, "main", 15))
    return document(width, 344, ROLES_LABEL, body)


def card(width, height, theme=CARD):
    return rect(.5, .5, width - 1, height - 1, fill=theme["page"], radius=10,
                extra=' stroke="#30363d" stroke-width="1"')


def roles_narrow(theme=CARD):
    width, pad, w, h, step = 328, 14, 118, 42, 72
    ink, soft = theme["ink"], theme["soft"]
    left = pad + w + 62
    judge = pad + 5 * step + 14
    lane = judge + step
    height = lane + step + h + pad
    body = [card(width, height), plate(left, pad, width - pad - left, lane + h - pad, theme, radius=8)]
    body.append(text(left + 14, pad + 30, "ledger.db", theme["on"], 13.5, weight=600))
    for index, name in enumerate(HOLDS):
        body.append(text(left + 14, pad + 58 + index * 20, name, theme["off"], 11.5))
    for index, name in enumerate(ROLES):
        y = pad + index * step
        body.append(box(pad, y, w, h, name, theme, "person" if index == 0 else "role", 14.5))
        if index:
            body.append(arrow(pad + w / 2, y - step + h + 4, pad + w / 2, y - 4, ink))
        body.append(arrow(pad + w + 4, y + h / 2, left - 4, y + h / 2, ink))
        body.append(text((pad + w + left) / 2, y + h / 2 - 8, WRITES[index], soft, 11.5, anchor="middle"))
    for y, name, label in ((judge, "Judge", "verdict"), (lane, "Ship lane", "receipt")):
        body.append(box(pad, y, w, h, name, theme, "role", 14.5))
        body.append(arrow(pad + w + 4, y + h / 2, left - 4, y + h / 2, ink, both=True))
        body.append(text((pad + w + left) / 2, y + h / 2 - 8, label, soft, 11.5, anchor="middle"))
    body.append(arrow(pad + w / 2, lane + h + 4, pad + w / 2, lane + step - 4, ink))
    body.append(box(pad, lane + step, w, h, "main", theme, "main", 14))
    return document(width, height, ROLES_LABEL, body)


# --------------------------------------------------------------- ship lane

STAGES = (("branch@sha", "literal"), ("Stop check", "role"), ("Worktree", "role"),
          ("Checks", "role"), ("Fast-forward", "role"), ("main", "main"))
# stage index -> (edge label, outcome, colour, whether the ledger gets a receipt)
EXITS = {1: ("halt", "held", "amber", False), 3: ("exit ≠ 0", "red", "amber", True),
         4: ("not ff", "stale", "amber", True), 5: ("ff", "applied", "green", True)}
SHIP_LABEL = (
    "A branch pinned at one commit passes a stop check, a disposable worktree, the "
    "checks and a fast-forward to reach main. A stop holds it. A failed check ends "
    "in a red receipt, a main that moved in a stale receipt, success in an applied receipt."
)


def ship_lane(theme):
    width, w, h, gap = 840, 120, 52, 24
    ink, soft = theme["ink"], theme["soft"]
    body = []
    for index, (name, kind) in enumerate(STAGES):
        x = index * (w + gap)
        body.append(box(x, 2, w, h, name, theme, kind, 15))
        if index:
            body.append(arrow(x - gap + 4, 28, x - 4, 28, ink))
        if index in EXITS:
            edge, outcome, colour, recorded = EXITS[index]
            centre = x + w / 2
            body.append(labelled(centre, 2 + h + 5, 131, edge, theme))
            body.append(box(x, 136, w, 44, outcome, theme, colour, 15))
            if recorded:
                body.append(arrow(centre, 185, centre, 219, ink))
    start = 3 * (w + gap)
    body.append(plate(start, 224, width - start, 52, theme))
    body.append(text(start + 24, 256, "ledger.db", theme["on"], 15, weight=600))
    body.append(text(width - 24, 255, "receipts", theme["off"], 14, anchor="end"))
    return document(width, 278, SHIP_LABEL, body)


def ship_lane_narrow(theme=CARD):
    width, pad, w, h, step = 328, 14, 104, 42, 70
    ink, soft = theme["ink"], theme["soft"]
    out_x, out_w, strip = pad + w + 66, 80, 280
    height = pad + 5 * step + h + pad
    body = [card(width, height)]
    recorded_rows = [index for index, exit_ in EXITS.items() if exit_[3]]
    top = pad + min(recorded_rows) * step
    bottom = pad + max(recorded_rows) * step + h
    body.append(plate(strip, top, width - pad - strip, bottom - top, theme, radius=8))
    middle_x, middle_y = strip + (width - pad - strip) / 2, (top + bottom) / 2
    body.append(text(middle_x, middle_y, "ledger.db", theme["on"], 12.5, weight=600, anchor="middle",
                     extra=f' transform="rotate(90 {n(middle_x)} {n(middle_y)})" dy="4"'))
    for index, (name, kind) in enumerate(STAGES):
        y = pad + index * step
        body.append(box(pad, y, w, h, name, theme, kind, 14))
        if index:
            body.append(arrow(pad + w / 2, y - step + h + 4, pad + w / 2, y - 4, ink))
        if index in EXITS:
            edge, outcome, colour, recorded = EXITS[index]
            body.append(arrow(pad + w + 4, y + h / 2, out_x - 4, y + h / 2, ink))
            body.append(text((pad + w + out_x) / 2, y + h / 2 - 8, edge, soft, 11.5, anchor="middle"))
            body.append(box(out_x, y, out_w, h, outcome, theme, colour, 14))
            if recorded:
                body.append(arrow(out_x + out_w + 2, y + h / 2, strip - 2, y + h / 2, ink))
    return document(width, height, SHIP_LABEL, body)


def main(argv):
    source = Path(argv[1]) if len(argv) > 1 else ROOT / "docs" / "demo" / "transcript.txt"
    transcript = source.read_text(encoding="utf-8").strip("\n")
    images = {
        "ledger": hero(transcript),
        "ledger-narrow": hero_narrow(transcript),
        "roles-narrow": roles_narrow(),
        "ship-lane-narrow": ship_lane_narrow(),
    }
    for name, theme in THEMES.items():
        images[f"wordmark-{name}"] = wordmark(theme)
        images[f"roles-{name}"] = roles(theme)
        images[f"ship-lane-{name}"] = ship_lane(theme)
    for stem, image in images.items():
        (HERE / f"{stem}.svg").write_text(image, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main(sys.argv)
