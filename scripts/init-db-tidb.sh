#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_PORT="${DB_PORT:-4000}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-tidb}"
DB_IMAGE="${DB_IMAGE:-pingcap/tidb:latest}"
# The TiDB image ships no SQL client, so a throwaway MySQL client container
# joins its network namespace to run statements.
CLIENT_IMAGE="${CLIENT_IMAGE:-mysql:8.0}"

DATABASE_URL="${DATABASE_URL:-tidb://root@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-tidb] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-tidb] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-tidb] creating tidb container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:4000" \
    "${DB_IMAGE}" >/dev/null
fi

tidb_sql() {
  docker run --rm -i --network "container:${DB_CONTAINER}" "${CLIENT_IMAGE}" \
    mysql --protocol=tcp -h127.0.0.1 -P4000 -uroot "$@"
}

echo "[init-db-tidb] waiting for tidb to accept connections..."
until tidb_sql -e "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-tidb] applying schema..."
tidb_sql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
USE \`${DB_NAME}\`;

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

echo "[init-db-tidb] done. DATABASE_URL=${DATABASE_URL}"
