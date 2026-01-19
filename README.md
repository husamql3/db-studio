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

## Getting Started

```bash
# Install dependencies (root and workspaces)
bun install

# Configure your PostgreSQL connection in packages/core/server/.env
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
