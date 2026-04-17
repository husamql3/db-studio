# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
bun run check

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
bunx vitest run src/path/to/file.test.ts  # single file
```

> **Dev ports**: Frontend (Vite) → `http://localhost:3001`, API → `http://localhost:3333`. Port 3333 also serves the static frontend build, but use 3001 during development.

## Architecture

This is a **Bun + Turbo monorepo** with these packages:

| Package | Role |
|---------|------|
| `packages/server` | Hono API server + CLI (`npx db-studio`) |
| `packages/core` | React 19 frontend (Vite, TanStack Router/Query/Table) |
| `packages/shared` | Shared types and constants |
| `packages/proxy` | Cloudflare Workers proxy (rate limiting via Upstash Redis) |
| `www` | Marketing/docs site (TanStack Start + Fumadocs, deploys to Cloudflare) |

### Server (`packages/server`)

- **CLI entry**: `src/index.ts` — uses `commander` to parse flags (`--env`, `--port`, `--database-url`, etc.)
- **Hono app**: `src/app.ts` (or wired via `src/db-manager.ts`)
- **DB abstraction**: `src/db-manager.ts` — singleton `DatabaseManager` class; exposes `getDbPool()` (PG), `getMysqlPool()` (MySQL), `getMssqlPool()` (SQL Server, async), `getMongoClient()` / `getMongoDb()` (MongoDB). DB type is auto-detected from the URL protocol.
- **DAOs**: `src/dao/*.dao.ts` (PG), `src/dao/mysql/`, `src/dao/mssql/`, `src/dao/mongo/`
- **DAO factory**: `src/dao/dao-factory.ts` — `getDaoFactory(dbType)` returns the correct DAO implementation; routes call this instead of dispatching manually.
- **Routes**: `src/routes/` — each route file uses `new Hono<RouteEnv>()` (not `AppType`) to avoid circular imports and to access `c.get("dbType")`
- **Middleware**: `src/middlewares/` — sets `c.set("dbType", ...)` based on the connection URL
- **Type mapping**: `src/utils/column.type.ts` — `mapPostgresToDataType` / `mapMysqlToDataType` → `CellVariant`

**Multi-database routing pattern**: middleware detects DB type from `DATABASE_URL` protocol and sets `c.get("dbType")`. Routes call `getDaoFactory(dbType)` to get the right DAO implementation.

### Frontend (`packages/core`)

- TanStack Router with file-based routing in `src/routes/`
- TanStack Query for server state; Zustand for client state (`src/stores/`)
- shadcn/ui components; Monaco editor for JSON/query editing
- API calls proxied from Vite dev server (`/api` → `:3333`)
- Cell rendering: `CellVariant` = `"text" | "boolean" | "number" | "enum" | "json" | "date" | "array"`

### Shared (`packages/shared`)

Three export paths:
- `shared` / `shared/types` → `src/types/index.ts`
- `shared/constants` → `src/constants/index.ts`

### Key types

- `DATABASE_TYPES = ["pg", "mysql", "mssql", "mongodb"]` in `database.types.ts`
- `RouteEnv` — Hono env type that provides `c.get("dbType")`
- `CellVariant` / `DataTypes` — used for table cell rendering

## Tooling

- **Linter/Formatter**: Biome (tabs, 95-char width). Run `bun run check` to auto-fix.
- **Tests**: Vitest (server package only). Path aliases `@` → `./src` and `shared` → `../shared/src` are configured in `vitest.config.ts`.
- **Pre-commit hook**: runs `bun run check && bun run test && bun run build` via Husky.
- **CI**: GitHub Actions on push to `stage` — build → biome check → tests.

## Conventions

- **Commit format**: `<type>(<scope>): <message>` (e.g., `feat(back): add mysql row insert`)
- **Branch format**: `<type>/<issue-number>/<description>` (e.g., `feat/123/support-mysql`)
- **PG specifics**: `$1/$2` placeholders, FK violation code `23503`
- **MySQL specifics**: backtick identifiers, `?` placeholders, no `RETURNING` clause, FK violation errno `1451`; `mysql2`'s `execute()` requires `as any` cast when passing `unknown[]` arrays
- **MSSQL specifics**: bracket identifiers (`[col]`), named `@param` placeholders via `mssql` package
- **MongoDB specifics**: no schema enforcement; `ObjectId` handling via `isValidObjectId` / `coerceObjectId` helpers in `db-manager.ts`; "tables" are collections

