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

- [ ] Create `src/adapters/adapter.interface.ts`
  - Define `IDbAdapter` interface with all 18 method signatures
  - Mirror `DaoMethods` from `dao-factory.ts` exactly so downstream is unaffected
  - Add `mapToUniversalType(nativeType: string): CellVariant`
  - Add `mapFromUniversalType(universalType: string): string`
  - Add `runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T>` (internal contract)

- [ ] Create `src/adapters/adapter.registry.ts`
  - `AdapterRegistry` class with `register()` and `get()` methods
  - `get()` throws `HTTPException(400)` for unknown DB types (replaces silent `undefined`)
  - Export `adapterRegistry` singleton
  - Export `getAdapter(dbType)` as a drop-in alias for `getDaoFactory(dbType)`

- [ ] Wire registry into `dao-factory.ts` as a **facade**
  - Keep `getDaoFactory()` exported and working
  - Internally delegate to `adapterRegistry.get()` once adapters are registered
  - This allows a zero-diff migration for all existing route files

- [ ] Add registration boot call in `src/utils/create-server.ts`
  - Import and register all 4 adapters at startup before routes are mounted

- [ ] Write unit tests for `AdapterRegistry`
  - `get()` returns the registered adapter
  - `get()` throws on unknown type
  - `register()` overwrites an existing registration

---

## Phase 2 — Fix Existing Bypasses

> Stop routes from branching on `dbType` directly. All operations must flow through the factory/registry.

- [ ] Audit `src/routes/tables.routes.ts` for `if (dbType === ...)` branches
  - Lines ~132–211 contain direct `mysqlAddColumn`, `mongoAddColumn`, `pgAddColumn` calls
  - Replace every branch with `getDaoFactory(dbType).<method>()`
  - Confirm no direct DAO imports remain in any route file

- [ ] Audit `src/routes/records.routes.ts` for any direct DAO imports
- [ ] Audit `src/routes/query.routes.ts` for any direct DAO imports
- [ ] Audit `src/routes/databases.routes.ts` for any direct DAO imports

- [ ] Fix `src/utils/table-details-schema.ts` (AI chat schema extraction)
  - Currently hardcoded to `getDbPool()` — only works for PostgreSQL
  - Replace with `getDaoFactory(dbType).getTableColumns()` and `getTableSchema()`
  - Verify chat works for MySQL, MSSQL, and MongoDB connections

- [ ] Delete legacy `src/db.ts`
  - Confirm nothing imports it except `table-details-schema.ts` (fixed above)
  - Remove file after the fix above is confirmed

- [ ] Run full test suite and confirm no regressions
  - `cd packages/server && bun run test`

---

## Phase 3 — Base Adapter (Template Methods)

> Extract all shared logic into `BaseAdapter` so individual adapters contain only DB-specific code.

