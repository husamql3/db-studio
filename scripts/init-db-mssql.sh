#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_NAME="${DB_NAME:-dbstudio}"
DB_USER="${DB_USER:-sa}"
DB_PASSWORD="${DB_PASSWORD:-DbStudio1!}"
DB_PORT="${DB_PORT:-1433}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_CONTAINER="${DB_CONTAINER:-db-studio-mssql}"
DB_IMAGE="${DB_IMAGE:-mcr.microsoft.com/mssql/server:2022-latest}"

DATABASE_URL="${DATABASE_URL:-mssql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[init-db-mssql] docker is not installed or not in PATH"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "[init-db-mssql] starting existing container ${DB_CONTAINER}..."
    docker start "${DB_CONTAINER}" >/dev/null
  fi
else
  echo "[init-db-mssql] creating SQL Server container ${DB_CONTAINER}..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -e ACCEPT_EULA=Y \
    -e MSSQL_SA_PASSWORD="${DB_PASSWORD}" \
    -p "${DB_PORT}:1433" \
    "${DB_IMAGE}" >/dev/null
fi

# Locate sqlcmd — newer images ship mssql-tools18
SQLCMD=""
for candidate in \
  "/opt/mssql-tools18/bin/sqlcmd" \
  "/opt/mssql-tools/bin/sqlcmd"; do
  if docker exec "${DB_CONTAINER}" test -x "${candidate}" 2>/dev/null; then
    SQLCMD="${candidate}"
    break
  fi
done

if [[ -z "${SQLCMD}" ]]; then
  echo "[init-db-mssql] sqlcmd not found inside container"
  exit 1
fi

echo "[init-db-mssql] waiting for SQL Server to accept connections..."
until docker exec "${DB_CONTAINER}" \
  "${SQLCMD}" -No -S "localhost,1433" -U "${DB_USER}" -P "${DB_PASSWORD}" \
  -Q "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done

echo "[init-db-mssql] creating database ${DB_NAME} (if needed)..."
docker exec "${DB_CONTAINER}" \
  "${SQLCMD}" -No -S "localhost,1433" -U "${DB_USER}" -P "${DB_PASSWORD}" \
  -Q "IF DB_ID('${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];"

echo "[init-db-mssql] applying schema..."
docker exec -i "${DB_CONTAINER}" \
  "${SQLCMD}" -No -S "localhost,1433" -U "${DB_USER}" -P "${DB_PASSWORD}" \
  -d "${DB_NAME}" <<'SQL'

