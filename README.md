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

## Run with npx

No install required. From your project directory (or any subfolder), run:

```bash
npx db-studio
```

This runs the latest published version and uses the **current directory** as the project context. db-studio looks for a `.env` file in the current working directory and, if not found, searches parent directories until one is found. It reads `DATABASE_URL` from that file (or use `--var-name <name>` for a different variable). If `DATABASE_URL` is not in the .env file, it is also read from **process.env** (e.g. when set in the shell or in a package.json script). To point to a specific env file, use `--env <path>` (e.g. `npx db-studio --env .env.local`).

### Custom runs in package.json

You can run db-studio from npm/bun scripts. Useful when you want a dedicated script, a different env file, or to pass the connection via the environment:

```json
{
  "scripts": {
    "db": "db-studio",
    "db:local": "db-studio --env .env.local",
    "db:prod": "DATABASE_URL=$PROD_DATABASE_URL db-studio",
    "db:port": "db-studio -p 4444"
  }
}
```

- `db`: uses .env in the project (or parent dirs); or install first with `npm i -D db-studio` / `bun add -d db-studio`.
- `db:local`: explicit env file (e.g. `.env.local`).
- `db:prod`: connection from an existing env var (e.g. set in CI or `.env` loaded by your app).
- `db:port`: custom port (default is 3333).

With npx, no install needed: `"db": "npx db-studio"` or `"db:local": "npx db-studio --env .env.local"`.

## Getting Started

**Using the CLI (installed or npx):** Run `db-studio` or `npx db-studio` from a directory that contains your `.env` (or from a subfolder; db-studio will search upward for `.env`). Alternatively use `--env <path>` to specify the env file.

**Developing from source:**

```bash
# Install dependencies (root and workspaces)
bun install

# Configure your PostgreSQL connection in packages/server/.env (for local dev)
# DATABASE_URL=postgres://user:password@localhost:5432/database

# Start development servers
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
