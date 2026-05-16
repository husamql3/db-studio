import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPipeline = vi.hoisted(() => ({
	scan: vi.fn(),
	exec: vi.fn(),
}));

const mockClient = vi.hoisted(() => ({
	pipeline: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { REDIS_TABLES, RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter — tables", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockGetRedisClient.mockResolvedValue(mockClient);
		mockPipeline.scan.mockReturnThis();
		mockClient.pipeline.mockReturnValue(mockPipeline);
		adapter = new RedisAdapter();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getTablesList", () => {
		it("returns the six fixed Redis type-tables with per-type counts", async () => {
			mockPipeline.exec.mockResolvedValue([
				[null, ["0", ["a", "b", "c"]]],
				[null, ["0", ["k1", "k2"]]],
				[null, ["0", []]],
				[null, ["0", ["s1"]]],
				[null, ["0", ["z1", "z2", "z3", "z4"]]],
				[null, ["0", []]],
			]);

			const tables = await adapter.getTablesList("0");
			expect(tables.map((t) => t.tableName)).toEqual([...REDIS_TABLES]);
			expect(tables.map((t) => t.rowCount)).toEqual([3, 2, 0, 1, 4, 0]);
		});

		it("caches counts for 30 seconds", async () => {
			mockPipeline.exec.mockResolvedValue([
				[null, ["0", ["a"]]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
				[null, ["0", []]],
			]);

			await adapter.getTablesList("0");
			await adapter.getTablesList("0");
			expect(mockClient.pipeline).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(31_000);
			await adapter.getTablesList("0");
			expect(mockClient.pipeline).toHaveBeenCalledTimes(2);
		});

		it("rejects invalid db indexes", async () => {
			await expect(adapter.getTablesList("not-a-number")).rejects.toMatchObject({ status: 400 });
		});
	});

	describe("getTableSchema", () => {
		it("returns synthesized schema text for each known table", async () => {
			for (const table of REDIS_TABLES) {
				const schema = await adapter.getTableSchema({ tableName: table, db: "0" });
				expect(schema).toMatch(/Redis|columns/i);
			}
		});

		it("throws 404 for an unknown table name", async () => {
			await expect(
				adapter.getTableSchema({ tableName: "foo", db: "0" }),
			).rejects.toMatchObject({ status: 404 });
		});
	});

	describe("getTableColumns", () => {
		it("returns key, value, ttl for collection-style tables", async () => {
			const cols = await adapter.getTableColumns({ tableName: "hashes", db: "0" });
			expect(cols.map((c) => c.columnName)).toEqual(["key", "value", "ttl"]);
			expect(cols[0].isPrimaryKey).toBe(true);
			expect(cols[1].dataType).toBe("json");
			expect(cols[2].dataType).toBe("number");
		});

		it("returns extended columns for streams", async () => {
			const cols = await adapter.getTableColumns({ tableName: "streams", db: "0" });
			expect(cols.map((c) => c.columnName)).toEqual([
				"key",
				"length",
				"first-id",
				"last-id",
				"ttl",
			]);
		});
	});

	describe("schema-mutating operations", () => {
		const cases = [
			{
				name: "createTable",
				call: () =>
					adapter.createTable({
						db: "0",
						tableData: { tableName: "x", fields: [] } as never,
					}),
			},
			{
				name: "deleteTable",
				call: () => adapter.deleteTable({ db: "0", tableName: "strings" }),
			},
			{
				name: "addColumn",
				call: () =>
					adapter.addColumn({
						db: "0",
						tableName: "strings",
						columnName: "extra",
						columnType: "text",
					} as never),
			},
			{
				name: "deleteColumn",
				call: () =>
					adapter.deleteColumn({ db: "0", tableName: "strings", columnName: "extra" }),
			},
			{
				name: "alterColumn",
				call: () =>
					adapter.alterColumn({
						db: "0",
						tableName: "strings",
						columnName: "value",
						columnType: "text",
					} as never),
			},
			{
				name: "renameColumn",
				call: () =>
					adapter.renameColumn({
						db: "0",
						tableName: "strings",
						columnName: "value",
						newColumnName: "v",
					}),
			},
		];

		for (const { name, call } of cases) {
			it(`${name} throws 400`, async () => {
				await expect(call()).rejects.toMatchObject({ status: 400 });
			});
		}
	});
});
