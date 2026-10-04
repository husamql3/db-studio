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

# Lint & format (Biome)
bun run format

# Type checking
bun run typecheck

# Initialize database schema
bun run init-db:pgsql   # PostgreSQL
bun run init-db:mysql   # MySQL
bun run init-db:mssql   # SQL Server
bun run init-db:mongo   # MongoDB
bun run init-db:sqlite  # SQLite
bun run init-db:redis   # Redis
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
| `packages/server` | Hono API server + CLI (`npx db-studio`) |
| `packages/web` | React 19 web app (Vite, TanStack Router/Query/Table) |
| `packages/shared` | Shared types and constants |
| `packages/proxy` | Cloudflare Workers proxy (rate limiting via Upstash Redis) |
| `packages/desktop` | Electron desktop app: hosts the server CLI as a child process and the web build over `dbstudio://app` |
| `www` | Marketing/docs site (TanStack Start + Fumadocs, deploys to Cloudflare) |

### Server (`packages/server`)

- **CLI entry**: `src/index.ts` — uses `commander` to parse flags (`--env`, `--port`, `--database-url`, etc.)
- **Hono app**: `src/utils/create-server.ts` — creates the app, registers adapters, mounts routes, validates `/:dbType`, and serves the frontend build.
- **DB connections**: `src/db-manager.ts` owns connection creation and URL parsing; adapters import connection helpers through `src/adapters/connections.ts`.
- **Adapters**: `src/adapters/` — Strategy + Template Method architecture. PostgreSQL, MySQL, SQL Server, MongoDB, SQLite, and Redis all route through registered adapters.
- **Adapter contract**: `src/adapters/adapter.interface.ts` defines `IDbAdapter`, the single interface routes depend on.
- **Adapter registry**: `src/adapters/adapter.registry.ts` exports `adapterRegistry` and `getAdapter(dbType)`. `src/adapters/register.ts` registers each adapter before routes mount.
- **Routes**: `src/routes/` — each route file uses `new Hono<RouteEnv>()` (not `AppType`) to avoid circular imports and to access `c.get("dbType")`
- **Middleware**: `create-server.ts` validates `/:dbType` against `adapterRegistry.getSupportedTypes()` and sets `c.set("dbType", ...)`

**Multi-database routing pattern**: requests under `/:dbType/*` are validated against the adapter registry, then routes call `getAdapter(c.get("dbType"))`. Routes never branch on database type; database-specific behavior lives inside the adapter classes.

### Frontend (`packages/web`)

- TanStack Router with file-based routing in `src/routes/`
- TanStack Query for server state; Zustand for client state (`src/stores/`)
- shadcn/ui primitives live in `packages/ui`; Monaco editor for JSON/query editing
- API calls go through `src/shared/api/` — pure transport wrappers over Axios
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
  shared/
    api/            — endpoint functions (pure transport wrappers)
    query/          — query-key factories
  stores/           — app-wide Zustand: database, overlay registry, preferences
  hooks/            — cross-cutting hooks (databases list, rate limit, theme)
  routes/           — file-based routes; each renders a feature screen only
  components/       — shell components (sidebar, chat, command palette)
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

