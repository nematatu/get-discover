#!/usr/bin/env bash
set -euo pipefail

DATA_ROOT="${GET_DISCOVER_DATA_DIR:-$HOME/.local/share/get-discover}"
PROFILE_ROOT="$DATA_ROOT/chrome-profile"
CHROME_APP="/Applications/Google Chrome.app"
CHROME_BIN="$CHROME_APP/Contents/MacOS/Google Chrome"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "get-discover currently supports macOS only." >&2
  exit 1
fi

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Google Chrome is required." >&2
  echo "Install it, then run: bash setup.sh" >&2
  exit 1
fi

mkdir -p "$DATA_ROOT"

if [[ "${1:-}" == "--reset" ]]; then
  echo "Resetting dedicated get-discover Chrome profile..."
  rm -rf "$PROFILE_ROOT"
  rm -f "$DATA_ROOT/client-instance-id"
fi

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
else
  echo "Bun is not installed; installing it for the current user..."
  curl -fsSL https://bun.sh/install | bash
  BUN_BIN="$HOME/.bun/bin/bun"

  if [[ ! -x "$BUN_BIN" ]]; then
    echo "Bun installation did not produce $BUN_BIN" >&2
    exit 1
  fi
fi

has_unbound_token() {
  local db="$PROFILE_ROOT/Default/Web Data"

  [[ -f "$db" ]] || return 1

  local count
  count="$(
    /usr/bin/sqlite3 "$db" "SELECT COUNT(*) FROM token_service WHERE service LIKE 'AccountId-%' AND length(binding_key) = 0;" 2>/dev/null |
      tr -cd '0-9'
  )" || return 1

  [[ "${count:-0}" -gt 0 ]]
}

if ! has_unbound_token; then
  echo
  echo "A dedicated Chrome window will open."
  echo
  echo "In that window:"
  echo "  1. Sign in to CHROME (not only google.com)."
  echo "  2. Use the Google account whose Discover feed you want."
  echo "  3. Return to this terminal and press Enter."
  echo
  echo "This profile is isolated from your normal Chrome profile:"
  echo "  $PROFILE_ROOT"
  echo

  "$CHROME_BIN" --user-data-dir="$PROFILE_ROOT" --no-first-run --disable-features=EnableChromeRefreshTokenBinding,EnableChromeRefreshTokenBindingUpgrade >/dev/null 2>&1 &
  CHROME_PID=$!

  read -r -p "Press Enter after Chrome sign-in is complete: " _

  if kill -0 "$CHROME_PID" 2>/dev/null; then
    kill "$CHROME_PID" 2>/dev/null || true
    wait "$CHROME_PID" 2>/dev/null || true
  fi

  sleep 2

  if ! has_unbound_token; then
    echo >&2
    echo "No unbound Chrome refresh token was found." >&2
    echo "Make sure you signed in to Chrome itself." >&2
    echo "Then retry with a clean dedicated profile:" >&2
    echo "  bash setup.sh --reset" >&2
    exit 1
  fi
fi

echo
echo "Dedicated Chrome profile: OK"
echo "Unbound refresh token: OK"
echo
echo "Fetching Discover..."

exec "$BUN_BIN" run src/cli.ts --pages 5
