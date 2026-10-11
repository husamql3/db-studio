#!/usr/bin/env bash
set -euo pipefail

DB_PORT="${DB_PORT:-18080}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-libsql}"
DB_IMAGE="${DB_IMAGE:-ghcr.io/tursodatabase/libsql-server:latest}"

DATABASE_URL="${DATABASE_URL:-libsql://${DB_HOST}:${DB_PORT}?tls=0}"
HTTP_URL="http://${DB_HOST}:${DB_PORT}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-libsql] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-libsql] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-libsql] creating libsql-server container ${DB_CONTAINER}..."
  docker run -d --name "${DB_CONTAINER}" -p "${DB_PORT}:8080" "${DB_IMAGE}" >/dev/null
fi

echo "[init-db-libsql] waiting for libsql-server to accept requests..."
for _ in $(seq 1 60); do
  if curl -fsS "${HTTP_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "${HTTP_URL}/health" >/dev/null

echo "[init-db-libsql] seeding sample tables..."
# Hrana's "sequence" request runs a multi-statement script on one stream.
SEED_SQL="$(cat <<'SQL'
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  cost_center TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contractor')),
  salary          REAL,
  hire_date       TEXT NOT NULL DEFAULT (date('now')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS employees_department_id_idx ON employees (department_id);

INSERT OR IGNORE INTO departments (name, cost_center) VALUES
  ('Engineering', 'CC-100'),
  ('Design',      'CC-200'),
  ('Operations',  'CC-300');

INSERT OR IGNORE INTO employees (full_name, email, department_id, employment_type, salary, hire_date) VALUES
  ('Alice Chen',   'alice@corp.example', (SELECT id FROM departments WHERE name = 'Engineering'), 'full_time',  115000.00, '2022-03-14'),
  ('Bob Santos',   'bob@corp.example',   (SELECT id FROM departments WHERE name = 'Design'),      'full_time',   95000.00, '2023-07-01'),
  ('Carol Nguyen', 'carol@corp.example', (SELECT id FROM departments WHERE name = 'Engineering'), 'contractor',  85000.00, '2024-01-10'),
  ('Dan Lee',      'dan@corp.example',   (SELECT id FROM departments WHERE name = 'Operations'),  'part_time',   52000.00, '2023-11-20');
SQL
)"

PAYLOAD="$(SEED_SQL="${SEED_SQL}" node -e 'process.stdout.write(JSON.stringify({ requests: [{ type: "sequence", sql: process.env.SEED_SQL }, { type: "close" }] }))')"
RESPONSE="$(curl -fsS -X POST -H "Content-Type: application/json" --data "${PAYLOAD}" "${HTTP_URL}/v2/pipeline")"
if echo "${RESPONSE}" | grep -q '"type":"error"'; then
  echo "[init-db-libsql] seeding failed: ${RESPONSE}"
  exit 1
fi

echo "[init-db-libsql] done. DATABASE_URL=${DATABASE_URL}"
