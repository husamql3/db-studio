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
docker exec -i "${DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM ('planning', 'active', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contributors (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  birth_date DATE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  status project_status NOT NULL DEFAULT 'active',
  budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  launch_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  contributor_id INT NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 10,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id)
);

ALTER TABLE contributors
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status project_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_date DATE;

ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS hours_per_week INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contributions_unique_pair'
  ) THEN
    ALTER TABLE contributions
      ADD CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id);
  END IF;
END $$;

SELECT setval(
  pg_get_serial_sequence('contributors', 'id'),
  COALESCE((SELECT MAX(id) FROM contributors), 1),
  true
);

SELECT setval(
  pg_get_serial_sequence('projects', 'id'),
  COALESCE((SELECT MAX(id) FROM projects), 1),
  true
);

SELECT setval(
  pg_get_serial_sequence('contributions', 'id'),
  COALESCE((SELECT MAX(id) FROM contributions), 1),
  true
);

INSERT INTO contributors (name, email, is_active, birth_date, joined_at)
VALUES
  ('Mona Patel', 'mona@example.com', TRUE, '1994-04-19', '2024-01-15T09:00:00Z'),
  ('Diego Rivera', 'diego@example.com', FALSE, '1991-11-03', '2023-10-21T14:30:00Z')
ON CONFLICT (email) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  birth_date = EXCLUDED.birth_date,
  joined_at = EXCLUDED.joined_at;

INSERT INTO projects (name, status, budget, launch_date, created_at)
VALUES
  ('Nebula Analytics', 'active', 125000.50, '2025-02-01', '2024-12-10T10:00:00Z'),
  ('Atlas Mobile', 'planning', 48000.00, '2025-06-15', '2025-01-07T16:45:00Z')
ON CONFLICT (name) DO UPDATE
SET
  status = EXCLUDED.status,
  budget = EXCLUDED.budget,
  launch_date = EXCLUDED.launch_date,
  created_at = EXCLUDED.created_at;

INSERT INTO contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
VALUES
  (
    (SELECT id FROM contributors WHERE email = 'mona@example.com'),
    (SELECT id FROM projects WHERE name = 'Nebula Analytics'),
    'Lead Engineer',
    32,
    TRUE,
    '2025-02-03',
    '2025-02-03T09:00:00Z'
  ),
  (
    (SELECT id FROM contributors WHERE email = 'diego@example.com'),
    (SELECT id FROM projects WHERE name = 'Atlas Mobile'),
    'Product Designer',
    20,
    FALSE,
    '2025-01-20',
    '2025-01-20T11:30:00Z'
  )
ON CONFLICT (contributor_id, project_id) DO UPDATE
SET
  role = EXCLUDED.role,
  hours_per_week = EXCLUDED.hours_per_week,
  is_billable = EXCLUDED.is_billable,
  started_at = EXCLUDED.started_at,
  created_at = EXCLUDED.created_at;
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
