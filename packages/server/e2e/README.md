# Server E2E scripts

Each script drives the real server against a real database and writes a repeatable artifact to
`e2e/artifacts/` (gitignored). Rerunning from the same state must produce the same file. Run
them from `packages/server`. Each file's header lists the failures it covers.

Two kinds of script:

- **In-process** scripts open `DATABASE_URL` the way the CLI opens `--database-url` and call the
  Elysia app with `app.handle`, with no port and no build.
- **CLI** scripts start the built CLI on a free port, so they can run side by side. Run
  `bun run prepack` first (it builds the web app and the server into `dist/`). Those that take
  `[build]` run a snapshot in `e2e/artifacts/builds/<build>/` instead of `dist/`. Browser scripts
  use Chrome; set `PERF_BROWSER_CHANNEL` to use another Playwright channel.

`e2e/lib.ts` holds what they share: `inProcessApp`, `startCli`, `requireDatabaseUrl`,
`normalize`, `writeArtifact` and `launchBrowser`.

Use a disposable database: most scripts create and drop `dbstudio_*` tables, and two runs
sharing one database drop each other's tables. `bun run init-db:<engine>` from the repo root
seeds one.

## Any SQL engine

- `contract.ts`: the API contract the web app relies on, through a scratch table. `DATABASE_URL=<url> bun run e2e -- <label>`
- `missing-table.ts`: opening a missing table answers 404. `DATABASE_URL=<url> bunx tsx e2e/missing-table.ts`
- `lazy-loading.ts` (CLI, browser, any engine with tables): the assistant and telemetry SDKs load on demand. `DATABASE_URL=<url> bunx tsx e2e/lazy-loading.ts [build]`

## PostgreSQL

- `audit-regressions.ts`: force delete, rollback of a failed save, NULL-aware paging (also MySQL). `DATABASE_URL=postgresql://... bunx tsx e2e/audit-regressions.ts`
- `row-estimates.ts`: large tables report estimates, others exact counts (also MySQL, SQL Server). `DATABASE_URL=postgresql://... bun run e2e:row-estimates`
- `read-only-writes.ts`: writes on a read-only connection answer 403 (also MySQL, DuckDB). `DATABASE_URL=postgresql://... bunx tsx e2e/read-only-writes.ts`
- `pg-constraint-violation.ts`: constraint violations answer 409. `DATABASE_URL=postgresql://... bunx tsx e2e/pg-constraint-violation.ts`
- `pg-invalid-data.ts`: values of the wrong type answer 400. `DATABASE_URL=postgresql://... bunx tsx e2e/pg-invalid-data.ts`
- `pg-no-key-pagination.ts`: paging a table without a key. `DATABASE_URL=postgresql://... bunx tsx e2e/pg-no-key-pagination.ts`
- `pg-oversized-query-result.ts`: a result too large for JSON answers 4xx. `DATABASE_URL=postgresql://... bunx tsx e2e/pg-oversized-query-result.ts`
- `pg-permission-denied.ts`: missing privileges answer 403 (superuser URL). `DATABASE_URL=postgresql://... bunx tsx e2e/pg-permission-denied.ts`
- `http-surface.sh` (source server, ports 4999 and 4998): pins routing, errors, CORS, static files and chat streaming for diffing two versions. `DATABASE_URL=postgresql://... sh e2e/http-surface.sh <label>`
- `shutdown.ts` (CLI): Ctrl+C and SIGTERM answer the request in flight and exit within 5 s. `DATABASE_URL=postgresql://... bunx tsx e2e/shutdown.ts [build]`
- `grid-clipboard.ts` (CLI, browser): range selection, copy and paste in the grid. `DATABASE_URL=postgresql://... bun run e2e:grid-clipboard`
- `schema-routing.ts` (CLI, browser, `init-db:pgsql` seed): same-named tables in two schemas. `DATABASE_URL=postgresql://... bun run e2e:schema-routing [build]`
- `visualizer.ts` (CLI, browser, `init-db:pgsql` seed): the schema visualizer. `DATABASE_URL=postgresql://... bun run e2e:visualizer [build]`
- `grid.ts` (CLI, browser, `perf-seed.sql`): each cell editor and page change. `DATABASE_URL=postgresql://.../dbstudio_perf bun run e2e:grid [build]`
- `perf.ts` (CLI, browser, `perf-seed.sql`): benchmarks build snapshots run by run; see its header. `DATABASE_URL=postgresql://.../dbstudio_perf bun run e2e:perf <build> [build ...]`

## MySQL

- `index-listing.ts`: primary and unique indexes refuse drops (also SQL Server, SQLite). `DATABASE_URL=mysql://... bunx tsx e2e/index-listing.ts`
- Also `audit-regressions.ts`, `row-estimates.ts`, `read-only-writes.ts` and `read-only.ts` (`MYSQL_URL`).

## SQL Server

- `mssql-limited-login.ts`: a login without server permissions lists databases and tables (`sa` URL). `DATABASE_URL='mssql://sa:...@127.0.0.1:1433/dbstudio' bunx tsx e2e/mssql-limited-login.ts`
- Also `row-estimates.ts` and `index-listing.ts` (columnstore and INCLUDE columns).

## SQLite and Cloudflare D1

- `d1-specifics.ts`: partial updates roll back, alters keep referenced rows, `_cf_*` tables stay hidden, blobs round-trip. `DATABASE_URL=sqlite:///tmp/scratch.sqlite bunx tsx e2e/d1-specifics.ts sqlite` (or a `d1://` URL with label `d1`)
- Also `index-listing.ts` (expression keys with comments) and `missing-table.ts`.

## DuckDB

- `duckdb-force-delete.ts`: a force delete of a referenced row refuses before writing (in-memory, no URL). `bunx tsx e2e/duckdb-force-delete.ts`
- `duckdb-transactions.ts`: the query runner refuses transaction statements (in-memory, no URL). `bunx tsx e2e/duckdb-transactions.ts`
- Also `read-only-writes.ts` and `read-only.ts`.

## MongoDB

- `mongo-indexes.ts`: the Indexes routes on a scratch collection and the seeded ones. `DATABASE_URL=mongodb://127.0.0.1:27017/dbstudio bunx tsx e2e/mongo-indexes.ts`

## Oracle

- `oracle-review.ts`: composite keys, nanosecond timestamps, temporal sorting and filters. `DATABASE_URL='oracle://user:pass@host:1521/SERVICE' bunx tsx e2e/oracle-review.ts`

## ClickHouse

- `clickhouse-regressions.ts` (Node 20): wide numbers, refused grid mutations, late failures. `DATABASE_URL=clickhouse://dbstudio:dbstudio@127.0.0.1:8123/dbstudio node --import tsx e2e/clickhouse-regressions.ts <label>`

## No database

- `read-only.ts`: read-only connections on scratch DuckDB and SQLite files; set `PG_URL`, `MYSQL_URL` or `CLICKHOUSE_URL` to add those engines. `bun run e2e:read-only`
- `connect-flow.ts` (CLI, browser): connect and switch from the browser against scratch SQLite files. `bun run e2e:connect-flow`
- `missing-web-build.ts`: a server without a web build answers 404 with build instructions. `bunx tsx e2e/missing-web-build.ts`

## Website

- `www-shots.ts`: screenshots of the marketing site in `www/`, not the server; see its header. `bunx tsx e2e/www-shots.ts <label> [shot ...]`