- **Stack**: Electron 44, `electron-builder`, `electron-updater` (GitHub Releases), `electron-store`; main and preload bundled to CJS with `tsup` (`dist-electron/`). Every JS dependency is inlined, so the desktop package keeps all deps in `devDependencies` and ships no `node_modules`.
- **Server sidecar**: `src/server/server-process.ts` spawns the built CLI (`packages/server/dist/index.js`) with the URL in the `DB_STUDIO_DESKTOP_DATABASE_URL` env var (`--var-name`, never argv), a free `PORT`, `HOST=127.0.0.1`, and `ALLOWED_ORIGINS` set to the renderer origin. One connection at a time; starts and stops are serialized, switching kills and respawns, then reloads the window. Packaged builds run it with `ELECTRON_RUN_AS_NODE=1` against `resources/server` (staged by `scripts/stage-server.mjs`, which `npm install`s the server's runtime deps; `better-sqlite3` ships N-API prebuilds so no Electron rebuild is needed). Dev uses the system `node`.
- **Renderer**: the `packages/web` build, served from disk via the privileged `dbstudio://app` scheme (`src/protocol.ts`), or from `VITE_DEV_SERVER_URL` in dev. The preload exposes `window.desktop` (`DesktopBridge` in `packages/shared/src/types/desktop.types.ts`); `getBaseUrl()` in the web client reads the API origin from it.
- **Connections**: `src/connections/store.ts` keeps metadata in `electron-store` and the URL encrypted with `safeStorage`. The UI is `packages/web/src/features/connections` on the `/connections` route, gated by `isDesktop`.
- **Commands**: `bun run dev:desktop` (builds the server first via turbo, then starts the web Vite dev server on port 3001 unless one is already reachable or `VITE_DEV_SERVER_URL` is set), `bun run build:desktop`, `bun run --cwd packages/desktop package -- --mac --arch arm64` (also `--win`, `--dir` for an unpacked build). Releases: `.github/workflows/release-desktop.yml` builds macOS arm64/x64 and Windows x64 and uploads to the `v<version>` GitHub release; version follows `packages/server`. v1 builds are unsigned.

### Shared (`packages/shared`)

Three export paths:
- `@db-studio/shared` / `@db-studio/shared/types` → `src/types/index.ts`
- `shared/constants` → `src/constants/index.ts`

### Key types

- `DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb", "sqlite", "redis"]` in `database.types.ts`
- `RouteEnv` — Hono env type that provides `c.get("dbType")`
- `CellVariant` / `DataTypes` — used for table cell rendering

## Tooling

- **Linter/Formatter**: Biome (tabs, 95-char width). Run `bun run format` to auto-fix.
- **Tests**: Vitest (`server`, `web`, `www`). Deliberately minimal — see [Testing](#testing) before adding any. Path aliases `@` → `./src` and `@db-studio/shared` → `../shared/src` are configured in each `vitest.config.ts`.
- **Pre-commit hook**: runs `bun run format && bun run typecheck && bun run test && bun run build` via Husky.
- **CI**: GitHub Actions on push to `stage` — build → biome format → tests.

## Conventions

- **Commit format**: `<type>(<scope>): <message>` (e.g., `feat(back): add mysql row insert`)
- **Branch format**: `<type>/<issue-number>/<description>` (e.g., `feat/123/support-mysql`)
- **PG specifics**: `$1/$2` placeholders, FK violation code `23503`; implemented in `PgAdapter`
- **MySQL specifics**: backtick identifiers, `?` placeholders, no `RETURNING` clause, FK violation errno `1451`; `mysql2`'s `execute()` requires `as any` cast for `unknown[]` — this is expected, no suppression comment needed; implemented in `MySqlAdapter`
- **MSSQL specifics**: bracket identifiers (`[col]`), named `@param` placeholders via `mssql` package, each value bound via `request.input(name, value)`; implemented in `MsSqlAdapter`
- **MongoDB specifics**: no schema enforcement; `ObjectId` handling via `isValidObjectId` / `coerceObjectId` helpers in `db-manager.ts`; "tables" are collections; implemented in `MongoAdapter`. `src/dao/mongo/**` is dead code — it was kept alive only by a mock-heavy DAO test suite that has since been deleted, and nothing outside tests imports it. Do not add to it; it is pending removal.
- **Redis specifics**: schemaless key-value store mapped onto six fixed type-tables (`strings`, `hashes`, `lists`, `sets`, `zsets`, `streams`) — one row per key with type-specific value column; logical DBs `0..N-1` (from `CONFIG GET databases`) appear as db-studio databases; pagination is forward-only via `SCAN` (no `prev`, no sort, no filters — adapter throws 400); cluster mode is rejected at connect time; `executeQuery` accepts redis-cli style command strings (quote-aware tokenizer) and shapes replies via a command-name dispatch table with single-cell JSON fallback; per-type row counts cached for 30s; implemented in `RedisAdapter` using `ioredis`. Schema mutations (`createTable`/`deleteTable`/`addColumn`/etc.) all return 400.

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

export const DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb", "sqlite", "redis"] as const;
export const databaseTypeSchema = z.enum(DATABASE_TYPES);
export type DatabaseTypeSchema = z.infer<typeof databaseTypeSchema>;
```

**Exports**: All shared types re-exported from `packages/shared/src/types/index.ts` using `.js` extensions (ESM):
```ts
export * from "./database.types.js";
export * from "./column-info.types.js";
```

**TanStack Table module augmentation** (in `packages/web`):
```ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<_TData extends RowData, _TValue> {
    variant?: CellVariant;
    isPrimaryKey?: boolean;
    // ...
  }
}
```

### React Hooks

**Feature hooks** (query, mutation, derived state scoped to one feature):
Location: `packages/web/src/features/[feature]/hooks/use-[name].ts`

**Cross-cutting hooks** (app-wide concerns: databases list, rate limit, theme):
Location: `packages/web/src/hooks/use-[name].ts`

**Pattern** — return a named object (not a tuple):
```ts
export const useDatabasesList = () => {
  const { setDbType } = useDatabaseStore();

  const { data, isLoading } = useQuery({
    queryKey: [CONSTANTS.CACHE_KEYS.DATABASES_LIST],
    queryFn: () => rootApi.get<BaseResponse<DatabaseListSchemaType>>("/databases"),
    select: (res) => res.data.data,
    staleTime: 1000 * 60 * 5,
  });

  return { databases: data?.databases, isLoading };
};
```

**Categories**:
- **Data fetching**: `useQuery` from TanStack Query, return `{ data, isLoading, error, refetch }`
- **Initialization**: use `useRef` guard to prevent double-init
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

**Imports order** (enforced by Biome):
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

### Server Routes (Hono)

Location: `packages/server/src/routes/[resource].routes.ts`

**Pattern**:
```ts
export const tablesRoutes = new Hono<RouteEnv>()   // NOT AppType
  .basePath("/tables")

  .get("/", zValidator("query", databaseSchema), async (c): ApiHandler<TableInfoSchemaType[]> => {
    const { db } = c.req.valid("query");
    const adapter = getAdapter(c.get("dbType"));
    return c.json({ data: await adapter.getTablesList(db) }, 200);
  })

  .post("/", zValidator("query", databaseSchema), zValidator("json", createTableSchema), async (c): ApiHandler<string> => {
    const body = c.req.valid("json");
    const adapter = getAdapter(c.get("dbType"));
    await adapter.createTable({ tableData: body, db: c.req.valid("query").db });
    return c.json({ data: `Table ${body.tableName} created successfully` }, 200);
  });

export type TablesRoutes = typeof tablesRoutes.routes;
```

**Rules**:
- Always `new Hono<RouteEnv>()` — never `AppType` (causes circular imports)
- Validation via `zValidator("query"|"json"|"param", schema)`
- DB dispatch via `getAdapter(c.get("dbType"))` — never switch/if-else on dbType in routes
- Return type annotation `ApiHandler<T>` on every handler

### Adapter Pattern

**Architecture**: Strategy + Template Method. Each database is a single class (`PgAdapter`, `MySqlAdapter`, `MsSqlAdapter`, `MongoAdapter`) registered at boot. SQL adapters extend `BaseAdapter`; MongoDB overrides the template methods that require document-store behavior.

**Key files**:
- `src/adapters/adapter.interface.ts` — `IDbAdapter` interface and adapter method contract
- `src/adapters/base.adapter.ts` — `BaseAdapter`: implements `getTableData()` and `exportTableData()` as template methods; provides `wrapError()`, `encodeCursor()`, `decodeCursor()`
- `src/adapters/adapter.registry.ts` — `AdapterRegistry` singleton plus `getAdapter()`; `get()` throws `HTTPException(400)` for unregistered types
- `src/adapters/register.ts` — `registerAdapters()` called at boot before routes mount
- `src/adapters/[db]/[db].adapter.ts` — concrete adapter per database
- `src/adapters/[db]/[db].query-builder.ts` — SQL construction helpers (WHERE, ORDER BY, cursor clauses)
- `src/adapters/mongo/mongo.pipeline-builder.ts` — MongoDB `$match`, `$sort`, skip/limit, and cursor helpers
- `src/adapters/connections.ts` — adapter-facing barrel for connection helpers from `db-manager.ts`

**Request flow**:
```
Request → create-server validates and sets dbType → route calls getAdapter(dbType)
  → adapterRegistry.get(dbType) returns the adapter
  → route calls adapter.someMethod(params)
```

**Implementing a method** (all adapters follow this structure):
```ts
export class PgAdapter extends BaseAdapter {
  // Abstract method implementations required by BaseAdapter
  protected async runQuery<T>(db: string, sql: string, values: unknown[]): Promise<T> {
    const pool = getDbPool(db);
    const result = await pool.query(sql, values);
    return result.rows as T;
  }

  protected quoteIdentifier(name: string): string { return `"${name}"`; }
  mapToUniversalType(nativeType: string): DataTypes { ... }
  mapFromUniversalType(universalType: string): string { ... }

  // IDbAdapter method — validate, build SQL, execute
  async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
    const pool = getDbPool(params.db);
    // 1. Assert table/column existence → throw HTTPException on failure
    // 2. Build SQL using query-builder helpers
    // 3. Execute
  }
}
```

**Template method `getTableData()`**: implemented once in `BaseAdapter`; calls `buildTableDataQuery()` → `runQuery()` → `normalizeRows()` → `buildCursors()`. Adapters only override if their DB requires a fundamentally different approach (e.g. `MsSqlAdapter` overrides because `mssql` requests need per-value `.input()` calls).

**Overriding template methods**: any override that bypasses `BaseAdapter.getTableData()` MUST wrap its body in `try/catch` and call `throw this.wrapError(e)` — otherwise connection errors won't be surfaced as 503.

**Error handling**: `BaseAdapter.wrapError(e)` maps connection errors (ECONNREFUSED, ETIMEDOUT, Login failed, etc.) to `HTTPException(503)` and all others to `HTTPException(500)`. It is called automatically by the template methods; manual calls are only needed in overrides.

### How To Add A New Database

1. Create `src/adapters/<dbname>/<dbname>.adapter.ts` implementing `IDbAdapter`.
2. Create `src/adapters/<dbname>/<dbname>.query-builder.ts` for SQL databases, or a domain-specific builder like `mongo.pipeline-builder.ts` for non-SQL databases.
3. Add connection handling in `src/db-manager.ts` and expose adapter-facing helpers through `src/adapters/connections.ts`.
4. Register the adapter in `src/adapters/register.ts`: `adapterRegistry.register("<dbname>", new MyAdapter())`.
5. Add `"<dbname>"` to `DATABASE_TYPES` in `packages/shared/src/types/database.types.ts`.

### Import Aliases

Configured in each package's `tsconfig.json`:

```ts
// packages/web  →  @/ maps to ./src/
import { useDatabaseStore } from "@/stores/database.store";

