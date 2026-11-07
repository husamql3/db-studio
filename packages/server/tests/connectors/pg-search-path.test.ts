import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

type FakeClient = { query: (sql: string) => Promise<void> };

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

const freshPool = async () => {
	FakePool.instances = [];
	vi.resetModules();

	const { createConnection, registerConnection, connector } =
		await import("@/open-connections.js");

	registerConnection("test", createConnection("postgresql://test:test@localhost:5432/testdb"));
	await connector("pg").pool();
	const pool = FakePool.instances[0];
	expect(pool).toBeDefined();

	return pool as FakePool;
};

describe("PostgreSQL pool search_path", () => {
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

		// Let every queued callback run: only the SET finishing may settle the hook.
		await new Promise((resolve) => setImmediate(resolve));
		expect(settled).toBe(false);

		finishSet();
		await hook;
		expect(settled).toBe(true);
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
