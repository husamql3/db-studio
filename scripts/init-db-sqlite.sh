
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_PATH="${DB_PATH:-${ROOT_DIR}/db/dbstudio.sqlite}"
case "${DB_PATH}" in
  /*) ;;
  *) DB_PATH="${ROOT_DIR}/${DB_PATH}" ;;
esac

DB_DIR="$(dirname "${DB_PATH}")"
DB_FILE="$(basename "${DB_PATH}")"
DB_CONTAINER_DIR="${DB_CONTAINER_DIR:-/db}"
DB_CONTAINER_PATH="${DB_CONTAINER_PATH:-${DB_CONTAINER_DIR}/${DB_FILE}}"
DB_IMAGE="${DB_IMAGE:-keinos/sqlite3:latest}"
DB_URL_TARGET="${DB_URL_TARGET:-host}"

case "${DB_URL_TARGET}" in
  host)
    DB_URL_PATH="${DB_PATH}"
    ;;
  docker)
    DB_URL_PATH="${DB_CONTAINER_PATH}"
    ;;
  *)
    echo "[init-db] unsupported DB_URL_TARGET=${DB_URL_TARGET}; expected host or docker"
    exit 1
    ;;
esac

DATABASE_URL="${DATABASE_URL:-sqlite://${DB_URL_PATH}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db] docker is not installed or not in PATH"
  exit 1
fi

mkdir -p "${DB_DIR}"

DOCKER_USER_ARGS=()
if command -v id >/dev/null 2>&1; then
  DOCKER_USER_ARGS=(--user "$(id -u):$(id -g)")
fi

echo "[init-db] creating SQLite database at ${DB_PATH} with ${DB_IMAGE}..."

docker run --rm -i \
  "${DOCKER_USER_ARGS[@]}" \
  -v "${DB_DIR}:${DB_CONTAINER_DIR}" \
  -w "${DB_CONTAINER_DIR}" \
  "${DB_IMAGE}" \
  sqlite3 "${DB_CONTAINER_PATH}" <<'SQL'
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contributors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  birth_date TEXT,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'archived')),
  budget      REAL NOT NULL DEFAULT 0,
  launch_date TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contributions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  contributor_id INTEGER NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  hours_per_week INTEGER NOT NULL DEFAULT 10,
  is_billable    INTEGER NOT NULL DEFAULT 1,
  started_at     TEXT NOT NULL DEFAULT (date('now')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (contributor_id, project_id)
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL CHECK (event_type IN ('page_view', 'click', 'form_submit', 'api_call')),
  page        TEXT,
  metadata    TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

INSERT OR IGNORE INTO contributors (name, email, is_active, birth_date, joined_at) VALUES
  ('Mona Patel',   'mona@example.com',  1, '1994-04-19', '2024-01-15 09:00:00'),
  ('Diego Rivera', 'diego@example.com', 0, '1991-11-03', '2023-10-21 14:30:00');

INSERT OR IGNORE INTO projects (name, status, budget, launch_date, created_at) VALUES
  ('Nebula Analytics', 'active',   125000.50, '2025-02-01', '2024-12-10 10:00:00'),
  ('Atlas Mobile',     'planning',  48000.00, '2025-06-15', '2025-01-07 16:45:00');

INSERT OR IGNORE INTO contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at) VALUES
  (
    (SELECT id FROM contributors WHERE email = 'mona@example.com'),
    (SELECT id FROM projects WHERE name = 'Nebula Analytics'),
    'Lead Engineer', 32, 1, '2025-02-03', '2025-02-03 09:00:00'
  ),
  (
    (SELECT id FROM contributors WHERE email = 'diego@example.com'),
    (SELECT id FROM projects WHERE name = 'Atlas Mobile'),
    'Product Designer', 20, 0, '2025-01-20', '2025-01-20 11:30:00'
  );

INSERT OR IGNORE INTO events (event_type, page, metadata, occurred_at) VALUES
  ('page_view',   '/dashboard', '{"referrer":"google.com"}',               '2025-03-01 08:12:00'),
  ('click',       '/dashboard', '{"element":"btn-export"}',                '2025-03-01 08:13:45'),
  ('api_call',    NULL,         '{"endpoint":"/api/tables","status":200}', '2025-03-01 08:14:00'),
  ('page_view',   '/tables',   '{"referrer":"/dashboard"}',                '2025-03-02 10:05:00'),
  ('form_submit', '/settings', '{"form":"connection-form"}',               '2025-03-02 10:07:30');

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