// cross-package  →  shared/ maps to ../shared/src/
import type { TableInfoSchemaType } from "@db-studio/shared/types";

// server internal  →  @/ maps to ./src/
import { getAdapter } from "@/adapters/adapter.registry.js"; // .js extension required (ESM)
import { PgAdapter } from "@/adapters/pg/pg.adapter.js";     // adapters follow the same rule
```

### Mutation Toast Feedback

Wrap mutation calls with `toast.promise` for consistent loading/success/error feedback.

**Pattern**:
```ts
const addColumn = async (
    data: AddColumnSchemaType,
    options?: {
        onSuccess?: () => void;
        onError?: (error: MutationError) => void;
    },
) =>
    toast.promise(addColumnMutation(data, options), {
        loading: "Adding column...",
        success: (message) => message || "Column added successfully",
        error: (error: MutationError) =>
            (typeof error.details === "string" && error.details) ||
            error.message ||
            "Failed to add column",
    });
```

**Rules**:
- Always use `toast.promise` — never call `toast.success` / `toast.error` manually around mutations
- `success` callback receives the mutation return value; prefer server message with a fallback string
- `error` callback: check `error.details` (string) first, then `error.message`, then a static fallback

### Client API (`src/shared/api/`)

Canonical API layer — pure transport wrappers, no React or Zustand:

```txt
src/shared/api/
  client.ts      — two Axios instances (rootApi + api) and setDbType()
  databases.ts   — database list endpoints
  tables.ts      — table data, schema, export endpoints
  records.ts     — record CRUD endpoints
  query.ts       — SQL query execution endpoint
  chat.ts        — AI assistant endpoint
  index.ts       — barrel re-export
```

Two Axios instances in `client.ts`:
- `rootApi` — unscoped base URL, used for `/databases` etc.
- `api` — scoped to `/{dbType}`, base URL updated via `setDbType()`

```ts
export const setDbType = (type: DatabaseTypeSchema): void => {
  api.defaults.baseURL = `${getBaseUrl()}/${type}`;
};
```

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
