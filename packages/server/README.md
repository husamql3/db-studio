# db-studio

<p align="center">
  <img src="https://raw.githubusercontent.com/husamql3/db-studio/main/assets/icon.png" alt="db-studio icon" width="128" height="128">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/db-studio"><img src="https://img.shields.io/npm/v/db-studio" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/db-studio"><img src="https://img.shields.io/npm/dm/db-studio" alt="npm downloads"></a>
  <a href="https://github.com/husamql3/db-studio/stargazers"><img src="https://img.shields.io/github/stars/husamql3/db-studio" alt="GitHub stars"></a>
  <a href="https://github.com/husamql3/db-studio/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://deepwiki.com/husamql3/db-studio"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

<p align="center">
A modern, universal database studio (the pgAdmin alternative) for every database.<br>
Browse tables, edit records, design schemas, and run queries from one UI, launched with a single <code>npx</code> command.
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/husamql3/db-studio/main/assets/screenshot.png" alt="db-studio screenshot" width="800">
</p>

## Installation

No installation required. Run it from a directory that has a `.env` with `DATABASE_URL`:

```bash
npx db-studio
```

db-studio searches the current directory, then its parents, for a `.env` file. If `DATABASE_URL` is not there, it reads it from the environment.

**As a project script:**

```json
{
  "scripts": {
    "db:studio": "npx db-studio"
  }
}
```

**Flags:**

| Flag                   | Description                                    | Example                                                  |
|------------------------|------------------------------------------------|----------------------------------------------------------|
| `--env <path>`         | Use a specific `.env` file                     | `npx db-studio --env .env.local`                         |
| `--var-name <name>`    | Read a different environment variable          | `npx db-studio --var-name MY_DB_URL`                     |
| `--port <number>`      | Change the server port (default: 3333)         | `npx db-studio --port 4000`                              |
| `--database-url <url>` | Pass the connection string directly            | `npx db-studio --database-url "postgresql://localhost/mydb"` |
| `--open`               | Open db-studio in your browser once it starts  | `npx db-studio --open`                                   |
| `--no-open`            | Do not open the browser (the default)          | `npx db-studio --no-open`                                |
| `--status`             | Check the connection only, without the UI      | `npx db-studio --status`                                 |
| `--version`            | Show the installed version                     | `npx db-studio --version`                                |
| `--help`               | Show all options                               | `npx db-studio --help`                                   |

Full documentation: [dbstudio.sh](https://dbstudio.sh)

## Features

### Databases
- 🐘 PostgreSQL, CockroachDB, MySQL, MariaDB, TiDB, SQL Server, Oracle
- 🪶 SQLite, Turso / libSQL, Cloudflare D1, DuckDB
- 🍃 MongoDB, Redis, ClickHouse
- 🔌 Connect with a single connection URL

### Table Browser
- 📋 Spreadsheet-like grid with inline cell editing
- 🔎 Filter, sort, and paginate rows
- 🔴 Live mode refreshes the grid and highlights changed rows and cells
- 🧾 Row details sheet with keyboard navigation between rows
- 🙈 Hide and reorder columns, saved per table
- 📤 Export tables as CSV, Excel, or JSON

### Records
- ➕ Add records with type-aware forms
- 📥 Bulk insert from CSV, Excel, or JSON
- 🔗 Pick foreign key values from the referenced table
- 🗑️ Delete rows, with force delete for dependent rows

### Schema
- 🏗️ Create and rename tables, with foreign keys
- ✏️ Add and edit columns
- 📇 Create and drop indexes

### Query Runner
- ⌨️ Monaco-powered editor with syntax highlighting and autocomplete
- ✨ Generate, optimize, or fix queries with AI

### AI Assistant
- 💬 Ask questions about your data in plain English
- 🔑 Bring your own key for Gemini, OpenAI, Anthropic, Grok, or OpenRouter

### Everywhere
- ⌘ Command palette to jump to tables and run actions
- 🌗 Light and dark themes
- 📊 Anonymous usage data, off with `DB_STUDIO_TELEMETRY=0`

## Contributing

See [CONTRIBUTING.md](https://github.com/husamql3/db-studio/blob/main/CONTRIBUTING.md) for development setup. Check the [roadmap](https://dbstudio.sh/roadmap) and [changelog](https://dbstudio.sh/changelog) for what's planned and what shipped.

## License

Apache License 2.0 - see [LICENSE](https://github.com/husamql3/db-studio/blob/main/LICENSE).
