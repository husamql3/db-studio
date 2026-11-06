# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Commands

```bash
# Install dependencies
bun install

# Development (starts services through Portless)
bun run dev

# Build all packages
bun run build

# Run all tests
bun run test

# Format (oxfmt) and lint (oxlint), with fixes
bun run format

# Lint only
bun run lint

# Type checking
bun run typecheck

# Initialize database schema
bun run init-db:pgsql   # PostgreSQL
bun run init-db:mysql   # MySQL
bun run init-db:mssql   # SQL Server
bun run init-db:mongo   # MongoDB
bun run init-db:sqlite  # SQLite
bun run init-db:libsql  # libSQL server (sqld) on OrbStack
bun run init-db:d1      # Cloudflare D1 (remote, via wrangler; D1_DATABASE, default db-studio-e2e)
bun run init-db:redis   # Redis
bun run init-db:duckdb  # DuckDB
bun run init-db:oracle  # Oracle
bun run init-db:clickhouse  # ClickHouse
```

### Running a single test (server package)

```bash
cd packages/server
bun run test                         # all tests
bun run test:watch                   # watch mode
bun run test:coverage                # with coverage
bunx vitest run tests/path/to/file.test.ts  # single file
```

> **Dev URLs**: Frontend (Vite) → `https://web.db-studio.localhost`, API → `https://api.db-studio.localhost`, proxy → `https://proxy.db-studio.localhost`, docs → `https://www.db-studio.localhost`. Production-style local serving uses `https://db-studio.localhost` via the server package `start` script.

## Architecture

This is a **Bun + Turbo monorepo** with these packages:

| Package | Role |
|---------|------|
| `packages/server` | Elysia API server on Node (`@elysiajs/node`) + CLI (`npx db-studio`) |
| `packages/web` | React 19 web app (Vite, TanStack Router/Query/Table) |
| `packages/shared` | Shared types and constants |
| `packages/proxy` | Cloudflare Workers proxy (rate limiting via Upstash Redis) |
| `packages/desktop` | Electron desktop shell: starts the server CLI as a child process and opens its web app |
| `www` | Marketing/docs site (TanStack Start + Fumadocs, deploys to Cloudflare) |

### Server (`packages/server`)

