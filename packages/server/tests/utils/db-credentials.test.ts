/**
 * The credentials and database name each driver receives from a connection URL
 * (https://github.com/husamql3/db-studio/discussions/63). PostgreSQL, MongoDB and libSQL get the
 * URL itself and decode it in their driver; the engines below get separate fields from us.
 *
 * Failure modes:
 * 1. A percent-encoded character (`p%40ss` for `p@ss`) reaches the driver still encoded, so the
 *    server answers "Login failed".
 * 2. A character typed unencoded that `URL` encodes on parse (`;`, `=`) reaches the driver as
 *    `%3B`, `%3D`.
 * 3. A password decoded twice: `100%2541` must arrive as `100%41`, not `100A`.
 * 4. A `%` that starts no escape throws a URIError, or makes the escapes around it reach the driver
 *    undecoded: `p%40ss%` must arrive as `p@ss%`.
 * 5. A database name with an encoded character (`my%20db`) reaches the driver encoded.
 * 6. A database name passed by the app (`sales%41`) is decoded as if it came from the URL.
 * 7. An alias rewrite (`mariadb://` to `mysql://`) changes the credentials it re-serializes.
 */
import { describe, expect, it, vi } from "vitest";

// db-manager is globally mocked in tests/setup.ts; this suite exercises the real one.
vi.unmock("@/db-manager.js");

type Received = { user?: string; password?: string; database?: string };
const received: Received[] = [];

vi.mock("mysql2/promise", () => ({
	createPool: (config: Received) => {
		received.push(config);
		return {};
	},
}));
vi.mock("mssql", () => ({
	default: {
		ConnectionPool: class {
			constructor(config: Received) {
				received.push(config);
			}
			connect() {
				return Promise.resolve({ on: () => {} });
			}
		},
	},
}));
vi.mock("oracledb", () => ({
	default: {
		createPool: (config: Received) => {
			received.push(config);
			return Promise.resolve({});
		},
	},
}));
vi.mock("ioredis", () => ({
	Redis: class {
		constructor({ username, password }: { username?: string; password?: string }) {
			received.push({ user: username, password });
		}
		connect() {
			return Promise.resolve();
		}
		info() {
			return Promise.resolve("redis_version:7.2.0\r\nredis_mode:standalone\r\n");
		}
	},
}));
vi.mock("@clickhouse/client", () => ({
	ClickHouseLogLevel: { OFF: 0 },
	createClient: ({ username, ...config }: Received & { username: string }) => {
		received.push({ ...config, user: username });
		return {};
	},
}));

const { DatabaseManager } = await import("@/db-manager.js");

/** The fields the driver received for `url`. */
const driverConfig = async (url: string): Promise<Received> => {
	received.length = 0;
	const manager = new DatabaseManager(url);
	const connect = {
		mysql: () => manager.getMysqlPool(),
		mssql: () => manager.getMssqlPool(),
		oracle: () => manager.getOraclePool(),
		redis: () => manager.getRedisClient(),
		clickhouse: () => manager.getClickhouseClient(),
	}[manager.getDbType() as "mysql" | "mssql" | "oracle" | "redis" | "clickhouse"];
	await connect();
	expect(received).toHaveLength(1);
	return received[0] as Received;
};

const ENGINES = [
	["mysql", "mysql://{creds}@localhost:3306/db"],
	["mssql", "mssql://{creds}@localhost:1433/db"],
	["oracle", "oracle://{creds}@localhost:1521/FREEPDB1"],
	["redis", "redis://{creds}@localhost:6379/0"],
	["clickhouse", "clickhouse://{creds}@localhost:8123/db"],
] as const;

describe.each(ENGINES)("%s credentials", (_engine, template) => {
	const url = (creds: string) => template.replace("{creds}", creds);

	it("decodes percent-encoded characters", async () => {
		expect(await driverConfig(url("te%40m:p%40ss%3Aw%2Frd"))).toMatchObject({
			user: "te@m",
			password: "p@ss:w/rd",
		});
	});

	it("keeps characters URL encodes while parsing", async () => {
		expect(await driverConfig(url("test:p;ss=1"))).toMatchObject({ password: "p;ss=1" });
	});

	it("decodes once", async () => {
		expect(await driverConfig(url("test:100%2541"))).toMatchObject({ password: "100%41" });
	});

	it("keeps a % that starts no escape", async () => {
		expect(await driverConfig(url("test:p%40ss%"))).toMatchObject({ password: "p@ss%" });
	});
});

describe("database names", () => {
	it.each([
		"mysql://u:p@localhost:3306/my%20db",
		"mssql://u:p@localhost:1433/my%20db",
		"clickhouse://u:p@localhost:8123/my%20db",
	])("decodes %s", async (url) => {
		expect(await driverConfig(url)).toMatchObject({ database: "my db" });
	});

	it("keeps a name passed by the app as given", async () => {
		received.length = 0;
		await new DatabaseManager("mysql://u:p@localhost:3306/db").getMysqlPool("sales%41 db");
		expect(received[0]).toMatchObject({ database: "sales%41 db" });
	});
});

it("keeps credentials through an alias rewrite", async () => {
	expect(await driverConfig("mariadb://te%40m:p%40ss;@localhost/db")).toMatchObject({
		user: "te@m",
		password: "p@ss;",
	});
});
