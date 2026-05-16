import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = vi.hoisted(() => ({
	call: vi.fn(),
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());

vi.mock("@/adapters/connections.js", () => ({
	getRedisClient: mockGetRedisClient,
	getRedisDefaultDb: vi.fn(() => 0),
}));

import { RedisAdapter } from "@/adapters/redis/redis.adapter.js";
import { tokenizeCommand } from "@/adapters/redis/redis.command-shaper.js";

describe("RedisAdapter — executeQuery", () => {
	let adapter: RedisAdapter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetRedisClient.mockResolvedValue(mockClient);
		adapter = new RedisAdapter();
	});

	it("rejects empty queries with 400", async () => {
		await expect(adapter.executeQuery({ db: "0", query: "" })).rejects.toMatchObject({
			status: 400,
		});
		await expect(adapter.executeQuery({ db: "0", query: "   " })).rejects.toMatchObject({
			status: 400,
		});
	});

	it("tokenizes a simple GET and shapes a scalar reply", async () => {
		mockClient.call.mockResolvedValue("alice");
		const result = await adapter.executeQuery({ db: "0", query: "GET user:1" });
		expect(mockClient.call).toHaveBeenCalledWith("GET", "user:1");
		expect(result.columns).toEqual(["value"]);
		expect(result.rows).toEqual([{ value: "alice" }]);
		expect(result.rowCount).toBe(1);
	});

	it("shapes HGETALL as field/value pairs", async () => {
		mockClient.call.mockResolvedValue(["name", "alice", "age", "30"]);
		const result = await adapter.executeQuery({
			db: "0",
			query: "HGETALL user:1",
		});
		expect(result.columns).toEqual(["field", "value"]);
		expect(result.rows).toEqual([
			{ field: "name", value: "alice" },
			{ field: "age", value: "30" },
		]);
	});

	it("shapes KEYS as indexed array rows", async () => {
		mockClient.call.mockResolvedValue(["foo", "bar"]);
		const result = await adapter.executeQuery({ db: "0", query: "KEYS *" });
		expect(result.columns).toEqual(["#", "value"]);
		expect(result.rows).toEqual([
			{ "#": 0, value: "foo" },
			{ "#": 1, value: "bar" },
		]);
	});

	it("shapes ZRANGE WITHSCORES as member/score pairs", async () => {
		mockClient.call.mockResolvedValue(["alice", "100", "bob", "250"]);
		const result = await adapter.executeQuery({
			db: "0",
			query: "ZRANGE lb 0 -1 WITHSCORES",
		});
		expect(result.columns).toEqual(["member", "score"]);
		expect(result.rows).toEqual([
			{ member: "alice", score: "100" },
			{ member: "bob", score: "250" },
		]);
	});

	it("shapes INFO as section/key/value rows", async () => {
		mockClient.call.mockResolvedValue(
			"# Server\r\nredis_version:7.4.0\r\n# Clients\r\nconnected_clients:3\r\n",
		);
		const result = await adapter.executeQuery({ db: "0", query: "INFO" });
		expect(result.columns).toEqual(["section", "key", "value"]);
		expect(result.rows).toEqual([
			{ section: "Server", key: "redis_version", value: "7.4.0" },
			{ section: "Clients", key: "connected_clients", value: "3" },
		]);
	});

	it("falls back to single-cell JSON for unknown commands with complex replies", async () => {
		mockClient.call.mockResolvedValue({ nested: { thing: [1, 2, 3] } });
		const result = await adapter.executeQuery({ db: "0", query: "WEIRD nested-thing" });
		expect(result.columns).toEqual(["result"]);
		expect(typeof result.rows[0].result).toBe("string");
	});

	it("surfaces Redis reply errors as error rows (not exceptions)", async () => {
		mockClient.call.mockRejectedValue(new Error("WRONGTYPE Operation against a key…"));
		const result = await adapter.executeQuery({ db: "0", query: "LRANGE foo 0 -1" });
		expect(result.columns).toEqual(["error"]);
		expect(result.error).toContain("WRONGTYPE");
	});

	it("rejects malformed quoted strings with 400", async () => {
		await expect(
			adapter.executeQuery({ db: "0", query: 'SET k "unclosed' }),
		).rejects.toMatchObject({ status: 400 });
	});
});

describe("tokenizeCommand", () => {
	it("splits whitespace-separated tokens", () => {
		expect(tokenizeCommand("GET foo")).toEqual(["GET", "foo"]);
	});

	it("preserves double-quoted strings", () => {
		expect(tokenizeCommand('SET foo "hello world"')).toEqual(["SET", "foo", "hello world"]);
	});

	it("preserves single-quoted strings", () => {
		expect(tokenizeCommand("HSET k field 'value with space'")).toEqual([
			"HSET",
			"k",
			"field",
			"value with space",
		]);
	});

	it("supports backslash-escapes inside double quotes", () => {
		expect(tokenizeCommand('SET k "she said \\"hi\\""')).toEqual([
			"SET",
			"k",
			'she said "hi"',
		]);
	});

	it("throws on unterminated quotes", () => {
		expect(() => tokenizeCommand('SET k "open')).toThrow();
	});
});
