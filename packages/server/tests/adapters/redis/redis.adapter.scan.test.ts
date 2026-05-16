import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = vi.hoisted(() => ({
	scan: vi.fn(),
	pipeline: vi.fn(),
	dbsize: vi.fn(),
}));

const mockPipeline = vi.hoisted(() => ({
	ttl: vi.fn(),
	get: vi.fn(),
	hgetall: vi.fn(),
	lrange: vi.fn(),
	smembers: vi.fn(),
	zrange: vi.fn(),
	xinfo: vi.fn(),
	exec: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter — getTableData (SCAN)", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRedisClient.mockResolvedValue(mockClient);
		for (const fn of Object.values(mockPipeline)) {
			if (typeof fn === "function") {
				(fn as ReturnType<typeof vi.fn>).mockReturnThis();
			}
		}
		mockClient.pipeline.mockReturnValue(mockPipeline);
		mockClient.dbsize.mockResolvedValue(42);
		adapter = new RedisAdapter();
	});

	it("rejects 'desc' direction (backward pagination not supported)", async () => {
		await expect(
			adapter.getTableData({ db: "0", tableName: "strings", direction: "desc" }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rejects sort parameters", async () => {
		await expect(
			adapter.getTableData({ db: "0", tableName: "strings", sort: "key" }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rejects filter parameters", async () => {
		await expect(
			adapter.getTableData({
				db: "0",
				tableName: "strings",
				filters: [{ columnName: "key", operator: "=", value: "x" }],
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("rejects unknown table names", async () => {
		await expect(
			adapter.getTableData({ db: "0", tableName: "ghost-table" }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("returns rows for a strings table on the first page", async () => {
		mockClient.scan.mockResolvedValueOnce(["0", ["alpha", "beta"]]);
		mockPipeline.exec
			.mockResolvedValueOnce([
				[null, 100],
				[null, -1],
			])
			.mockResolvedValueOnce([
				[null, "value-alpha"],
				[null, "value-beta"],
			]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "strings",
			limit: 50,
		});

		expect(result.data).toEqual([
			{ key: "alpha", value: "value-alpha", ttl: 100 },
			{ key: "beta", value: "value-beta", ttl: -1 },
		]);
		expect(result.meta.total).toBe(42);
		expect(result.meta.hasNextPage).toBe(false);
		expect(result.meta.hasPreviousPage).toBe(false);
		expect(result.meta.nextCursor).toBeNull();
		expect(result.meta.prevCursor).toBeNull();
	});

	it("encodes a non-zero cursor for the next page", async () => {
		mockClient.scan.mockResolvedValueOnce(["123", ["k1"]]);
		// Loop continues until limit met or cursor=0; on the second pass we hit limit
		mockClient.scan.mockResolvedValue(["456", []]);
		mockPipeline.exec
			.mockResolvedValueOnce([[null, 0]])
			.mockResolvedValueOnce([[null, "v1"]]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "strings",
			limit: 1,
		});

		expect(result.data).toHaveLength(1);
		expect(result.meta.hasNextPage).toBe(true);
		expect(result.meta.nextCursor).toEqual(expect.any(String));
	});

	it("caps the loop at 10 round-trips to prevent runaway scans", async () => {
		mockClient.scan.mockResolvedValue(["9999", []]);
		mockPipeline.exec.mockResolvedValue([]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "strings",
			limit: 50,
		});

		expect(mockClient.scan).toHaveBeenCalledTimes(10);
		expect(result.data).toEqual([]);
		expect(result.meta.hasNextPage).toBe(true);
	});

	it("rejects an opaque cursor that targets a different table", async () => {
		const wrongCursor = Buffer.from(JSON.stringify({ scanCursor: "5", type: "hashes" })).toString(
			"base64url",
		);
		await expect(
			adapter.getTableData({ db: "0", tableName: "strings", cursor: wrongCursor }),
		).rejects.toMatchObject({ status: 400 });
	});

	it("hydrates hash rows as JSON value objects", async () => {
		mockClient.scan.mockResolvedValueOnce(["0", ["user:1"]]);
		mockPipeline.exec
			.mockResolvedValueOnce([[null, -1]])
			.mockResolvedValueOnce([[null, { name: "alice", age: "30" }]]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "hashes",
			limit: 50,
		});

		expect(result.data[0]).toEqual({
			key: "user:1",
			value: { name: "alice", age: "30" },
			ttl: -1,
		});
	});

	it("hydrates list/set rows as arrays", async () => {
		mockClient.scan.mockResolvedValueOnce(["0", ["mylist"]]);
		mockPipeline.exec
			.mockResolvedValueOnce([[null, -1]])
			.mockResolvedValueOnce([[null, ["a", "b", "c"]]]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "lists",
			limit: 50,
		});

		expect(result.data[0]).toEqual({ key: "mylist", value: ["a", "b", "c"], ttl: -1 });
	});

	it("hydrates zset rows as {member, score} arrays", async () => {
		mockClient.scan.mockResolvedValueOnce(["0", ["leaderboard"]]);
		mockPipeline.exec
			.mockResolvedValueOnce([[null, -1]])
			.mockResolvedValueOnce([[null, ["alice", "100", "bob", "250"]]]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "zsets",
			limit: 50,
		});

		expect(result.data[0]).toEqual({
			key: "leaderboard",
			value: [
				{ member: "alice", score: 100 },
				{ member: "bob", score: 250 },
			],
			ttl: -1,
		});
	});

	it("summarizes streams via XINFO STREAM", async () => {
		mockClient.scan.mockResolvedValueOnce(["0", ["events"]]);
		mockPipeline.exec.mockResolvedValueOnce([[null, -1]]).mockResolvedValueOnce([
			[
				null,
				[
					"length",
					12,
					"first-entry",
					["1700000000-0", ["k", "v"]],
					"last-entry",
					["1700001000-0", ["k", "v"]],
				],
			],
		]);

		const result = await adapter.getTableData({
			db: "0",
			tableName: "streams",
			limit: 50,
		});

		expect(result.data[0]).toMatchObject({
			key: "events",
			length: 12,
			"first-id": "1700000000-0",
			"last-id": "1700001000-0",
		});
	});
});
