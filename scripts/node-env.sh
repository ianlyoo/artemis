#!/bin/sh
# Usage: sh scripts/node-env.sh <command> [arguments...]
major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || major=0
case "$major" in ''|*[!0-9]*) major=0;; esac
if [ "$major" -lt 24 ]; then
  echo 'Artemis requires Node.js 24 or newer on PATH' >&2
  exit 2
fi
exec "$@"
