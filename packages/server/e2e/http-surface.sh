#!/usr/bin/env sh
# Boots the real CLI server on a port and records e2e/artifacts/http-surface-<label>.json.
# Usage: DATABASE_URL=postgresql://... sh e2e/http-surface.sh <label>
set -eu
label="$1"
port=4999
cd "$(dirname "$0")/.."

DB_STUDIO_TELEMETRY=0 \
	ALLOWED_ORIGINS=https://allowed.example \
	DB_STUDIO_PROXY_URL=http://127.0.0.1:4998 \
	npx tsx src/index.ts --database-url "$DATABASE_URL" --port "$port" --no-open \
	>"/tmp/http-surface-$label.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; pkill -P $server 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
	curl -s -o /dev/null "http://127.0.0.1:$port/api/databases/current" && break
	sleep 0.5
done

npx tsx e2e/http-surface.ts "http://127.0.0.1:$port" "$label"
