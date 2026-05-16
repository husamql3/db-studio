import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = vi.hoisted(() => ({
	set: vi.fn(),
	exists: vi.fn(),
	del: vi.fn(),
	expire: vi.fn(),
	hset: vi.fn(),
	rpush: vi.fn(),
	sadd: vi.fn(),
	zadd: vi.fn(),
	xadd: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";

describe("RedisAdapter — record mutations", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRedisClient.mockResolvedValue(mockClient);
		adapter = new RedisAdapter();
	});

	describe("addRecord", () => {
		it("inserts a string with SET NX", async () => {
			mockClient.set.mockResolvedValue("OK");
			const result = await adapter.addRecord({
				db: "0",
				params: { tableName: "strings", data: { key: "foo", value: "bar" } },
			});
			expect(mockClient.set).toHaveBeenCalledWith("foo", "bar", "NX");
			expect(result).toEqual({ insertedCount: 1 });
		});

		it("applies TTL with EXPIRE when ttl is provided", async () => {
			mockClient.set.mockResolvedValue("OK");
			await adapter.addRecord({
				db: "0",
				params: { tableName: "strings", data: { key: "foo", value: "bar", ttl: 60 } },
			});
			expect(mockClient.expire).toHaveBeenCalledWith("foo", 60);
		});

		it("returns 409 if a string key already exists (SET NX returns null)", async () => {
			mockClient.set.mockResolvedValue(null);
			await expect(
				adapter.addRecord({
					db: "0",
					params: { tableName: "strings", data: { key: "foo", value: "bar" } },
				}),
			).rejects.toMatchObject({ status: 409 });
		});

		it("inserts a hash with HSET after EXISTS precheck", async () => {
			mockClient.exists.mockResolvedValue(0);
			mockClient.hset.mockResolvedValue(2);
			await adapter.addRecord({
				db: "0",
				params: {
					tableName: "hashes",
					data: { key: "user:1", value: { name: "alice", age: 30 } },
				},
			});
			expect(mockClient.hset).toHaveBeenCalledWith("user:1", "name", "alice", "age", "30");
		});

		it("rejects a hash insert when the key already exists", async () => {
			mockClient.exists.mockResolvedValue(1);
			await expect(
				adapter.addRecord({
					db: "0",
					params: {
						tableName: "hashes",
						data: { key: "user:1", value: { name: "alice" } },
					},
				}),
			).rejects.toMatchObject({ status: 409 });
		});

		it("inserts a list with RPUSH", async () => {
			mockClient.exists.mockResolvedValue(0);
			mockClient.rpush.mockResolvedValue(3);
			await adapter.addRecord({
				db: "0",
				params: { tableName: "lists", data: { key: "q", value: ["a", "b", "c"] } },
			});
			expect(mockClient.rpush).toHaveBeenCalledWith("q", "a", "b", "c");
		});

		it("inserts a set with SADD", async () => {
			mockClient.exists.mockResolvedValue(0);
			mockClient.sadd.mockResolvedValue(2);
			await adapter.addRecord({
				db: "0",
				params: { tableName: "sets", data: { key: "tags", value: ["redis", "cache"] } },
			});
			expect(mockClient.sadd).toHaveBeenCalledWith("tags", "redis", "cache");
		});

		it("inserts a zset with ZADD score/member pairs", async () => {
			mockClient.exists.mockResolvedValue(0);
			mockClient.zadd.mockResolvedValue(2);
			await adapter.addRecord({
				db: "0",
				params: {
					tableName: "zsets",
					data: {
						key: "lb",
						value: [
							{ member: "alice", score: 100 },
							{ member: "bob", score: 250 },
						],
					},
				},
			});
			expect(mockClient.zadd).toHaveBeenCalledWith("lb", 100, "alice", 250, "bob");
		});

		it("inserts a stream entry with XADD *", async () => {
			mockClient.exists.mockResolvedValue(0);
			mockClient.xadd.mockResolvedValue("1700000000-0");
			await adapter.addRecord({
				db: "0",
				params: {
					tableName: "streams",
					data: { key: "events", value: { user: "alice", action: "login" } },
				},
			});
			expect(mockClient.xadd).toHaveBeenCalledWith(
				"events",
				"*",
				"user",
				"alice",
				"action",
				"login",
			);
		});

		it("rejects an empty hash", async () => {
			mockClient.exists.mockResolvedValue(0);
			await expect(
				adapter.addRecord({
					db: "0",
					params: { tableName: "hashes", data: { key: "x", value: {} } },
				}),
			).rejects.toMatchObject({ status: 400 });
		});

		it("rejects when the 'key' column is missing", async () => {
			await expect(
				adapter.addRecord({
					db: "0",
					params: { tableName: "strings", data: { value: "bar" } },
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	describe("updateRecords", () => {
		it("replaces a list value via DEL + RPUSH (destructive update)", async () => {
			mockClient.exists.mockResolvedValue(1);
			mockClient.del.mockResolvedValue(1);
			mockClient.rpush.mockResolvedValue(2);

			const result = await adapter.updateRecords({
				db: "0",
				params: {
					tableName: "lists",
					primaryKey: "key",
					updates: [
						{
							rowData: { key: "q", value: ["x", "y", "z"] },
							columnName: "value",
							value: ["a", "b"],
						},
					],
				},
			});

			expect(mockClient.del).toHaveBeenCalledWith("q");
			expect(mockClient.rpush).toHaveBeenCalledWith("q", "a", "b");
			expect(result.updatedCount).toBe(1);
		});

		it("returns 404 when updating a string that doesn't exist (SET XX returns null)", async () => {
			mockClient.set.mockResolvedValue(null);
			await expect(
				adapter.updateRecords({
					db: "0",
					params: {
						tableName: "strings",
						primaryKey: "key",
						updates: [
							{
								rowData: { key: "missing", value: "x" },
								columnName: "value",
								value: "y",
							},
						],
					},
				}),
			).rejects.toMatchObject({ status: 404 });
		});

		it("throws 400 when attempting to update a stream", async () => {
			mockClient.exists.mockResolvedValue(1);
			await expect(
				adapter.updateRecords({
					db: "0",
					params: {
						tableName: "streams",
						primaryKey: "key",
						updates: [
							{
								rowData: { key: "events", value: {} },
								columnName: "value",
								value: {},
							},
						],
					},
				}),
			).rejects.toMatchObject({ status: 400 });
		});
	});

	describe("deleteRecords", () => {
		it("DELs all primary keys", async () => {
			mockClient.del.mockResolvedValue(3);
			const result = await adapter.deleteRecords({
				db: "0",
				tableName: "strings",
				primaryKeys: [
					{ columnName: "key", value: "a" },
					{ columnName: "key", value: "b" },
					{ columnName: "key", value: "c" },
				],
			});
			expect(mockClient.del).toHaveBeenCalledWith("a", "b", "c");
			expect(result).toEqual({ deletedCount: 3, fkViolation: false, relatedRecords: [] });
		});
	});

	describe("forceDeleteRecords", () => {
		it("delegates to deleteRecords (no FK semantics in Redis)", async () => {
			mockClient.del.mockResolvedValue(1);
			const result = await adapter.forceDeleteRecords({
				db: "0",
				tableName: "strings",
				primaryKeys: [{ columnName: "key", value: "x" }],
			});
			expect(result.deletedCount).toBe(1);
		});
	});

	describe("bulkInsertRecords", () => {
		it("inserts each record and counts successes/failures", async () => {
			mockClient.set.mockResolvedValueOnce("OK"); // first ok
			mockClient.set.mockResolvedValueOnce(null); // second conflicts
			mockClient.set.mockResolvedValueOnce("OK"); // third ok

			const result = await adapter.bulkInsertRecords({
				db: "0",
				tableName: "strings",
				records: [
					{ key: "a", value: "1" },
					{ key: "b", value: "2" },
					{ key: "c", value: "3" },
				],
			});

			expect(result.successCount).toBe(2);
			expect(result.failureCount).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors?.[0].recordIndex).toBe(1);
		});

		it("rejects empty record arrays", async () => {
			await expect(
				adapter.bulkInsertRecords({ db: "0", tableName: "strings", records: [] }),
			).rejects.toMatchObject({ status: 400 });
		});
	});
});
