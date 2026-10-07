#!/usr/bin/env bash
set -euo pipefail

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
else
  echo "Bun is not installed. Run: bash setup.sh" >&2
  exit 1
fi

exec "$BUN_BIN" run src/cli.ts "$@"
