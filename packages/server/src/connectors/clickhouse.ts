import type { ClickHouseClient } from "@clickhouse/client";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { openOnce } from "./open-once.js";

/** `clickhouse://` speaks HTTP and `clickhouses://` HTTPS; one client per database. */
export const clickhouseConnector = (url: ConnectionUrl, readOnly: boolean) => {
	const clients = openOnce(async (database: string): Promise<ClickHouseClient> => {
		const { ClickHouseLogLevel, createClient } = await loadDriver("clickhouse");

		return createClient({
			url: `${url.scheme === "clickhouses" ? "https" : "http"}://${url.host}:${url.port}`,
			username: url.user || "default",
			password: url.password,
			database,
			request_timeout: 30_000,
			clickhouse_settings: {
				output_format_json_quote_64bit_integers: 1,
				output_format_json_quote_decimals: 1,
				wait_end_of_query: 1,
				// 2, not 1: read-only that still lets each request change settings like the one above.
				...(readOnly && { readonly: "2" }),
			},
			// Failures surface through the adapter's error mapping; the client's own log would duplicate them.
			log: { level: ClickHouseLogLevel.OFF },
		});
	});

	const client = (database = "") => clients.get(database || url.database || "default");

	return {
		/** The client for `database`, or for the URL's own database (`default` without one). */
		client,
		ping: async () => {
			await (await client()).query({ query: "SELECT 1" });
		},
		close: async () => {
			await Promise.all((await clients.drain()).map((c) => c.close()));
		},
	};
};
