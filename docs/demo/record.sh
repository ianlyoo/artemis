#!/bin/sh
# Run with harness and Pillow installed. Set DEMO_FONT to override the monospace font.
set -eu
demo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
harness_bin=$(command -v harness)
python3 - "$demo_dir" "$harness_bin" <<'PY'
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


destination = Path(sys.argv[1])
with TemporaryDirectory(prefix="harness-record-") as scratch:
    env = os.environ | {
        "HOME": scratch, "XDG_CONFIG_HOME": scratch, "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
    }
    transcript = subprocess.check_output([sys.argv[2], "demo"], cwd=scratch, env=env)

fonts = [
    os.environ.get("DEMO_FONT"),
    "DejaVuSansMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
]
for name in filter(None, fonts):
    try:
        font = ImageFont.truetype(name, 18)
        break
    except OSError:
        continue
else:
    raise SystemExit("Set DEMO_FONT to a monospace TrueType font.")

columns, rows = 76, 23
margin, leading = 20, 24
width = round(columns * font.getlength("M")) + 2 * margin
height = rows * leading + 2 * margin + 30
screen = ["$ harness demo"]
frames, delays = [], []


def frame(delay):
    image = Image.new("RGB", (width, height), "#131923")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 32), fill="#242e3d")
    draw.text((margin, 7), "Terminal", font=font, fill="#dbe3ed")
    for index, line in enumerate(screen[-rows:]):
        words = line.split(maxsplit=3)
        kind = words[2] if len(words) >= 3 and words[0].isdigit() else ""
        color = {
            "reject": "#ffd088", "waiting": "#ffd088",
            "pass": "#9be8bf", "applied": "#9be8bf", "approved": "#9be8bf",
        }.get(kind, "#edf2f9")
        draw.text((margin, margin + 30 + index * leading), line, font=font, fill=color)
    frames.append(image)
    delays.append(delay)


frame(650)
for line in transcript.decode("utf-8").splitlines():
    screen.extend(wrap(line, width=columns, subsequent_indent=" " * 22,
                       replace_whitespace=False, drop_whitespace=False) or [""])
    if line.startswith("Ledger timeline"):
        frame(1100)
    elif "  reject " in line or "  waiting " in line or "  applied " in line:
        frame(1400)
    else:
        frame(340)
delays[-1] = 4200
frames[0].save(destination / "demo.gif", save_all=True, append_images=frames[1:],
               duration=delays, loop=0, optimize=True)
(destination / "transcript.txt").write_bytes(transcript)
PY
