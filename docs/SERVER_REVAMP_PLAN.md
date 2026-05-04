# Server Revamp Plan — Adapter Architecture

> **Goal**: Replace the flat 72-DAO-file pattern with a Strategy + Template Method architecture
> so that adding a new database requires writing **one file** and **one registry line**.
>
> **Scope**: `packages/server/src` only. Routes, middleware, shared types, and frontend are untouched.
>
> **Approach**: Incremental — each phase is independently shippable and does not break existing behaviour.

---

## Phase 1 — Foundation: Interface + Registry

> Define the contract and the lookup mechanism. No behaviour changes yet.

- [x] Create `src/adapters/adapter.interface.ts`
  - Define `IDbAdapter` interface with all 18 method signatures
  - Mirror `DaoMethods` from `dao-factory.ts` exactly so downstream is unaffected
  - Add `mapToUniversalType(nativeType: string): CellVariant`
  - Add `mapFromUniversalType(universalType: string): string`
  - Add `runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T>` (internal contract)

- [x] Create `src/adapters/adapter.registry.ts`
  - `AdapterRegistry` class with `register()` and `get()` methods
  - `get()` throws `HTTPException(400)` for unknown DB types (replaces silent `undefined`)
  - Export `adapterRegistry` singleton
  - Export `getAdapter(dbType)` as a drop-in alias for `getDaoFactory(dbType)`

- [x] Wire registry into `dao-factory.ts` as a **facade**
  - Keep `getDaoFactory()` exported and working
  - Internally delegate to `adapterRegistry.get()` once adapters are registered
  - This allows a zero-diff migration for all existing route files

- [x] Add registration boot call in `src/utils/create-server.ts`
  - `registerAdapters()` imported from `src/adapters/register.ts` and called before routes mount
  - All 4 `adapterRegistry.register()` calls are commented out in `register.ts` pending adapter implementations

- [x] Write unit tests for `AdapterRegistry`
  - `get()` returns the registered adapter
  - `get()` throws on unknown type
  - `register()` overwrites an existing registration

---

## Phase 2 — Fix Existing Bypasses

> Stop routes from branching on `dbType` directly. All operations must flow through the factory/registry.

- [x] Audit `src/routes/tables.routes.ts` for `if (dbType === ...)` branches
  - All `if (dbType === ...)` branches removed — all handlers use `getDaoFactory(dbType)`
  - Dead direct DAO imports removed (pgAddColumn, pgAlterColumn, mongoAddColumn, etc.)

- [x] Audit `src/routes/records.routes.ts` for any direct DAO imports — clean, uses `getDaoFactory`
- [x] Audit `src/routes/query.routes.ts` for any direct DAO imports — clean, uses `getDaoFactory`
- [x] Audit `src/routes/databases.routes.ts` for any direct DAO imports — clean, uses `getDaoFactory`

- [x] Fix `src/dao/table-details-schema.ts` (AI chat schema extraction)
  - Replaced `getDbPool()` + direct `getTableColumns` import with `getDaoFactory(dbType)`
  - Uses `dao.getTablesList(db)` for table names (works for all DB types)
  - Uses `dao.getTableColumns({ tableName, db })` for columns (works for all DB types)
  - PG-specific description and sample data guarded by `dbType === "pg"` check
  - Fixed hardcoded `dbType: "pg"` in return value to use actual `dbType`

- [x] Delete legacy `src/db.ts`
  - Confirmed no source imports; file deleted

- [x] Run full test suite and confirm no regressions
  - 27 test files, 820 tests — all pass

---

## Phase 3 — Base Adapter (Template Methods)

> Extract all shared logic into `BaseAdapter` so individual adapters contain only DB-specific code.

