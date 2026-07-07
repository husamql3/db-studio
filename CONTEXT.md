# db-studio — Domain Context

This is the canonical glossary for db-studio. Terms here are the names domain experts
use; treat any drift in code or conversation as a signal to either correct the code or
update this file.

## Deployment shapes

db-studio runs in one of two shapes:

- **Standalone (OSS)**: a single user runs `npx db-studio` against their own database.
  One process, one `DATABASE_URL` from env, one tenant. This is the historical shape
  and remains the OSS product.
- **Hosted (multi-tenant) — private fork**: a separate, private fork of db-studio is
  embedded inside a larger hosting platform that owns many databases on behalf of many
  of its own users. The hosting platform routes incoming traffic to the fork and
  supplies, per request, the database URL to operate against. **The fork is not a CLI**
  — it's a long-running application/service. CLI compatibility is therefore not a
  constraint on the fork's design.

## Terms

### `dbType`
The database **engine** — one of `pg`, `mysql`, `mssql`, `mongodb`, `sqlite`, `redis`.
Always derivable from the protocol of a database URL (`postgres://` → `pg`, etc.).
Already appears as the first path segment in every API URL (`/:dbType/...`).

### `dbName` *(hosted shape only)*
A **hosting-platform-level identifier** for one of the databases the platform hosts.
It is *not* a term db-studio itself knows about — it lives in the hosting platform's
URL space (e.g. `platform.com/:dbName/...`). The platform is responsible for resolving
`:dbName` to a concrete database URL and passing that URL through to db-studio on every
request. From db-studio's point of view, requests always come in shaped as `/:dbType/...`.

### `database` (CLI flag, route query param, function arg)
The **logical database** (catalog / schema / Mongo db / Redis logical index) inside a
connected server. Different from `dbName` — `database` lives inside a single connection,
`dbName` selects which connection to use in the first place.

## Hosted-fork architecture (decided so far)

- **Channel topology**: the fork is served at `studio.platform.com`. The platform
  itself lives at `platform.com` (or `app.platform.com`). Same registrable domain →
  cookies can be scoped to `Domain=.platform.com`.
- **Per-request connection config**: a JWE (encrypted + signed JWT) carries the DB
  URL from the platform to the fork. The platform and fork share a symmetric key.
  Tokens are short-lived; renewal is the platform's responsibility.
- **Transport**: JWE is delivered as an `HttpOnly; Secure; SameSite=Lax` cookie on
  `.platform.com`, set by the platform server-side before the user reaches the fork.
  The browser auto-forwards it on every fork API call. SPA JS never touches it.
- **Singleton removal**: the fork's `DatabaseManager` keeps the pool-cache (keyed by
  connection string) but loses `baseConfig` and the env-driven init. A request-scoped
  middleware decrypts the JWE → derives the connection config → derives `dbType` from
  the URL protocol → sets both on the Hono context. Adapters pull from the context.
- **URL structure inside the fork**: unchanged from OSS — still `/:dbType/...`. The
  `:dbName` from the platform's URL space never enters the fork.
- **JWE scope**: one JWE = one specific database, with credentials for a role that
  the platform provisioned against that single DB (e.g. `pstrack-user` against
  `pstrack`). The fork never sees a server-wide admin connection. A leaked token
  grants exactly what the underlying DB role grants — no more.
- **Permission enforcement**: the DB role itself is the source of truth. The fork
  does *not* implement its own ACL layer on top. The raw-SQL editor stays available
  in hosted mode for the same reason — withholding it would not improve security,
  since the same role's credentials can be used outside the fork.
- **Bootstrap flow**: clicking "Open" in the platform hits a platform backend route
  that (1) generates a JWE for the target DB, (2) sets it as an `HttpOnly; Secure;
  SameSite=Lax` cookie on `Domain=.platform.com`, (3) 302s the browser to a deep
  link `studio.platform.com/:dbType/tables` (or similar). The dbType is in the URL,
  not derived from a `/session` call. The JWE middleware asserts the URL's `:dbType`
  matches the JWE's protocol — a mismatch fails fast as a 400.
- **JWE expiry / renewal**: TTL = 1 hour. On a 401, the fork's SPA performs a
  **silent refresh** against a platform-side endpoint (`platform.com/api/db-studio/refresh`)
  with credentials. If the platform returns a refreshed cookie, the SPA retries the
  original request transparently — user notices nothing. If the platform itself
  returns 401 (platform session also gone), the SPA redirects the browser to the
  platform's login page with a `next=` back to the same database. The refresh URL
  is provided to the SPA via a build-time env or injected into the bootstrap HTML.
- **Connection pooling**: the platform does **not** expose a connection pooler in
  front of customer DBs — the fork connects directly. Therefore the fork keeps its
  own per-tenant pool cache, with:
  - `max: 2` connections per pool (vs. OSS's 10) — one in-flight + one spare is
    enough for a single user browsing one tab; the actual customer's app needs the
    rest of the DB's connection budget.
  - Idle eviction after 5 min: a background sweeper closes pools whose
    `lastAccessedAt` is older than the threshold.
  - Hard cap of 500 pools per fork process, with LRU eviction on insert when full.
  - Mongo and Redis client maps must be **re-keyed by connection string** (today
    they're keyed by single-server / db-index — fine for OSS, wrong for the fork).
- **Cross-DB enforcement**: handled by the underlying DB role, **not** by fork code.
  The `pstrack-user` role can only connect to / see the `pstrack` database; any
  attempt to operate on another DB fails at the DB layer (permission denied →
  surfaced as 503 by `BaseAdapter.wrapError`). The fork does **not** validate
  user-supplied `?db=...` against the JWE's DB name, and does **not** strip the
  query param. Route handlers continue to call `getDbPool(c.req.valid("query").db)`
  unchanged. The trade-off: a stale or malicious SPA sending `?db=other_db` gets a
  somewhat confusing DB-level error instead of a clean 403, and the existence of
  other DBs may leak via timing/wording. Accepted, because:
  1. The DB role is the real security boundary either way.
  2. Adding fork-level checks would be validation theater (validating user input
     against a server-known truth — the answer should never come from the user).
  3. It keeps route code identical to OSS, making upstream merges cheap.
- **Frontend hosted-mode UI**: the fork's FE detects hosted mode (via a build-time
  flag, e.g. `VITE_DB_STUDIO_MODE=hosted`) and **collapses the databases tier of the
  sidebar entirely**. The platform's own UI is the database-selection UI; the fork
  renders one DB and shows the tables list as the top-level sidebar tier. The
  "create database" / "delete database" / database-switcher affordances are hidden
  in hosted mode.
- **JWE payload**:
  ```json
  {
    "iss": "platform.com",
    "aud": "studio.platform.com",
    "iat": 1747551600,
    "exp": 1747555200,
    "jti": "01J5T9...",
    "db_url": "postgres://pstrack-user:<pw>@host:5432/pstrack",
    "platform_user_id": "user_abc123",
    "platform_db_id": "db_xyz789"
  }
  ```
  Plus `kid` in the JWE protected header for key rotation (included from day one,
  not retrofitted). `dbType` is **not** in the payload — derivable from `db_url`'s
  protocol; single source of truth. No `scopes` field — ACL is the DB role's job.
  `platform_user_id` and `platform_db_id` are present specifically so the fork can
  emit audit-able logs that correlate to the platform's records.
