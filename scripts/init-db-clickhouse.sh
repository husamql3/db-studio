#!/usr/bin/env bash
set -euo pipefail

DB_PORT="${DB_PORT:-8123}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_NAME="${DB_NAME:-dbstudio}"
DB_USER="${DB_USER:-dbstudio}"
DB_PASSWORD="${DB_PASSWORD:-dbstudio}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-clickhouse}"
DB_IMAGE="${DB_IMAGE:-clickhouse/clickhouse-server:latest}"

DATABASE_URL="${DATABASE_URL:-clickhouse://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"
HTTP_URL="http://${DB_HOST}:${DB_PORT}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-clickhouse] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-clickhouse] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-clickhouse] creating clickhouse container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:8123" \
    -e CLICKHOUSE_USER="${DB_USER}" \
    -e CLICKHOUSE_PASSWORD="${DB_PASSWORD}" \
    -e CLICKHOUSE_DB="${DB_NAME}" \
    --ulimit nofile=262144:262144 \
    "${DB_IMAGE}" >/dev/null
fi

echo "[init-db-clickhouse] waiting for clickhouse to answer /ping..."
until curl -fsS "${HTTP_URL}/ping" 2>/dev/null | grep -q "Ok"; do
  sleep 1
done

run_sql() {
  curl -fsS --user "${DB_USER}:${DB_PASSWORD}" "${HTTP_URL}/?database=${DB_NAME}" --data-binary "$1" >/dev/null
}

until run_sql "SELECT 1" 2>/dev/null; do
  sleep 1
done

echo "[init-db-clickhouse] seeding sample tables..."
run_sql "DROP TABLE IF EXISTS page_views"
run_sql "DROP TABLE IF EXISTS products"

run_sql "CREATE TABLE products (
  id UInt32,
  name String,
  category LowCardinality(String),
  price Decimal(10, 2),
  in_stock Bool,
  tags Array(String),
  created_at DateTime
) ENGINE = MergeTree ORDER BY id"

run_sql "INSERT INTO products VALUES
  (1, 'Mechanical Keyboard', 'peripherals', 129.99, true, ['usb', 'rgb'], '2024-01-05 10:00:00'),
  (2, 'Wireless Mouse', 'peripherals', 49.50, true, ['bluetooth'], '2024-01-06 11:30:00'),
  (3, '27in Monitor', 'displays', 329.00, false, ['4k', 'ips'], '2024-02-10 09:15:00'),
  (4, 'USB-C Hub', 'accessories', 39.90, true, [], '2024-03-01 14:45:00'),
  (5, 'Laptop Stand', 'accessories', 59.00, true, ['aluminium'], '2024-03-12 08:20:00')"

run_sql "CREATE TABLE page_views (
  event_time DateTime,
  path String,
  country LowCardinality(String),
  device Enum8('desktop' = 1, 'mobile' = 2, 'tablet' = 3),
  duration_ms UInt32,
  referrer Nullable(String)
) ENGINE = MergeTree ORDER BY (event_time, path)"

run_sql "INSERT INTO page_views VALUES
  ('2024-04-01 08:00:00', '/', 'DE', 'desktop', 1200, NULL),
  ('2024-04-01 08:00:05', '/pricing', 'DE', 'desktop', 5400, '/'),
  ('2024-04-01 09:12:40', '/', 'US', 'mobile', 800, 'https://news.ycombinator.com'),
  ('2024-04-01 09:13:02', '/docs', 'US', 'mobile', 15300, '/'),
  ('2024-04-02 17:45:10', '/', 'JP', 'tablet', 2100, NULL),
  ('2024-04-02 17:46:00', '/blog', 'JP', 'tablet', 9100, '/')"

echo "[init-db-clickhouse] done. Connection string:"
echo "  ${DATABASE_URL}"
