import type { Redis, RedisOptions } from "ioredis";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { writeOperationalLog } from "@/operational-log.js";
import { openOnce } from "./open-once.js";

export const UNSUPPORTED_SERVER_MODE =
	"Redis cluster and Sentinel modes are not supported. Use a standalone redis:// connection.";

/** The `field:value` lines of an INFO reply; section headers and blank lines are skipped. */
export const parseInfo = (info: string) => {
	const fields: Partial<Record<string, string>> = {};

	for (const line of info.split(/\r?\n/)) {
		const idx = line.indexOf(":");

		if (line.startsWith("#") || idx < 0) continue;
		fields[line.slice(0, idx)] = line.slice(idx + 1);
	}

	return fields;
};

/** Refuses a server db-studio cannot browse: cluster or Sentinel mode, or Redis before 6.2. */
const assertSupportedServer = async (client: Redis) => {
	const { redis_mode: mode, redis_version: version } = parseInfo(await client.info("server"));

	if (mode === "cluster" || mode === "sentinel") throw new Error(UNSUPPORTED_SERVER_MODE);

	const [major = 0, minor = 0] = version?.split(".").map(Number) ?? [];

	if (major < 6 || (major === 6 && minor < 2)) {
		throw new Error(
			`Redis 6.2 or newer is required. Connected server reports ${version ?? "an unknown version"}.`,
		);
	}
};

/** One client per logical database index. */
export const redisConnector = (url: ConnectionUrl) => {
	const parsedDefault = Number.parseInt(url.database, 10);
	/** The logical database the URL names (`redis://host/3` is 3), else 0. */
	const defaultDb = Number.isFinite(parsedDefault) ? parsedDefault : 0;

	const clients = openOnce(async (index: number): Promise<Redis> => {
		const options: RedisOptions = {
			host: url.host,
			port: url.port,
			db: index,
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableReadyCheck: true,
			connectTimeout: 2000,
		};

		if (url.user) options.username = url.user;

		if (url.password) options.password = url.password;

		if (url.scheme === "rediss") options.tls = {};

		const { Redis } = await loadDriver("redis");
		const client = new Redis(options);

		try {
			await client.connect();
			await assertSupportedServer(client);
		} catch (error) {
			await client.quit().catch(() => {});
			throw error;
		}

		return client;
	});

	const client = (index = defaultDb) => clients.get(index);

	return {
		defaultDb,
		client,
		/**
		 * Runs `fn` on a connection of its own, for commands that hold state (WATCH, MULTI), and
		 * closes that connection afterwards.
		 */
		withIsolatedClient: async <T>(index: number, fn: (client: Redis) => Promise<T>) => {
			const isolated = (await client(index)).duplicate();

			try {
				await isolated.connect();

				return await fn(isolated);
			} finally {
				await isolated.quit().catch(() => isolated.disconnect());
			}
		},
		ping: async () => {
			await (await client()).ping();
		},
		close: async () => {
			const closing = (await clients.drain()).map(async (c) => {
				await c.quit().catch(() => {});
				writeOperationalLog("info", "db_pool_closed", { db_type: "redis" });
			});

			await Promise.all(closing);
		},
	};
};
