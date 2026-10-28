import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// db-manager is globally mocked in tests/setup.ts; this suite exercises the real one.
vi.unmock("@/db-manager.js");

type FakeClient = { query: (sql: string) => Promise<unknown> };

class FakePool extends EventEmitter {
	static instances: FakePool[] = [];
	constructor(public config: { onConnect: (client: FakeClient) => Promise<void> }) {
		super();
		FakePool.instances.push(this);
	}
}

vi.mock("pg", () => ({
	Pool: FakePool,
	DatabaseError: class DatabaseError extends Error {},
	default: { Pool: FakePool },
}));
vi.mock("@libsql/client", () => ({ createClient: vi.fn() }));
vi.mock("ioredis", () => ({ Redis: class {} }));
vi.mock("mongodb", () => ({ MongoClient: class {}, ObjectId: class {} }));
vi.mock("mssql", () => ({ default: { ConnectionPool: class {} } }));
vi.mock("mysql2/promise", () => ({ createPool: vi.fn() }));

const freshPool = async () => {
	FakePool.instances = [];
	vi.resetModules();
	const { DatabaseManager, getDbPool, openConnection } = await import(
		"@/db-manager.js"
	);
	openConnection(
		"test",
		new DatabaseManager("postgresql://test:test@localhost:5432/testdb"),
	);
	await getDbPool();
	const pool = FakePool.instances[0];
	expect(pool).toBeDefined();
	return pool as FakePool;
};

describe("PostgreSQL pool search_path", () => {
	it("widens search_path on every new connection", async () => {
		const pool = await freshPool();
		const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

		await pool.config.onConnect(client);

		expect(client.query).toHaveBeenCalledTimes(1);
		expect(client.query.mock.calls[0][0]).toMatch(/set_config\(\s*'search_path'/);
	});

	it("holds the client back until the statement finishes", async () => {
		// pg-pool hands the client to the caller once onConnect settles. Settling
		// before the SET completes would let the caller's query overlap it on a
		// busy client (deprecated by pg) or run against the default search_path.
		const pool = await freshPool();
		let finishSet = () => {};
		const client = {
			query: vi.fn(() => new Promise<void>((resolve) => (finishSet = resolve))),
		};
		let settled = false;

		const hook = pool.config.onConnect(client).then(() => {
			settled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);

		finishSet();
		await hook;
		expect(settled).toBe(true);
	});

	it("keeps public first so an ambiguous table name still resolves to public", async () => {
		const pool = await freshPool();
		const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

		await pool.config.onConnect(client);

		const sql = client.query.mock.calls[0][0] as string;
		expect(sql).toContain("'public, ' || string_agg");
		// Only non-system, non-public schemas are appended after it.
		expect(sql).toContain("'pg_catalog', 'information_schema', 'public'");
	});

	it("leaves the connection usable when the statement fails", async () => {
		// A rejected onConnect makes pg-pool end the client and fail the checkout.
		const pool = await freshPool();
		const lines: string[] = [];
		const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
			lines.push(String(chunk));
			return true;
		});
		const client = {
			query: vi.fn().mockRejectedValue(new Error("permission denied for secret-host")),
		};

		await expect(pool.config.onConnect(client)).resolves.toBeUndefined();
		stderr.mockRestore();

		expect(lines.join("")).toContain('"event":"db_search_path_widen_failed"');
		expect(lines.join("")).not.toContain("secret-host");
	});
});
