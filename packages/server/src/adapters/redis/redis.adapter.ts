import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	CellValue,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	ExecuteQueryResult,
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

export class RedisAdapter extends BaseAdapter {
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

	// -----------------------------------------------------------------------
	// Database operations
	// -----------------------------------------------------------------------

	override async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const client = await getRedisClient(getRedisDefaultDb());
			const configReply = (await client.call("CONFIG", "GET", "databases")) as unknown;
			let total = 16;
			if (Array.isArray(configReply) && configReply.length >= 2) {
				const parsed = Number.parseInt(String(configReply[1]), 10);
				if (Number.isFinite(parsed) && parsed > 0) total = parsed;
			}

			const keyspaceInfo = await client.info("keyspace");
			const keysPerDb = parseKeyspaceInfo(keyspaceInfo);

			return Array.from({ length: total }, (_, i) => ({
				name: String(i),
				size: `${keysPerDb.get(i) ?? 0} keys`,
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
				const reply = (await client.call("CONFIG", "GET", "maxclients")) as unknown;
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
