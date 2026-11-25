#!/bin/sh
# Install Artemis for this user on macOS or Linux (no sudo):
#   curl -fsSL https://raw.githubusercontent.com/ianlyoo/artemis/main/install.sh | sh
# It needs Python 3.11 or newer and Git. It installs with pipx, or uv when that is what you have, and fetches nothing
# else from the network but the package. ARTEMIS_INSTALL_SOURCE installs another source (a checkout, a tag).
set -eu
export PYTHONIOENCODING=utf-8   # pipx prints paths; a Korean or Japanese Windows code page cannot hold every one

source=${ARTEMIS_INSTALL_SOURCE:-git+https://github.com/ianlyoo/artemis}

say() { printf '%s\n' "$*"; }
fail() { printf 'artemis install: %s\n' "$*" >&2; exit 1; }

python=
for candidate in python3.13 python3.12 python3.11 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 &&
        "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11))' >/dev/null 2>&1; then
        python=$(command -v "$candidate")
        break
    fi
done
[ -n "$python" ] || fail "Python 3.11 or newer is needed. On macOS: brew install python. \
On Ubuntu or Debian: sudo apt install python3. Then run this again."
command -v git >/dev/null 2>&1 || fail "Git is needed. On macOS: xcode-select --install. \
On Ubuntu or Debian: sudo apt install git. Then run this again."
say "Using $("$python" -c 'import sys; print("Python", sys.version.split()[0])') at $python"

if command -v pipx >/dev/null 2>&1; then
    pipx install --force --python "$python" "$source"
    bin=$(pipx environment --value PIPX_BIN_DIR) shown="pipx ensurepath"
    ensure() { pipx ensurepath; }
    remove="pipx uninstall artemis-harness"
elif "$python" -m pipx --version >/dev/null 2>&1; then
    "$python" -m pipx install --force --python "$python" "$source"
    bin=$("$python" -m pipx environment --value PIPX_BIN_DIR) shown="$python -m pipx ensurepath"
    ensure() { "$python" -m pipx ensurepath; }
    remove="$python -m pipx uninstall artemis-harness"
elif command -v uv >/dev/null 2>&1; then
    uv tool install --force --python "$python" "$source"
    bin=$(uv tool dir --bin) shown="uv tool update-shell"
    ensure() { uv tool update-shell; }
    remove="uv tool uninstall artemis-harness"
else
    # Neither pipx nor uv: Artemis gets a virtual environment of its own and a link to its command.
    venv=${XDG_DATA_HOME:-$HOME/.local/share}/artemis/venv bin=$HOME/.local/bin
    ensure() { return 1; }      # nothing here edits a shell profile: the line to add is printed below
    "$python" -m venv --clear "$venv" >/dev/null 2>&1 || fail "Python cannot make a virtual environment here. \
On Ubuntu or Debian: sudo apt install pipx (or python3-venv). On macOS: brew install pipx. Then run this again."
    "$venv/bin/python" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
    "$venv/bin/python" -m pip install --quiet "$source" || fail "pip could not install Artemis; see above."
    mkdir -p "$bin" && ln -sf "$venv/bin/artemis" "$bin/artemis"
    remove="rm -r '$venv' '$bin/artemis'"
fi

say ""
case ":$PATH:" in
    *":$bin:"*) ;;
    *) if ensure >/dev/null 2>&1; then
           say "Added $bin to your PATH for new terminals ($shown)."
       else
           say "Add $bin to your PATH for new terminals, for example in ~/.profile: export PATH=\"$bin:\$PATH\""
       fi ;;
esac
"$bin/artemis" doctor || say "artemis doctor found something to fix; it says what above."
say ""
say "Artemis is installed. Open a new terminal if this one does not know the artemis command yet, then"
say "try it: artemis demo    Start your home: artemis serve    Remove it: $remove"
