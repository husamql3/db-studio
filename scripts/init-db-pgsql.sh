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

-- ============================================================
-- Schemas
-- ============================================================
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS hr;

-- ============================================================
-- public schema
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'project_status' AND n.nspname = 'public') THEN
    CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contributors (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  birth_date DATE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  status public.project_status NOT NULL DEFAULT 'active',
  budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  launch_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contributions (
  id SERIAL PRIMARY KEY,
  contributor_id INT NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 10,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id)
);

ALTER TABLE public.contributors
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS status public.project_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS budget NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_date DATE;

ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS hours_per_week INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contributions_unique_pair'
  ) THEN
    ALTER TABLE public.contributions
      ADD CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id);
  END IF;
END $$;

SELECT setval(pg_get_serial_sequence('public.contributors', 'id'), COALESCE((SELECT MAX(id) FROM public.contributors), 1), true);
SELECT setval(pg_get_serial_sequence('public.projects', 'id'), COALESCE((SELECT MAX(id) FROM public.projects), 1), true);
SELECT setval(pg_get_serial_sequence('public.contributions', 'id'), COALESCE((SELECT MAX(id) FROM public.contributions), 1), true);

INSERT INTO public.contributors (name, email, is_active, birth_date, joined_at)
VALUES
  ('Mona Patel', 'mona@example.com', TRUE, '1994-04-19', '2024-01-15T09:00:00Z'),
  ('Diego Rivera', 'diego@example.com', FALSE, '1991-11-03', '2023-10-21T14:30:00Z')
ON CONFLICT (email) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  birth_date = EXCLUDED.birth_date,
  joined_at = EXCLUDED.joined_at;

INSERT INTO public.projects (name, status, budget, launch_date, created_at)
VALUES
  ('Nebula Analytics', 'active', 125000.50, '2025-02-01', '2024-12-10T10:00:00Z'),
  ('Atlas Mobile', 'planning', 48000.00, '2025-06-15', '2025-01-07T16:45:00Z')
ON CONFLICT (name) DO UPDATE
SET
  status = EXCLUDED.status,
  budget = EXCLUDED.budget,
  launch_date = EXCLUDED.launch_date,
  created_at = EXCLUDED.created_at;

INSERT INTO public.contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
VALUES
  (
    (SELECT id FROM public.contributors WHERE email = 'mona@example.com'),
    (SELECT id FROM public.projects WHERE name = 'Nebula Analytics'),
    'Lead Engineer', 32, TRUE, '2025-02-03', '2025-02-03T09:00:00Z'
  ),
  (
    (SELECT id FROM public.contributors WHERE email = 'diego@example.com'),
    (SELECT id FROM public.projects WHERE name = 'Atlas Mobile'),
    'Product Designer', 20, FALSE, '2025-01-20', '2025-01-20T11:30:00Z'
  )
ON CONFLICT (contributor_id, project_id) DO UPDATE
SET
  role = EXCLUDED.role,
  hours_per_week = EXCLUDED.hours_per_week,
  is_billable = EXCLUDED.is_billable,
  started_at = EXCLUDED.started_at,
  created_at = EXCLUDED.created_at;

