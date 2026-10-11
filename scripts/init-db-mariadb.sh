#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_PORT="${DB_PORT:-3307}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-mariadb}"
DB_IMAGE="${DB_IMAGE:-mariadb:11}"

DATABASE_URL="${DATABASE_URL:-mariadb://root@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-mariadb] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-mariadb] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-mariadb] creating mariadb container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -e MARIADB_DATABASE="${DB_NAME}" \
    -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=yes \
    -p "${DB_PORT}:3306" \
    "${DB_IMAGE}" >/dev/null
fi

# The entrypoint's bootstrap server runs with networking disabled, so a TCP
# connection only succeeds once the real server is up.
echo "[init-db-mariadb] waiting for mariadb to accept TCP connections..."
until docker exec "${DB_CONTAINER}" mariadb --protocol=tcp -h127.0.0.1 -uroot -e "SELECT 1" "${DB_NAME}" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-mariadb] applying schema..."
docker exec -i "${DB_CONTAINER}" mariadb --protocol=tcp -h127.0.0.1 -uroot "${DB_NAME}" <<'SQL'
CREATE TABLE IF NOT EXISTS contributors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name TEXT NOT NULL,
  email VARCHAR(255) UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  birth_date DATE,
  profile JSON,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('planning', 'active', 'archived') NOT NULL DEFAULT 'active',
  budget DECIMAL(10, 2) NOT NULL DEFAULT 0,
  owner_id INT,
  INDEX projects_owner_id_idx (owner_id),
  CONSTRAINT fk_project_owner FOREIGN KEY (owner_id) REFERENCES contributors(id) ON DELETE SET NULL
);

INSERT INTO contributors (name, email, is_active, birth_date, profile, joined_at)
VALUES
  ('Mona Patel', 'mona@example.com', TRUE, '1994-04-19', '{"team": "core"}', '2024-01-15 09:00:00'),
  ('Diego Rivera', 'diego@example.com', FALSE, '1991-11-03', NULL, '2023-10-21 14:30:00')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_active = VALUES(is_active),
  birth_date = VALUES(birth_date),
  profile = VALUES(profile),
  joined_at = VALUES(joined_at);

INSERT INTO projects (name, status, budget, owner_id)
VALUES
  ('Nebula Analytics', 'active', 125000.50, (SELECT id FROM contributors WHERE email = 'mona@example.com')),
  ('Atlas Mobile', 'planning', 48000.00, (SELECT id FROM contributors WHERE email = 'diego@example.com'))
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  budget = VALUES(budget),
  owner_id = VALUES(owner_id);
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

echo "[init-db-mariadb] done. DATABASE_URL=${DATABASE_URL}"
