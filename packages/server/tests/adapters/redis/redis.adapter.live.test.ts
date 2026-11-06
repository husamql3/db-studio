/**
 * The Redis adapter against a real server: what each call stores and what it reads back.
 *
 * Failure modes it covers:
 * - a grid insert of each type stores the wrong structure, drops its TTL, or overwrites a key
 *   that already exists; a bulk insert miscounts or overwrites on conflict;
 * - a grid update of a collection merges instead of replacing, or a key edit loses the value;
 * - grid rows of a type come back in the wrong shape (hash object, list array, zset pairs,
 *   stream summary), or a cursor for one type-table is accepted by another;
 * - table counts are not refreshed after a grid insert;
 * - the key browser loses binary key names, field names or values, overwrites on create,
 *   applies a write over a newer value, pages a large hash with repeats or gaps, turns
 *   infinite scores into invalid JSON, or reads streams in the wrong order;
 * - a large string downloads in wrong-sized or mis-ordered chunks;
 * - query runner replies get the wrong columns, or a reply error throws instead of a row;
 * - the database list or connection info disagrees with the server.
 *
 * It uses logical database 13 of the Redis at REDIS_TEST_URL (default redis://127.0.0.1:6379,
 * the `bun run init-db:redis` container) and flushes that database before each test. When no
 * Redis answers there, the suite is skipped.
 */
import type { AddRecordSchemaType } from "@db-studio/shared/types";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REDIS_TABLES, RedisAdapter } from "@/adapters/redis/redis.adapter.js";
import {
	closeAllConnections,
	createConnection,
	registerConnection,
} from "@/open-connections.js";

const REDIS_URL = process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6379";
const DB = "13";

const raw = new Redis(`${REDIS_URL}/${DB}`, {
	lazyConnect: true,
	maxRetriesPerRequest: 0,
	retryStrategy: () => null,
});

raw.on("error", () => {});

const available = await raw.connect().then(
	() => true,
	() => false,
);

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const encoded = (value: string) => ({ base64: b64(value), utf8: value });

