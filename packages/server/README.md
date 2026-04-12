# db-studio

A modern, universal (pgAdmin alternative) database management studio for any database.

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

<br />

<img src="https://dbstudio.sh/og-image.png" alt="DB Studio screenshot" width="1000" />

## Getting Started

Run DB Studio without installing it globally:

```bash
npx db-studio
```

DB Studio reads your database connection from `DATABASE_URL` in a `.env` file.

```env
DATABASE_URL="postgresql://user:password@127.0.0.1:5432/mydb"
```

You can also pass the connection string directly:

```bash
npx db-studio --database-url "postgresql://user:password@127.0.0.1:5432/mydb"
```

## Usage

Add a simple script to your `package.json`:

```json
{
  "scripts": {
    "db:studio": "npx db-studio"
  }
}
```

Then run:

```bash
npm run db:studio
```

Helpful options:

- `npx db-studio --env .env.local`
- `npx db-studio --port 4000`
- `npx db-studio --status`
