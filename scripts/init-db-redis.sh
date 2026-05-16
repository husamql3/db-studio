#!/usr/bin/env bash
set -euo pipefail

DB_PORT="${DB_PORT:-6379}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-redis}"
DB_IMAGE="${DB_IMAGE:-redis:7}"

DATABASE_URL="${DATABASE_URL:-redis://${DB_HOST}:${DB_PORT}/0}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-redis] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-redis] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-redis] creating redis container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:6379" \
    "${DB_IMAGE}" \
    redis-server --databases 16 >/dev/null
fi

echo "[init-db-redis] waiting for redis to accept connections..."
until docker exec "${DB_CONTAINER}" redis-cli PING 2>/dev/null | grep -q "PONG"; do
  sleep 1
done

echo "[init-db-redis] seeding sample keys across all six data types..."
docker exec -i "${DB_CONTAINER}" redis-cli <<'REDIS'
SELECT 0
FLUSHDB

# ─── strings ─────────────────────────────────────────────────────────────────
SET user:1 "alice"
SET user:2 "bob"
SET user:3 "carol"
SET counter 42
SET session:abc123 "active" EX 3600
SET feature:dark-mode "enabled"

# ─── hashes ──────────────────────────────────────────────────────────────────
HSET profile:1 name alice age 30 city Berlin role engineer
HSET profile:2 name bob age 25 city Tokyo role designer
HSET profile:3 name carol age 28 city "Mexico City" role pm
HSET config:app theme dark locale en debug false

# ─── lists ───────────────────────────────────────────────────────────────────
RPUSH queue:tasks "task-1" "task-2" "task-3" "task-4"
RPUSH log:errors "ENOENT" "ECONN" "ETIMEDOUT"
RPUSH recent:visits "/home" "/dashboard" "/settings"

# ─── sets ────────────────────────────────────────────────────────────────────
SADD tags:post:1 redis nosql cache database
SADD tags:post:2 web ssr javascript
SADD online:users alice bob carol

# ─── sorted sets ─────────────────────────────────────────────────────────────
ZADD leaderboard 100 alice 250 bob 175 carol 320 dave
ZADD trending 5 javascript 12 typescript 3 rust 8 python
ZADD scores:weekly 89.5 alice 76.2 bob 91.0 carol

# ─── streams ─────────────────────────────────────────────────────────────────
XADD events:login * user alice ip 10.0.0.1
XADD events:login * user bob ip 10.0.0.2
XADD events:login * user carol ip 10.0.0.3
XADD events:purchase * user alice item book amount 19.99
XADD events:purchase * user bob item laptop amount 1299.00

# ─── second logical DB to verify db switching ────────────────────────────────
SELECT 1
SET hello "world"
SET note "this key lives in db1"
HSET prefs:1 lang en color blue
REDIS

echo "[init-db-redis] done. Connection string:"
echo "  ${DATABASE_URL}"