-- ============================================================
--  all_types  — one column per SQL Server data type so the
--  client & server can be tested against every mapped type.
-- ============================================================
IF OBJECT_ID('dbo.all_types', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.all_types (
    -- identity / primary key
    id               INT            IDENTITY(1,1) PRIMARY KEY,

    -- integers (map → number)
    col_tinyint      TINYINT        NULL,
    col_smallint     SMALLINT       NULL,
    col_int          INT            NULL,
    col_bigint       BIGINT         NULL,

    -- exact numerics (map → number)
    col_decimal      DECIMAL(18,4)  NULL,
    col_numeric      NUMERIC(18,4)  NULL,
    col_money        MONEY          NULL,
    col_smallmoney   SMALLMONEY     NULL,

    -- approximate numerics (map → number)
    col_float        FLOAT          NULL,
    col_real         REAL           NULL,

    -- boolean (map → boolean)
    col_bit          BIT            NULL,

    -- fixed-length strings (map → text)
    col_char         CHAR(10)       NULL,
    col_nchar        NCHAR(10)      NULL,

    -- variable-length strings (map → text)
    col_varchar      VARCHAR(255)   NULL,
    col_nvarchar     NVARCHAR(255)  NULL,

    -- large text (map → text)
    col_text         TEXT           NULL,
    col_ntext        NTEXT          NULL,

    -- xml (map → text / xml)
    col_xml          XML            NULL,

    -- unique identifier / uuid (map → text / uuid)
    col_uniqueid     UNIQUEIDENTIFIER NULL DEFAULT NEWID(),

    -- date & time types (map → date)
    col_date         DATE           NULL,
    col_time         TIME(3)        NULL,
    col_smalldt      SMALLDATETIME  NULL,
    col_datetime     DATETIME       NULL,
    col_datetime2    DATETIME2(7)   NULL,
    col_dtoffset     DATETIMEOFFSET NULL,

    -- binary types (map → text)
    col_binary       BINARY(16)     NULL,
    col_varbinary    VARBINARY(255) NULL,

    -- created_at
    created_at       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ============================================================
--  contributors  — relational anchor table
-- ============================================================
IF OBJECT_ID('dbo.contributors', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.contributors (
    id          INT            IDENTITY(1,1) PRIMARY KEY,
    public_id   UNIQUEIDENTIFIER NOT NULL UNIQUE DEFAULT NEWID(),
    name        NVARCHAR(255)  NOT NULL,
    email       NVARCHAR(255)  UNIQUE,
    is_active   BIT            NOT NULL DEFAULT 1,
    birth_date  DATE           NULL,
    joined_at   DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
END
GO

-- ============================================================
--  projects
-- ============================================================
IF OBJECT_ID('dbo.projects', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.projects (
    id          INT            IDENTITY(1,1) PRIMARY KEY,
    public_id   UNIQUEIDENTIFIER NOT NULL UNIQUE DEFAULT NEWID(),
    name        NVARCHAR(255)  NOT NULL UNIQUE,
    status      NVARCHAR(20)   NOT NULL DEFAULT 'active'
                  CHECK (status IN ('planning', 'active', 'archived')),
    budget      DECIMAL(10,2)  NOT NULL DEFAULT 0,
    launch_date DATE           NULL,
    created_at  DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
  );
END
GO

-- ============================================================
--  contributions  — join table with FKs
-- ============================================================
IF OBJECT_ID('dbo.contributions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.contributions (
    id               INT  IDENTITY(1,1) PRIMARY KEY,
    contributor_id   INT  NOT NULL,
    project_id       INT  NOT NULL,
    role             NVARCHAR(255) NOT NULL,
    hours_per_week   INT  NOT NULL DEFAULT 10,
    is_billable      BIT  NOT NULL DEFAULT 1,
    started_at       DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    created_at       DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT contributions_unique_pair UNIQUE (contributor_id, project_id),
    CONSTRAINT fk_contributor FOREIGN KEY (contributor_id)
      REFERENCES dbo.contributors(id) ON DELETE CASCADE,
    CONSTRAINT fk_project    FOREIGN KEY (project_id)
      REFERENCES dbo.projects(id)     ON DELETE CASCADE
  );
END
GO

-- ============================================================
--  Seed data — all_types
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.all_types)
BEGIN
  INSERT INTO dbo.all_types (
    col_tinyint, col_smallint, col_int, col_bigint,
    col_decimal, col_numeric, col_money, col_smallmoney,
    col_float, col_real,
    col_bit,
    col_char, col_nchar, col_varchar, col_nvarchar, col_text, col_ntext,
    col_xml,
    col_uniqueid,
    col_date, col_time, col_smalldt, col_datetime, col_datetime2, col_dtoffset,
    col_binary, col_varbinary
  ) VALUES (
    255, 32767, 2147483647, 9223372036854775807,
    12345.6789, 98765.4321, 1234.5600, 99.99,
    3.14159265358979, 2.71828,
    1,
    'CHAR10    ', N'NCHAR10   ', 'varchar value', N'nvarchar value', 'long text value here', N'long ntext value here',
    N'<root><item id="1">hello</item></root>',
    NEWID(),
    '2025-06-15', '13:45:30.123', '2025-06-15 13:45:00', '2025-06-15 13:45:30.123',
    '2025-06-15 13:45:30.1234567', '2025-06-15 13:45:30.1234567 +03:00',
    0x0102030405060708090A0B0C0D0E0F10,
    0xDEADBEEF
  ),
  (
    0, -32768, -2147483648, -9223372036854775808,
    -99999.9999, -88888.8888, -9999.9900, -214.74,
    -1.23456789012345, -0.00001,
    0,
    '          ', N'          ', '', N'', '', N'',
    N'<empty/>',
    NEWID(),
    '1970-01-01', '00:00:00.000', '2000-01-01 00:00:00', '2000-01-01 00:00:00.000',
    '2000-01-01 00:00:00.0000000', '2000-01-01 00:00:00.0000000 -05:00',
    0x00000000000000000000000000000000,
    0x00
  );
END
GO

-- ============================================================
--  Seed data — contributors
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.contributors WHERE email = 'mona@example.com')
  INSERT INTO dbo.contributors (name, email, is_active, birth_date, joined_at)
  VALUES (N'Mona Patel', 'mona@example.com', 1, '1994-04-19', '2024-01-15 09:00:00 +00:00');

IF NOT EXISTS (SELECT 1 FROM dbo.contributors WHERE email = 'diego@example.com')
  INSERT INTO dbo.contributors (name, email, is_active, birth_date, joined_at)
  VALUES (N'Diego Rivera', 'diego@example.com', 0, '1991-11-03', '2023-10-21 14:30:00 +00:00');
GO

-- ============================================================
--  Seed data — projects
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.projects WHERE name = 'Nebula Analytics')
  INSERT INTO dbo.projects (name, status, budget, launch_date, created_at)
  VALUES ('Nebula Analytics', 'active', 125000.50, '2025-02-01', '2024-12-10 10:00:00 +00:00');

IF NOT EXISTS (SELECT 1 FROM dbo.projects WHERE name = 'Atlas Mobile')
  INSERT INTO dbo.projects (name, status, budget, launch_date, created_at)
  VALUES ('Atlas Mobile', 'planning', 48000.00, '2025-06-15', '2025-01-07 16:45:00 +00:00');
GO

-- ============================================================
--  Seed data — contributions
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM dbo.contributions c
  JOIN dbo.contributors u ON u.id = c.contributor_id AND u.email = 'mona@example.com'
  JOIN dbo.projects     p ON p.id = c.project_id     AND p.name  = 'Nebula Analytics'
)
  INSERT INTO dbo.contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
  VALUES (
    (SELECT id FROM dbo.contributors WHERE email = 'mona@example.com'),
    (SELECT id FROM dbo.projects     WHERE name  = 'Nebula Analytics'),
    'Lead Engineer', 32, 1, '2025-02-03', '2025-02-03 09:00:00 +00:00'
  );

IF NOT EXISTS (
  SELECT 1 FROM dbo.contributions c
  JOIN dbo.contributors u ON u.id = c.contributor_id AND u.email = 'diego@example.com'
  JOIN dbo.projects     p ON p.id = c.project_id     AND p.name  = 'Atlas Mobile'
)
  INSERT INTO dbo.contributions (contributor_id, project_id, role, hours_per_week, is_billable, started_at, created_at)
  VALUES (
    (SELECT id FROM dbo.contributors WHERE email = 'diego@example.com'),
    (SELECT id FROM dbo.projects     WHERE name  = 'Atlas Mobile'),
    'Product Designer', 20, 0, '2025-01-20', '2025-01-20 11:30:00 +00:00'
  );
GO
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

echo "[init-db-mssql] done. DATABASE_URL=${DATABASE_URL}"
