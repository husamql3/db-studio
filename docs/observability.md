# Observability

DB Studio uses PostHog for anonymous product analytics and Sentry for errors and sampled
performance traces. Official builds use the EU ingestion regions. Telemetry is enabled by
default, disclosed on first use, and can be disabled in Settings or with
`DB_STUDIO_TELEMETRY=0`.

## Privacy contract

Allowed fields are limited in code to the DB Studio release, client/server source, database
engine, operation or feature name, success category, coarse duration/count buckets, runtime/OS
family, and country derived by the providers during ingestion.

Never send connection strings, IP addresses as event properties, usernames, database/table/
column names, SQL, parameters, schemas, prompts, responses, record values, request bodies, raw
URLs, raw database errors, or arbitrary metadata. Client autocapture and session recording are
disabled. Server event names are derived from fixed route categories rather than request paths.

The anonymous installation UUID lives in the platform application-state directory. It persists
across upgrades and can be rotated in Settings. Telemetry delivery is asynchronous and failures
never fail a database operation.

## Vendor projects

- Sentry organization: `husamql3` (EU)
- Sentry projects: `db-studio-web`, `db-studio-server`
- PostHog EU project: `DB Studio` (`267671`)

The official Sentry DSNs and PostHog project token are public ingestion identifiers and are
compiled into the app. Self-hosted builds can override them with `VITE_SENTRY_DSN`,
`DB_STUDIO_SENTRY_DSN`, `VITE_POSTHOG_KEY`, and `DB_STUDIO_POSTHOG_KEY`. PostHog ingestion uses
`https://eu.i.posthog.com` by default. The project has IP anonymization enabled and autocapture,
console capture, performance capture, heatmaps, surveys, dead-click capture, and session replay
disabled at the project level.

Release builds upload source maps when `SENTRY_AUTH_TOKEN` is present. The build plugins delete
the map files after upload so they are not included in the npm package.

## Private dashboard

`https://dbstudio.sh/admin` is backed by fixed server-side PostHog and Sentry API queries. Vendor
credentials never reach the browser. Results are cached for five minutes and accept only
allowlisted date, source, engine, feature, and release filters.

Configure `www/.env` from `www/.env.example`, then upload it with `bun run cf-secrets`. Generate
the password hash without putting the password in the environment or repository:

```bash
printf '%s' 'a-long-admin-password' | bun run --cwd www admin:hash-password
```

Store the output as `ADMIN_PASSWORD_HASH`, and generate a separate random
`ADMIN_SESSION_SECRET`. The hash is `pbkdf2_sha256:100000:<salt>:<hash>`: fields are separated by
`:` because dotenv expansion strips `$`-prefixed segments out of `.env`, and the iteration count is
capped at 100000 because the Workers runtime refuses to derive above that (local `wrangler dev`
does not enforce the cap, so a higher count only fails once deployed). `workers_dev` is disabled for production so the custom domain is the only
public entry point.

## Telegram alerts

Avocado-bot exposes:

- `POST /api/webhooks/dbstudio/sentry`
- `POST /api/webhooks/dbstudio/posthog`

Each endpoint uses its own bearer secret. Set `DBSTUDIO_SENTRY_WEBHOOK_SECRET` and
`DBSTUDIO_POSTHOG_WEBHOOK_SECRET` as encrypted avocado-bot Worker secrets. Sentry payloads are
reduced to issue ID/link fields; PostHog accepts a strict aggregate-alert schema. Both reuse the
bot's fingerprint deduplication and hourly rate cap before posting to Telegram.

Configure provider alert rules only after deploying avocado-bot and setting those secrets. The
current Sentry MCP supports project management but not creating webhook alert actions; configure
that action in Sentry's UI. PostHog project setup was completed through its MCP. Alert delivery
remains a setup step until avocado-bot is deployed with the two webhook secrets.
