import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// db-manager is globally mocked in tests/setup.ts; this suite exercises the real one.
vi.unmock("@/db-manager.js");

class FakePool extends EventEmitter {
	static instances: FakePool[] = [];
	constructor(public config: unknown) {
		super();
		FakePool.instances.push(this);
	}
}

vi.mock("pg", () => ({
	Pool: FakePool,
	DatabaseError: class DatabaseError extends Error {},
	default: { Pool: FakePool },
}));
vi.mock("better-sqlite3", () => ({ default: class {} }));
vi.mock("ioredis", () => ({ Redis: class {} }));
vi.mock("mongodb", () => ({ MongoClient: class {}, ObjectId: class {} }));
vi.mock("mssql", () => ({ default: { ConnectionPool: class {} } }));
vi.mock("mysql2/promise", () => ({ createPool: vi.fn() }));

const freshPool = async () => {
	FakePool.instances = [];
	vi.resetModules();
	const { getDbPool } = await import("@/db-manager.js");
	getDbPool();
	const pool = FakePool.instances[0];
	expect(pool).toBeDefined();
	return pool as FakePool;
};

describe("PostgreSQL pool search_path", () => {
	beforeEach(() => {
		process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
	});

	it("widens search_path on every new connection", async () => {
		const pool = await freshPool();
		const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

		pool.emit("connect", client);

		expect(client.query).toHaveBeenCalledTimes(1);
		expect(client.query.mock.calls[0][0]).toContain("SET search_path TO public, ");
	});

	it("enqueues the statement synchronously so no query can overtake it", async () => {
		// pg hands the client to the caller as soon as the synchronous "connect"
		// emit returns. Looking the schemas up first and only then issuing SET
		// would let the caller's query run against the default search_path.
		const pool = await freshPool();
		const order: string[] = [];
		const client = {
			query: vi.fn((sql: string) => {
				order.push(sql.includes("search_path") ? "set" : "caller");
				return Promise.resolve({ rows: [] });
			}),
		};

		pool.emit("connect", client);
		// Whatever the caller does the instant it receives the client:
		client.query("SELECT * FROM daily_summarie");

		expect(order).toEqual(["set", "caller"]);
	});

	it("keeps public first so an ambiguous table name still resolves to public", async () => {
		const pool = await freshPool();
		const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

		pool.emit("connect", client);

		const sql = client.query.mock.calls[0][0] as string;
		expect(sql).toContain("'SET search_path TO public, ' || extra");
		// Only non-system, non-public schemas are appended after it.
		expect(sql).toContain("'pg_catalog', 'information_schema', 'public'");
	});

	it("leaves the connection usable when the statement fails", async () => {
		const pool = await freshPool();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const client = { query: vi.fn().mockRejectedValue(new Error("permission denied")) };

		expect(() => pool.emit("connect", client)).not.toThrow();
		await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

		consoleError.mockRestore();
	});
});
