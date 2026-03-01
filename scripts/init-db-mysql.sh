#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_PORT="${DB_PORT:-3306}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-mysql}"
DB_IMAGE="${DB_IMAGE:-mysql:8.0}"

DATABASE_URL="${DATABASE_URL:-mysql://root@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-mysql] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-mysql] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-mysql] creating mysql container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -e MYSQL_DATABASE="${DB_NAME}" \
    -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
    -p "${DB_PORT}:3306" \
    "${DB_IMAGE}" >/dev/null
fi

echo "[init-db-mysql] waiting for mysql to accept connections..."
until docker exec "${DB_CONTAINER}" mysql -uroot -e "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-mysql] granting remote access to root..."
docker exec "${DB_CONTAINER}" mysql -uroot -e "
  CREATE USER IF NOT EXISTS 'root'@'%';
  GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
  FLUSH PRIVILEGES;
"

echo "[init-db-mysql] applying schema..."
docker exec -i "${DB_CONTAINER}" mysql -uroot "${DB_NAME}" <<'SQL'
CREATE TABLE IF NOT EXISTS contributors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  name TEXT NOT NULL,
  email VARCHAR(255) UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  birth_date DATE,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('planning', 'active', 'archived') NOT NULL DEFAULT 'active',
  budget DECIMAL(10, 2) NOT NULL DEFAULT 0,
  launch_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contributions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contributor_id INT NOT NULL,
  project_id INT NOT NULL,
  role TEXT NOT NULL,
  hours_per_week INT NOT NULL DEFAULT 10,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  started_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id),
  CONSTRAINT fk_contributor FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE CASCADE,
  CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO contributors (name, email, is_active, birth_date, joined_at)
VALUES
  ('Mona Patel', 'mona@example.com', TRUE, '1994-04-19', '2024-01-15 09:00:00'),
  ('Diego Rivera', 'diego@example.com', FALSE, '1991-11-03', '2023-10-21 14:30:00')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_active = VALUES(is_active),
  birth_date = VALUES(birth_date),
  joined_at = VALUES(joined_at);

INSERT INTO projects (name, status, budget, launch_date, created_at)
VALUES
  ('Nebula Analytics', 'active', 125000.50, '2025-02-01', '2024-12-10 10:00:00'),
  ('Atlas Mobile', 'planning', 48000.00, '2025-06-15', '2025-01-07 16:45:00')
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  budget = VALUES(budget),
  launch_date = VALUES(launch_date),
  created_at = VALUES(created_at);

INSERT INTO contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
VALUES
  (
    (SELECT id FROM contributors WHERE email = 'mona@example.com'),
    (SELECT id FROM projects WHERE name = 'Nebula Analytics'),
    'Lead Engineer',
    32,
    TRUE,
    '2025-02-03',
    '2025-02-03 09:00:00'
  ),
  (
    (SELECT id FROM contributors WHERE email = 'diego@example.com'),
    (SELECT id FROM projects WHERE name = 'Atlas Mobile'),
    'Product Designer',
    20,
    FALSE,
    '2025-01-20',
    '2025-01-20 11:30:00'
  )
ON DUPLICATE KEY UPDATE
  role = VALUES(role),
  hours_per_week = VALUES(hours_per_week),
  is_billable = VALUES(is_billable),
  started_at = VALUES(started_at),
  created_at = VALUES(created_at);
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

echo "[init-db-mysql] done. DATABASE_URL=${DATABASE_URL}"