- [x] Create `src/adapters/base.adapter.ts`
  - **Error wrapping** — `protected wrapError(e: unknown): HTTPException`
    - Move all connection-error detection from `middlewares/error-handler.ts` into this method
    - MySQL codes: `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, errno `1045`
    - PostgreSQL codes: code starting with `"08"`
    - MongoDB names: `MongoNetworkError`, `MongoServerSelectionError`
    - MSSQL patterns: `ETIMEDOUT`, `Login failed`
    - Each adapter can `override wrapError()` to add DB-specific codes

  - **Template Method: `getTableData()`**
    - Shared steps: validate params → call `buildTableDataQuery()` (abstract) → `runQuery()` → `normalizeRows()` (abstract) → `buildCursors()` (abstract)
    - Cursor encode/decode helpers (`base64url` encode/decode) as protected methods

  - **Template Method: `exportTableData()`**
    - Fetches all rows via `runQuery()` using `quoteIdentifier()` (abstract) for DB-specific quoting
    - Adapters do not need to re-implement export logic

  - **Result normalization helper** — `protected normalizeRow(row): NormalizedRow`
    - Casts each cell value; used inside `normalizeRows()` implementations
    - Shared by all SQL adapters; MongoDB overrides for document shape

  - **Pagination helpers**
    - `protected encodeCursor(data: CursorData): string`
    - `protected decodeCursor(cursor: string): CursorData | null`

- [x] Define abstract method signatures every adapter must implement
  ```
  protected abstract runQuery<T>(db, sql, values): Promise<T>
  protected abstract buildTableDataQuery(params): QueryBundle
  protected abstract normalizeRows(rows): NormalizedRow[]
  protected abstract buildCursors(params, rows, hasMore): { nextCursor, prevCursor }
  protected abstract quoteIdentifier(name): string
  abstract mapToUniversalType(nativeType): DataTypes
  abstract mapFromUniversalType(universalType): string
  ```
  (Note: `buildCursors` replaces `buildNextCursor` from plan — returns both next/prev cursors.
  `quoteIdentifier` added to support the `exportTableData` template method.)

---

## Phase 4 — PostgreSQL Adapter

> Migrate the 17 PG DAO files into one `PgAdapter` class. This is the reference implementation.

- [x] Create `src/adapters/pg/pg.query-builder.ts`
  - Move `buildWhereClause()`, `buildSortClause()`, `buildCursorWhereClause()` from `utils/build-clauses.ts`
  - Keep `ILIKE`, `$1`/`$2` placeholders, tuple cursor comparison
  - Export as `pgQueryBuilder` object implementing `IQueryBuilder`

- [x] Create `src/adapters/pg/pg.adapter.ts` — `PgAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, Pool>` using `db-manager.ts` `getDbPool()`; callers never touch the pool
  - **`runQuery()`**: `pool.query(sql, values)` → returns `rows`
  - **`buildTableDataQuery()`**: move logic from `dao/tables-data.dao.ts`
  - **`mapToUniversalType()`**: move `mapPostgresToDataType` from `utils/column.type.ts`
  - **`mapFromUniversalType()`**: reverse mapping for column creation
  - Implement all 18 `IDbAdapter` methods by inlining the corresponding `dao/*.dao.ts` logic

- [x] Register `PgAdapter` in the boot call (Phase 1)
- [x] Delete the 17 migrated `src/dao/*.dao.ts` files (PG base files)
- [x] Run tests — `bunx vitest run` — confirm PG behaviour unchanged (787/787 passing)

---

## Phase 5 — MySQL Adapter

- [x] Create `src/adapters/mysql/mysql.query-builder.ts`
  - Move `buildMysqlColumnDefinition()` from `dao/mysql/mysql-column.utils.ts`
  - Add `buildWhereClause()` with backtick identifiers and `?` placeholders
  - Add `buildCursorClause()` using `LIMIT`/`OFFSET` (MySQL lacks tuple cursor comparison)
  - Add `buildSortClause()` with backtick column names

- [x] Create `src/adapters/mysql/mysql.adapter.ts` — `MySqlAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, MysqlPool>` using `getMysqlPool()`
  - **`runQuery()`**: `pool.execute(sql, values as any)` → returns `rows[0]`
  - **`buildTableDataQuery()`**: implement paginated data fetch (currently missing entirely)
    - Use `LIMIT`/`OFFSET` strategy
    - Support filter operators with backtick identifiers
  - **`mapToUniversalType()`**: move `mapMysqlToDataType` from `utils/column.type.ts`
  - Implement all 18 methods by inlining `dao/mysql/*.mysql.dao.ts` logic

- [x] Register `MySqlAdapter` in the boot call
- [x] Delete the migrated `src/dao/mysql/` files
- [x] Write tests for `MySqlAdapter.getTableData()` (it was missing — write it fresh)

---

## Phase 6 — MSSQL Adapter

- [x] Create `src/adapters/mssql/mssql.query-builder.ts`
  - `buildWhereClause()` with bracket identifiers (`[col]`) and `@param` named placeholders
  - `buildCursorClause()` using `OFFSET n ROWS FETCH NEXT n ROWS ONLY`
  - `buildSortClause()` with bracket column names
  - Column type mapping for MSSQL native types → `CellVariant`

- [x] Create `src/adapters/mssql/mssql.adapter.ts` — `MsSqlAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, ConnectionPool>` using `getMssqlPool()` (async — hidden from callers)
  - **`runQuery()`**: `(await pool).request().query(sql)` → returns `result.recordset`
  - **`buildTableDataQuery()`**: implement paginated data fetch (currently missing)
    - Use `OFFSET`/`FETCH NEXT` syntax
  - Implement all 18 methods by inlining `dao/mssql/*.mssql.dao.ts` logic
  - **`override wrapError()`**: add MSSQL-specific error codes (`18456` login failed, etc.)

- [x] Register `MsSqlAdapter` in the boot call
- [x] Delete the migrated `src/dao/mssql/` files
- [x] Write tests for `MsSqlAdapter.getTableData()` (currently missing)

---

## Phase 7 — MongoDB Adapter

- [x] Create `src/adapters/mongo/mongo.pipeline-builder.ts`
  - `buildMatchStage()` — convert filter params to MongoDB query object
  - `buildSortStage()` — convert sort params to `$sort` stage
  - `encodeMongoCursor()` / `decodeMongoCursor()` — base64url cursor helpers

- [x] Create `src/adapters/mongo/mongo.adapter.ts` — `MongoAdapter extends BaseAdapter`
  - **Connection**: `getMongoDb(db)` from `db-manager.ts`
  - **`runQuery()`**: throws 501 (MongoDB uses direct collection calls)
  - **`mapToUniversalType()`**: maps BSON types → DataTypes
  - **`mapFromUniversalType()`**: reverse mapping
  - **`getTableData()`** → `find().sort().skip().limit()` (full override)
  - **`exportTableData()`** → `find({}).limit(10000)` (full override)
  - **`executeQuery()`** → parses JSON payload, routes to find/aggregate/insert/update/delete/count
  - All 18 IDbAdapter methods implemented; all public methods wrapped in try/catch + wrapError
  - `override wrapError()` adds MongoDB error name detection (MongoNetworkError etc.)
  - Existing DAO files preserved (7 DAO unit tests import them directly)

- [x] Register `MongoAdapter` in the boot call
- [x] Rewrite 4 `tests/routes/mongodb/` test files to use `vi.hoisted()` + `vi.mock("@/dao/dao-factory.js")` pattern
  - Note: DAO files NOT deleted — they have standalone unit tests that import them directly
- [x] 27/27 test files pass (805 tests)

---

## Phase 8 — Cleanup & Hardening

- [x] Delete `src/dao/dao-factory.ts` — replaced by `adapter.registry.ts`
- [x] Delete `src/dao/table-details-schema.ts` — logic moved into each adapter's `getTableSchema()`
- [x] Remove all `getDaoFactory` imports from route files — replace with `getAdapter`
- [x] Delete `utils/build-clauses.ts` — logic moved into per-adapter query builders
- [x] Delete `utils/build-clauses-mysql.ts` — moved into `mysql.query-builder.ts`
- [x] Audit `db-manager.ts`:
  - Remove public `getDbPool`, `getMysqlPool`, `getMssqlPool`, `getMongoClient` exports
  - Make them package-internal (used only by adapters, not routes or utils)
  - Or scope them to `src/adapters/` via barrel re-exports
- [x] Fix `utils/parse-database-url.ts` — add missing default ports for MSSQL (1433) and MongoDB (27017)
- [x] Ensure `getSupportedTypes()` on the registry drives the `databaseTypeParamSchema` in middleware
  - Middleware should validate against the registry, not a hardcoded list

---

## Phase 9 — Tests & Coverage

- [x] Write integration test scaffold per adapter
  - `tests/adapters/pg.adapter.test.ts`
  - `tests/adapters/mysql.adapter.test.ts`
  - `tests/adapters/mssql.adapter.test.ts`
  - `tests/adapters/mongo.adapter.test.ts`
  - Each mocks the connection pool at module level; tests the full method call chain

- [x] Ensure every `IDbAdapter` method has at least one happy-path test per adapter
- [x] Test `BaseAdapter.wrapError()` for each DB's known error codes
- [x] Test `AdapterRegistry` — register, get, overwrite, get-unknown
- [x] Test query builders in isolation (no DB connection required)
  - `pg.query-builder.test.ts` — filter operators, cursor encoding, sort
  - `mysql.query-builder.test.ts` — backtick identifiers, LIMIT/OFFSET cursor
  - `mssql.query-builder.test.ts` — bracket identifiers, OFFSET/FETCH
  - `mongo.pipeline-builder.test.ts` — $match, $sort, $skip/$limit stages

- [x] Run coverage report and ensure `src/adapters/` is above 80%
  - `cd packages/server && bun run test:coverage`

---

## Phase 10 — Documentation & DX

- [x] Update `AGENTS.md` — Architecture section
  - Replace "DAOs" section with "Adapters" section
  - Document `IDbAdapter` interface location
  - Document how to add a new database (5-step guide)
  - Update file naming conventions table

- [x] Add `AGENTS.md` entry: **How to add a new database**

  ```
  1. Create src/adapters/<dbname>/<dbname>.adapter.ts implementing IDbAdapter
  2. Create src/adapters/<dbname>/<dbname>.query-builder.ts
  3. Add connection handling in db-manager.ts
  4. Register: adapterRegistry.register("<dbname>", new MyAdapter())
  5. Add "<dbname>" to DATABASE_TYPES in @db-studio/shared/types/database.types.ts
  ```

---

## Dependency Map

```
Phase 1 (Interface + Registry)
  └── Phase 2 (Fix bypasses)          ← can run in parallel with Phase 3
        └── Phase 4 (PG Adapter)
              └── Phase 5 (MySQL)
              └── Phase 6 (MSSQL)     ← Phases 5/6/7 are independent of each other
              └── Phase 7 (MongoDB)
                    └── Phase 8 (Cleanup)
                          └── Phase 9 (Tests)
                                └── Phase 10 (Docs)
```

---

## Definition of Done

A phase is complete when:

- [ ] All checklist items in the phase are ticked
- [ ] `bun run test` passes with no failures
- [ ] `bun run check` passes (Biome lint + format)
- [ ] `bun run typecheck` passes with no errors
- [ ] `bun run build` produces a clean build
- [ ] No `any` casts introduced except where pre-existing (mysql2 `execute` cast is acceptable)
- [ ] No new `if (dbType === ...)` branches in route files
