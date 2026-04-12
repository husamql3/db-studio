<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-light.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-dark.png">
  <img src="assets/logo-light.png" alt="DB Studio logo" width="100">
</picture>

<br>

<div align="center">
A modern, universal (pgAdmin alternative) database management studio for any database.
</div>

<br>

<div align="center">
  <a href="https://github.com/husamql3/db-studio/stargazers">
    <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/husamql3/db-studio">
  </a>
  <a href="https://www.npmjs.com/package/db-studio">
    <img src="https://img.shields.io/npm/v/db-studio?style=flat-rounded" />
  </a>
  <a href="https://www.npmjs.com/package/db-studio">
    <img src="https://img.shields.io/npm/dm/db-studio?style=flat-rounded" />
  </a>
  <a href="https://github.com/husamql3/db-studio/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/husamql3/pstrack">
  </a>
  <a href="https://deepwiki.com/husamql3/db-studio">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki">
  </a>
</div>

<br>

<img src="assets/screenshot.png" alt="DB Studio screenshot" width="1000" />
</div>

## Tech Stack

- **Frontend**: React 19, TanStack React Router, TanStack React Query, TanStack React Table, TanStack React Virtual, shadcn/ui, sonner, react-day-picker, react-hook-form, zustand
- **Backend**: Hono with Node, zod-validator, zod
- **Tooling**: Bun, Vite, TypeScript, Biome, Vitest, Wrangler (Cloudflare)

## Quick Start with npx

No installation required. Just run:

```bash
npx db-studio
```

This runs the latest published version and uses the **current directory** as the project context. db-studio looks for a `.env` file in the current working directory and, if not found, searches parent directories until one is found. It reads `DATABASE_URL` from that file (or use `--var-name <name>` for a different variable). If `DATABASE_URL` is not in the .env file, it is also read from **process.env** (e.g. when set in the shell or in a package.json script). To point to a specific env file, use `--env <path>` (e.g. `npx db-studio --env .env.local`).

### Recommended base script (add to package.json)

You can run db-studio from npm/bun scripts. Useful when you want a dedicated script, a different env file, or to pass the connection via the environment:

```json
{
  "scripts": {
    "db:studio": "npx db-studio"
  }
}
```

Now you can simply run:

```Bash
npm run db:studio
```

### Customize with flags

Modify the run command (or override in your script) using any of these flags:

| Flag                        | Description                                      | Example command / override                                                  |
|-----------------------------|--------------------------------------------------|-----------------------------------------------------------------------------|
| `--env <path>`              | Use a specific `.env` file                       | `npx db-studio --env .env.local` <br>or `--env .env.production`             |
| `--var-name <name>`         | Use a different environment variable name        | `npx db-studio --var-name MY_DB_URL`                                        |
| `--port <number>`           | Change the server port (default: 3333)           | `npx db-studio --port 4000`                                                 |
| `--database-url <url>`      | Provide connection string directly (no `.env`)   | `npx db-studio --database-url "postgresql://user:pass@localhost:5432/mydb"` |
| `--status`                  | Only check & show connection status (no UI)      | `npx db-studio --status`                                                    |
| `--help`                    | Show all available options                       | `npx db-studio --help`                                                      |

#### Examples of combined / overridden usage

```bash

# Local dev with custom env file
npm run db:studio -- --env .env.local

# Production with custom port
bun run db:studio -- --env .env.production --port 4444

# Direct connection (great for one-off or CI)
npx db-studio --database-url "postgresql://user:pass@host:5432/prod"

# Custom variable name + env file
npm run db:studio -- --env .env.staging --var-name STAGING_DB_URL

# Just verify connection
npm run db:studio -- --status
```

> **Tip**: When passing flags through `npm run` or `bun run`, use `--` to separate script args from command flags (as shown above).

For full documentation and more examples: [dbstudio.sh](https://dbstudio.sh)

## Development Setup

**Using the CLI (installed or npx):** Run `db-studio` or `npx db-studio` from a directory that contains your `.env` (or from a subfolder; db-studio will search upward for `.env`). Alternatively use `--env <path>` to specify the env file.

**Developing from source:**

```bash
# Install dependencies (root and workspaces)
bun install

# Initialize the database with required tables and schema
bun run init-db

# Configure your PostgreSQL connection in packages/server/.env (for local dev)
# DATABASE_URL=postgres://user:password@localhost:5432/database

# Start development servers (runs both frontend and backend concurrently)
bun run dev
```

At your first contribution, you should add your name and email to the `AUTHORS` file

```bash
your-name <your-email>
```

The app runs at `http://localhost:3001` with the API server on port `3333`.

> [!NOTE]
> It'll automatically opens the app in 3333, this have the client but static so it wont reflect any changes, the port 3001 runs with `vite`

## Roadmap

For the latest features, planned updates, and development progress, see the full roadmap here:

[📍 roadmap](https://dbstudio.sh/roadmap)

Contributions that align with roadmap priorities are especially welcome!

## Changelog

See what's new, fixed, or improved in each release:

[📜 Changelog](https://dbstudio.sh/changelog)

# Contributing

Extremely welcome! This is early-stage — PRs for new drivers, bug fixes, or even a better logo will be merged lightning-fast.
Check out [CONTRIBUTING.md](/CONTRIBUTING.md) and the open issues.

## License

[MIT](/LICENSE)