- **CLI entry**: `src/index.ts` — uses `commander` to parse flags (`--env`, `--port`, `--database-url`, etc.); `src/cmd/` holds only CLI code (flags, `.env` loading, help and status output).
- **Elysia app**: `src/app.ts` — creates the app, mounts routes, and serves the frontend build. `.wrap()` runs every request inside its request context (request ID, Sentry span, `server_operation` event); `.onError()` hands every failure to `handleError` in `src/middlewares/error-handler.ts`, which answers with the `ApiError` body.
- **DB connections**: `src/connection-url.ts` parses a connection URL once (engine, host, port, credentials, database, file path) from the `DATABASE_ENGINES` protocol traits. `src/connectors/<engine>.ts` holds each engine's connection code: a connector opens its clients lazily, one per database where the engine has several, and has `ping()` and `close()`; concurrent first calls share one connect attempt. Adapters reach their database only through `connector("<engine>")` from `src/open-connections.ts`, e.g. `connector("pg").pool(db)`.
- **Open connections**: the server can start without a database URL; until one opens, database routes answer 409 and the web app shows `/connect`. Several connections stay open at once, one per browser tab: a tab keeps its `connectionId` in `sessionStorage` and sends it as `X-Connection-Id` on every request, and `src/open-connections.ts`, the registry of open connections (each with its URL, read-only flag and connector), answers from that connection (a request without one gets the latest opened; one naming a closed connection gets 409). Adapters stay connection-agnostic, so keep any per-connection cache keyed by the client, not a module or adapter field. `src/connection.ts` tests a URL before it opens it (the connector's `ping()`, bounded by `STARTUP_TIMEOUT_MS`), reuses an already open URL, and saves it through `src/connections-store.ts` to `~/.dbstudio/connections.json` (`DB_STUDIO_CONFIG_DIR` overrides; owner-only file). Saved URLs never reach the browser: `/connections` returns masked URLs and takes ids. The server listens on `127.0.0.1` and refuses requests whose `Host` is not loopback unless `HOST` names another address.
- **Adapters**: `src/adapters/` — one strategy class per engine. PostgreSQL, MySQL, SQL Server, MongoDB, SQLite, Redis, DuckDB, Oracle, and ClickHouse each route through their adapter.
- **Adapter contract**: `src/adapters/adapter.interface.ts` defines `IDbAdapter`, the single interface routes depend on.
- **Adapters map**: `src/adapters/adapter.registry.ts` exports `ADAPTERS`, one instance per engine (`satisfies Record<DatabaseTypeSchema, IDbAdapter>`, so typecheck fails until a new engine has one), and `isDatabaseType`.
- **Routes**: `src/routes/` — each route file is an Elysia plugin (`new Elysia({ prefix })`). Routes under `/:dbType` `.use(adapterPlugin)` from `src/routes/adapter.plugin.ts`, which validates `:dbType` against `ADAPTERS`, checks it against the request's connection, and adds `dbType` and `adapter` to the context.
- **Errors**: adapters throw `HTTPException(status, { message, cause })` from `src/http-exception.ts` for their own refusals and let driver errors escape to `handleError`, which classifies them with the engine's adapter (see Adapter Pattern). `HTTPException` has no framework dependency; never import Elysia into adapters.

**Multi-database routing pattern**: requests under `/:dbType/*` resolve their adapter through `adapterPlugin`, then handlers call methods on the `adapter` from the context. Routes never branch on database type; database-specific behavior lives inside the adapter classes.

### Frontend (`packages/web`)

- TanStack Router with file-based routing in `src/routes/`
- TanStack Query for server state; Zustand for client state (`src/stores/`)
- shadcn/ui primitives live in `packages/ui`; Monaco editor for JSON/query editing
- API calls go through `src/shared/api/` — pure transport wrappers over Axios
- App sections (`/table`, `/runner`, `/browser`, …) are listed once in `src/lib/sections.ts` with their icon, sidebar and the engines they apply to; the layout guard, nav rail, sidebar, command palette and page-view events read it
- Cell rendering: `CellVariant` = `"text" | "boolean" | "number" | "enum" | "json" | "date" | "array"`

**Feature-first structure** — domain logic lives in `src/features/`, not flat `src/hooks/` or `src/components/`:

```txt
src/
  features/
    query-runner/   — SQL editor, query execution, result display
    schema/         — column list, add/edit column forms
    table-builder/  — create table form, foreign key builder
    tables/         — table grid, cell editing, pagination, exports
    records/        — add record form, bulk insert sheets, FK reference picker
    ai-assistant/   — chat sidebar, askAssistant(prompt), hosted quota (useAiQuota)
  shared/
    api/            — endpoint functions (pure transport wrappers)
    query/          — query-key factories
  stores/           — app-wide Zustand: database, overlay registry, preferences
  hooks/            — cross-cutting hooks (databases list, engine, theme)
  routes/           — file-based routes; each renders a feature screen only
  components/       — shell components (sidebar, nav rail, command palette)
```

Each feature folder follows this shape:

```txt
features/[name]/
  components/   — feature-specific React components
  hooks/        — query + mutation hooks scoped to this feature
  stores/       — feature-local Zustand state (if any)
  screens/      — entry-point component rendered by the matching route
  index.ts      — public barrel; only export what routes or other features need
```

**Package dependency direction**:

```
web → ui
web → shared
ui  → shared (type imports only, if unavoidable)
server → shared
proxy  → shared
```

Features within `packages/web` follow the same rule internally — a feature may import
from `src/shared/`, `src/stores/`, and sibling feature `index.ts` barrels, but never
from a sibling feature's internal files.

### Desktop (`packages/desktop`)

- **Thin shell**: Electron main (`src/main.ts`, bundled to `dist-electron/` by `tsup`, no preload) starts one server child at launch without a database URL (`src/server.ts`: free port, `HOST=127.0.0.1`) and opens a window on `http://127.0.0.1:<port>/`. Links off that origin open in the system browser.
- **Connections**: the web app's `/connect` page handles them, saved by the server in `~/.dbstudio`, so the desktop app and the CLI share one list.
- **Server child**: dev runs `packages/server/dist/index.js` with the system `node`; packaged runs Electron as Node (`ELECTRON_RUN_AS_NODE=1`) against `resources/server`, staged by `scripts/stage-server.mjs` with the target platform's native packages. If it fails to start or exits, the app shows the last output lines and the log path, then quits.
- **Commands**: `bun run dev:desktop` (builds the server, then launches Electron), `bun run --cwd packages/desktop package -- --mac --arch arm64` (also `--win`, `--linux`). Version follows `packages/server`; builds are unsigned.

### Shared (`packages/shared`)

Three export paths:
- `@db-studio/shared` / `@db-studio/shared/types` → `src/types/index.ts`
- `shared/constants` → `src/constants/index.ts`

### Key types

- `DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb", "sqlite", "redis", "duckdb", "oracle", "clickhouse"]` in `database.types.ts`
- `DATABASE_ENGINES` in `database-engines.types.ts` — per-engine traits (label, URL protocols with each one's default port, file or hosted trait and alias driver scheme, data model, editor language, Live mode, schema selector, drop-column CASCADE, filter and sort, Indexes and Logs tabs); web reads it via `useDatabaseEngine()`
- `CellVariant` / `DataTypes` — used for table cell rendering

## Tooling

- **Formatter**: oxfmt (`.oxfmtrc.json`: tabs, 95-char width, sorted imports), JS/TS only.
- **Linter**: oxlint (`.oxlintrc.json`) with the vendored [anti-slop](https://github.com/dmmulroy/anti-slop) rules in `tools/oxlint/anti-slop/` (ours to edit; `UPSTREAM.md` records the source commit). Rules set to `warn` are being worked down; turn one to `error` once it reaches zero. `bun run format` formats and applies lint fixes.
- **Tests**: Vitest (`server`, `web`, `www`). Deliberately minimal — see [Testing](#testing) before adding any. Path aliases `@` → `./src` and `@db-studio/shared` → `../shared/src` are configured in each `vitest.config.ts`.
- **Pre-commit hook**: runs `bun run format && bun run typecheck && bun run test && bun run build` via Husky.
- **CI**: GitHub Actions on push to `stage` — build → oxfmt check, oxlint, typecheck, knip, tests.

## Conventions

- **Commit format**: `<type>(<scope>): <message>` (e.g., `feat(back): add mysql row insert`)
- **Branch format**: `<type>/<issue-number>/<description>` (e.g., `feat/123/support-mysql`)
- **Release scope**: bump the app version and add a versioned changelog entry only when changes affect the desktop app or db-studio CLI/server, including their bundled web app, shared code, runtime dependencies, or packaging. Website-only changes in `www/`, documentation, and unrelated files do not require an app release; keep the app version unchanged and omit a new versioned changelog entry.
- **App releases (`stage` → `main`)**: before merging app changes, confirm that every user-facing app change since the last release has an entry in `www/src/lib/content/changelog.ts` and that `version` in `packages/server/package.json` matches the new changelog version. Keep entries brief: one short sentence per change, written for users, with no implementation details.
- **Version bump**: derive it from the new changelog entry, not from the size of the diff. Minor (`1.19.0` → `1.20.0`) when `features` has an entry or an improvement changes what users can see or do (a new screen, setting, CLI flag or engine). Patch (`1.19.0` → `1.19.1`) when the entry has only `bugsFixed` or improvements users do not see (speed, dependencies, docs). Major when an existing setup stops working (a removed or renamed CLI flag, a connection URL that no longer parses, a `connections.json` that no longer loads, a dropped Node version); ask before releasing one.
- **Logging**: server code never calls `console.*` outside `src/cmd/` (CLI output). Use `writeOperationalLog(level, event, fields)` from `src/operational-log.ts`: `event` is a fixed `snake_case` name, and anything variable goes in `fields` — never interpolated into the name. Pass errors as `errorFields(error)` (type + driver code); never log a message, connection string, table name or row. Each line already carries `instance_id` and, inside a request, `request_id`, `operation` and `db_type`. The request ID arrives as `X-Request-Id` (the web client sends one), is echoed on the response and in the `ApiError` body, tagged on Sentry reports, and forwarded to the proxy, whose logs go through `writeLog` in `packages/proxy/src/log.ts`.
- **PG specifics**: `$1/$2` placeholders, FK violation code `23503`; implemented in `PgAdapter`
- **MySQL specifics**: backtick identifiers, `?` placeholders, no `RETURNING` clause, FK violation errno `1451`; `mysql2`'s `execute()` requires `as any` cast for `unknown[]` — this is expected, no suppression comment needed; implemented in `MySqlAdapter`
- **MSSQL specifics**: bracket identifiers (`[col]`), named `@param` placeholders via `mssql` package, each value bound via `request.input(name, value)`; implemented in `MsSqlAdapter`
- **MongoDB specifics**: no schema enforcement; `ObjectId` handling via `coerceObjectId` in `src/adapters/mongo/object-id.ts`; "tables" are collections; implemented in `MongoAdapter`.
- **SQLite / libSQL specifics**: one `SqliteAdapter` on `@libsql/client` (`intMode: "bigint"`, rows normalized in `toRows`) serves `sqlite://` files (opened as `file:` URLs) and remote `libsql://` / Turso URLs (`?authToken=`, `?tls=0` for local sqld) under dbType `sqlite`; `PRAGMA foreign_keys` does not persist between requests on a remote server and is a no-op inside a transaction, so the table rebuild in `alterColumn` goes through `client.migrate()`. The adapter only sees the `SqliteClient` interface in `src/sqlite-client.ts` (`fromLibsql` wraps the libSQL client). Cloudflare D1 is a third protocol of the same engine: `d1://<account_id>/<database_id>?authToken=<api token>` (or `CLOUDFLARE_API_TOKEN`) goes through `src/d1-client.ts`, which calls the REST `/raw` endpoint, where one batch is one transaction and interactive transactions do not exist. So `updateRecords` is one write batch with a guard after each UPDATE that fails the batch when the UPDATE matched no row. D1 always enforces foreign keys and cannot suspend them, so `alterColumn` returns 400 for a table that other tables, or the table itself, reference. D1's internal `_cf_*` tables refuse every access and are hidden. D1 serializes integers as JSON doubles, so values past 2^53 arrive rounded; select them with `CAST(x AS TEXT)` to read them exactly.
- **Redis specifics**: schemaless key-value store mapped onto six fixed type-tables (`strings`, `hashes`, `lists`, `sets`, `zsets`, `streams`) — one row per key with type-specific value column; logical DBs `0..N-1` (from `CONFIG GET databases`) appear as db-studio databases; pagination is forward-only via `SCAN` (no `prev`, no sort, no filters — adapter throws 400); cluster mode is rejected at connect time; `executeQuery` accepts redis-cli style command strings (quote-aware tokenizer) and shapes replies via a command-name dispatch table with single-cell JSON fallback; per-type row counts cached for 30s and dropped after grid inserts and deletes and every key-browser write; implemented in `RedisAdapter` using `ioredis`. Schema mutations (create, rename, drop, column changes) return 400 through its `schemaMutation: false` trait.
- **DuckDB specifics**: file-based like SQLite (`duckdb:///abs/path.duckdb` or `duckdb://./rel.duckdb`); one `DuckDBInstance` + connection per file via `@duckdb/node-api`, and every call goes through the connector's `withConnection()`, which serializes access so transactions cannot interleave; the instance checkpoints on every commit (`checkpoint_threshold: "0b"`) because DuckDB cannot replay an `ALTER TABLE` on a table with a `nextval()` default from the WAL; a file locked by another process surfaces as 503; `"ident"` quoting, `?` placeholders; rows go through one boundary (`getRowObjectsJson()`, then safe-range BIGINT/HUGEINT to numbers); keyset pagination as described under the Adapter Pattern; only the current schema (`main`) is listed; identity/serial columns become a `<table>_<column>_seq` sequence default; FK actions CASCADE/SET NULL/SET DEFAULT, ADD COLUMN with UNIQUE/PRIMARY KEY, and ALTER on tables other tables reference return 400; `forceDeleteRecords` uses the ordinary single-statement delete and refuses 400 when dependent rows exist, because DuckDB cannot delete a parent and its children in one atomic transaction; implemented in `DuckDbAdapter`.
- **Oracle specifics**: `oracle://user:pass@host:1521/SERVICE` via `oracledb` in Thin mode (no Instant Client), one pool per process; the connected container (`CON_NAME`) is the only database and only the user's own tables (`USER_TABLES`) are listed; every identifier is quoted as stored, so `"ident"` quoting preserves case, and names containing `"` are rejected with 400 because Oracle cannot quote them; `:n` bind placeholders; OFFSET/FETCH pagination with an offset cursor like MSSQL, ordered by the user sort then the primary key (`ROWID` without one); `text` becomes `VARCHAR2(4000)`, not CLOB, so it stays sortable and comparable; DDL auto-commits, so every schema operation is a single statement that cannot half-apply; `oracleServerVersion >= 23ai` gates native `BOOLEAN` and `JSON` (older releases get `NUMBER(1)` and `CLOB`); array columns, ON UPDATE actions and ON DELETE SET DEFAULT return 400; implemented in `OracleAdapter`. Adapter-owned reads return `DATE` and `TIMESTAMP` columns as strings and preserve nine fractional digits. The query runner returns 400 for native temporal result columns because Thin mode converts them to millisecond-only JavaScript `Date` values. Select those columns with `TO_CHAR` and an explicit Oracle format.
- **ClickHouse specifics**: OLAP engine over the HTTP interface via `@clickhouse/client` (`clickhouse://` → http, `clickhouses://` → https, one client per database in `src/connectors/clickhouse.ts`); every request sets `wait_end_of_query = 1` so late server failures reach the API; row counts come from `system.tables.total_rows` (no `count()` scans); `isPrimaryKey` marks sorting-key columns, which are not unique, so pagination is OFFSET-based ordered by user sort, then the sorting key, then `_part`/`_part_offset`; inserts use `JSONEachRow`; grid updates, deletes, and force deletes return 400 because sorting keys cannot identify one row safely, while explicit query-runner mutations remain available and wait with `mutations_sync = 2`; created tables are `MergeTree ORDER BY (<pk>)`, identity/serial columns become `UInt64 DEFAULT generateSnowflakeID()`; no FKs or UNIQUE (400); JSON output quotes 64/128/256-bit integers and decimals so their exact values cross the JavaScript boundary as strings; implemented in `ClickhouseAdapter`.

## Patterns

### File Naming

| Artifact | Convention | Example |
|----------|-----------|---------|
| React hook | `use-[feature].ts` | `use-databases-list.ts` |
| Component | `[feature]-[description].tsx` | `sidebar-list-tables-item.tsx` |
| Store | `[entity].store.ts` | `database.store.ts`, `queries.store.ts` |
| Server route | `[resource].routes.ts` | `tables.routes.ts`, `records.routes.ts` |
| DB adapter | `[db].adapter.ts` | `pg.adapter.ts`, `mysql.adapter.ts` |
| SQL query builder | `[db].query-builder.ts` | `pg.query-builder.ts`, `mssql.query-builder.ts` |
| MongoDB pipeline builder | `mongo.pipeline-builder.ts` | `mongo.pipeline-builder.ts` |
| Shared type | `[feature].types.ts` | `column-info.types.ts` |
| Core type | `[feature].type.ts` | `table.type.ts` |
| Test | `[file-name].test.ts` | `parse-bulk-data.test.ts` |

### Types

**Naming**:
- Schema validators (Zod): `[entity]Schema` → `databaseSchema`
- Inferred types: `[Entity]SchemaType` → `DatabaseSchemaType`, `ColumnInfoSchemaType`
- Constants array: `ALL_CAPS` → `DATABASE_TYPES`

**Pattern** (Zod-first):
```ts
export const databaseSchema = z.object({
  db: z.string(),
});
export type DatabaseSchemaType = z.infer<typeof databaseSchema>;

export const DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb", "sqlite", "redis", "duckdb", "oracle", "clickhouse"] as const;
export const databaseTypeSchema = z.enum(DATABASE_TYPES);
export type DatabaseTypeSchema = z.infer<typeof databaseTypeSchema>;
```

**Exports**: All shared types re-exported from `packages/shared/src/types/index.ts` using `.js` extensions (ESM):
```ts
export * from "./database.types.js";
export * from "./column-info.types.js";
```

**TanStack Table module augmentation** (in `packages/web`; a merged declaration must repeat the library's type parameter names, so keep `TData`/`TValue`):
```ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    variant?: CellVariant;
    isPrimaryKey?: boolean;
    // ...
  }
}
```

### React Hooks

**Feature hooks** (query, mutation, derived state scoped to one feature):
Location: `packages/web/src/features/[feature]/hooks/use-[name].ts`

**Cross-cutting hooks** (app-wide concerns: databases list, engine, theme):
Location: `packages/web/src/hooks/use-[name].ts`

**Pattern** — return a named object (not a tuple):
```ts
export const useDatabasesList = () => {
  const { data, isLoading } = useQuery({
    queryKey: databaseKeys.list(),
    queryFn: () => rootApi.get<BaseResponse<DatabaseListSchemaType>>("/databases"),
    select: (res) => res.data.data,
    staleTime: 1000 * 60 * 5,
  });

  return { databases: data?.databases, isLoading };
};
```

**Categories**:
- **Data fetching**: `useQuery` from TanStack Query, return `{ data, isLoading, error, refetch }`
- **Initialization**: derive "initialized" from store state set in effects, not from a ref
- **State helpers**: wrap store + derived logic, expose clean API

### Components

**Export**: named export, PascalCase, same name as file (kebab → Pascal):
```ts
// File: sidebar-list-tables-item.tsx
export const SidebarListTablesItem = ({ tableName, rowCount }: TableInfoSchemaType) => { ... };
```

**Props**: destructure inline, type with imported schema types (no separate `Props` interface):
```ts
export const MyComponent = ({ id, label }: SomeSchemaType) => { ... };
```

**Imports order** (sorted by oxfmt):
1. External packages
2. `@db-studio/shared/types`
3. Local `@/` aliases

**className composition**: always via `cn()` utility.

### Zustand Stores

Location: `packages/web/src/stores/[entity].store.ts`

**Pattern**:
```ts
interface DatabaseStore {
  selectedDatabase: string | null;
  setSelectedDatabase: (db: string | null) => void;
}

export const useDatabaseStore = create<DatabaseStore>()((set) => ({
  selectedDatabase: null,
  setSelectedDatabase: (db) => set({ selectedDatabase: db }),
}));
```

**With persistence**:
```ts
export const useQueriesStore = create<QueriesStore>()(
  persist(
    (set, get) => ({ ... }),
    { name: "dbstudio-queries" }, // localStorage key
  ),
);
```

Rules:
- Updates always produce new objects (immutable pattern via `set`)
- Use `get()` for reading state inside derived/computed functions
- No selectors — consumers destructure from the hook directly
- A store holding state of the open connection (selections, edits, open sheets) registers its reset with `onConnectionReset` from `src/stores/connection-reset.ts`; switching connection runs them all

### Overlay Registry (`src/stores/overlay.store.ts`)

All sheets, drawers, and modal overlays are controlled through a single typed registry.
Never create a new ad-hoc `isOpen` boolean in a store or component for a named overlay.

```ts
type OverlayId =
  | "table-builder.create-table"
  | `table-builder.add-foreign-key-${number}`
  | "schema.add-column"
  | "schema.edit-column"
  | "records.add-record"
  | "records.bulk-insert"
  | "records.bulk-insert-csv"
  | "records.bulk-insert-excel"
  | "records.bulk-insert-json"
  | "records.record-reference"
  | "chat.assistant";
```

**Usage**:
```ts
const { openOverlay, closeOverlay, isOverlayOpen } = useOverlayStore();

// open
openOverlay("records.add-record");

// close
closeOverlay("records.add-record");

// check
isOverlayOpen("records.add-record");
```

To add a new overlay: add its ID to the `OverlayId` union in `overlay.store.ts`, then
render the overlay component wherever it belongs (route screen or app shell).

### Server Routes (Elysia)

Location: `packages/server/src/routes/[resource].routes.ts`

**Pattern**:
```ts
export const tablesRoutes = new Elysia({ prefix: "/tables" })
  .use(adapterPlugin)

  .get("/", async ({ adapter, query }) => ({ data: await adapter.getTablesList(query.db) }), {
    query: databaseSchema,
  })

  .post(
    "/",
    async ({ adapter, query, body }) => {
      await adapter.createTable({ tableData: body, db: query.db });
      return { data: `Table ${body.tableName} created successfully` };
    },
    { query: databaseSchema, body: createTableSchema },
  );
```

**Rules**:
- Chain every call on the instance; Elysia infers context and response types through the chain.
- A new plugin's prefix goes in `API_ROOT_RESOURCES` or `API_DB_RESOURCES` (`@db-studio/shared/constants`), which server and web telemetry name requests from; `app.ts` fails typecheck until it does.
- Validation via the route's `query` / `params` / `body` options with the Zod schemas from `@db-studio/shared/types`. A failure reaches `handleError` and answers 400 `{ error: "Validation error", details }`.
- Query values reach the schema as raw strings: `src/app.ts` replaces Elysia's query parser, which JSON-parses `[...]`/`{...}` values and splits on commas.
- DB dispatch via the `adapter` that `adapterPlugin` adds — never switch/if-else on dbType in routes.
- Return the `{ data }` envelope; use `status(409, { data })` for a non-200 success body and throw `HTTPException` for failures.
- Return a stream as its body and put its headers on `set.headers`: Elysia on Node drops the headers of a returned chunked `Response`.
- Do not use Elysia's `file()` on Node: it sends `Content-Length` together with chunked encoding.

### Adapter Pattern

**Architecture**: Strategy. Each database is a single class (`PgAdapter`, `MySqlAdapter`, `MsSqlAdapter`, `MongoAdapter`, …) with one instance in `ADAPTERS`. Every adapter extends `BaseAdapter` and implements its own `getTableData()`. The relational engines (PostgreSQL, MySQL, SQL Server, SQLite, DuckDB, Oracle) extend `SqlAdapter<Conn>`, which writes once what they do alike: record inserts (one INSERT builder on `writeTarget`), updates and bulk inserts, deletes and force deletes, table creation and drops, related rows of a refused delete, table and column checks, index create/drop, the table list and its row-count policy (also for an unfiltered page total), the query runner and the export. Each engine supplies small hooks (`connect`, `transaction`, `rows`, `execute`, `primaryKey`, `columnNames`, `referencingKeys`, `writeTarget`, `insertColumns`, `pageKey`, `columnDefinition` (shared by CREATE TABLE and ADD COLUMN), `dropTable`, `listIndexes`, `tableEstimates`, `runStatement`, …) and overrides a template only where its semantics differ (SQLite's one-batch writes, DuckDB's force-delete refusal, Oracle's typed binds and cycle refusal). ClickHouse has no row writes, foreign keys or indexes and extends `BaseAdapter` directly.

**Key files**:
- `src/adapters/adapter.interface.ts` — `IDbAdapter` interface and adapter method contract
- `src/adapters/base.adapter.ts` — `BaseAdapter`: `classifyError()`, key helpers, the methods every engine implements as `abstract`, and 501 defaults for the ones a trait can switch off
- `src/adapters/cursor.ts` — `encodeCursor()` / `decodeCursor(cursor, schema)`: the validated base64url JSON cursors of the Mongo and Redis adapters
- `src/adapters/sql-filters.ts` — the grid's filter conditions for every SQL engine; each builder supplies a `FilterDialect` (quote, LIKE operand, ILIKE strategy) and values bind through a `createBinds()` placeholder closure
- `src/adapters/sql-pagination.ts` — ORDER BY terms (requested sorts, then key tie-breakers in the leading sort's direction) and cursors. PostgreSQL, MySQL, SQLite and DuckDB page by keyset through `SqlAdapter.keysetTableData`, ordered after the sorts by the primary key or a row id (`ctid`, `rowid`; a table with neither pages by OFFSET): NULLs last in both directions (MySQL orders by `col IS NULL` first, having no `NULLS LAST`) and a per-column predicate `(c1 after v1) OR (c1 = v1 AND c2 after v2) …`, never a row-value tuple comparison, which cannot mix directions or match NULL. SQL Server, Oracle and ClickHouse page by OFFSET
- `src/adapters/sql.adapter.ts` — `SqlAdapter`: the shared relational templates and their engine hooks
- `src/adapters/adapter.registry.ts` — `ADAPTERS`, the adapter of each engine
- `src/adapters/[db]/[db].adapter.ts` — concrete adapter per database
- `src/adapters/[db]/[db].query-builder.ts` — the dialect: its one identifier quote function (every identifier goes through it, escaping the quote character), filter and keyset dialects, type mapping
- `src/adapters/mongo/mongo.pipeline-builder.ts` — MongoDB `$match`, `$sort`, skip/limit, and cursor helpers

**Request flow**:
```
Request → adapterPlugin validates dbType and the request's connection → ADAPTERS[dbType]
  → route calls adapter.someMethod(params)
  → adapter reaches the database through connector("<engine>")
```

**Implementing a method** (all adapters follow this structure):
```ts
export class PgAdapter extends BaseAdapter {
  // IDbAdapter method — validate, build SQL, execute
  async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
    const pool = await connector("pg").pool(params.db);
    // 1. Assert table/column existence → throw HTTPException on failure
    // 2. Build SQL using query-builder helpers
    // 3. Execute
  }
}
```

**Unsupported operations**: the routes refuse, with `requireCapability(dbType, …)` from `src/routes/adapter.plugin.ts`, what an engine's `DATABASE_ENGINES` traits leave out (`indexes: false`, `serverLogs: false`, `schemaMutation: false`, `cellDefault: false`, `rowMutation: false` with its `rowMutationReason`), so an adapter does not stub them. The key browser (`/keys`) serves the engines whose `dataModel` is `"key-value"`; `ADAPTERS` fails to typecheck until such an engine's adapter implements `IKeyValueAdapter`.

**Error handling**: let driver errors escape; `handleError` hands each one to `classifyError(e)` of the request's engine (the path's `:dbType`, else the request's connection), so a driver error gets the same status from every method. Each adapter recognises its own driver's errors in `classifyDriverError(e)` (PostgreSQL: SQLSTATE class 08 → 503, 22 → 400, 23 → 409, 42501 → 403; a read-only refusal → 403 with `READ_ONLY_MESSAGE`; an engine limitation → 400), and `BaseAdapter` adds the socket errors every driver shares (503) and 500 for the rest. Catch a driver error only to do real work: roll back, or turn a specific error into a specific answer (FK violation → `relatedRecords`, missing table → 404).

### How To Add A New Database

1. Create `src/adapters/<dbname>/<dbname>.adapter.ts` implementing `IDbAdapter`.
2. Create `src/adapters/<dbname>/<dbname>.query-builder.ts` for SQL databases, or a domain-specific builder like `mongo.pipeline-builder.ts` for non-SQL databases.
3. Add `src/connectors/<dbname>.ts` (its clients, `ping()` and `close()`) and add it to `CONNECTORS` in `src/connectors/index.ts`; the adapter reads it with `connector("<dbname>")`.
4. Add the adapter to `ADAPTERS` in `src/adapters/adapter.registry.ts`: `<dbname>: new MyAdapter()`.
5. Add `"<dbname>"` to `DATABASE_TYPES` in `packages/shared/src/types/database.types.ts`.
6. Add a `DATABASE_ENGINES` entry in `packages/shared/src/types/database-engines.types.ts` (typecheck fails until you do). It supplies the label, URL protocols (each with its default port, or `file` / `hosted`), data model, editor language, Live mode support, schema selector, read-only sessions (`readOnly`), table and column changes (`schemaMutation`), the drop-column CASCADE option (`dropColumnCascade`), grid filter and sort (`filterSort`), Indexes tab support (`indexes`) and Logs tab support (`serverLogs`); an engine with `serverLogs: true` implements `getServerLogs`, which answers `{ available: false, reason }` when the server keeps its log out of reach. The server and web read these fields instead of comparing `dbType` to literals, so do not add new `dbType === "<dbname>"` checks.

### Import Aliases

Configured in each package's `tsconfig.json`:

```ts
// packages/web  →  @/ maps to ./src/
import { useDatabaseStore } from "@/stores/database.store";

// cross-package  →  shared/ maps to ../shared/src/
import type { TableInfoSchemaType } from "@db-studio/shared/types";

// server internal  →  @/ maps to ./src/
import { ADAPTERS } from "@/adapters/adapter.registry.js"; // .js extension required (ESM)
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";     // adapters follow the same rule
```

### Mutation Toast Feedback

Wrap mutation calls with `toast.promise` for consistent loading/success/error feedback.

**Pattern**:
```ts
const addColumn = async (data: AddColumnSchemaType) =>
    toast.promise(addColumnMutation(data), {
        loading: "Adding column...",
        success: (message) => message || "Column added successfully",
        error: (error: ApiError) => apiErrorMessage(error, "Failed to add column"),
    });
```

**Rules**:
- Always use `toast.promise` — never call `toast.success` / `toast.error` manually around mutations
- `success` callback receives the mutation return value; prefer server message with a fallback string
- `toast.promise` returns the toast id at once and never rejects; a hook whose callers await the outcome returns `toast.promise(...).unwrap()`, and those callers catch the rejection (the toast already reported it)
- `error` callback: `apiErrorMessage(error, fallback)` from `src/shared/api/client.ts` (server details, then message, then the fallback). Every failed request rejects with its `ApiError` (`status`, `details`, `requestId`); type mutations with it (`useMutation<Data, ApiError, Variables>`)

### Client API (`src/shared/api/`)

Canonical API layer — pure transport wrappers, no React or Zustand:

```txt
src/shared/api/
  client.ts      — two Axios instances (rootApi + api) and setDbType()
  databases.ts   — database list endpoints
  tables.ts      — table data, schema, export endpoints
  records.ts     — record CRUD endpoints
  query.ts       — SQL query execution endpoint
  chat.ts        — AI assistant rate limit and stream URL
  index.ts       — barrel re-export
```

Two Axios instances in `client.ts`:
- `rootApi` — unscoped base URL, used for `/databases` etc.
- `api` — scoped to `/{dbType}`; `useDatabaseStore`'s `setDbType` moves its base URL, so set the engine only through the store.

`src/lib/api.ts` is a legacy compatibility facade — do not add new code there.

### Testing

This repo deliberately carries very few unit tests. A large mock-heavy unit suite was deleted
because it could not fail for any bug a user would ever hit. Do not grow it back.

#### Never write unit tests after you write code

Writing tests *after* the implementation only produces tests shaped like the implementation.
They restate the code you just wrote, pass on the first run, and keep passing after you break
the behaviour. If you finished a change and your instinct is "now add a test for it" — don't.
Verify the change with an E2E run instead.

The only tests written after code are **regression tests for a specific reported bug**, and only
when the test fails before the fix and passes after it. If you cannot demonstrate that
red-then-green transition, you do not have a regression test, you have decoration.

#### Prefer E2E tests as the sole testing mechanism

E2E is the default and usually the only testing mechanism here. Use E2E to verify that a complex
feature actually works: drive the real app against a real database (see `scripts/init-db-*.sh`
for seeded instances of each supported engine), perform the user's actual sequence of actions,
and assert on what the user would see.

**Every E2E test must end by producing a verifiable, repeatable artifact.** A test that only
prints "pass" is not evidence. The artifact is the deliverable — a screenshot, a recorded trace,
an exported result set, a dumped table state, a diffable JSON snapshot of the final DB rows.
It must be:

- **Verifiable** — a human can open it and independently confirm the feature worked.
- **Repeatable** — running the test again from the same seeded state produces the same artifact.
  No timestamps, no random IDs, no connection strings, no machine-specific paths baked into it.
  Normalise or redact anything non-deterministic before writing the artifact out.

Write artifacts to a gitignored output directory and name them after the scenario, so a reviewer
can pair a failing run with the exact artifact it produced.

#### If you must test a system in isolation, write the failure modes down first

Isolated tests are a last resort, reserved for logic that E2E genuinely cannot reach or cannot
pin down precisely — parsers, SQL and pipeline builders, value formatters, diffing, redaction,
auth token validation.

When you decide an isolated test is warranted, the order is mandatory:

1. **First, write down every way the system could fail.** In the PR description or a comment at
   the top of the test file, enumerate the real failure modes: wrong identifier quoting for a
   dialect, wrong placeholder style, off-by-one in LIMIT/OFFSET, a composite key silently
   matching the wrong row, `null` vs `""` vs `0` vs `false` collapsing into each other, an
   unescaped quote enabling injection, a secret surviving redaction.
2. **Then write the tests**, one per failure mode you listed, each with an expected value you
   derived independently of the implementation.
3. **Then write or fix the code.**

If you cannot name a concrete failure mode, there is no test to write.

#### What makes a test worth keeping

Apply one question to every test: *if I introduced a plausible bug in the code under test, would
this test fail?* If the answer is no, delete it. In particular, never write:

- **Mock theater** — mocking the unit's only collaborator, then asserting the mock's configured
  return value came back out. This proves `vi.fn()` works.
- **Call assertions with no argument checks** — `expect(mockFn).toHaveBeenCalled()`.
- **Pass-through route tests** — asserting a status code for a handler whose whole body is
  `return c.json(await adapter.x())`, where `adapter` is mocked.
- **Store setter/getter tests** — `setFoo(true)` then `expect(foo).toBe(true)`; "starts with
  default values"; "reset() restores defaults".
- **Render-the-prop tests** — rendering a component and asserting a string that was passed in as
  a prop appears on screen, or that clicking calls a `vi.fn()` prop.
- **Tests of what TypeScript already guarantees** — required props, enum membership, field types.
- **Copy-paste families** — the same test duplicated per database type against one shared mock.
- Snapshot tests.

#### Mechanics

- Vitest. `bun run test` at the root runs every package's suite.
- Server: `cd packages/server && bunx vitest run tests/path/to/file.test.ts`.
- Web: `cd packages/web && bunx vitest run src/path/to/file.test.ts` (happy-dom).
- Path aliases `@` → `./src` and `@db-studio/shared` → `../shared/src` are set in each
  `vitest.config.ts`.
- Naming: `[file-name].test.ts`, colocated with the source in `packages/web` and `www`;
  under `packages/server/tests/[area]/` for the server.

#### Performance

Benchmark a performance change with `packages/server/e2e/perf.ts` before claiming it; its
header explains the seed database and build snapshots. Compare builds in one interleaved run,
never two separate runs: wall time swings 20–40% between identical builds on a busy machine.
Judge by the layout and style-recalculation counts, best-of-N and the paired change, and run
an identical build against itself first if you need the noise floor. Changes that save database
round trips only show with `PERF_DB_LATENCY_MS` set.
