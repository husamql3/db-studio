# API contract E2E

Drives the real Elysia app in-process (`app.handle`, no port) against the SQL database in
`DATABASE_URL`, through the same routes the web app calls, using a scratch table `dbstudio_e2e`.

```bash
bun run init-db:pgsql   # from the repo root; prints the DATABASE_URL it seeded
cd packages/server
DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio bun run e2e -- pg
```

Prints PASS/FAIL per step and exits non-zero on any failure. Writes the normalized artifact to
`e2e/artifacts/<label>.json`; rerunning from the same state must produce a byte-identical file.
The scratch table names are fixed so the artifact stays repeatable, so run one contract at a time
per database: two runs sharing a `DATABASE_URL` would drop each other's tables.
MongoDB and Redis are out of scope. Dialect-specific SQL goes in `OVERRIDES` in `contract.ts`.

## Pin the HTTP surface

The surface probe boots the real CLI on port 4999 and records status, headers, and bodies for
routing, validation, error, CORS, request ID, static file, SPA fallback, and chat streaming cases.
It serves a fake AI proxy on port 4998 for the chat cases. Use it to compare old and new versions
of the HTTP layer, such as a framework upgrade.

```bash
cd packages/server
DATABASE_URL=postgresql://dbstudio:dbstudio@127.0.0.1:5434/dbstudio sh e2e/http-surface.sh <label>
```

It writes `e2e/artifacts/http-surface-<label>.json`. Two runs against the same server produce the
same file, so diff the files from the two versions.

## Run the Oracle review probe

The five Oracle review scenarios check composite foreign-key deletion, nanosecond timestamp
keys, nullable temporal bulk inserts, mixed-offset timestamp sorting, temporal pattern filters,
and the composite primary-key delete guard.

```bash
cd packages/server
DATABASE_URL='oracle://user:pass@host:1521/SERVICE' bunx tsx e2e/oracle-review.ts
```

The probe writes `e2e/artifacts/oracle-review.json`. A native Oracle `DATE` or
`TIMESTAMP` query-runner result returns 400. Use `TO_CHAR` with an explicit format in that query.

## ClickHouse regressions

The ClickHouse probe requires Node 20 and checks exact wide-number values, refused grid
mutations, inserts, explicit SQL mutations, and failures that arrive after response streaming
starts.

```bash
DATABASE_URL=clickhouse://dbstudio:dbstudio@127.0.0.1:8123/dbstudio \
  node --import tsx e2e/clickhouse-regressions.ts after
```

It writes `e2e/artifacts/clickhouse-regressions-<label>.json`. Use a new label for each run so
before and after evidence can be compared directly.

## Index listing regressions

Checks SQL Server columnstore columns separately from B-tree INCLUDE columns, and SQLite
expression keys containing SQL comments and quoted comment markers. On MySQL, checks that
primary keys and both forms of unique index refuse drops, uniqueness remains enforced, and
ordinary indexes can still be dropped. Uses and removes only
the `dbstudio_e2e_index_listing` scratch table in a disposable database.

```bash
DATABASE_URL=sqlite:///tmp/dbstudio-index-review.sqlite bunx tsx e2e/index-listing.ts
# Or set DATABASE_URL to a disposable SQL Server or MySQL database.
```

Writes `e2e/artifacts/<engine>-index-listing.json` (`sqlite`, `mssql`, or `mysql`).

## MongoDB indexes

MongoDB is outside the contract, so the Indexes routes have their own probe. It works on a
scratch collection `dbstudio_e2e_indexes` that it creates and drops, then records the indexes
of the seeded `contributors`, `projects` and `contributions` collections (`null` when absent).

```bash
cd packages/server
DATABASE_URL='mongodb://127.0.0.1:27017/dbstudio' bunx tsx e2e/mongo-indexes.ts
```

It writes `e2e/artifacts/mongo-indexes.json`.
