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
MongoDB and Redis are out of scope. Dialect-specific SQL goes in `OVERRIDES` in `contract.ts`.

## Run the Oracle review probe

The Oracle review probe checks composite foreign-key deletion, nanosecond timestamp keys,
nullable temporal bulk inserts, and the composite primary-key delete guard.

```bash
cd packages/server
DATABASE_URL='oracle://user:pass@host:1521/SERVICE' bunx tsx e2e/oracle-review.ts
```

The probe writes `packages/server/.e2e-output/oracle-review.json`. A native Oracle `DATE` or
`TIMESTAMP` query-runner result returns 400. Use `TO_CHAR` with an explicit format in that query.

Runtime verification for this probe is pending. Do not record a pass until the command exits 0
against Oracle and writes the normalized artifact.
