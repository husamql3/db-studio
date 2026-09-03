# Contributing to db-studio

Thanks for your interest in contributing to db-studio! Whether you want to fix a bug, add a new database engine, improve the UI, or help with documentation, we welcome your contributions.

This guide will walk you through setting up your environment, running the app locally, running tests, and submitting your pull request.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Monorepo Overview](#monorepo-overview)
- [Getting Started](#getting-started)
- [Running Locally](#running-locally)
  - [1. Configure Environment Variables](#1-configure-environment-variables)
  - [2. Initialize Test Data (Optional)](#2-initialize-test-data-optional)
  - [3. Start the Development Stack](#3-start-the-development-stack)
  - [4. Running on a Custom Port (No Sudo)](#4-running-on-a-custom-port-no-sudo)
  - [5. Work on a Single Package](#5-work-on-a-single-package)
  - [6. Useful Portless Commands](#6-useful-portless-commands)
- [Testing and Quality Checks](#testing-and-quality-checks)
  - [Running Tests](#running-tests)
  - [Formatting and Linting](#formatting-and-linting)
  - [Type Checking](#type-checking)
- [Development Workflow](#development-workflow)
  - [Issues](#issues)
  - [Branching](#branching)
  - [Commit Messages](#commit-messages)
  - [Submitting a Pull Request](#submitting-a-pull-request)
- [First-Time Contributors](#first-time-contributors)
- [Quick Reference](#quick-reference)

## Prerequisites

Before starting, install the following tools:

- [Bun](https://bun.sh/) (version 1.2.19 or higher): db-studio uses Bun as its package manager and runtime across the monorepo.
- [Node.js](https://nodejs.org/) (version 20 or higher): required by certain toolchains and CLI utilities.
- Git: for version control.

## Monorepo Overview

db-studio is organized as a Bun and Turborepo monorepo with the following structure:

| Package | Location | Description |
|---|---|---|
| `db-studio` | `packages/server` | Hono API server and the CLI tool |
| `@db-studio/web` | `packages/web` | React 19 web application (Vite, TanStack Router, TanStack Table) |
| `@db-studio/shared` | `packages/shared` | Shared TypeScript types, Zod schemas, and constants |
| `@db-studio/ui` | `packages/ui` | Reusable UI components and design tokens |
| `@db-studio/proxy` | `packages/proxy` | Cloudflare Workers proxy for AI assistant rate limiting |
| `www` | `www` | Documentation and marketing website |

## Getting Started

1. Fork the [db-studio repository](https://github.com/husamql3/db-studio) on GitHub.
2. Clone your fork locally:

   ```bash
   git clone https://github.com/<your-username>/db-studio.git
   cd db-studio
   ```

3. Install dependencies:

   ```bash
   bun install
   ```

4. Build all packages once:

   ```bash
   bun run build
   ```

## Running Locally

### 1. Configure Environment Variables

Create a `.env` file in the project root by copying the provided example:

```bash
cp .env.example .env
```

Open `.env` and set your database connection string in `DATABASE_URL`. Here are examples for different databases:

```env
# PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dbstudio"

# MySQL
DATABASE_URL="mysql://root@localhost:3306/dbstudio"

# SQL Server (MSSQL)
DATABASE_URL="mssql://sa:YourPassword1!@localhost:1433/dbstudio"

# MongoDB
DATABASE_URL="mongodb://localhost:27017/dbstudio"

# SQLite (relative or absolute file path)
DATABASE_URL="sqlite://./db/dbstudio.sqlite"

# Redis (database index 0 to N)
DATABASE_URL="redis://localhost:6379/0"
```

### 2. Initialize Test Data (Optional)

If you want ready-to-use sample tables and data, we provide database seed scripts:

```bash
bun run init-db:pgsql   # PostgreSQL
bun run init-db:mysql   # MySQL
bun run init-db:mssql   # SQL Server
bun run init-db:mongo   # MongoDB
bun run init-db:sqlite  # SQLite
bun run init-db:redis   # Redis
```

Running one of these commands creates sample tables such as users, categories, products, and orders, so you can test features with real data immediately.

### 3. Start the Development Stack

db-studio uses Portless to provide stable local HTTPS addresses instead of raw port numbers.

Before your first run, trust the local Portless certificate authority:

```bash
bunx portless trust
```

Start the full stack with:

```bash
bun run dev
```

Once running, access the services in your browser:

| Service | Address |
|---|---|
| Web App | `https://web.db-studio.localhost` |
| API Server | `https://api.db-studio.localhost` |
| AI Proxy | `https://proxy.db-studio.localhost` |
| Docs Site | `https://www.db-studio.localhost` |

### 4. Running on a Custom Port (No Sudo)

By default, Portless binds to port 443, which may prompt for administrator permissions (`sudo`). If you want to run completely unprivileged without any sudo prompts, start Portless on an unprivileged port such as 1355:

1. Start the Portless proxy on port 1355:

   ```bash
   bunx portless proxy start -p 1355
   ```

2. Run the dev stack with matching URLs:

   ```bash
   VITE_API_URL=https://api.db-studio.localhost:1355 \
   VITE_API_PROXY_TARGET=https://api.db-studio.localhost:1355 \
   DB_STUDIO_PROXY_URL=https://proxy.db-studio.localhost:1355 \
   bun run dev
   ```

3. Open `https://web.db-studio.localhost:1355` in your browser.

### 5. Work on a Single Package

If you only need to work on one part of the codebase, you do not have to run the entire stack:

```bash
bun run dev:web     # React frontend only
bun run dev:server  # Hono API server only
bun run dev:proxy   # Cloudflare AI proxy only
bun run dev:www     # Documentation site only
```

### 6. Useful Portless Commands

- List active routes and their internal ports:
  ```bash
  bunx portless list
  ```
- Stop the background proxy:
  ```bash
  bunx portless proxy stop
  ```

## Testing and Quality Checks

### Running Tests

We use Vitest to run our test suite through Turborepo. Please avoid running bare `bun test`, as Vitest handles our path aliases and mocking setup.

- Run all tests across the repository:
  ```bash
  bun run test
  ```

- Run only server tests from the root directory:
  ```bash
  bun run test:server
  ```

- Run a single test file (great for focused development):
  ```bash
  cd packages/server
  bunx vitest run tests/adapters/pg.adapter.test.ts
  ```

- Run tests in watch mode while editing code:
  ```bash
  cd packages/server
  bun run test:watch
  ```

### Formatting and Linting

We use Biome for fast, consistent formatting and linting:

```bash
bun run format
```

This checks configured files (as specified in `biome.json`) and automatically formats them according to project rules.

### Type Checking

Verify that TypeScript compiles across every package without errors:

```bash
bun run typecheck
```

Our pre-commit hooks run Biome formatting, tests, and project build (`bun run format && bun run test && bun run build`) automatically before every commit, so checking these locally helps your commits pass on the first try.

## Development Workflow

### Issues

We track work via GitHub issues. Pick an open issue or create one using this naming format:

```text
[<type>]: <short-description>
```

Examples:
- `[FIX]: Fix auth flow`
- `[FEATURE]: Support custom table filters`
- `[STYLE]: Improve sidebar responsiveness`

### Branching

Always create your branch from the `stage` branch (active development lives on `stage`, not `main`):

```bash
git checkout stage
git pull origin stage
git checkout -b <type>/<issue-number>/<short-description>
```

Branch naming convention:
```text
<type>/<issue-number>/<short-description>
```

Examples:
- `fix/142/fix-auth-flow`
- `feat/156/support-custom-filters`
- `docs/168/update-setup-guide`

### Commit Messages

We follow Conventional Commits format:

```text
<type>(<scope>): <short-description>
```

Common types:
- `feat`: new feature
- `fix`: bug fix
- `style`: design or UI adjustments
- `refactor`: code improvements without functional changes
- `docs`: documentation updates
- `test`: adding or fixing tests
- `chore`: maintenance or dependency updates

Common scopes:
- `front`: web frontend
- `back`: API server or CLI
- `shared`: types and schemas
- `ui`: shared UI components
- `proxy`: Cloudflare proxy
- `docs`: documentation website

Examples:
- `feat(back): add support for json array filtering`
- `fix(front): prevent layout shift on table reload`
- `docs: update setup and testing instructions`

### Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin <your-branch-name>
   ```
2. Open a Pull Request targeting the `stage` branch.
3. Keep your PR title clear and descriptive, matching your commit format or branch name.
4. Describe your changes, why they are needed, and link any related issues (such as `Closes #142`).
5. Automated CI checks will run project build, Biome formatting checks, TypeScript type checking, and tests on pull requests targeting `stage` or `main` (and on pushes to `stage`). Maintainers will review your PR and provide feedback.

## First-Time Contributors

If this is your first contribution to db-studio, welcome aboard! Please add your name and email to the [AUTHORS](AUTHORS) file in the root directory:

```text
Your Name <your-email@example.com>
```

## Quick Reference

| Action | Command |
|---|---|
| Install dependencies | `bun install` |
| Build all packages | `bun run build` |
| Start all services | `bun run dev` |
| Start frontend only | `bun run dev:web` |
| Start server only | `bun run dev:server` |
| Start docs site only | `bun run dev:www` |
| Format and lint | `bun run format` |
| Type check | `bun run typecheck` |
| Run all tests | `bun run test` |
| Run server tests | `bun run test:server` |
| Seed sample database | `bun run init-db:<engine>` |
| Trust local SSL | `bunx portless trust` |
| List active routes | `bunx portless list` |
| Stop Portless proxy | `bunx portless proxy stop` |

Thank you for helping make db-studio better! If you ever have questions or need a hand, feel free to ask in GitHub Discussions or open an issue.
