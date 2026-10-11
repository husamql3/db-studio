#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_PORT="${DB_PORT:-26257}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-cockroach}"
DB_IMAGE="${DB_IMAGE:-cockroachdb/cockroach:latest-v25.2}"

DATABASE_URL="${DATABASE_URL:-cockroachdb://root@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-cockroach] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-cockroach] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-cockroach] creating cockroach container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:26257" \
    "${DB_IMAGE}" start-single-node --insecure >/dev/null
fi

cockroach_sql() {
  docker exec -i "${DB_CONTAINER}" ./cockroach sql --insecure --host=127.0.0.1:26257 "$@"
}

echo "[init-db-cockroach] waiting for cockroach to accept SQL connections..."
until cockroach_sql -e "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-cockroach] applying schema..."
cockroach_sql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
cockroach_sql --database="${DB_NAME}" <<'SQL'
CREATE TABLE IF NOT EXISTS contributors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  birth_date DATE,
  profile JSONB,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  owner_id INT REFERENCES contributors(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects (owner_id);

INSERT INTO contributors (name, email, is_active, birth_date, profile, joined_at)
VALUES
  ('Mona Patel', 'mona@example.com', TRUE, '1994-04-19', '{"team": "core"}', '2024-01-15T09:00:00Z'),
  ('Diego Rivera', 'diego@example.com', FALSE, '1991-11-03', NULL, '2023-10-21T14:30:00Z')
ON CONFLICT (email) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  birth_date = EXCLUDED.birth_date,
  profile = EXCLUDED.profile,
  joined_at = EXCLUDED.joined_at;

INSERT INTO projects (name, budget, owner_id)
VALUES
  ('Nebula Analytics', 125000.50, (SELECT id FROM contributors WHERE email = 'mona@example.com')),
  ('Atlas Mobile', 48000.00, (SELECT id FROM contributors WHERE email = 'diego@example.com'))
ON CONFLICT (name) DO UPDATE
SET
  budget = EXCLUDED.budget,
  owner_id = EXCLUDED.owner_id;
SQL

if [[ -f "${ROOT_DIR}/.env" ]]; then
  if grep -q '^DATABASE_URL=' "${ROOT_DIR}/.env"; then
    sed -i.bak "s#^DATABASE_URL=.*#DATABASE_URL=${DATABASE_URL}#g" "${ROOT_DIR}/.env"
    rm -f "${ROOT_DIR}/.env.bak"
  else
    echo "DATABASE_URL=${DATABASE_URL}" >> "${ROOT_DIR}/.env"
  fi
else
  echo "DATABASE_URL=${DATABASE_URL}" > "${ROOT_DIR}/.env"
fi

echo "[init-db-cockroach] done. DATABASE_URL=${DATABASE_URL}"
