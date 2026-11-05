import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ConnectionUrl } from "@/connection-url.js";
import { createD1Client, d1Target } from "@/d1-client.js";
import { loadDriver } from "@/drivers.js";
import { fromLibsql, type SqliteClient } from "@/sqlite-client.js";
import { openOnce } from "./open-once.js";

/** A local SQLite file, a remote libSQL / Turso database or a Cloudflare D1 database. */
export const sqliteConnector = (url: ConnectionUrl) => {
	const clients = openOnce(async (): Promise<SqliteClient> => {
		if (url.scheme === "d1") return createD1Client(d1Target(url));

		// sqlite:///abs/path.db (or a relative sqlite://./path.db) becomes a file: URL and
		// sqlite://:memory: stays in memory; libsql:// URLs keep their authToken and tls query params.
		const libsqlUrl =
			url.file === null
				? url.driverUrl
				: url.inMemory
					? url.file
					: pathToFileURL(resolve(url.file)).href;

		const { createClient } = await loadDriver("sqlite");
		const client = createClient({ url: libsqlUrl, intMode: "bigint" });

		if (client.protocol === "file") {
			await client.execute("PRAGMA journal_mode = WAL");
			await client.execute("PRAGMA foreign_keys = ON");
		}

		return fromLibsql(client);
	});

	return {
		client: clients.get,
		ping: async () => {
			await (await clients.get()).execute("SELECT 1");
		},
		close: async () => {
			for (const client of await clients.drain()) client.close();
		},
	};
};
