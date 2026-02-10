#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run() {
  local name="$1"
  shift
  echo "[dev] starting ${name}..."
  (cd "$ROOT_DIR" && "$@") &
  echo $! >> /tmp/db-studio-dev.pids
}

run_in() {
  local name="$1"
  local dir="$2"
  shift 2
  echo "[dev] starting ${name}..."
  (cd "$dir" && "$@") &
  echo $! >> /tmp/db-studio-dev.pids
}

cleanup() {
  if [[ -f /tmp/db-studio-dev.pids ]]; then
    while read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done < /tmp/db-studio-dev.pids
    rm -f /tmp/db-studio-dev.pids
  fi
}

trap cleanup EXIT INT TERM

: > /tmp/db-studio-dev.pids

if [[ "${DB_STUDIO_SKIP_DB_INIT:-}" != "1" ]]; then
  echo "[dev] initializing postgres..."
  "$ROOT_DIR/scripts/init-db.sh"
fi

# Server: use Node/npm to avoid Bun + tsx CJS resolution issues
run_in "server" "$ROOT_DIR/packages/server" npm run dev -- --env "$ROOT_DIR/.env"

# Core: Vite dev server
run "core" bun run dev:core

# Wrangler (proxy/www) should run under Node, not Bun
# CI=1 disables interactive prompts from wrangler
run_in "proxy" "$ROOT_DIR/packages/proxy" CI=1 npm run dev

# If port 42069 is busy for the www dev worker, set a different port here
# Example: CLOUDFLARE_DEV_PORT=8790
run_in "www" "$ROOT_DIR/www" CI=1 npm run dev

echo "[dev] all processes started. Press Ctrl+C to stop."
wait
