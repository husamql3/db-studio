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
- **DB abstraction**: `src/db-manager.ts` exposes `getDbPool()` (PG) and `getMysqlPool()` (MySQL)
- **DAOs**: `src/dao/*.dao.ts` (PG), `src/dao/mysql/*.mysql.dao.ts` (MySQL)
- **Routes**: `src/routes/` — each route file uses `new Hono<RouteEnv>()` (not `AppType`) to avoid circular imports and to access `c.get("dbType")`
- **Middleware**: `src/middlewares/` — sets `c.set("dbType", ...)` based on the connection URL
- **Type mapping**: `src/utils/column.type.ts` — `mapPostgresToDataType` / `mapMysqlToDataType` → `CellVariant`

**Multi-database routing pattern**: routes dispatch by `c.get("dbType")` which is `"pg" | "mysql"`. Each route calls the appropriate DAO based on this value.

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

- `DATABASE_TYPES = ["pg", "mysql"]` in `database.types.ts`
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
- **MySQL specifics**: backtick identifiers, `?` placeholders, no `RETURNING` clause, FK violation errno `1451`
- **PG specifics**: `$1/$2` placeholders, FK violation code `23503`
- `mysql2`'s `execute()` requires `as any` cast when passing `unknown[]` arrays
