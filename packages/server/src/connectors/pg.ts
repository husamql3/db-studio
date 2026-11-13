import type { Pool } from "pg";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";
import { CONNECT_TIMEOUT_MS } from "./connect-timeout.js";
import { openOnce } from "./open-once.js";

/** The URL with `database` as its path; the name is literal, so it is encoded for the driver. */
const connectionString = (driverUrl: string, database: string) => {
	if (!database) return driverUrl;
	const url = new URL(driverUrl);
	url.pathname = `/${encodeURIComponent(database)}`;

	return url.toString();
};

export const pgConnector = (url: ConnectionUrl, readOnly: boolean) => {
	const pools = openOnce(async (database: string): Promise<Pool> => {
		const { Pool } = await loadDriver("pg");

		// The tables list spans every user schema, but the SQL the adapters
		// build refers to tables by bare name, so a table outside "public" is
		// listed yet every query against it fails with "relation does not
		// exist". Widen search_path on each new connection.
		//
		// The pool awaits onConnect before handing the client out, so the
		// caller's first query cannot overlap the SET (pg deprecates queuing a
		// query on a busy client). "public" stays first so it keeps winning a
		// name collision, as before. A single set_config() rather than a DO
		// block, because CockroachDB does not run PL/pgSQL.
		const pool = new Pool({
			connectionString: connectionString(url.driverUrl, database),
			max: 10,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
			onConnect: async (client) => {
				// shortcut: a transaction-mode pooler (PgBouncer, Neon -pooler, Supabase :6543) can
				// run later queries on a server connection that never got this SET; connect directly
				// for a guaranteed read-only session, or wrap each request in BEGIN READ ONLY.
				// Unlike search_path below, a failure here fails the connection instead of allowing writes.
				if (readOnly) await client.query("SET default_transaction_read_only = on");
				await client
					.query(
						`SELECT set_config(
							'search_path',
							COALESCE(
								'public, ' || string_agg(quote_ident(nspname), ', ' ORDER BY nspname),
								current_setting('search_path')
							),
							false
						)
						FROM pg_namespace
						WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'crdb_internal', 'pg_extension')
							AND nspname NOT LIKE 'pg_toast%'
							AND nspname NOT LIKE 'pg_temp%';`,
					)
					.then(
						() => {},
						(err: Error) => {
							writeOperationalLog("warn", "db_search_path_widen_failed", {
								db_type: "pg",
								...errorFields(err),
							});
						},
					);
			},
		});

		pool.on("error", (err) => {
			writeOperationalLog("error", "db_pool_error", { db_type: "pg", ...errorFields(err) });
		});

		return pool;
	});

	return {
		/** The pool for `database`, or for the URL's own database. */
		pool: (database = "") => pools.get(database),
		ping: async () => {
			await (await pools.get("")).query("SELECT 1");
		},
		close: async () => {
			const closing = (await pools.drain()).map(async (pool) => {
				await pool.end();
				writeOperationalLog("info", "db_pool_closed", { db_type: "pg" });
			});

			await Promise.all(closing);
		},
	};
};
