import { createHash, randomBytes } from "node:crypto";
import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	CellValue,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateKeySchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteKeyQuerySchemaType,
	DeleteKeyResultSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
	KeyActionSchemaType,
	KeyDetailsQuerySchemaType,
	KeyDetailsResultSchemaType,
	KeyRawQuerySchemaType,
	KeyRawResultSchemaType,
	KeyScanQuerySchemaType,
	KeyScanResultSchemaType,
	KeyWriteResultSchemaType,
	RedisKeyTypeSchemaType,
	RenameColumnParamsSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import { HTTPException } from "hono/http-exception";
import type { Redis } from "ioredis";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getRedisClient, getRedisDefaultDb } from "@/adapters/connections.js";
import type { IKeyValueAdapter } from "@/adapters/key-value-adapter.interface.js";
import { shapeReply, tokenizeCommand } from "./redis.command-shaper.js";

// ---------------------------------------------------------------------------
// Constants and types
// ---------------------------------------------------------------------------

export const REDIS_TABLES = [
	"strings",
	"hashes",
	"lists",
	"sets",
	"zsets",
	"streams",
] as const;
export type RedisTable = (typeof REDIS_TABLES)[number];

const TABLE_TO_REDIS_TYPE: Record<RedisTable, string> = {
	strings: "string",
	hashes: "hash",
	lists: "list",
	sets: "set",
	zsets: "zset",
	streams: "stream",
};

const SCHEMA_MUTATION_MESSAGE =
	"Schema is fixed for Redis tables; this operation is not supported";
const SORT_UNSUPPORTED_MESSAGE = "Sorting is not supported for Redis tables";
const FILTER_UNSUPPORTED_MESSAGE = "Filtering is not supported for Redis tables";
const PREV_UNSUPPORTED_MESSAGE =
	"Backward pagination is not supported for Redis tables (SCAN is forward-only)";
const SCAN_ROUND_TRIP_CAP = 10;
const COUNT_CACHE_TTL_MS = 30_000;
const COUNT_SCAN_CEILING = 10_000;
const MAX_STRING_PREVIEW_BYTES = 256 * 1024;
const MAX_STRING_FULL_BYTES = 8 * 1024 * 1024;

const isRedisTable = (name: string): name is RedisTable =>
	(REDIS_TABLES as readonly string[]).includes(name);

