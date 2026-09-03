# Contributing to db-studio

Thank you for your interest in contributing to db-studio! This guide will walk you through setting up your local environment, running the application in development mode, making changes, running tests, and submitting your pull request.

## Table of Contents

- [Development Setup](#development-setup)
- [Monorepo Architecture](#monorepo-architecture)
- [Local Development](#local-development)
  - [1. Environment Configuration](#1-environment-configuration)
  - [2. Database Initialization (Optional)](#2-database-initialization-optional)
  - [3. Start Development Services (Portless)](#3-start-development-services-portless)
  - [4. Targeted Development](#4-targeted-development)
- [Issues](#issues)
- [Branches](#branches)
- [Commits](#commits)
- [Testing & Quality Checks](#testing--quality-checks)
  - [Formatting & Linting](#formatting--linting)
  - [Type Checking](#type-checking)
  - [Running Tests](#running-tests)
- [First-Time Contributors](#first-time-contributors)
- [Pull Requests](#pull-requests)
- [Code Review](#code-review)
- [Merging](#merging)
- [Quick Reference](#quick-reference)

---

## Development Setup

Before contributing, make sure you have the following installed on your machine:

- [Bun](https://bun.sh/) (>= 1.2.19) — *we use Bun instead of Node.js / npm / pnpm*
- [Node.js](https://nodejs.org/) (>= 20.x)
- Git

### Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork**:

   ```bash
   git clone https://github.com/husamql3/db-studio.git
   cd db-studio
   ```

3. **Install dependencies**:

   ```bash
   bun install
   ```

4. **Build the packages**:

   ```bash
   bun run build
   ```

---

## Monorepo Architecture

`db-studio` is structured as a **Bun + Turborepo** monorepo:

| Package | Directory | Role / Stack |
|---|---|---|
| `db-studio` | `packages/server` | Hono API server & CLI (`npx db-studio`) |
| `@db-studio/web` | `packages/web` | React 19 web app (Vite, TanStack Router/Query/Table, shadcn/ui) |
| `@db-studio/shared` | `packages/shared` | Shared TypeScript types, Zod schemas, and constants |
| `@db-studio/ui` | `packages/ui` | Shared UI primitives and Tailwind components |
| `@db-studio/proxy` | `packages/proxy` | Cloudflare Workers proxy for AI assistant rate limiting |
| `www` | `www` | Documentation and marketing site (TanStack Start + Fumadocs) |

---

## Local Development

### 1. Environment Configuration

Create a `.env` file in the project root (or inside `packages/server/.env`) to connect to your database:

```env
# Example PostgreSQL connection
DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
```

`db-studio` supports multiple database types: PostgreSQL (`pg`), MySQL (`mysql`), SQL Server (`mssql`), MongoDB (`mongodb`), SQLite (`sqlite`), and Redis (`redis`).

### 2. Database Initialization (Optional)

To seed a local test database with sample schemas and tables, run the corresponding initialization script:

```bash
bun run init-db:pgsql   # PostgreSQL
bun run init-db:mysql   # MySQL
bun run init-db:mssql   # SQL Server
bun run init-db:mongo   # MongoDB
bun run init-db:sqlite  # SQLite
bun run init-db:redis   # Redis
```

### 3. Start Development Services (Portless)

Services in `db-studio` run through [Portless](https://portless.sh/), which assigns stable local HTTPS `.localhost` domain names instead of arbitrary port numbers.

**First-time setup:** Trust the local Portless certificate authority:

```bash
bunx portless trust
```

**Start all services:**

```bash
bun run dev
```

Once running, you can access each service at:

| Service | Local URL | Description |
|---|---|---|
| **Web Frontend** | `https://web.db-studio.localhost` | React 19 UI (Vite dev server) |
| **API Server** | `https://api.db-studio.localhost` | Hono REST API server |
| **AI Proxy** | `https://proxy.db-studio.localhost` | Cloudflare Workers proxy |
| **Docs Site** | `https://www.db-studio.localhost` | Documentation website |

### 4. Targeted Development

If you only want to work on a specific package rather than running the whole stack:

```bash
bun run dev:web     # Frontend only
bun run dev:server  # API server only
bun run dev:proxy   # Proxy only
bun run dev:www     # Documentation site only
```

---

## Issues

The GitHub workflow begins by creating or picking an issue.

### Issue Naming Convention

```text
[<type>]: <short-description>
```

### Examples

```text
[FIX]: Fix auth flow
[STYLE]: Improve login page styling
[FEATURE]: Implement admin dashboard
[SUB-FEAT]: Implement dashboard UI
```

---

## Branches

Create a dedicated feature branch from the `stage` branch before making changes:

### Branch Naming Convention

```text
<type>/<issue-number>/<short-description>
```

### Examples

- `fix/92/fix_auth_flow`
- `style/104/improve_login_page_styling`
- `feat/112/implement_dashboard`

---

## Commits

### Commit Message Format

Follow the Conventional Commits specification:

```text
<type>(<scope>): <short-description>
```

- **Types**: `feat`, `fix`, `style`, `enhance`, `refactor`, `docs`, `chore`, `test`
- **Scopes**: `front`, `back`, `shared`, `ui`, `proxy`, `docs`

### Examples

```text
feat(front): implement dashboard header
feat(back): implement table export endpoint
fix(back): handle null timestamp in mysql adapter
style(front): refine dark mode table borders
docs: update local development instructions
```

---

## Testing & Quality Checks

Before committing changes or opening a PR, ensure all code formatting, type checking, and tests pass. (Husky runs these checks automatically on git commit).

### Formatting & Linting

We use [Biome](https://biomejs.dev/) for formatting and linting:

```bash
bun run format
```

### Type Checking

Verify TypeScript types across all workspace packages:

```bash
bun run typecheck
```

### Running Tests

We use [Vitest](https://vitest.dev/) via Turborepo (do **not** run raw `bun test`):

```bash
# Run all tests across the entire monorepo
bun run test

# Run tests for a specific package from root
bun run test:server

# Run tests directly inside a package
cd packages/server && bun run test
cd packages/web && bun run test

# Run tests in watch mode (within a package)
bun run test:watch

# Run a single test file
cd packages/server
bunx vitest run tests/adapters/pg.adapter.test.ts
```

---

## First-Time Contributors

If this is your first contribution to `db-studio`, welcome! Please add your name and email to the [AUTHORS](AUTHORS) file in the root directory:

```text
Your Name <your-email@example.com>
```

---

## Pull Requests

1. Push your branch to your GitHub fork:
   ```bash
   git push origin <type>/<issue-number>/<short-description>
   ```
2. Open a Pull Request targeting the **`stage`** branch.
3. PR Title format: `<type>/<scope>/<short-description>` (or match your branch name).
4. Provide a clear description of the changes made, why they are needed, and link any related issues (e.g., `Closes #123`).

---

## Code Review

- Every PR will be reviewed by the maintainers.
- Automated CI workflows will run Biome checks, TypeScript type checks, and tests on push.
- Address any reviewer feedback by pushing new commits to your branch.

---

## Merging

Once approved and all CI checks pass, your PR will be merged into the `stage` branch and prepared for the next release.

---

## Quick Reference

| Task | Command |
|---|---|
| Install dependencies | `bun install` |
| Build all packages | `bun run build` |
| Start all dev services | `bun run dev` |
| Start frontend only | `bun run dev:web` |
| Start server only | `bun run dev:server` |
| Format & lint (Biome) | `bun run format` |
| Type check | `bun run typecheck` |
| Run all tests | `bun run test` |
| Run server tests | `bun run test:server` |
| Seed sample database | `bun run init-db:<db>` (e.g. `init-db:pgsql`) |
| Trust local SSL cert | `bunx portless trust` |

---

Thank you for contributing! If you have any questions, feel free to open an issue or reach out to the maintainers.
