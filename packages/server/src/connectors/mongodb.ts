import type { MongoClient } from "mongodb";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { openOnce } from "./open-once.js";

export const mongodbConnector = (url: ConnectionUrl) => {
	const clients = openOnce(async (): Promise<MongoClient> => {
		const { MongoClient } = await loadDriver("mongodb");
		const client = new MongoClient(url.driverUrl);

		try {
			await client.connect();
		} catch (error) {
			await client.close().catch(() => {});
			throw error;
		}

		return client;
	});

	/** The database the URL names, `admin` without one. */
	const dbName = url.database || "admin";
	const client = clients.get;

	return {
		client,
		dbName,
		db: async (name?: string) => (await client()).db(name ?? dbName),
		ping: async () => {
			await (await client()).db(dbName).command({ ping: 1 });
		},
		close: async () => {
			await Promise.all((await clients.drain()).map((c) => c.close()));
		},
	};
};
