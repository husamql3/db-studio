import type { Pool } from "oracledb";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { openOnce } from "./open-once.js";

/**
 * One pool for the service in the URL (`oracle://user:pass@host:1521/SERVICE`): an Oracle
 * service is a single database, so no request selects another pool.
 */
export const oracleConnector = (url: ConnectionUrl) => {
	const pools = openOnce(async (): Promise<Pool> => {
		const oracledb = await loadDriver("oracle");

		return oracledb.createPool({
			user: url.user,
			password: url.password,
			connectString: `${url.host}:${url.port}/${url.database}`,
			poolMin: 0,
			poolMax: 10,
			connectTimeout: 5,
			// LTZ values are projected in the session zone; pin it so pooled connections agree.
			sessionCallback: (connection, _tag, done) => {
				connection
					.execute("ALTER SESSION SET TIME_ZONE = '+00:00'")
					.then(() =>
						connection.execute(
							`ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS' NLS_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF9' NLS_TIMESTAMP_TZ_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF9TZH:TZM' NLS_NUMERIC_CHARACTERS = '.,'`,
						),
					)
					.then(() => done(), done);
			},
		});
	});

	return {
		pool: pools.get,
		ping: async () => {
			const connection = await (await pools.get()).getConnection();
			await connection.execute("SELECT 1 FROM dual").finally(() => connection.close());
		},
		close: async () => {
			await Promise.all((await pools.drain()).map((pool) => pool.close(0)));
		},
	};
};