-- ============================================================
-- analytics schema
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'event_type' AND n.nspname = 'analytics') THEN
    CREATE TYPE analytics.event_type AS ENUM ('page_view', 'click', 'form_submit', 'api_call');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS analytics.events (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type analytics.event_type NOT NULL,
  page TEXT,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics.daily_summaries (
  id SERIAL PRIMARY KEY,
  summary_date DATE NOT NULL UNIQUE,
  total_events INT NOT NULL DEFAULT 0,
  unique_sessions INT NOT NULL DEFAULT 0,
  top_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT setval(pg_get_serial_sequence('analytics.events', 'id'), COALESCE((SELECT MAX(id) FROM analytics.events), 1), true);
SELECT setval(pg_get_serial_sequence('analytics.daily_summaries', 'id'), COALESCE((SELECT MAX(id) FROM analytics.daily_summaries), 1), true);

INSERT INTO analytics.events (session_id, event_type, page, metadata, occurred_at)
VALUES
  (gen_random_uuid(), 'page_view', '/dashboard', '{"referrer": "google.com"}', '2025-03-01T08:12:00Z'),
  (gen_random_uuid(), 'click',     '/dashboard', '{"element": "btn-export"}',  '2025-03-01T08:13:45Z'),
  (gen_random_uuid(), 'api_call',  NULL,          '{"endpoint": "/api/tables", "status": 200}', '2025-03-01T08:14:00Z'),
  (gen_random_uuid(), 'page_view', '/tables',     '{"referrer": "/dashboard"}', '2025-03-02T10:05:00Z'),
  (gen_random_uuid(), 'form_submit','/settings',  '{"form": "connection-form"}','2025-03-02T10:07:30Z');

INSERT INTO analytics.daily_summaries (summary_date, total_events, unique_sessions, top_page)
VALUES
  ('2025-03-01', 3, 2, '/dashboard'),
  ('2025-03-02', 2, 2, '/tables')
ON CONFLICT (summary_date) DO UPDATE
SET
  total_events    = EXCLUDED.total_events,
  unique_sessions = EXCLUDED.unique_sessions,
  top_page        = EXCLUDED.top_page;

-- ============================================================
-- hr schema
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'employment_type' AND n.nspname = 'hr') THEN
    CREATE TYPE hr.employment_type AS ENUM ('full_time', 'part_time', 'contractor');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr.departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cost_center TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr.employees (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department_id INT REFERENCES hr.departments(id) ON DELETE SET NULL,
  employment_type hr.employment_type NOT NULL DEFAULT 'full_time',
  salary NUMERIC(12, 2),
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr.time_off_requests (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES hr.employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  approved BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT setval(pg_get_serial_sequence('hr.departments', 'id'), COALESCE((SELECT MAX(id) FROM hr.departments), 1), true);
SELECT setval(pg_get_serial_sequence('hr.employees', 'id'), COALESCE((SELECT MAX(id) FROM hr.employees), 1), true);
SELECT setval(pg_get_serial_sequence('hr.time_off_requests', 'id'), COALESCE((SELECT MAX(id) FROM hr.time_off_requests), 1), true);

INSERT INTO hr.departments (name, cost_center)
VALUES
  ('Engineering',  'CC-100'),
  ('Design',       'CC-200'),
  ('Operations',   'CC-300')
ON CONFLICT (name) DO NOTHING;

INSERT INTO hr.employees (full_name, email, department_id, employment_type, salary, hire_date)
VALUES
  ('Alice Chen',   'alice@corp.example',  (SELECT id FROM hr.departments WHERE name = 'Engineering'), 'full_time',   115000.00, '2022-03-14'),
  ('Bob Santos',   'bob@corp.example',    (SELECT id FROM hr.departments WHERE name = 'Design'),      'full_time',    95000.00, '2023-07-01'),
  ('Carol Nguyen', 'carol@corp.example',  (SELECT id FROM hr.departments WHERE name = 'Engineering'), 'contractor',   85000.00, '2024-01-10'),
  ('Dan Lee',      'dan@corp.example',    (SELECT id FROM hr.departments WHERE name = 'Operations'),  'part_time',    52000.00, '2023-11-20')
ON CONFLICT (email) DO UPDATE
SET
  full_name       = EXCLUDED.full_name,
  department_id   = EXCLUDED.department_id,
  employment_type = EXCLUDED.employment_type,
  salary          = EXCLUDED.salary,
  hire_date       = EXCLUDED.hire_date;

INSERT INTO hr.time_off_requests (employee_id, start_date, end_date, reason, approved)
VALUES
  ((SELECT id FROM hr.employees WHERE email = 'alice@corp.example'), '2025-04-07', '2025-04-11', 'Vacation',      TRUE),
  ((SELECT id FROM hr.employees WHERE email = 'bob@corp.example'),   '2025-05-01', '2025-05-02', 'Personal day',  NULL),
  ((SELECT id FROM hr.employees WHERE email = 'carol@corp.example'), '2025-03-24', '2025-03-24', 'Medical',       TRUE);
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
