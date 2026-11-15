import type { Pool } from "mysql2/promise";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { writeOperationalLog } from "@/operational-log.js";
import { CONNECT_TIMEOUT_MS } from "./connect-timeout.js";
import { openOnce } from "./open-once.js";

export const mysqlConnector = (url: ConnectionUrl, readOnly: boolean) => {
	const pools = openOnce(async (database: string): Promise<Pool> => {
		const { createPool } = await loadDriver("mysql");

		const pool = createPool({
			host: url.host,
			port: url.port,
			user: url.user,
			password: url.password,
			database: database || url.database || undefined,
			waitForConnections: true,
			connectionLimit: 10,
			idleTimeout: 30000,
			connectTimeout: CONNECT_TIMEOUT_MS,
			multipleStatements: false,
		});

		// mysql2 queues commands per connection, so this runs before the connection's first
		// query; a connection that cannot be made read-only is dropped instead of writing.
		if (readOnly) {
			pool.pool.on("connection", (connection) =>
				connection.query("SET SESSION TRANSACTION READ ONLY", (error) => {
					if (error) connection.destroy();
				}),
			);
		}

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
				writeOperationalLog("info", "db_pool_closed", { db_type: "mysql" });
			});

			await Promise.all(closing);
		},
	};
};
