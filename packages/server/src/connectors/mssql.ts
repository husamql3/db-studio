import type { ConnectionPool } from "mssql";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";
import { CONNECT_TIMEOUT_MS } from "./connect-timeout.js";
import { openOnce } from "./open-once.js";

export const mssqlConnector = (url: ConnectionUrl) => {
	const pools = openOnce(async (database: string): Promise<ConnectionPool> => {
		const mssql = await loadDriver("mssql");

		const pool = await new mssql.ConnectionPool({
			server: url.host,
			port: url.port,
			user: url.user,
			password: url.password,
			database: database || url.database || undefined,
			options: {
				encrypt: false, // Use true for Azure
				trustServerCertificate: true,
				enableArithAbort: true,
				connectTimeout: CONNECT_TIMEOUT_MS,
			},
			pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
		}).connect();

		pool.on("error", (err) => {
			writeOperationalLog("error", "db_pool_error", { db_type: "mssql", ...errorFields(err) });
		});

		return pool;
	});

	return {
		/** The pool for `database`, or for the URL's own database. */
		pool: (database = "") => pools.get(database),
		ping: async () => {
			await (await pools.get("")).request().query("SELECT 1");
		},
		close: async () => {
			const closing = (await pools.drain()).map(async (pool) => {
				await pool.close();
				writeOperationalLog("info", "db_pool_closed", { db_type: "mssql" });
			});

			await Promise.all(closing);
		},
	};
};
