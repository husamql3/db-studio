import type { Redis, RedisOptions } from "ioredis";
import type { ConnectionUrl } from "@/connection-url.js";
import { loadDriver } from "@/drivers.js";
import { writeOperationalLog } from "@/operational-log.js";
import { openOnce } from "./open-once.js";

/** Refuses a server db-studio cannot browse: cluster or Sentinel mode, or Redis before 6.2. */
const assertSupportedServer = async (client: Redis) => {
	const info = await client.info("server");

	if (/^redis_mode:(cluster|sentinel)\b/m.test(info)) {
		throw new Error(
			"Redis cluster and Sentinel modes are not supported. Use a standalone redis:// connection.",
		);
	}

	const version = info.match(/^redis_version:([^\r\n]+)/m)?.[1];
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
		/** A connection of its own, for commands that block or hold state (MULTI, WATCH). */
		isolatedClient: async (index = defaultDb) => {
			const isolated = (await client(index)).duplicate();
			await isolated.connect();

			return isolated;
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
