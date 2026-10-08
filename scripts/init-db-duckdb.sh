#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_PATH="${DB_PATH:-${ROOT_DIR}/db/dbstudio.duckdb}"
case "${DB_PATH}" in
  /*) ;;
  *) DB_PATH="${ROOT_DIR}/${DB_PATH}" ;;
esac

DATABASE_URL="${DATABASE_URL:-duckdb://${DB_PATH}}"

if ! command -v bun >/dev/null 2>&1; then
  echo "[init-db] bun is not installed or not in PATH"
  exit 1
fi

mkdir -p "$(dirname "${DB_PATH}")"

echo "[init-db] creating DuckDB database at ${DB_PATH}..."

# Runs from packages/server so @duckdb/node-api resolves; no duckdb CLI needed.
SEED_SCRIPT=$(cat <<'JS'
import { DuckDBInstance } from "@duckdb/node-api";

const instance = await DuckDBInstance.create(process.env.DB_PATH);
const connection = await instance.connect();
await connection.run(`
CREATE SEQUENCE IF NOT EXISTS contributors_id_seq;
CREATE SEQUENCE IF NOT EXISTS projects_id_seq;
CREATE SEQUENCE IF NOT EXISTS contributions_id_seq;
CREATE SEQUENCE IF NOT EXISTS events_id_seq;
CREATE SEQUENCE IF NOT EXISTS departments_id_seq;
CREATE SEQUENCE IF NOT EXISTS employees_id_seq;

CREATE TABLE IF NOT EXISTS contributors (
  id         INTEGER PRIMARY KEY DEFAULT nextval('contributors_id_seq'),
  name       VARCHAR NOT NULL,
  email      VARCHAR UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  birth_date DATE,
  joined_at  TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY DEFAULT nextval('projects_id_seq'),
  name        VARCHAR NOT NULL UNIQUE,
  status      VARCHAR NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'archived')),
  budget      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  launch_date DATE,
  created_at  TIMESTAMP NOT NULL DEFAULT current_timestamp
);

-- DuckDB foreign keys support neither ON DELETE CASCADE nor SET NULL.
CREATE TABLE IF NOT EXISTS contributions (
  id             INTEGER PRIMARY KEY DEFAULT nextval('contributions_id_seq'),
  contributor_id INTEGER NOT NULL REFERENCES contributors(id),
  project_id     INTEGER NOT NULL REFERENCES projects(id),
  role           VARCHAR NOT NULL,
  hours_per_week INTEGER NOT NULL DEFAULT 10,
  is_billable    BOOLEAN NOT NULL DEFAULT true,
  started_at     DATE NOT NULL DEFAULT current_date,
  created_at     TIMESTAMP NOT NULL DEFAULT current_timestamp,
  UNIQUE (contributor_id, project_id)
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY DEFAULT nextval('events_id_seq'),
  event_type  VARCHAR NOT NULL CHECK (event_type IN ('page_view', 'click', 'form_submit', 'api_call')),
  page        VARCHAR,
  metadata    JSON,
  occurred_at TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY DEFAULT nextval('departments_id_seq'),
  name        VARCHAR NOT NULL UNIQUE,
  cost_center VARCHAR,
  created_at  TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS employees (
  id              INTEGER PRIMARY KEY DEFAULT nextval('employees_id_seq'),
  full_name       VARCHAR NOT NULL,
  email           VARCHAR NOT NULL UNIQUE,
  department_id   INTEGER REFERENCES departments(id),
  employment_type VARCHAR NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contractor')),
  salary          DECIMAL(12, 2),
  hire_date       DATE NOT NULL DEFAULT current_date,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT current_timestamp
);

INSERT INTO contributors (name, email, is_active, birth_date, joined_at)
SELECT * FROM (VALUES
  ('Mona Patel',   'mona@example.com',  true,  DATE '1994-04-19', TIMESTAMP '2024-01-15 09:00:00'),
  ('Diego Rivera', 'diego@example.com', false, DATE '1991-11-03', TIMESTAMP '2023-10-21 14:30:00')
) WHERE NOT EXISTS (SELECT 1 FROM contributors);

INSERT INTO projects (name, status, budget, launch_date, created_at)
SELECT * FROM (VALUES
  ('Nebula Analytics', 'active',   125000.50, DATE '2025-02-01', TIMESTAMP '2024-12-10 10:00:00'),
  ('Atlas Mobile',     'planning',  48000.00, DATE '2025-06-15', TIMESTAMP '2025-01-07 16:45:00')
) WHERE NOT EXISTS (SELECT 1 FROM projects);

INSERT INTO contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
SELECT c.id, p.id, v.role, v.hours, v.billable, v.started, v.created
FROM (VALUES
  ('mona@example.com',  'Nebula Analytics', 'Lead Engineer',    32, true,  DATE '2025-02-03', TIMESTAMP '2025-02-03 09:00:00'),
  ('diego@example.com', 'Atlas Mobile',     'Product Designer', 20, false, DATE '2025-01-20', TIMESTAMP '2025-01-20 11:30:00')
) AS v(email, project, role, hours, billable, started, created)
JOIN contributors c ON c.email = v.email
JOIN projects p ON p.name = v.project
WHERE NOT EXISTS (SELECT 1 FROM contributions);

INSERT INTO events (event_type, page, metadata, occurred_at)
SELECT * FROM (VALUES
  ('page_view',   '/dashboard', '{"referrer":"google.com"}',               TIMESTAMP '2025-03-01 08:12:00'),
  ('click',       '/dashboard', '{"element":"btn-export"}',                TIMESTAMP '2025-03-01 08:13:45'),
  ('api_call',    NULL,         '{"endpoint":"/api/tables","status":200}', TIMESTAMP '2025-03-01 08:14:00'),
  ('page_view',   '/tables',    '{"referrer":"/dashboard"}',               TIMESTAMP '2025-03-02 10:05:00'),
  ('form_submit', '/settings',  '{"form":"connection-form"}',              TIMESTAMP '2025-03-02 10:07:30')
) WHERE NOT EXISTS (SELECT 1 FROM events);

INSERT INTO departments (name, cost_center)
SELECT * FROM (VALUES
  ('Engineering', 'CC-100'),
  ('Design',      'CC-200'),
  ('Operations',  'CC-300')
) WHERE NOT EXISTS (SELECT 1 FROM departments);

INSERT INTO employees (full_name, email, department_id, employment_type, salary, hire_date)
SELECT v.full_name, v.email, d.id, v.employment_type, v.salary, v.hire_date
FROM (VALUES
  ('Alice Chen',   'alice@corp.example', 'Engineering', 'full_time',  115000.00, DATE '2022-03-14'),
  ('Bob Santos',   'bob@corp.example',   'Design',      'full_time',   95000.00, DATE '2023-07-01'),
  ('Carol Nguyen', 'carol@corp.example', 'Engineering', 'contractor',  85000.00, DATE '2024-01-10'),
  ('Dan Lee',      'dan@corp.example',   'Operations',  'part_time',   52000.00, DATE '2023-11-20')
) AS v(full_name, email, department, employment_type, salary, hire_date)
JOIN departments d ON d.name = v.department
WHERE NOT EXISTS (SELECT 1 FROM employees);
`);
connection.closeSync();
instance.closeSync();
JS
)

(cd "${ROOT_DIR}/packages/server" && DB_PATH="${DB_PATH}" bun -e "${SEED_SCRIPT}")

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
