# API contract E2E

Drives the real Hono app in-process (`app.request`, no port) against the SQL database in
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
