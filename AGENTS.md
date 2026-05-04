# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Commands

```bash
# Install dependencies
bun install

# Development (starts both frontend :3001 and API :3333)
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
```

### Running a single test (server package)

```bash
cd packages/server
bun run test                         # all tests
bun run test:watch                   # watch mode
bun run test:coverage                # with coverage
bunx vitest run tests/path/to/file.test.ts  # single file
```

> **Dev ports**: Frontend (Vite) → `http://localhost:3001`, API → `http://localhost:3333`. Port 3333 also serves the static frontend build, but use 3001 during development.

## Architecture

This is a **Bun + Turbo monorepo** with these packages:

| Package | Role |
|---------|------|
| `packages/server` | Hono API server + CLI (`npx db-studio`) |
| `packages/web` | React 19 web app (Vite, TanStack Router/Query/Table) |
| `packages/shared` | Shared types and constants |
| `packages/proxy` | Cloudflare Workers proxy (rate limiting via Upstash Redis) |
| `www` | Marketing/docs site (TanStack Start + Fumadocs, deploys to Cloudflare) |

### Server (`packages/server`)

- **CLI entry**: `src/index.ts` — uses `commander` to parse flags (`--env`, `--port`, `--database-url`, etc.)
- **Hono app**: `src/utils/create-server.ts` — creates the app, registers adapters, mounts routes, validates `/:dbType`, and serves the frontend build.
- **DB connections**: `src/db-manager.ts` owns connection creation and URL parsing; adapters import connection helpers through `src/adapters/connections.ts`.
- **Adapters**: `src/adapters/` — Strategy + Template Method architecture. PostgreSQL, MySQL, SQL Server, and MongoDB all route through registered adapters.
- **Adapter contract**: `src/adapters/adapter.interface.ts` defines `IDbAdapter`, the single interface routes depend on.
- **Adapter registry**: `src/adapters/adapter.registry.ts` exports `adapterRegistry` and `getAdapter(dbType)`. `src/adapters/register.ts` registers each adapter before routes mount.
- **Routes**: `src/routes/` — each route file uses `new Hono<RouteEnv>()` (not `AppType`) to avoid circular imports and to access `c.get("dbType")`
- **Middleware**: `create-server.ts` validates `/:dbType` against `adapterRegistry.getSupportedTypes()` and sets `c.set("dbType", ...)`

**Multi-database routing pattern**: requests under `/:dbType/*` are validated against the adapter registry, then routes call `getAdapter(c.get("dbType"))`. Routes never branch on database type; database-specific behavior lives inside the adapter classes.

### Frontend (`packages/web`)

- TanStack Router with file-based routing in `src/routes/`
- TanStack Query for server state; Zustand for client state (`src/stores/`)
- shadcn/ui components; Monaco editor for JSON/query editing
- API calls proxied from Vite dev server (`/api` → `:3333`)
- Cell rendering: `CellVariant` = `"text" | "boolean" | "number" | "enum" | "json" | "date" | "array"`

### Shared (`packages/shared`)

Three export paths:
- `@db-studio/shared` / `@db-studio/shared/types` → `src/types/index.ts`
- `shared/constants` → `src/constants/index.ts`

### Key types

- `DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb"]` in `database.types.ts`
- `RouteEnv` — Hono env type that provides `c.get("dbType")`
- `CellVariant` / `DataTypes` — used for table cell rendering

## Tooling

- **Linter/Formatter**: Biome (tabs, 95-char width). Run `bun run format` to auto-fix.
- **Tests**: Vitest (server package only). Path aliases `@` → `./src` and `@db-studio/shared` → `../shared/src` are configured in `vitest.config.ts`.
- **Pre-commit hook**: runs `bun run format && bun run test && bun run build` via Husky.
- **CI**: GitHub Actions on push to `stage` — build → biome format → tests.

## Conventions

- **Commit format**: `<type>(<scope>): <message>` (e.g., `feat(back): add mysql row insert`)
- **Branch format**: `<type>/<issue-number>/<description>` (e.g., `feat/123/support-mysql`)
- **PG specifics**: `$1/$2` placeholders, FK violation code `23503`; implemented in `PgAdapter`
- **MySQL specifics**: backtick identifiers, `?` placeholders, no `RETURNING` clause, FK violation errno `1451`; `mysql2`'s `execute()` requires `as any` cast for `unknown[]` — this is expected, no suppression comment needed; implemented in `MySqlAdapter`
- **MSSQL specifics**: bracket identifiers (`[col]`), named `@param` placeholders via `mssql` package, each value bound via `request.input(name, value)`; implemented in `MsSqlAdapter`
- **MongoDB specifics**: no schema enforcement; `ObjectId` handling via `isValidObjectId` / `coerceObjectId` helpers in `db-manager.ts`; "tables" are collections; implemented in `MongoAdapter`. Legacy Mongo DAO files remain only for standalone compatibility tests.

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

export const DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb"] as const;
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

Location: `packages/web/src/hooks/use-[feature].ts`

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

### Client API (`lib/api.ts`)

Two Axios instances with logging interceptors:
- `rootApi` — unscoped base URL, used for `/databases` etc.
- `api` — scoped to `/{dbType}`, base URL updated via `setDbType()`

```ts
export const setDbType = (type: DatabaseTypeSchema): void => {
  api.defaults.baseURL = `${getBaseUrl()}/${type}`;
};
```

### Tests

Location: `packages/server/tests/[area]/[feature].test.ts`

**Route tests** mock `adapter.registry.js` so all DB types share the same mock adapter:
```ts
const mockAdapter = vi.hoisted(() => ({
  getTablesList: vi.fn(),
  addRecord: vi.fn(),
  executeQuery: vi.fn(),
  // ... all IDbAdapter methods used by the route under test
}));

vi.mock("@/adapters/adapter.registry.js", () => ({
  getAdapter: vi.fn(() => mockAdapter),
  adapterRegistry: {
    register: vi.fn(),
    get: vi.fn(() => mockAdapter),
    getSupportedTypes: vi.fn(() => ["pg", "mysql", "mssql", "mongodb"]),
  },
}));

vi.mock("@/db-manager.js", () => ({
  getDbPool: vi.fn(() => ({ query: vi.fn() })),
  getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
  getMssqlPool: vi.fn(),
  // ...
}));

describe("Tables Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app = createServer().app;
  });
});
```

**Adapter tests** mock `adapters/connections.js` and instantiate the adapter:
```ts
const mockPool = vi.hoisted(() => vi.fn());
vi.mock("@/adapters/connections.js", () => ({ getMssqlPool: mockPool, ... }));

import { MsSqlAdapter } from "@/adapters/mssql/mssql.adapter.js";

const adapter = new MsSqlAdapter();
mockPool.mockResolvedValue({ request: vi.fn().mockReturnValue({...}) });
```

**Rules**:
- Route tests always mock `@/adapters/adapter.registry.js` — never individual adapter files
- Use `vi.hoisted()` for mock objects referenced inside `vi.mock()` factory functions
- Reset mocks in `beforeEach` (not `afterEach`)
- Test both happy path and error cases (connection errors → 503, generic errors → 500)
- Run a single file: `bunx vitest run tests/path/to/file.test.ts` (from `packages/server`)