## Patterns

### File Naming

| Artifact | Convention | Example |
|----------|-----------|---------|
| React hook | `use-[feature].ts` | `use-databases-list.ts` |
| Component | `[feature]-[description].tsx` | `sidebar-list-tables-item.tsx` |
| Store | `[entity].store.ts` | `database.store.ts`, `queries.store.ts` |
| Server route | `[resource].routes.ts` | `tables.routes.ts`, `records.routes.ts` |
| Base DAO (PG) | `[action]-[resource].dao.ts` | `add-column.dao.ts` |
| MySQL DAO | `[action]-[resource].mysql.dao.ts` | `add-column.mysql.dao.ts` |
| MongoDB DAO | `[action]-[resource].mongo.dao.ts` | `add-column.mongo.dao.ts` |
| MSSQL DAO | `[action]-[resource].mssql.dao.ts` | `add-column.mssql.dao.ts` |
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

**TanStack Table module augmentation** (in `packages/core`):
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

Location: `packages/core/src/hooks/use-[feature].ts`

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
2. `shared/types`
3. Local `@/` aliases

**className composition**: always via `cn()` utility.

### Zustand Stores

Location: `packages/core/src/stores/[entity].store.ts`

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
    const dao = getDaoFactory(c.get("dbType"));
    return c.json({ data: await dao.getTablesList(db) }, 200);
  })

  .post("/", zValidator("query", databaseSchema), zValidator("json", createTableSchema), async (c): ApiHandler<string> => {
    const body = c.req.valid("json");
    const dao = getDaoFactory(c.get("dbType"));
    await dao.createTable({ tableData: body, db: c.req.valid("query").db });
    return c.json({ data: `Table ${body.tableName} created successfully` }, 200);
  });

export type TablesRoutes = typeof tablesRoutes.routes;
```

**Rules**:
- Always `new Hono<RouteEnv>()` — never `AppType` (causes circular imports)
- Validation via `zValidator("query"|"json"|"param", schema)`
- DB dispatch via `getDaoFactory(c.get("dbType"))` — never switch/if-else on dbType in routes
- Return type annotation `ApiHandler<T>` on every handler

### DAO Pattern

**Factory** (`dao-factory.ts`) maps `dbType` → implementation:
```ts
const daoRegistry = {
  pg:      { addRecord: pgAddRecord.addRecord, createTable: pgCreateTable.createTable, ... },
  mysql:   { addRecord: mysqlAddRecord.addRecord, ... },
  mongodb: { addRecord: ({ db, params }) => addMongoRecord({ db, params }), ... },
  mssql:   { ... },
} as const;

export function getDaoFactory(dbType: DatabaseTypeSchema): DaoMethods {
  return daoRegistry[dbType];
}
```

**DAO function structure**:
```ts
// PostgreSQL (default)
export async function addColumn(params: AddColumnParamsSchemaType): Promise<void> {
  const pool = getDbPool(params.db);
  // 1. Validate (check existence) → throw HTTPException on failure
  // 2. Build SQL
  // 3. Execute
}

// MySQL variant — same signature, different pool + syntax
export async function addColumn(params: AddColumnParamsSchemaType): Promise<void> {
  const pool = getMysqlPool(params.db);
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT ...`, [params.tableName]);
  await pool.execute<ResultSetHeader>(`ALTER TABLE \`${params.tableName}\` ...`);
}
```

### Import Aliases

Configured in each package's `tsconfig.json`:

```ts
// packages/core  →  @/ maps to ./src/
import { useDatabaseStore } from "@/stores/database.store";

// cross-package  →  shared/ maps to ../shared/src/
import type { TableInfoSchemaType } from "shared/types";

// server internal  →  @/ maps to ./src/
import { getDaoFactory } from "@/dao/dao-factory.js";  // .js extension required (ESM)
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

**Structure**:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("@/db-manager.js", () => ({
  getDbPool: vi.fn(() => ({ query: mockQuery })),
}));

describe("Feature", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should do X", async () => {
    mockQuery.mockResolvedValue({ rows: [...] });
    const result = await myDao();
    expect(result).toEqual([...]);
  });

  it("should throw on Y", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(myDao()).rejects.toThrow("some message");
  });
});
```

**Rules**:
- Mock database connections at the module level with `vi.mock`
- Reset mocks in `beforeEach` (not `afterEach`)
- Test both happy path and error cases
- Run a single file: `bunx vitest run src/path/to/file.test.ts`
