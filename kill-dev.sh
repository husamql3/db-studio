#!/usr/bin/env bash
set -euo pipefail

PIDS_FILE="/tmp/db-studio-dev.pids"

kill_pid() {
  local pid="$1"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

# Kill processes started by dev.sh
if [[ -f "$PIDS_FILE" ]]; then
  while read -r pid; do
    kill_pid "$pid"
  done < "$PIDS_FILE"
  rm -f "$PIDS_FILE"
fi

# Kill common dev ports used by this repo
PORTS=(3333 3000 3001 3002 3003 42069 5173 5174 5175 5176 8787 8788 8789)

for port in "${PORTS[@]}"; do
  # ss output example: users:(("node",pid=123,fd=12))
  pids=$(ss -lptn "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p')
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill_pid "$pid"
    done
  fi
 done

 echo "[kill-dev] done"