describe.skipIf(!available)("RedisAdapter against a real Redis", () => {
	let adapter: RedisAdapter;

	beforeAll(() => {
		registerConnection("redis-live-test", createConnection(REDIS_URL));
	});

	afterAll(async () => {
		await raw.flushdb();
		raw.disconnect();
		await closeAllConnections();
	});

	beforeEach(async () => {
		await raw.flushdb();
		adapter = new RedisAdapter();
	});

	describe("grid records", () => {
		it("stores each type's value, with its TTL", async () => {
			const add = (tableName: string, data: AddRecordSchemaType["data"]) =>
				adapter.addRecord({ db: DB, params: { tableName, data } });

			await add("strings", { key: "s", value: "bar", ttl: 60 });
			await add("hashes", { key: "h", value: { name: "alice", age: 30 } });
			await add("lists", { key: "l", value: ["a", "b", "c"] });
			await add("sets", { key: "st", value: ["redis", "cache"] });
			await add("zsets", {
				key: "z",
				value: [
					{ member: "alice", score: 100 },
					{ member: "bob", score: 250 },
				],
			});
			await add("streams", { key: "x", value: { user: "alice", action: "login" } });

			expect(await raw.get("s")).toBe("bar");
			expect(await raw.ttl("s")).toBeGreaterThan(55);
			expect(await raw.hgetall("h")).toEqual({ name: "alice", age: "30" });
			expect(await raw.lrange("l", 0, -1)).toEqual(["a", "b", "c"]);
			expect((await raw.smembers("st")).sort()).toEqual(["cache", "redis"]);
			expect(await raw.zrange("z", "0", "-1", "WITHSCORES")).toEqual([
				"alice",
				"100",
				"bob",
				"250",
			]);
			const [[, fields]] = await raw.xrange("x", "-", "+");
			expect(fields).toEqual(["user", "alice", "action", "login"]);
			expect(await raw.ttl("h")).toBe(-1);
		});

		it("refuses to insert over an existing key and keeps its value", async () => {
			await raw.set("taken", "original");

			await expect(
				adapter.addRecord({
					db: DB,
					params: { tableName: "strings", data: { key: "taken", value: "new" } },
				}),
			).rejects.toMatchObject({ status: 409 });
			expect(await raw.get("taken")).toBe("original");
		});

		it("counts a bulk insert's conflicts without overwriting them", async () => {
			await raw.set("b", "kept");

			const result = await adapter.bulkInsertRecords({
				db: DB,
				tableName: "strings",
				records: [
					{ key: "a", value: "1" },
					{ key: "b", value: "2" },
					{ key: "c", value: "3" },
				],
			});

			expect(result).toMatchObject({ successCount: 2, failureCount: 1 });
			expect(result.errors?.map((error) => error.recordIndex)).toEqual([1]);
			expect(await raw.mget("a", "b", "c")).toEqual(["1", "kept", "3"]);
		});

		it("replaces a list's elements on update", async () => {
			await raw.rpush("q", "x", "y", "z");

			const result = await adapter.updateRecords({
				db: DB,
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

			expect(result.updatedCount).toBe(1);
			expect(await raw.lrange("q", 0, -1)).toEqual(["a", "b"]);
		});

		it("renames the key when the key column is edited, keeping the value", async () => {
			await raw.set("old", "v");

			await adapter.updateRecords({
				db: DB,
				params: {
					tableName: "strings",
					primaryKey: "key",
					updates: [{ rowData: { key: "old", value: "v" }, columnName: "key", value: "new" }],
				},
			});

			expect(await raw.exists("old")).toBe(0);
			expect(await raw.get("new")).toBe("v");
		});

		it("reads each type-table's rows in its own shape", async () => {
			await raw.set("s", "value-s", "EX", 100);
			await raw.hset("h", "name", "alice", "age", "30");
			await raw.rpush("l", "a", "b", "c");
			await raw.zadd("z", 100, "alice", 250, "bob");
			await raw.xadd("x", "1700000000-0", "k", "v");
			await raw.xadd("x", "1700001000-0", "k", "w");

			const rows = async (tableName: string) =>
				(await adapter.getTableData({ db: DB, tableName, limit: 50 })).data;

			const [strings] = await rows("strings");
			expect(strings).toMatchObject({ key: "s", value: "value-s" });
			expect(strings?.ttl).toBeGreaterThan(95);
			expect(await rows("hashes")).toEqual([
				{ key: "h", value: { name: "alice", age: "30" }, ttl: -1 },
			]);
			expect(await rows("lists")).toEqual([{ key: "l", value: ["a", "b", "c"], ttl: -1 }]);
			expect(await rows("zsets")).toEqual([
				{
					key: "z",
					value: [
						{ member: "alice", score: 100 },
						{ member: "bob", score: 250 },
					],
					ttl: -1,
				},
			]);
			expect(await rows("streams")).toMatchObject([
				{ key: "x", length: 2, "first-id": "1700000000-0", "last-id": "1700001000-0" },
			]);
		});

		it("refuses a cursor issued for another type-table", async () => {
			const wrongCursor = Buffer.from(
				JSON.stringify({ scanCursor: "5", type: "hashes" }),
			).toString("base64url");

			await expect(
				adapter.getTableData({ db: DB, tableName: "strings", cursor: wrongCursor }),
			).rejects.toMatchObject({ status: 400 });
		});

		it("lists the six type-tables and recounts after a grid insert", async () => {
			await raw.set("s1", "1");
			await raw.hset("h1", "f", "v");
			await raw.zadd("z1", 1, "m");

			const counts = async () =>
				Object.fromEntries(
					(await adapter.getTablesList(DB)).map((table) => [table.tableName, table.rowCount]),
				);

			expect((await adapter.getTablesList(DB)).map((table) => table.tableName)).toEqual([
				...REDIS_TABLES,
			]);
			expect(await counts()).toMatchObject({ strings: 1, hashes: 1, zsets: 1, lists: 0 });

			await adapter.addRecord({
				db: DB,
				params: { tableName: "strings", data: { key: "s2", value: "2" } },
			});
			expect((await counts()).strings).toBe(2);
		});
	});

	describe("key browser", () => {
		it("creates a key with its TTL and refuses to create it again", async () => {
			const create = (value: string) =>
				adapter.createKey({
					db: DB,
					key: encoded("greeting"),
					type: "string",
					value: { kind: "string", value: encoded(value) },
					ttlMs: 60_000,
				});

			expect(await create("hello")).toMatchObject({
				key: encoded("greeting"),
				deleted: false,
			});
			await expect(create("again")).rejects.toMatchObject({ status: 409 });
			expect(await raw.get("greeting")).toBe("hello");
			expect(await raw.pttl("greeting")).toBeGreaterThan(55_000);
		});

		it("refuses a write made against a value that changed since it was read", async () => {
			await raw.set("greeting", "hello");

			const { revision } = await adapter.getKeyDetails({
				db: DB,
				key: b64("greeting"),
				limit: 100,
				full: false,
				direction: "forward",
			});

			await raw.set("greeting", "changed elsewhere");

			await expect(
				adapter.applyKeyAction({
					db: DB,
					key: b64("greeting"),
					expectedRevision: revision,
					force: false,
					operation: { action: "setString", value: encoded("hi") },
				}),
			).rejects.toMatchObject({ status: 409 });
			expect(await raw.get("greeting")).toBe("changed elsewhere");
		});

		it("lists binary key names intact, with type and TTL", async () => {
			const binary = Buffer.from([0xff, 0x00, 0x61]);
			await raw.hset("user:1", "name", "alice");
			await raw.pexpire("user:1", 60_000);
			await raw.set(binary, "x");

			const result = await adapter.scanKeys({ db: DB, limit: 50, exactPattern: false });
			const byKey = new Map(result.keys.map((item) => [item.key.base64, item]));

			expect(result.keys).toHaveLength(2);
			expect(byKey.get(b64("user:1"))).toMatchObject({ key: encoded("user:1"), type: "hash" });
			expect(byKey.get(b64("user:1"))?.ttlMs).toBeGreaterThan(55_000);
			expect(byKey.get(b64(binary))).toMatchObject({
				key: { base64: "_wBh" },
				type: "string",
				ttlMs: -1,
			});
			expect(result.hasMore).toBe(false);
		});

		it("reads a string with its length, TTL and revision", async () => {
			await raw.set("session:abc", "active", "PX", 3_600_000);

			const result = await adapter.getKeyDetails({
				db: DB,
				key: b64("session:abc"),
				limit: 100,
				full: false,
				direction: "forward",
			});

			expect(result).toMatchObject({
				key: encoded("session:abc"),
				type: "string",
				length: 6,
				value: { kind: "string", value: encoded("active"), truncated: false },
				hasMore: false,
			});
			expect(result.ttlMs).toBeGreaterThan(3_500_000);
			expect(result.revision).toMatch(/^[A-Za-z0-9_-]{40,}$/);
		});

		it("downloads a large binary string in bounded chunks that reassemble it", async () => {
			const original = Buffer.alloc(1_500_000);

			for (let i = 0; i < original.length; i++) original[i] = (i * 7) % 256;
			await raw.set("binary", original);

			const first = await adapter.getStringChunk({
				db: DB,
				key: b64("binary"),
				offset: 0,
				limit: 1_048_576,
			});

			expect(first).toMatchObject({ length: 1_500_000, nextOffset: 1_048_576, hasMore: true });

			const second = await adapter.getStringChunk({
				db: DB,
				key: b64("binary"),
				offset: 1_048_576,
				limit: 1_048_576,
			});

			expect(second).toMatchObject({ nextOffset: null, hasMore: false });
			expect(
				Buffer.concat([
					Buffer.from(first.chunk.base64, "base64url"),
					Buffer.from(second.chunk.base64, "base64url"),
				]).equals(original),
			).toBe(true);
		});

		it("pages a large hash with every field exactly once, binary fields intact", async () => {
			// More fields than the default hash-max-listpack-entries (512), so HSCAN pages.
			const fields = Array.from({ length: 1000 }, (_, i) => `field-${i}`);
			await raw.hset("profile", ...fields.flatMap((field) => [field, `v-${field}`]));
			await raw.hset("profile", Buffer.from([0xff]), Buffer.from([0x00]));

			const seen: string[] = [];
			let cursor: string | undefined;
			let pages = 0;

			do {
				const page = await adapter.getKeyDetails({
					db: DB,
					key: b64("profile"),
					limit: 100,
					full: false,
					direction: "forward",
					cursor,
				});

				if (page.value?.kind !== "hash") throw new Error(`not a hash: ${page.value?.kind}`);

				for (const { field, value } of page.value.entries) {
					seen.push(field.base64);

					if (field.utf8 && value.utf8 !== `v-${field.utf8}`) {
						throw new Error(`${field.utf8} came back as ${value.utf8}`);
					}
				}

				cursor = page.nextCursor ?? undefined;
				pages++;
			} while (cursor);

			expect(pages).toBeGreaterThan(1);
			expect(seen.toSorted()).toEqual([...fields.map(b64), "_w"].toSorted());
		});

		it("pages a list by stable indexes", async () => {
			await raw.rpush("queue", "one", "two", "three");

			const first = await adapter.getKeyDetails({
				db: DB,
				key: b64("queue"),
				limit: 2,
				full: false,
				direction: "forward",
			});

			const second = await adapter.getKeyDetails({
				db: DB,
				key: b64("queue"),
				limit: 2,
				full: false,
				direction: "forward",
				cursor: first.nextCursor ?? undefined,
			});

			expect(first.value).toEqual({
				kind: "list",
				entries: [
					{ index: 0, value: encoded("one") },
					{ index: 1, value: encoded("two") },
				],
			});
			expect(first.hasMore).toBe(true);
			expect(second.value).toEqual({
				kind: "list",
				entries: [{ index: 2, value: encoded("three") }],
			});
			expect(second.hasMore).toBe(false);
		});

		it("reads set members and sorted-set scores, infinite ones as strings", async () => {
			await raw.sadd("tags", "blue", "green");
			await raw.zadd(
				"scores",
				"-inf",
				"minimum",
				98,
				"bob",
				125.5,
				"alice",
				"+inf",
				"maximum",
			);

			const details = (key: string) =>
				adapter.getKeyDetails({
					db: DB,
					key: b64(key),
					limit: 100,
					full: false,
					direction: "forward",
				});

			const tags = await details("tags");

			if (tags.value?.kind !== "set") throw new Error("tags is not a set");
			expect(tags.value.members.map((member) => member.utf8).sort()).toEqual([
				"blue",
				"green",
			]);

			const scores = await details("scores");
			expect(scores.value).toEqual({
				kind: "zset",
				entries: [
					{ member: encoded("minimum"), score: "-inf" },
					{ member: encoded("bob"), score: 98 },
					{ member: encoded("alice"), score: 125.5 },
					{ member: encoded("maximum"), score: "inf" },
				],
			});
		});

		it("reads stream entries oldest-first forward and newest-first backward", async () => {
			await raw.xadd("events", "1700000000-0", "user", "alice");
			await raw.xadd("events", "1700000001-0", "event", "latest");

			const ids = async (direction: "forward" | "backward") => {
				const { value } = await adapter.getKeyDetails({
					db: DB,
					key: b64("events"),
					limit: 100,
					full: false,
					direction,
				});

				if (value?.kind !== "stream") throw new Error("events is not a stream");

				return value.entries;
			};

			expect(await ids("forward")).toEqual([
				{ id: "1700000000-0", fields: [{ field: encoded("user"), value: encoded("alice") }] },
				{
					id: "1700000001-0",
					fields: [{ field: encoded("event"), value: encoded("latest") }],
				},
			]);
			expect((await ids("backward")).map((entry) => entry.id)).toEqual([
				"1700000001-0",
				"1700000000-0",
			]);
		});
	});

	describe("query runner", () => {
		const run = (query: string) => adapter.executeQuery({ db: DB, query });

		it("shapes each reply kind into its own columns", async () => {
			await run('SET greeting "hello world"');
			await run("HSET user:1 name alice age 30");

			expect(await run("GET greeting")).toMatchObject({
				columns: ["value"],
				rows: [{ value: "hello world" }],
				rowCount: 1,
			});
			expect(await run("HGETALL user:1")).toMatchObject({
				columns: ["field", "value"],
				rows: [
					{ field: "name", value: "alice" },
					{ field: "age", value: "30" },
				],
			});
			expect(await run("KEYS greet*")).toMatchObject({
				columns: ["#", "value"],
				rows: [{ "#": 0, value: "greeting" }],
			});

			const info = await run("INFO server");
			expect(info.columns).toEqual(["section", "key", "value"]);
			expect(info.rows).toContainEqual({
				section: "Server",
				key: "redis_version",
				value: (await raw.info("server")).match(/redis_version:(\S+)/)?.[1],
			});
		});

		it("answers a nested reply of an unlisted command as one JSON cell", async () => {
			const result = await run("COMMAND INFO get");

			expect(result.columns).toEqual(["result"]);
			expect(JSON.stringify(JSON.parse(String(result.rows[0]?.result)))).toContain('"get"');
		});

		it("answers a Redis reply error as an error row", async () => {
			await raw.set("plain", "x");

			const result = await run("LRANGE plain 0 -1");

			expect(result.columns).toEqual(["error"]);
			expect(result.error).toContain("WRONGTYPE");
		});
	});

	describe("databases", () => {
		it("lists every logical database with its key count", async () => {
			await raw.set("a", "1");
			await raw.set("b", "2");
			const [, configured] = await raw.config("GET", "databases");

			const list = await adapter.getDatabasesList();

			expect(list).toHaveLength(Number(configured));
			expect(list[13]).toEqual({ name: "13", size: "2 keys", owner: "n/a", encoding: "n/a" });
		});

		it("reports the server's address, version and connection counts", async () => {
			const server = await raw.info("server");
			const { hostname, port } = new URL(REDIS_URL);

			const info = await adapter.getDatabaseConnectionInfo();

			expect(info).toMatchObject({
				host: hostname,
				port: Number(port || 6379),
				version: server.match(/redis_version:(\S+)/)?.[1],
			});
			expect(info.active_connections).toBeGreaterThan(0);
			expect(info.max_connections).toBeGreaterThan(0);
		});
	});
});
