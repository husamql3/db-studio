#!/usr/bin/env bash
set -euo pipefail

PG_CTL="/usr/lib/postgresql/16/bin/pg_ctl"
DATA_DIR="/home/youssef/db-studio/pg-minimal/pgdata"
LOG_FILE="/home/youssef/db-studio/pg-minimal/logs/postgres.log"

if "$PG_CTL" -D "$DATA_DIR" status >/dev/null 2>&1; then
  echo "Postgres already running."
else
  echo "Starting local Postgres..."
  "$PG_CTL" -D "$DATA_DIR" -l "$LOG_FILE" start
fi

export PATH="/home/youssef/.bun/bin:$PATH"

exec bun run dev