const assertRedisTable = (tableName: string): RedisTable => {
	if (!isRedisTable(tableName)) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist in Redis. Valid tables: ${REDIS_TABLES.join(", ")}`,
		});
	}
	return tableName;
};

const parseDbIndex = (db: string): number => {
	if (db === "") return getRedisDefaultDb();
	const parsed = Number.parseInt(db, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new HTTPException(400, {
			message: `Invalid Redis database index: "${db}". Expected a non-negative integer.`,
		});
	}
	return parsed;
};

interface ScanCursorEnvelope {
	scanCursor: string;
	type: RedisTable;
}

interface KeyBrowserCursorEnvelope {
	scanCursor: string;
	search?: string;
	exactPattern: boolean;
	type?: RedisKeyTypeSchemaType;
	pending?: string[];
}

interface KeyDetailsCursorEnvelope {
	key: string;
	type: RedisKeyTypeSchemaType;
	cursor: string;
	direction: "forward" | "backward";
}

const encodeKeyBrowserCursor = (env: KeyBrowserCursorEnvelope): string =>
	Buffer.from(JSON.stringify(env)).toString("base64url");

const decodeKeyBrowserCursor = (cursor: string): KeyBrowserCursorEnvelope | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
	} catch {
		return null;
	}
};

const encodeKeyDetailsCursor = (env: KeyDetailsCursorEnvelope): string =>
	Buffer.from(JSON.stringify(env)).toString("base64url");

const decodeKeyDetailsCursor = (cursor: string): KeyDetailsCursorEnvelope | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
	} catch {
		return null;
	}
};

const encodeBinaryValue = (value: Buffer): { base64: string; utf8?: string } => {
	const utf8 = value.toString("utf8");
	return Buffer.from(utf8, "utf8").equals(value)
		? { base64: value.toString("base64url"), utf8 }
		: { base64: value.toString("base64url") };
};

const escapeRedisGlob = (value: string): string => value.replaceAll(/[\\*?[\]]/g, "\\$&");

const normalizeRedisKeyType = (value: unknown): RedisKeyTypeSchemaType => {
	const type = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
	return (["string", "hash", "list", "set", "zset", "stream"] as const).includes(
		type as Exclude<RedisKeyTypeSchemaType, "unknown">,
	)
		? (type as RedisKeyTypeSchemaType)
		: "unknown";
};

const decodeBinaryValue = (value: string): Buffer => Buffer.from(value, "base64url");
const decodeKeyParam = (value: string): Buffer =>
	value === "-" ? Buffer.alloc(0) : decodeBinaryValue(value);

const revisionForDump = (dump: Buffer): string =>
	createHash("sha256").update(dump).digest("base64url");

const conflict = (): HTTPException =>
	new HTTPException(409, {
		message: "This key changed since it was loaded. Reload it or explicitly overwrite.",
	});

const isUnavailableCommandError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return /(NOPERM|unknown command|not allowed|unsupported)/i.test(message);
};

const assertKeyType = (
	actual: RedisKeyTypeSchemaType,
	expected: Exclude<RedisKeyTypeSchemaType, "unknown">,
): void => {
	if (actual !== expected) {
		throw new HTTPException(400, {
			message: `This operation requires a ${expected} key, but the key is ${actual}.`,
		});
	}
};

const assertTransactionSucceeded = (result: unknown): void => {
	if (result === null) throw conflict();
	if (!Array.isArray(result)) return;
	const failed = result.find(
		(entry): entry is [Error, unknown] => Array.isArray(entry) && entry[0] instanceof Error,
	);
	if (failed) {
		throw new HTTPException(400, { message: failed[0].message });
	}
};

const encodeScanCursor = (env: ScanCursorEnvelope): string =>
	Buffer.from(JSON.stringify(env)).toString("base64url");

const decodeScanCursor = (cursor: string): ScanCursorEnvelope | null => {
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
	} catch {
		return null;
	}
};

interface CountCacheEntry {
	timestamp: number;
	counts: Record<RedisTable, number>;
}

// ---------------------------------------------------------------------------
// Per-type column definitions
// ---------------------------------------------------------------------------

const columnInfo = (
	overrides: Partial<ColumnInfoSchemaType> &
		Pick<ColumnInfoSchemaType, "columnName" | "dataType">,
): ColumnInfoSchemaType => ({
	columnName: overrides.columnName,
	dataType: overrides.dataType,
	dataTypeLabel:
		overrides.dataTypeLabel ??
		(overrides.dataType === "number"
			? "int"
			: overrides.dataType === "json"
				? "json"
				: overrides.dataType === "array"
					? "array"
					: "text"),
	isNullable: overrides.isNullable ?? false,
	columnDefault: overrides.columnDefault ?? null,
	isPrimaryKey: overrides.isPrimaryKey ?? false,
	isForeignKey: false,
	referencedTable: null,
	referencedColumn: null,
	enumValues: null,
});

const KEY_COL = columnInfo({ columnName: "key", dataType: "text", isPrimaryKey: true });
const TTL_COL = columnInfo({ columnName: "ttl", dataType: "number", isNullable: true });

const TABLE_COLUMNS: Record<RedisTable, ColumnInfoSchemaType[]> = {
	strings: [
		KEY_COL,
		columnInfo({ columnName: "value", dataType: "text", isNullable: true }),
		TTL_COL,
	],
	hashes: [KEY_COL, columnInfo({ columnName: "value", dataType: "json" }), TTL_COL],
	lists: [KEY_COL, columnInfo({ columnName: "value", dataType: "array" }), TTL_COL],
	sets: [KEY_COL, columnInfo({ columnName: "value", dataType: "array" }), TTL_COL],
	zsets: [KEY_COL, columnInfo({ columnName: "value", dataType: "json" }), TTL_COL],
	streams: [
		KEY_COL,
		columnInfo({ columnName: "length", dataType: "number" }),
		columnInfo({ columnName: "first-id", dataType: "text", isNullable: true }),
		columnInfo({ columnName: "last-id", dataType: "text", isNullable: true }),
		TTL_COL,
	],
};

const SCHEMA_DESCRIPTIONS: Record<RedisTable, string> = {
	strings: `-- Redis string keys
-- Columns: key (text, PK), value (text), ttl (number, seconds; -1 = no TTL, -2 = missing)
-- Backed by: GET / SET / EXPIRE`,
	hashes: `-- Redis hash keys
-- Columns: key (text, PK), value (json: {field: value, ...}), ttl (number)
-- Backed by: HGETALL / HSET / EXPIRE`,
	lists: `-- Redis list keys
-- Columns: key (text, PK), value (array of elements), ttl (number)
-- Backed by: LRANGE / RPUSH / EXPIRE`,
	sets: `-- Redis set keys
-- Columns: key (text, PK), value (array of members), ttl (number)
-- Backed by: SMEMBERS / SADD / EXPIRE`,
	zsets: `-- Redis sorted set keys
-- Columns: key (text, PK), value (json: [{member, score}, ...]), ttl (number)
-- Backed by: ZRANGE WITHSCORES / ZADD / EXPIRE`,
	streams: `-- Redis stream keys
-- Columns: key (text, PK), length (number), first-id (text), last-id (text), ttl (number)
-- Backed by: XINFO STREAM / XADD / EXPIRE (read-only — streams are append-only)`,
};

// ---------------------------------------------------------------------------
// RedisAdapter
// ---------------------------------------------------------------------------

export class RedisAdapter extends BaseAdapter implements IKeyValueAdapter {
	private countCache: Map<number, CountCacheEntry> = new Map();

	// -----------------------------------------------------------------------
	// Abstract stubs — Redis does not use SQL
	// -----------------------------------------------------------------------

	protected runQuery<T>(): Promise<T> {
		throw new HTTPException(501, { message: "runQuery is not supported for Redis" });
	}

	protected buildTableDataQuery(_params: GetTableDataParams): QueryBundle {
		throw new HTTPException(501, {
			message: "buildTableDataQuery is not supported for Redis",
		});
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return rawRows.map((row) => this.normalizeRow(row as Record<string, unknown>));
	}

	protected buildCursors(): { nextCursor: string | null; prevCursor: string | null } {
		return { nextCursor: null, prevCursor: null };
	}

	protected quoteIdentifier(name: string): string {
		return name;
	}

	mapToUniversalType(nativeType: string): DataTypes {
		switch (nativeType.toLowerCase()) {
			case "string":
				return "text";
			case "hash":
				return "json";
			case "list":
			case "set":
				return "array";
			case "zset":
			case "stream":
				return "json";
			case "integer":
			case "number":
			case "ttl":
				return "number";
			default:
				return "text";
		}
	}

	mapFromUniversalType(_universalType: string): string {
		return "string";
	}

	async scanKeys(params: KeyScanQuerySchemaType): Promise<KeyScanResultSchemaType> {
		try {
			const { db, limit, search, exactPattern, type, cursor } = params;
			const dbIndex = parseDbIndex(db);
			const client = await getRedisClient(dbIndex);
			let scanCursor = "0";
			let pending: Buffer[] = [];

			if (cursor) {
				const decoded = decodeKeyBrowserCursor(cursor);
				if (
					!decoded ||
					decoded.search !== search ||
					decoded.exactPattern !== exactPattern ||
					decoded.type !== type
				) {
					throw new HTTPException(400, { message: "Invalid or stale key scan cursor" });
				}
				scanCursor = decoded.scanCursor;
				pending = decoded.pending?.map(decodeBinaryValue) ?? [];
			}

			const pattern = search ? (exactPattern ? search : `*${escapeRedisGlob(search)}*`) : "*";
			const scanArgs: Array<string | number> = [
				scanCursor,
				"MATCH",
				pattern,
				"COUNT",
				Math.max(limit * 2, 100),
			];
			if (type) scanArgs.push("TYPE", type);

			let nextScanCursor = scanCursor;
			if ((pending.length < limit && scanCursor !== "0") || !cursor) {
				const [nextRaw, keys] = (await (
					client.scanBuffer as unknown as (
						...args: Array<string | number>
					) => Promise<[Buffer | string, Buffer[]]>
				)(...scanArgs)) as [Buffer | string, Buffer[]];
				nextScanCursor = Buffer.isBuffer(nextRaw) ? nextRaw.toString("utf8") : nextRaw;
				pending.push(...keys);
			}
			const pageKeys = pending.slice(0, limit);
			const remaining = pending.slice(limit);
			const pipeline = client.pipeline();
			for (const key of pageKeys) {
				pipeline.call("TYPE", key);
				pipeline.pttl(key);
				pipeline.call("MEMORY", "USAGE", key);
			}
			const metadata = (await pipeline.exec()) ?? [];

			return {
				keys: pageKeys.map((key, index) => {
					const offset = index * 3;
					const memory = metadata[offset + 2]?.[1];
					return {
						key: encodeBinaryValue(key),
						type: normalizeRedisKeyType(metadata[offset]?.[1]),
						ttlMs: Number(metadata[offset + 1]?.[1] ?? -2),
						memoryBytes: memory === null || memory === undefined ? null : Number(memory),
					};
				}),
				nextCursor:
					nextScanCursor === "0" && remaining.length === 0
						? null
						: encodeKeyBrowserCursor({
								scanCursor: nextScanCursor,
								search,
								exactPattern,
								type,
								pending: remaining.map((value) => value.toString("base64url")),
							}),
				hasMore: nextScanCursor !== "0" || remaining.length > 0,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getKeyDetails(
		params: KeyDetailsQuerySchemaType & { key: string },
	): Promise<KeyDetailsResultSchemaType> {
		try {
			const { db, key: encodedKey, cursor, limit, full, direction } = params;
			const key = decodeKeyParam(encodedKey);
			const client = await getRedisClient(parseDbIndex(db));
			const [typeRaw, ttlMs, memoryRaw, dumpRaw] = await Promise.all([
				client.callBuffer("TYPE", key),
				client.pttl(key),
				client.call("MEMORY", "USAGE", key).catch(() => null),
				client.callBuffer("DUMP", key),
			]);
			const dump = dumpRaw as Buffer | null;
			if (!dump) {
				throw new HTTPException(404, { message: "Redis key no longer exists" });
			}

			const type = normalizeRedisKeyType(typeRaw);
			const summary = {
				key: encodeBinaryValue(key),
				type,
				ttlMs: Number(ttlMs),
				memoryBytes: memoryRaw === null ? null : Number(memoryRaw),
				revision: revisionForDump(dump),
			};
			const decodedCursor = cursor ? decodeKeyDetailsCursor(cursor) : null;
			if (
				cursor &&
				(!decodedCursor ||
					decodedCursor.key !== encodedKey ||
					decodedCursor.type !== type ||
					decodedCursor.direction !== direction)
			) {
				throw new HTTPException(400, { message: "Invalid or stale key details cursor" });
			}

			if (type === "string") {
				const length = await client.strlen(key);
				const readLimit = full ? MAX_STRING_FULL_BYTES : MAX_STRING_PREVIEW_BYTES;
				const value = await client.getrangeBuffer(key, 0, readLimit - 1);
				return {
					...summary,
					length,
					value: {
						kind: "string",
						value: encodeBinaryValue(value),
						truncated: length > readLimit,
					},
					nextCursor: null,
					hasMore: false,
				};
			}

			if (type === "hash") {
				const [length, scanResult] = await Promise.all([
					client.hlen(key),
					client.hscanBuffer(key, decodedCursor?.cursor ?? "0", "COUNT", String(limit)),
				]);
				const [nextRaw, values] = scanResult as [Buffer | string, Buffer[]];
				const next = Buffer.isBuffer(nextRaw) ? nextRaw.toString("utf8") : nextRaw;
				const entries = [];
				for (let index = 0; index < values.length; index += 2) {
					entries.push({
						field: encodeBinaryValue(values[index]),
						value: encodeBinaryValue(values[index + 1]),
					});
				}
				return {
					...summary,
					length,
					value: { kind: "hash", entries },
					nextCursor:
						next === "0"
							? null
							: encodeKeyDetailsCursor({ key: encodedKey, type, cursor: next, direction }),
					hasMore: next !== "0",
				};
			}

			if (type === "list") {
				const offset = Number.parseInt(decodedCursor?.cursor ?? "0", 10);
				const length = await client.llen(key);
				const values = await client.lrangeBuffer(key, offset, offset + limit - 1);
				const nextOffset = offset + values.length;
				const hasMore = nextOffset < length;
				return {
					...summary,
					length,
					value: {
						kind: "list",
						entries: values.map((value, index) => ({
							index: offset + index,
							value: encodeBinaryValue(value),
						})),
					},
					nextCursor: hasMore
						? encodeKeyDetailsCursor({
								key: encodedKey,
								type,
								cursor: String(nextOffset),
								direction,
							})
						: null,
					hasMore,
				};
			}

			if (type === "set") {
				const [length, scanResult] = await Promise.all([
					client.scard(key),
					client.sscanBuffer(key, decodedCursor?.cursor ?? "0", "COUNT", String(limit)),
				]);
				const [nextRaw, members] = scanResult as [Buffer | string, Buffer[]];
				const next = Buffer.isBuffer(nextRaw) ? nextRaw.toString("utf8") : nextRaw;
				return {
					...summary,
					length,
					value: { kind: "set", members: members.map(encodeBinaryValue) },
					nextCursor:
						next === "0"
							? null
							: encodeKeyDetailsCursor({ key: encodedKey, type, cursor: next, direction }),
					hasMore: next !== "0",
				};
			}

			if (type === "zset") {
				const [length, scanResult] = await Promise.all([
					client.zcard(key),
					client.zscanBuffer(key, decodedCursor?.cursor ?? "0", "COUNT", String(limit)),
				]);
				const [nextRaw, values] = scanResult as [Buffer | string, Buffer[]];
				const next = Buffer.isBuffer(nextRaw) ? nextRaw.toString("utf8") : nextRaw;
				const entries = [];
				for (let index = 0; index < values.length; index += 2) {
					entries.push({
						member: encodeBinaryValue(values[index]),
						score: Number(values[index + 1].toString("utf8")),
					});
				}
				return {
					...summary,
					length,
					value: { kind: "zset", entries },
					nextCursor:
						next === "0"
							? null
							: encodeKeyDetailsCursor({ key: encodedKey, type, cursor: next, direction }),
					hasMore: next !== "0",
				};
			}

			if (type === "stream") {
				const boundary = decodedCursor?.cursor ?? (direction === "forward" ? "-" : "+");
				const [length, rawEntries] = await Promise.all([
					client.xlen(key),
					direction === "forward"
						? client.xrangeBuffer(key, boundary, "+", "COUNT", limit + 1)
						: client.xrevrangeBuffer(key, boundary, "-", "COUNT", limit + 1),
				]);
				const hasMore = rawEntries.length > limit;
				const page = rawEntries.slice(0, limit) as Array<[Buffer, Buffer[]]>;
				const entries = page.map(([id, values]) => {
					const fields = [];
					for (let index = 0; index < values.length; index += 2) {
						fields.push({
							field: encodeBinaryValue(values[index]),
							value: encodeBinaryValue(values[index + 1]),
						});
					}
					return { id: id.toString("utf8"), fields };
				});
				const lastId = entries.at(-1)?.id;
				return {
					...summary,
					length,
					value: { kind: "stream", entries },
					nextCursor:
						hasMore && lastId
							? encodeKeyDetailsCursor({
									key: encodedKey,
									type,
									cursor: `(${lastId}`,
									direction,
								})
							: null,
					hasMore,
				};
			}

			return {
				...summary,
				length: null,
				value: { kind: "unknown" },
				nextCursor: null,
				hasMore: false,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async getStringChunk(
		params: KeyRawQuerySchemaType & { key: string },
	): Promise<KeyRawResultSchemaType> {
		try {
			const client = await getRedisClient(parseDbIndex(params.db));
			const key = decodeKeyParam(params.key);
			const type = normalizeRedisKeyType(await client.callBuffer("TYPE", key));
			if (type === "unknown") {
				throw new HTTPException(404, { message: "Redis key no longer exists" });
			}
			assertKeyType(type, "string");
			if (params.expectedRevision) {
				const dump = (await client.callBuffer("DUMP", key)) as Buffer | null;
				if (!dump || revisionForDump(dump) !== params.expectedRevision) throw conflict();
			}
			const length = await client.strlen(key);
			const chunk = await client.getrangeBuffer(
				key,
				params.offset,
				params.offset + params.limit - 1,
			);
			const next = params.offset + chunk.length;
			return {
				chunk: encodeBinaryValue(chunk),
				length,
				nextOffset: next < length ? next : null,
				hasMore: next < length,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	async createKey(
		params: CreateKeySchemaType & { db: string },
	): Promise<KeyWriteResultSchemaType> {
		const client = await getRedisClient(parseDbIndex(params.db));
		const key = decodeBinaryValue(params.key.base64);
		try {
			await client.watch(key);
			if ((await client.exists(key)) !== 0) {
				throw new HTTPException(409, {
					message: "A Redis key with this name already exists.",
				});
			}
			if (params.type !== params.value.kind) {
				throw new HTTPException(400, {
					message: "The initial value does not match the selected Redis key type.",
				});
			}

			const transaction = client.multi();
			switch (params.value.kind) {
				case "string":
					transaction.set(key, decodeBinaryValue(params.value.value.base64));
					break;
				case "hash":
					transaction.hset(
						key,
						...params.value.entries.flatMap(({ field, value }) => [
							decodeBinaryValue(field.base64),
							decodeBinaryValue(value.base64),
						]),
					);
					break;
				case "list":
					transaction.rpush(
						key,
						...params.value.entries.map((value) => decodeBinaryValue(value.base64)),
					);
					break;
				case "set":
					transaction.sadd(
						key,
						...params.value.members.map((member) => decodeBinaryValue(member.base64)),
					);
					break;
				case "zset":
					transaction.zadd(
						key,
						...params.value.entries.flatMap(({ member, score }) => [
							score,
							decodeBinaryValue(member.base64),
						]),
					);
					break;
				case "stream":
					transaction.xadd(
						key,
						params.value.id,
						...params.value.fields.flatMap(({ field, value }) => [
							decodeBinaryValue(field.base64),
							decodeBinaryValue(value.base64),
						]),
					);
					break;
			}
			if (params.ttlMs !== null) transaction.pexpire(key, params.ttlMs);
			assertTransactionSucceeded(await transaction.exec());

			const dump = (await client.callBuffer("DUMP", key)) as Buffer | null;
			if (!dump) throw conflict();
			return {
				key: encodeBinaryValue(key),
				revision: revisionForDump(dump),
				deleted: false,
			};
		} catch (e) {
			throw this.wrapError(e);
		} finally {
			await client.unwatch().catch(() => undefined);
		}
	}

	async applyKeyAction(
		params: KeyActionSchemaType & { db: string; key: string },
	): Promise<KeyWriteResultSchemaType> {
		const client = await getRedisClient(parseDbIndex(params.db));
		const key = decodeKeyParam(params.key);
		const newKey =
			params.operation.action === "rename"
				? decodeBinaryValue(params.operation.newKey.base64)
				: null;
		try {
			if (newKey && !newKey.equals(key)) await client.watch(key, newKey);
			else await client.watch(key);

			const [dumpRaw, typeRaw, ttlMs] = await Promise.all([
				client.callBuffer("DUMP", key),
				client.callBuffer("TYPE", key),
				client.pttl(key),
			]);
			const dump = dumpRaw as Buffer | null;
			if (!dump) throw new HTTPException(404, { message: "Redis key no longer exists" });
			if (!params.force && revisionForDump(dump) !== params.expectedRevision) throw conflict();
			const type = normalizeRedisKeyType(typeRaw);
			if (newKey && !newKey.equals(key) && (await client.exists(newKey)) !== 0) {
				throw new HTTPException(409, {
					message: "A Redis key with the new name already exists.",
				});
			}

			const transaction = client.multi();
			switch (params.operation.action) {
				case "rename":
					if (!newKey || newKey.equals(key)) {
						return {
							key: encodeBinaryValue(key),
							revision: revisionForDump(dump),
							deleted: false,
						};
					}
					transaction.rename(key, newKey);
					break;
				case "setTtl":
					if (params.operation.ttlMs === null) transaction.persist(key);
					else transaction.pexpire(key, params.operation.ttlMs);
					break;
				case "setString":
					assertKeyType(type, "string");
					transaction.set(key, decodeBinaryValue(params.operation.value.base64));
					if (ttlMs > 0) transaction.pexpire(key, ttlMs);
					break;
				case "upsertHash":
					assertKeyType(type, "hash");
					transaction.hset(
						key,
						decodeBinaryValue(params.operation.field.base64),
						decodeBinaryValue(params.operation.value.base64),
					);
					break;
				case "deleteHash":
					assertKeyType(type, "hash");
					transaction.hdel(key, decodeBinaryValue(params.operation.field.base64));
					break;
				case "pushList":
					assertKeyType(type, "list");
					if (params.operation.side === "left") {
						transaction.lpush(key, decodeBinaryValue(params.operation.value.base64));
					} else {
						transaction.rpush(key, decodeBinaryValue(params.operation.value.base64));
					}
					break;
				case "setList":
					assertKeyType(type, "list");
					transaction.lset(
						key,
						params.operation.index,
						decodeBinaryValue(params.operation.value.base64),
					);
					break;
				case "deleteList": {
					assertKeyType(type, "list");
					const marker = Buffer.concat([
						Buffer.from("db-studio:list-delete:"),
						randomBytes(32),
					]);
					transaction.lset(key, params.operation.index, marker);
					transaction.lrem(key, 1, marker);
					break;
				}
				case "addSet":
					assertKeyType(type, "set");
					transaction.sadd(key, decodeBinaryValue(params.operation.member.base64));
					break;
				case "removeSet":
					assertKeyType(type, "set");
					transaction.srem(key, decodeBinaryValue(params.operation.member.base64));
					break;
				case "upsertZset":
					assertKeyType(type, "zset");
					transaction.zadd(
						key,
						params.operation.score,
						decodeBinaryValue(params.operation.member.base64),
					);
					break;
				case "removeZset":
					assertKeyType(type, "zset");
					transaction.zrem(key, decodeBinaryValue(params.operation.member.base64));
					break;
				case "appendStream":
					assertKeyType(type, "stream");
					transaction.xadd(
						key,
						params.operation.id,
						...params.operation.fields.flatMap(({ field, value }) => [
							decodeBinaryValue(field.base64),
							decodeBinaryValue(value.base64),
						]),
					);
					break;
				case "deleteStream":
					assertKeyType(type, "stream");
					transaction.xdel(key, params.operation.id);
					break;
			}

			assertTransactionSucceeded(await transaction.exec());
			const resultKey = newKey && !newKey.equals(key) ? newKey : key;
			const nextDump = (await client.callBuffer("DUMP", resultKey)) as Buffer | null;
			return {
				key: encodeBinaryValue(resultKey),
				revision: nextDump ? revisionForDump(nextDump) : null,
				deleted: nextDump === null,
			};
		} catch (e) {
			throw this.wrapError(e);
		} finally {
			await client.unwatch().catch(() => undefined);
		}
	}

	async deleteKey(
		params: DeleteKeyQuerySchemaType & { key: string },
	): Promise<DeleteKeyResultSchemaType> {
		const client = await getRedisClient(parseDbIndex(params.db));
		const key = decodeKeyParam(params.key);
		try {
			await client.watch(key);
			const dump = (await client.callBuffer("DUMP", key)) as Buffer | null;
			if (!dump) throw new HTTPException(404, { message: "Redis key no longer exists" });
			if (!params.force && revisionForDump(dump) !== params.expectedRevision) throw conflict();
			const transaction = client.multi().del(key);
			assertTransactionSucceeded(await transaction.exec());
			return { deleted: true };
		} catch (e) {
			throw this.wrapError(e);
		} finally {
			await client.unwatch().catch(() => undefined);
		}
	}

	// -----------------------------------------------------------------------
	// Database operations
	// -----------------------------------------------------------------------

	override async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const client = await getRedisClient(getRedisDefaultDb());
			let total = 1;
			let supportsLogicalDatabases = false;
			let configReply: unknown = null;
			try {
				configReply = await client.call("CONFIG", "GET", "databases");
			} catch (error) {
				if (!isUnavailableCommandError(error)) throw error;
			}
			if (Array.isArray(configReply) && configReply.length >= 2) {
				const parsed = Number.parseInt(String(configReply[1]), 10);
				if (Number.isFinite(parsed) && parsed > 0) {
					total = parsed;
					supportsLogicalDatabases = true;
				}
			}

			let keyspaceInfo = "";
			try {
				keyspaceInfo = await client.info("keyspace");
			} catch (error) {
				if (!isUnavailableCommandError(error)) throw error;
			}
			const keysPerDb = parseKeyspaceInfo(keyspaceInfo);

			const databases = supportsLogicalDatabases
				? Array.from({ length: total }, (_, index) => index)
				: [getRedisDefaultDb()];
			return databases.map((index) => ({
				name: String(index),
				size: `${keysPerDb.get(index) ?? 0} keys`,
				owner: "n/a",
				encoding: "n/a",
			}));
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return { db: String(getRedisDefaultDb()) };
	}

	override async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
			const client = await getRedisClient(getRedisDefaultDb());
			const [serverInfo, clientsInfo] = await Promise.all([
				client.info("server"),
				client.info("clients"),
			]);
			const server = parseInfoSection(serverInfo);
			const clients = parseInfoSection(clientsInfo);

			let maxclients = Number.parseInt(clients.maxclients ?? "0", 10);
			if (!Number.isFinite(maxclients) || maxclients === 0) {
				const reply = await client.call("CONFIG", "GET", "maxclients").catch((error) => {
					if (!isUnavailableCommandError(error)) throw error;
					return null;
				});
				if (Array.isArray(reply) && reply.length >= 2) {
					maxclients = Number.parseInt(String(reply[1]), 10) || 0;
				}
			}

			const opts = client.options;
			return {
				host: opts.host ?? null,
				port: opts.port ?? null,
				user: opts.username || "default",
				database: String(opts.db ?? getRedisDefaultDb()),
				version: server.redis_version ?? "unknown",
				active_connections: Number.parseInt(clients.connected_clients ?? "0", 10) || 0,
				max_connections: maxclients || 0,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// -----------------------------------------------------------------------
	// Table operations
	// -----------------------------------------------------------------------

	override async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		try {
			const dbIndex = parseDbIndex(db);
			const counts = await this.getCachedCounts(dbIndex);
			return REDIS_TABLES.map((tableName) => ({
				tableName,
				rowCount: counts[tableName],
			}));
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async createTable(): Promise<void> {
		throw new HTTPException(400, {
			message: "Redis tables are fixed; cannot create new ones",
		});
	}

	override async deleteTable(_params: DeleteTableParams): Promise<DeleteTableResult> {
		throw new HTTPException(400, {
			message:
				"Bulk deletion of Redis tables is not supported. Use FLUSHDB from the query runner to clear the entire logical database.",
		});
	}

	override async getTableSchema({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const table = assertRedisTable(tableName);
		return SCHEMA_DESCRIPTIONS[table];
	}

	// -----------------------------------------------------------------------
	// Column operations — all schema mutations throw 400
	// -----------------------------------------------------------------------

	override async getTableColumns({
		tableName,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const table = assertRedisTable(tableName);
		return TABLE_COLUMNS[table];
	}

	override async addColumn(_params: AddColumnParamsSchemaType): Promise<void> {
		throw new HTTPException(400, { message: SCHEMA_MUTATION_MESSAGE });
	}

	override async deleteColumn(
		_params: DeleteColumnParamsSchemaType,
	): Promise<{ deletedCount: number }> {
		throw new HTTPException(400, { message: SCHEMA_MUTATION_MESSAGE });
	}

	override async alterColumn(_params: AlterColumnParamsSchemaType): Promise<void> {
		throw new HTTPException(400, { message: SCHEMA_MUTATION_MESSAGE });
	}

	override async renameColumn(_params: RenameColumnParamsSchemaType): Promise<void> {
		throw new HTTPException(400, { message: SCHEMA_MUTATION_MESSAGE });
	}

	// -----------------------------------------------------------------------
	// getTableData — forward-only SCAN with envelope cursor
	// -----------------------------------------------------------------------

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		try {
			const { tableName, db, cursor, limit = 50, direction = "asc", sort, filters } = params;

			if (direction === "desc") {
				throw new HTTPException(400, { message: PREV_UNSUPPORTED_MESSAGE });
			}
			if (sort && (typeof sort === "string" ? sort.length > 0 : sort.length > 0)) {
				throw new HTTPException(400, { message: SORT_UNSUPPORTED_MESSAGE });
			}
			if (filters && filters.length > 0) {
				throw new HTTPException(400, { message: FILTER_UNSUPPORTED_MESSAGE });
			}

			const table = assertRedisTable(tableName);
			const redisType = TABLE_TO_REDIS_TYPE[table];
			const dbIndex = parseDbIndex(db);
			const client = await getRedisClient(dbIndex);

			let scanCursor = "0";
			if (cursor) {
				const decoded = decodeScanCursor(cursor);
				if (!decoded || decoded.type !== table) {
					throw new HTTPException(400, { message: "Invalid or mismatched cursor" });
				}
				scanCursor = decoded.scanCursor;
			}

			const collectedKeys: string[] = [];
			let rounds = 0;
			let scanComplete = false;

			while (collectedKeys.length < limit && rounds < SCAN_ROUND_TRIP_CAP) {
				const [next, batch] = (await client.scan(
					scanCursor,
					"MATCH",
					"*",
					"COUNT",
					Math.max(limit * 2, 100),
					"TYPE",
					redisType,
				)) as [string, string[]];
				collectedKeys.push(...batch);
				scanCursor = next;
				rounds++;
				if (next === "0") {
					scanComplete = true;
					break;
				}
			}

			const pageKeys = collectedKeys.slice(0, limit);
			const overflow = collectedKeys.slice(limit);
			const rows = await this.hydrateRows(client, table, pageKeys);

			const total = await client.dbsize();
			const hasNextPage = !scanComplete || overflow.length > 0;
			const nextCursor =
				hasNextPage && !scanComplete ? encodeScanCursor({ scanCursor, type: table }) : null;

			return {
				data: rows,
				meta: {
					limit,
					total,
					hasNextPage,
					hasPreviousPage: false,
					nextCursor,
					prevCursor: null,
				},
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	private async hydrateRows(
		client: Redis,
		table: RedisTable,
		keys: string[],
	): Promise<NormalizedRow[]> {
		if (keys.length === 0) return [];

		const ttlPipeline = client.pipeline();
		for (const key of keys) ttlPipeline.ttl(key);
		const ttlResults = (await ttlPipeline.exec()) ?? [];

		const valuePipeline = client.pipeline();
		for (const key of keys) {
			switch (table) {
				case "strings":
					valuePipeline.get(key);
					break;
				case "hashes":
					valuePipeline.hgetall(key);
					break;
				case "lists":
					valuePipeline.lrange(key, 0, -1);
					break;
				case "sets":
					valuePipeline.smembers(key);
					break;
				case "zsets":
					valuePipeline.zrange(key, 0, -1, "WITHSCORES");
					break;
				case "streams":
					valuePipeline.xinfo("STREAM", key);
					break;
			}
		}
		const valueResults = (await valuePipeline.exec()) ?? [];

		return keys.map((key, i) => {
			const ttl = (ttlResults[i]?.[1] as number | null) ?? -2;
			const raw = valueResults[i]?.[1];

			if (table === "streams") {
				const info = streamInfoToObject(raw);
				return this.normalizeRow({
					key,
					length: info.length,
					"first-id": info.firstId,
					"last-id": info.lastId,
					ttl,
				});
			}

			let value: unknown;
			switch (table) {
				case "strings":
					value = (raw as string | null) ?? null;
					break;
				case "hashes":
					value = raw as Record<string, unknown>;
					break;
				case "lists":
				case "sets":
					value = raw as unknown[];
					break;
				case "zsets":
					value = flatPairsToZsetEntries(raw as string[] | undefined);
					break;
			}

			return this.normalizeRow({ key, value, ttl } as Record<string, unknown>);
		});
	}

	private async getCachedCounts(dbIndex: number): Promise<Record<RedisTable, number>> {
		const cached = this.countCache.get(dbIndex);
		if (cached && Date.now() - cached.timestamp < COUNT_CACHE_TTL_MS) {
			return cached.counts;
		}

		const client = await getRedisClient(dbIndex);
		const counts = {} as Record<RedisTable, number>;
		const pipeline = client.pipeline();
		for (const table of REDIS_TABLES) {
			pipeline.scan(
				"0",
				"MATCH",
				"*",
				"COUNT",
				COUNT_SCAN_CEILING,
				"TYPE",
				TABLE_TO_REDIS_TYPE[table],
			);
		}
		const results = (await pipeline.exec()) ?? [];
		REDIS_TABLES.forEach((table, i) => {
			const reply = results[i]?.[1] as [string, string[]] | undefined;
			counts[table] = reply?.[1]?.length ?? 0;
		});

		this.countCache.set(dbIndex, { timestamp: Date.now(), counts });
		return counts;
	}

	// -----------------------------------------------------------------------
	// Record operations
	// -----------------------------------------------------------------------

	override async addRecord({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: AddRecordSchemaType;
	}): Promise<{ insertedCount: number }> {
		try {
			const { tableName, data } = params;
			const table = assertRedisTable(tableName);
			const key = extractKey(data);
			const ttl = extractTtl(data);
			const client = await getRedisClient(parseDbIndex(db));

			await this.writeRecord(client, table, key, data.value, { mode: "create", ttl });
			this.countCache.delete(parseDbIndex(db));
			return { insertedCount: 1 };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async updateRecords({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		try {
			const { tableName, updates, primaryKey } = params;
			const table = assertRedisTable(tableName);
			const pkField = primaryKey || "key";
			const client = await getRedisClient(parseDbIndex(db));

			const updatesByKey = new Map<string, Record<string, unknown>>();
			for (const u of updates) {
				const k = u.rowData[pkField];
				if (k === undefined || k === null) {
					throw new HTTPException(400, {
						message: `Primary key "${pkField}" not found in row data`,
					});
				}
				const keyStr = String(k);
				const existing = updatesByKey.get(keyStr) ?? { ...u.rowData };
				existing[u.columnName] = u.value;
				updatesByKey.set(keyStr, existing);
			}

			let updatedCount = 0;
			for (const [key, row] of updatesByKey.entries()) {
				const value = row.value;
				const ttl = extractTtl(row);
				await this.writeRecord(client, table, key, value, { mode: "update", ttl });
				updatedCount++;
			}
			return { updatedCount };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async deleteRecords(params: DeleteRecordParams): Promise<DeleteRecordResult> {
		try {
			const { tableName, primaryKeys, db } = params;
			assertRedisTable(tableName);
			const client = await getRedisClient(parseDbIndex(db));
			const keys = primaryKeys.map((pk) => String(pk.value));
			if (keys.length === 0)
				return { deletedCount: 0, fkViolation: false, relatedRecords: [] };
			const deletedCount = await client.del(...keys);
			this.countCache.delete(parseDbIndex(db));
			return { deletedCount, fkViolation: false, relatedRecords: [] };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async forceDeleteRecords(
		params: DeleteRecordParams,
	): Promise<{ deletedCount: number }> {
		const result = await this.deleteRecords(params);
		return { deletedCount: result.deletedCount };
	}

	override async bulkInsertRecords(
		params: BulkInsertRecordsParams,
	): Promise<BulkInsertResult> {
		try {
			const { tableName, records, db } = params;
			if (!records || records.length === 0) {
				throw new HTTPException(400, { message: "At least one record is required" });
			}
			const table = assertRedisTable(tableName);
			const client = await getRedisClient(parseDbIndex(db));

			const errors: Array<{ recordIndex: number; error: string }> = [];
			let successCount = 0;

			for (let i = 0; i < records.length; i++) {
				const record = records[i] as Record<string, unknown>;
				try {
					const key = extractKey(record);
					const ttl = extractTtl(record);
					await this.writeRecord(client, table, key, record.value, { mode: "create", ttl });
					successCount++;
				} catch (e) {
					errors.push({
						recordIndex: i,
						error: e instanceof Error ? e.message : String(e),
					});
				}
			}

			this.countCache.delete(parseDbIndex(db));
			return {
				success: errors.length === 0,
				message: `Inserted ${successCount} of ${records.length} record${records.length === 1 ? "" : "s"}`,
				successCount,
				failureCount: errors.length,
				...(errors.length > 0 ? { errors } : {}),
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, CellValue>[] }> {
		try {
			const table = assertRedisTable(tableName);
			const dbIndex = parseDbIndex(db);
			const client = await getRedisClient(dbIndex);
			const redisType = TABLE_TO_REDIS_TYPE[table];

			const allKeys: string[] = [];
			let scanCursor = "0";
			do {
				const [next, batch] = (await client.scan(
					scanCursor,
					"MATCH",
					"*",
					"COUNT",
					1000,
					"TYPE",
					redisType,
				)) as [string, string[]];
				allKeys.push(...batch);
				scanCursor = next;
			} while (scanCursor !== "0");

			if (allKeys.length === 0) {
				throw new HTTPException(404, {
					message: `Table "${tableName}" has no data`,
				});
			}

			const rows = await this.hydrateRows(client, table, allKeys);
			const cols = TABLE_COLUMNS[table].map((c) => c.columnName);
			return { cols, rows: rows as Record<string, CellValue>[] };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	private async writeRecord(
		client: Redis,
		table: RedisTable,
		key: string,
		value: unknown,
		opts: { mode: "create" | "update"; ttl: number | null },
	): Promise<void> {
		if (table === "streams" && opts.mode === "update") {
			throw new HTTPException(400, {
				message: "Streams are append-only; updating a stream record is not supported",
			});
		}

		if (opts.mode === "create") {
			if (table === "strings") {
				const result = await client.set(
					key,
					typeof value === "string" ? value : JSON.stringify(value),
					"NX",
				);
				if (result === null) {
					throw new HTTPException(409, { message: `Key "${key}" already exists` });
				}
			} else {
				const exists = await client.exists(key);
				if (exists) {
					throw new HTTPException(409, { message: `Key "${key}" already exists` });
				}
				await this.writeCollectionValue(client, table, key, value);
			}
		} else {
			if (table === "strings") {
				const result = await client.set(
					key,
					typeof value === "string" ? value : JSON.stringify(value),
					"XX",
				);
				if (result === null) {
					throw new HTTPException(404, { message: `Key "${key}" does not exist` });
				}
			} else {
				const exists = await client.exists(key);
				if (!exists) {
					throw new HTTPException(404, { message: `Key "${key}" does not exist` });
				}
				await client.del(key);
				await this.writeCollectionValue(client, table, key, value);
			}
		}

		if (opts.ttl !== null && opts.ttl > 0) {
			await client.expire(key, opts.ttl);
		}
	}

	private async writeCollectionValue(
		client: Redis,
		table: RedisTable,
		key: string,
		value: unknown,
	): Promise<void> {
		switch (table) {
			case "hashes": {
				const obj = coerceObject(value, "hash");
				const flat: string[] = [];
				for (const [field, val] of Object.entries(obj)) {
					flat.push(field, stringifyValue(val));
				}
				if (flat.length === 0) {
					throw new HTTPException(400, { message: "Hash must have at least one field" });
				}
				await client.hset(key, ...flat);
				return;
			}
			case "lists": {
				const arr = coerceArray(value, "list");
				if (arr.length === 0) {
					throw new HTTPException(400, { message: "List must have at least one element" });
				}
				await client.rpush(key, ...arr.map(stringifyValue));
				return;
			}
			case "sets": {
				const arr = coerceArray(value, "set");
				if (arr.length === 0) {
					throw new HTTPException(400, { message: "Set must have at least one member" });
				}
				await client.sadd(key, ...arr.map(stringifyValue));
				return;
			}
			case "zsets": {
				const entries = coerceZsetEntries(value);
				if (entries.length === 0) {
					throw new HTTPException(400, {
						message: "Sorted set must have at least one member",
					});
				}
				const args: (string | number)[] = [];
				for (const e of entries) {
					args.push(e.score, e.member);
				}
				await client.zadd(key, ...(args as [string, ...string[]]));
				return;
			}
			case "streams": {
				const obj = coerceObject(value, "stream");
				const flat: string[] = [];
				for (const [field, val] of Object.entries(obj)) {
					flat.push(field, stringifyValue(val));
				}
				if (flat.length === 0) {
					throw new HTTPException(400, {
						message: "Stream entry must have at least one field",
					});
				}
				await client.xadd(key, "*", ...(flat as [string, ...string[]]));
				return;
			}
		}
	}

	// -----------------------------------------------------------------------
	// Query execution
	// -----------------------------------------------------------------------

	override async executeQuery({
		query,
		db,
	}: {
		query: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ExecuteQueryResult> {
		const startTime = performance.now();
		try {
			if (!query?.trim()) {
				throw new HTTPException(400, { message: "Query is required" });
			}

			let argv: string[];
			try {
				argv = tokenizeCommand(query.trim());
			} catch (e) {
				throw new HTTPException(400, {
					message: e instanceof Error ? e.message : "Invalid Redis command",
				});
			}

			if (argv.length === 0) {
				throw new HTTPException(400, { message: "Empty command" });
			}

			const client = await getRedisClient(parseDbIndex(db));
			const [cmd, ...rest] = argv;

			let reply: unknown;
			try {
				reply = await client.call(cmd, ...rest);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				return {
					columns: ["error"],
					rows: [{ error: message }],
					rowCount: 0,
					duration: performance.now() - startTime,
					error: message,
				};
			}

			const shaped = shapeReply(argv, reply);
			return {
				...shaped,
				duration: performance.now() - startTime,
				message: typeof reply === "string" ? reply : undefined,
			};
		} catch (e) {
			throw this.wrapError(e);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseInfoSection(info: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of info.split(/\r?\n/)) {
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		out[line.slice(0, idx)] = line.slice(idx + 1);
	}
	return out;
}

function parseKeyspaceInfo(info: string): Map<number, number> {
	const out = new Map<number, number>();
	for (const line of info.split(/\r?\n/)) {
		const match = line.match(/^db(\d+):keys=(\d+)/);
		if (match) out.set(Number(match[1]), Number(match[2]));
	}
	return out;
}

function extractKey(data: Record<string, unknown>): string {
	const k = data.key;
	if (k === undefined || k === null || k === "") {
		throw new HTTPException(400, { message: "Field 'key' is required" });
	}
	return String(k);
}

function extractTtl(data: Record<string, unknown>): number | null {
	const t = data.ttl;
	if (t === undefined || t === null || t === "") return null;
	const parsed = typeof t === "number" ? t : Number.parseInt(String(t), 10);
	if (!Number.isFinite(parsed)) return null;
	return parsed;
}

function stringifyValue(v: unknown): string {
	if (typeof v === "string") return v;
	if (v === null || v === undefined) return "";
	if (typeof v === "object") return JSON.stringify(v);
	return String(v);
}

function coerceObject(value: unknown, kind: string): Record<string, unknown> {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// fall through
		}
		throw new HTTPException(400, {
			message: `Value for ${kind} must be a JSON object`,
		});
	}
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw new HTTPException(400, { message: `Value for ${kind} must be a JSON object` });
}

function coerceArray(value: unknown, kind: string): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// fall through
		}
	}
	throw new HTTPException(400, { message: `Value for ${kind} must be a JSON array` });
}

function coerceZsetEntries(value: unknown): { member: string; score: number }[] {
	let arr: unknown[];
	if (Array.isArray(value)) {
		arr = value;
	} else if (typeof value === "string") {
		try {
			arr = JSON.parse(value);
		} catch {
			throw new HTTPException(400, {
				message: "Value for zset must be an array of {member, score} entries",
			});
		}
	} else {
		throw new HTTPException(400, {
			message: "Value for zset must be an array of {member, score} entries",
		});
	}

	const out: { member: string; score: number }[] = [];
	for (const entry of arr) {
		if (!entry || typeof entry !== "object") {
			throw new HTTPException(400, {
				message: "Each zset entry must be an object with 'member' and 'score'",
			});
		}
		const obj = entry as { member?: unknown; score?: unknown };
		if (obj.member === undefined || obj.score === undefined) {
			throw new HTTPException(400, {
				message: "Each zset entry must include 'member' and 'score'",
			});
		}
		const score = typeof obj.score === "number" ? obj.score : Number(obj.score);
		if (!Number.isFinite(score)) {
			throw new HTTPException(400, { message: `Invalid score: ${String(obj.score)}` });
		}
		out.push({ member: String(obj.member), score });
	}
	return out;
}

function flatPairsToZsetEntries(
	reply: string[] | undefined,
): { member: string; score: number }[] {
	if (!reply) return [];
	const out: { member: string; score: number }[] = [];
	for (let i = 0; i < reply.length; i += 2) {
		const score = Number(reply[i + 1]);
		out.push({ member: reply[i], score: Number.isFinite(score) ? score : 0 });
	}
	return out;
}

function streamInfoToObject(reply: unknown): {
	length: number;
	firstId: string | null;
	lastId: string | null;
} {
	if (!Array.isArray(reply)) return { length: 0, firstId: null, lastId: null };
	const obj: Record<string, unknown> = {};
	for (let i = 0; i < reply.length; i += 2) {
		obj[String(reply[i])] = reply[i + 1];
	}
	const length =
		typeof obj.length === "number"
			? obj.length
			: Number.parseInt(String(obj.length ?? "0"), 10) || 0;
	const firstEntry = obj["first-entry"];
	const lastEntry = obj["last-entry"];
	const idOf = (entry: unknown): string | null =>
		Array.isArray(entry) && typeof entry[0] === "string" ? entry[0] : null;
	return { length, firstId: idOf(firstEntry), lastId: idOf(lastEntry) };
}
