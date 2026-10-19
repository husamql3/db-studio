#!/usr/bin/env bash
set -euo pipefail

# Seeds a remote Cloudflare D1 database with the sample tables of init-db-sqlite.sh.
# Wrangler authenticates with CLOUDFLARE_API_TOKEN or a prior `wrangler login`; set
# CLOUDFLARE_ACCOUNT_ID when the login can reach more than one account.

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
D1_DATABASE="${D1_DATABASE:-db-studio-e2e}"

if ! INFO="$(bunx wrangler d1 info "${D1_DATABASE}" --json 2>/dev/null)"; then
  echo "[init-db-d1] creating D1 database ${D1_DATABASE}..."
  bunx wrangler d1 create "${D1_DATABASE}" >/dev/null
  INFO="$(bunx wrangler d1 info "${D1_DATABASE}" --json)"
fi
DATABASE_ID="$(printf '%s' "${INFO}" | grep -o '"uuid": *"[^"]*"' | cut -d'"' -f4)"

# Reuse the SQLite seed; D1 refuses PRAGMA journal_mode and always enforces foreign keys.
SEED_DIR="$(mktemp -d)"
trap 'rm -rf "${SEED_DIR}"' EXIT
SEED_FILE="${SEED_DIR}/seed.sql"
awk "/<<'SQL'\$/ { seed = 1; next } /^SQL\$/ { seed = 0 } seed && !/^PRAGMA/" \
  "${SCRIPTS_DIR}/init-db-sqlite.sh" > "${SEED_FILE}"

echo "[init-db-d1] seeding sample tables into ${D1_DATABASE}..."
bunx wrangler d1 execute "${D1_DATABASE}" --remote --file "${SEED_FILE}" --yes >/dev/null

echo "[init-db-d1] done. DATABASE_URL=d1://${CLOUDFLARE_ACCOUNT_ID:-<account_id>}/${DATABASE_ID}?authToken=<cloudflare api token>"
echo "[init-db-d1] or set CLOUDFLARE_API_TOKEN and leave out ?authToken=..."