- [ ] Create `src/adapters/base.adapter.ts`

  - **Error wrapping** — `protected wrapError(e: unknown): HTTPException`
    - Move all connection-error detection from `middlewares/error-handler.ts` into this method
    - MySQL codes: `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, errno `1045`
    - PostgreSQL codes: code starting with `"08"`
    - MongoDB names: `MongoNetworkError`, `MongoServerSelectionError`
    - MSSQL patterns: `ETIMEDOUT`, `Login failed`
    - Each adapter can `override wrapError()` to add DB-specific codes

  - **Template Method: `getTableData()`**
    - Shared steps: validate params → call `buildTableDataQuery()` (abstract) → `runQuery()` → `normalizeRows()` (abstract) → `buildNextCursor()` (abstract)
    - Cursor encode/decode helpers (`base64` encode/decode) as protected methods

  - **Template Method: `exportTableData()`**
    - Shared steps: fetch rows via `getTableData()` → pass to `get-export-file.ts` utility
    - Adapters do not need to re-implement export logic

  - **Result normalization helper** — `protected normalizeRow(row, columns): NormalizedRow`
    - Applies `mapToUniversalType()` to each cell value
    - Shared by all SQL adapters; MongoDB overrides for document shape

  - **Pagination helpers**
    - `protected encodeCursor(row, sortKey): string`
    - `protected decodeCursor(cursor: string): CursorPayload`

- [ ] Define abstract method signatures every adapter must implement
  ```
  abstract runQuery<T>(db, sql, values): Promise<T>
  abstract buildTableDataQuery(params): QueryBundle
  abstract normalizeRows(rows): NormalizedRow[]
  abstract buildNextCursor(rows): string | null
  abstract mapToUniversalType(nativeType): CellVariant
  abstract mapFromUniversalType(universalType): string
  ```

---

## Phase 4 — PostgreSQL Adapter

> Migrate the 17 PG DAO files into one `PgAdapter` class. This is the reference implementation.

- [ ] Create `src/adapters/pg/pg.query-builder.ts`
  - Move `buildWhereClause()`, `buildSortClause()`, `buildCursorWhereClause()` from `utils/build-clauses.ts`
  - Keep `ILIKE`, `$1`/`$2` placeholders, tuple cursor comparison
  - Export as `pgQueryBuilder` object implementing `IQueryBuilder`

- [ ] Create `src/adapters/pg/pg.adapter.ts` — `PgAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, Pool>` using `db-manager.ts` `getDbPool()`; callers never touch the pool
  - **`runQuery()`**: `pool.query(sql, values)` → returns `rows`
  - **`buildTableDataQuery()`**: move logic from `dao/tables-data.dao.ts`
  - **`mapToUniversalType()`**: move `mapPostgresToDataType` from `utils/column.type.ts`
  - **`mapFromUniversalType()`**: reverse mapping for column creation
  - Implement all 18 `IDbAdapter` methods by inlining the corresponding `dao/*.dao.ts` logic

- [ ] Register `PgAdapter` in the boot call (Phase 1)
- [ ] Delete the 17 migrated `src/dao/*.dao.ts` files (PG base files)
- [ ] Run tests — `bunx vitest run` — confirm PG behaviour unchanged

---

## Phase 5 — MySQL Adapter

- [ ] Create `src/adapters/mysql/mysql.query-builder.ts`
  - Move `buildMysqlColumnDefinition()` from `dao/mysql/mysql-column.utils.ts`
  - Add `buildWhereClause()` with backtick identifiers and `?` placeholders
  - Add `buildCursorClause()` using `LIMIT`/`OFFSET` (MySQL lacks tuple cursor comparison)
  - Add `buildSortClause()` with backtick column names

- [ ] Create `src/adapters/mysql/mysql.adapter.ts` — `MySqlAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, MysqlPool>` using `getMysqlPool()`
  - **`runQuery()`**: `pool.execute(sql, values as any)` → returns `rows[0]`
  - **`buildTableDataQuery()`**: implement paginated data fetch (currently missing entirely)
    - Use `LIMIT`/`OFFSET` strategy
    - Support filter operators with backtick identifiers
  - **`mapToUniversalType()`**: move `mapMysqlToDataType` from `utils/column.type.ts`
  - Implement all 18 methods by inlining `dao/mysql/*.mysql.dao.ts` logic

- [ ] Register `MySqlAdapter` in the boot call
- [ ] Delete the migrated `src/dao/mysql/` files
- [ ] Write tests for `MySqlAdapter.getTableData()` (it was missing — write it fresh)

---

## Phase 6 — MSSQL Adapter

- [ ] Create `src/adapters/mssql/mssql.query-builder.ts`
  - `buildWhereClause()` with bracket identifiers (`[col]`) and `@param` named placeholders
  - `buildCursorClause()` using `OFFSET n ROWS FETCH NEXT n ROWS ONLY`
  - `buildSortClause()` with bracket column names
  - Column type mapping for MSSQL native types → `CellVariant`

- [ ] Create `src/adapters/mssql/mssql.adapter.ts` — `MsSqlAdapter extends BaseAdapter`
  - **Connection**: internal `Map<string, ConnectionPool>` using `getMssqlPool()` (async — hidden from callers)
  - **`runQuery()`**: `(await pool).request().query(sql)` → returns `result.recordset`
  - **`buildTableDataQuery()`**: implement paginated data fetch (currently missing)
    - Use `OFFSET`/`FETCH NEXT` syntax
  - Implement all 18 methods by inlining `dao/mssql/*.mssql.dao.ts` logic
  - **`override wrapError()`**: add MSSQL-specific error codes (`18456` login failed, etc.)

- [ ] Register `MsSqlAdapter` in the boot call
- [ ] Delete the migrated `src/dao/mssql/` files
- [ ] Write tests for `MsSqlAdapter.getTableData()` (currently missing)

---

## Phase 7 — MongoDB Adapter

- [ ] Create `src/adapters/mongo/mongo.pipeline-builder.ts`
  - `buildMatchStage()` — convert filter params to `$match` aggregation stage
  - `buildSortStage()` — convert sort params to `$sort` stage
  - `buildSkipLimitStage()` — pagination via `$skip`/`$limit`
  - `buildProjectStage()` — optional field projection

- [ ] Create `src/adapters/mongo/mongo.adapter.ts` — `MongoAdapter extends BaseAdapter`
  - **Connection**: `getMongoDb(db)` from `db-manager.ts`
  - **`runQuery()`**: not applicable for MongoDB — override to throw `NotImplemented`; all methods use `getMongoDb()` directly
  - **`mapToUniversalType()`**: infer type from JS value (`typeof` + `instanceof Date` checks)
  - **`mapFromUniversalType()`**: no-op (MongoDB is schemaless)
  - **`getTablesList()`** → `listCollections()`
  - **`getTableData()`** → `find()` with aggregation pipeline (override Template Method)
  - **`executeQuery()`** → parse and run aggregation JSON
  - Consolidate the confusing re-export pattern (`mongo/database-list.mongo.dao.ts` → `mongo/database-list.dao.ts`)

- [ ] Register `MongoAdapter` in the boot call
- [ ] Delete the migrated `src/dao/mongo/` files and re-export stubs
- [ ] Write tests for `MongoAdapter.getTableData()` pagination

---

## Phase 8 — Cleanup & Hardening

- [ ] Delete `src/dao/dao-factory.ts` — replaced by `adapter.registry.ts`
- [ ] Delete `src/dao/table-details-schema.ts` — logic moved into each adapter's `getTableSchema()`
- [ ] Remove all `getDaoFactory` imports from route files — replace with `getAdapter`
- [ ] Delete `utils/build-clauses.ts` — logic moved into per-adapter query builders
- [ ] Delete `utils/build-clauses-mysql.ts` — moved into `mysql.query-builder.ts`
- [ ] Audit `db-manager.ts`:
  - Remove public `getDbPool`, `getMysqlPool`, `getMssqlPool`, `getMongoClient` exports
  - Make them package-internal (used only by adapters, not routes or utils)
  - Or scope them to `src/adapters/` via barrel re-exports
- [ ] Fix `utils/parse-database-url.ts` — add missing default ports for MSSQL (1433) and MongoDB (27017)
- [ ] Ensure `getSupportedTypes()` on the registry drives the `databaseTypeParamSchema` in middleware
  - Middleware should validate against the registry, not a hardcoded list

---

## Phase 9 — Tests & Coverage

- [ ] Write integration test scaffold per adapter
  - `tests/adapters/pg.adapter.test.ts`
  - `tests/adapters/mysql.adapter.test.ts`
  - `tests/adapters/mssql.adapter.test.ts`
  - `tests/adapters/mongo.adapter.test.ts`
  - Each mocks the connection pool at module level; tests the full method call chain

- [ ] Ensure every `IDbAdapter` method has at least one happy-path test per adapter
- [ ] Test `BaseAdapter.wrapError()` for each DB's known error codes
- [ ] Test `AdapterRegistry` — register, get, overwrite, get-unknown
- [ ] Test query builders in isolation (no DB connection required)
  - `pg.query-builder.test.ts` — filter operators, cursor encoding, sort
  - `mysql.query-builder.test.ts` — backtick identifiers, LIMIT/OFFSET cursor
  - `mssql.query-builder.test.ts` — bracket identifiers, OFFSET/FETCH
  - `mongo.pipeline-builder.test.ts` — $match, $sort, $skip/$limit stages

- [ ] Run coverage report and ensure `src/adapters/` is above 80%
  - `cd packages/server && bun run test:coverage`

---

## Phase 10 — Documentation & DX

- [ ] Update `CLAUDE.md` — Architecture section
  - Replace "DAOs" section with "Adapters" section
  - Document `IDbAdapter` interface location
  - Document how to add a new database (5-step guide)
  - Update file naming conventions table

- [ ] Add `CLAUDE.md` entry: **How to add a new database**
  ```
  1. Create src/adapters/<dbname>/<dbname>.adapter.ts implementing IDbAdapter
  2. Create src/adapters/<dbname>/<dbname>.query-builder.ts
  3. Add connection handling in db-manager.ts
  4. Register: adapterRegistry.register("<dbname>", new MyAdapter())
  5. Add "<dbname>" to DATABASE_TYPES in shared/types/database.types.ts
  ```

- [ ] Update `PATTERNS.md` to reflect adapter pattern replacing DAO pattern

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
