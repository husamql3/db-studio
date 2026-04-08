# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
bun install

# Development
bun run dev              # All packages
bun run dev:core         # Frontend only (http://localhost:3001)
bun run dev:server       # Backend only (http://localhost:3333)

# Build
bun run build            # All packages
bun run build:core
bun run build:server

# Test
bun run test             # All tests
bun run test:server      # Server tests only

# Run a single test file
cd packages/server && bun run test -- tests/routes/tables.routes.test.ts

# Code quality
bun run check            # Biome lint/format check (all packages)
bun run typecheck        # TypeScript check
```

## Architecture

**Bun + Turbo monorepo.** Key packages:

- `packages/server` — Hono HTTP server + CLI tool. Entry: `src/index.ts`
- `packages/core` — React 19 frontend (Vite). Entry: `src/main.tsx`
- `packages/shared` — Shared types and constants, imported by both server and core
- `packages/proxy` — Cloudflare Workers proxy (AI rate limiting)

Build order matters: `shared` → `core` → `server` (tsup copies `core/dist` into `server/dist/core-dist/` so the CLI ships a single artifact).

### Server (`packages/server`)

**Route dispatch pattern** — routes use `new Hono<RouteEnv>()` (not `AppType`) to avoid circular imports. At runtime, `c.get("dbType")` determines whether to call PostgreSQL or MySQL DAOs:

```typescript
const dbType = c.get("dbType");
if (dbType === "mysql") {
  await mysqlGetTablesList(db);
} else {
  await pgGetTablesList(db);
}
```

**DAO structure:**
- `src/dao/*.dao.ts` — PostgreSQL DAOs
- `src/dao/mysql/*.mysql.dao.ts` — MySQL DAOs (backtick identifiers, `?` placeholders, no `RETURNING`)

**Database type detection** happens in `src/db-manager.ts` by URL protocol: `postgres://` / `postgresql://` → `"pg"`, `mysql://` → `"mysql"`.

**Key MySQL differences:**
- Use `` ` `` backtick identifiers and `?` placeholders
- No `RETURNING` clause
- `tinyint(1)` maps to boolean (handled in `mapMysqlToDataType`)
- FK violation errno is `1451` (PG: code `23503`)
- `mysql2` `execute()` values require `as any` cast for `unknown[]`

**Tests** live in `packages/server/tests/` (not co-located). `tests/setup.ts` mocks the DB manager. Some pre-existing test failures exist in `tests/dao/database-list.dao.test.ts` and `tests/middlewares/error-handler.test.ts` — not our bugs.

### Frontend (`packages/core`)

**TanStack ecosystem:** File-based routing (TanStack Router, route tree auto-generated in `routeTree.gen.ts`), TanStack Query for server state, TanStack Table for the data grid.

**State:** Zustand stores in `src/stores/` for selected database/table and user preferences.

**Vite proxy:** `/api` → `http://localhost:3333` during development.

**Cell rendering:** `CellVariant = DataTypes = "text" | "boolean" | "number" | "enum" | "json" | "date" | "array"`.

### Shared (`packages/shared`)

Single source of truth for types. Sub-path exports:
- `shared/types` → `src/types/index.ts`
- `shared/constants` → `src/constants/index.ts`

Column type mappers: `mapPostgresToDataType`, `mapMysqlToDataType`, `standardizeDataTypeLabel`, `standardizeMysqlDataTypeLabel`.

## Environment Setup

Create `packages/server/.env`:
```
DATABASE_URL="postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio"
# or for MySQL:
# DATABASE_URL="mysql://root@127.0.0.1:3306/dbstudio"
```

Spin up a local DB with Docker:
```bash
bun run init-db:pgsql   # PostgreSQL on port 5434
bun run init-db:mysql   # MySQL on port 3306
```

## Tooling Notes

- **Linter/formatter:** Biome (not ESLint/Prettier). Run `bun run check` to validate, `bun run check --write` is not a root script — cd into the package or use `bunx biome check --write`.
- **Pre-commit hook:** Husky runs `check`, `test`, and `build` before every commit.
- **Unused variables:** Convention in `packages/core` is to prefix with `_` (e.g., `_Foo`).
