# Security Policy

## Supported versions

Only the latest release of `db-studio` on npm receives security fixes. Upgrade with
`npx db-studio@latest` before you report an issue.

| Version          | Supported |
| ---------------- | --------- |
| Latest release   | Yes       |
| Older releases   | No        |

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

Report it privately through
[GitHub Security Advisories](https://github.com/husamql3/db-studio/security/advisories/new).
If you cannot use GitHub, email **husam@ql3.dev** with the subject `[security] db-studio`.

Include:

- the affected version (`npx db-studio --version`) and database engine
- steps to reproduce, or a proof of concept
- the impact you expect: what an attacker can read, change or run

Never include real connection strings, credentials or production data. Use a local database
seeded by `scripts/init-db-*.sh` to reproduce.

## What to expect

- We acknowledge your report within 3 business days.
- We confirm or reject the issue within 10 business days and tell you our plan.
- We fix confirmed issues in a new release, then publish a GitHub Security Advisory.
  We credit you in the advisory unless you ask us not to.

Please give us 90 days, or until a fix ships, before you disclose the issue publicly.

## Scope

db-studio runs a local server that holds database credentials and runs queries on the user's
behalf. Reports we especially want:

- access to the local server from another origin or host (for example DNS rebinding, CSRF
  or a bypass of the loopback `Host` check)
- saved connection URLs or passwords that reach the browser, logs, Sentry or the proxy
- SQL, NoSQL or command injection through table names, filters, sort keys or record values
- path traversal through file-based engines (SQLite, DuckDB) or exports
- bypass of rate limits or leaked keys in the Cloudflare proxy (`packages/proxy`)
- issues in the marketing and docs site (`www`), including the `/admin` page

Out of scope:

- queries the connected database user is already allowed to run through the query runner
- running the server with `HOST` set to a non-loopback address on an untrusted network
- an attacker who already has access to the user's machine or `~/.dbstudio/`
- vulnerabilities in dependencies with no exploitable path in db-studio (report those
  upstream)
- missing security headers or best practices without a demonstrated impact
