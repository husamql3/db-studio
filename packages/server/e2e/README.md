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
