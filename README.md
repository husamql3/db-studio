# DB Studio



<div align="center">

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-light.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-dark.png">
  <img src="assets/logo-light.png" alt="DB Studio logo" width="100">
</picture>

<br>

<img src="assets/screenshot.png" alt="DB Studio screenshot" width="1000" />

</div>

<div align="center">
A modern, universal (pgAdmin alternative) database management studio for any SQL database that you can launch via the CLI.
</div>

<br>

<div align="center">
  <a href="https://github.com/husamql3/db-studio/stargazers"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/husamql3/db-studio"></a>
  <a href="https://github.com/husamql3/db-studio/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/husamql3/pstrack"></a>
  <a href="https://deepwiki.com/husamql3/db-studio"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</div>

## Features

### ✅ Available Now

- **Virtual Data Grid** — High-performance table view with virtualized scrolling powered by TanStack Table
- **Command Palette** — Quick navigation and actions with `Cmd/Ctrl + K`
- **Table Management** — Create tables with column types, constraints, and foreign key relationships
- **Record Operations** — Insert new records with form validation
- **Resizable Sidebar** — Pin or auto-hide, drag to resize
- **Keyboard Shortcuts** — Navigate and interact efficiently
- **Dark Theme** — Easy on the eyes, built for extended use

### Planned / In Progress

- Inline row editing & bulk operations
- AI-assisted SQL generation
- Import/export (CSV, JSON, SQL)
- Full SQL query editor with autocomplete
- Visual schema & ER diagram
- Advanced filtering, sorting & saved queries
- Query history & favorites

## Tech Stack

- **Frontend:** React 19, TanStack (Table, Query, Form), Zustand, Tailwind CSS, Radix UI
- **Backend:** Hono, PostgreSQL (pg)
- **Tooling:** Vite, TypeScript, Biome

## Getting Started

```bash
# Install dependencies
bun install
cd server && bun install

# Configure your PostgreSQL connection in server/.env
# DATABASE_URL=postgres://user:password@localhost:5432/database

# Start development servers
bun run dev
```

The app runs at `http://localhost:5173` with the API server on port `3000`.

# Contributing

Extremely welcome! This is early-stage — PRs for new drivers, bug fixes, or even a better logo will be merged lightning-fast.
Check out [CONTRIBUTING.md](/CONTRIBUTING.md) and the open issues.

## License

[Apache](/LICENSE)
