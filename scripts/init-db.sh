#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_USER="${DB_USER:-dbstudio}"
DB_PASSWORD="${DB_PASSWORD:-dbstudio}"
DB_PORT="${DB_PORT:-5434}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-pg}"
DB_IMAGE="${DB_IMAGE:-postgres:16-alpine}"

DATABASE_URL="${DATABASE_URL:-postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db] creating postgres container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -p "${DB_PORT}:5432" \
    "${DB_IMAGE}" >/dev/null
fi

echo "[init-db] waiting for postgres to accept connections..."
until docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; do
  sleep 0.5
done

echo "[init-db] applying schema..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" <<'SQL'
CREATE TABLE IF NOT EXISTS contributors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  contributor_id INT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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

echo "[init-db] done. DATABASE_URL=${DATABASE_URL}"
