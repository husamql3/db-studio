import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateIndexParamsSchemaType,
	CreateTableSchemaType,
	DatabaseInfoSchemaType,
	DatabaseSchemaType,
	DataTypes,
	DeleteColumnParamsSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteTableParams,
	DeleteTableResult,
	DropIndexParamsSchemaType,
	ExecuteQueryResult,
	IndexInfoSchemaType,
	RenameColumnParamsSchemaType,
	RenameTableParamsSchemaType,
	ServerLogEntrySchemaType,
	ServerLogLevel,
	ServerLogsResult,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	UpdateRecordsSchemaType,
} from "@db-studio/shared/types";
import type { Db, IndexDescriptionInfo } from "mongodb";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type DriverErrorClass } from "@/adapters/base.adapter.js";
import { visibleMongoDatabases } from "@/adapters/mongo/mongo-database-visibility.js";
import { logDetail, logsUnavailable, newestEntries } from "@/adapters/server-logs.js";
import type { ServerAddress } from "@/connection-url.js";
import { HTTPException } from "@/http-exception.js";
import { connector } from "@/open-connections.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";
import {
	buildMatchStage,
	buildSortStage,
	decodeMongoCursor,
	encodeMongoCursor,
} from "./mongo.pipeline-builder.js";
import { coerceObjectId } from "./object-id.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// oxlint-disable-next-line anti-slop/no-unknown-returns -- walks arbitrary BSON documents; anything it does not convert passes through
const normalizeValue = (value: unknown): unknown => {
	if (value instanceof Date) return value.toISOString();

	if (typeof value === "bigint") return value.toString();

	if (value && typeof value === "object") {
		if (
			"_bsontype" in value &&
			value._bsontype === "ObjectId" &&
			"toHexString" in value &&
			typeof value.toHexString === "function"
		) {
			return value.toHexString();
		}

		if (Array.isArray(value)) return value.map((item) => normalizeValue(item));

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeValue(v)]),
		);
	}

	return value;
};

const normalizeDoc = (doc: unknown): Record<string, unknown> =>
	normalizeValue(doc) as Record<string, unknown>;

const INDEX_DEFINITION_OPTIONS = [
	"sparse",
	"expireAfterSeconds",
	"partialFilterExpression",
	"collation",
] as const;

const toIndexInfo = (index: IndexDescriptionInfo): IndexInfoSchemaType => {
	const indexName = index.name ?? "";
	const isPrimary = indexName === "_id_";
	const keyValues = Object.values(index.key);
	const weights = index.weights;

	// A text index stores its text part as `_fts`/`_ftsx`; the indexed fields are in `weights`.
	const columns = weights
		? Object.keys(index.key).flatMap((field) =>
				field === "_fts" ? Object.keys(weights) : field === "_ftsx" ? [] : [field],
			)
		: Object.keys(index.key);

	const options: Record<string, unknown> = {};

	if (weights) options.weights = weights;

	for (const option of INDEX_DEFINITION_OPTIONS) {
		const value = index[option];

		if (value !== undefined && value !== null && value !== false)
			options[option] = normalizeValue(value);
	}

	const isPlain = keyValues.every((value) => value === 1) && Object.keys(options).length === 0;

	return {
		indexName,
		columns,
		isUnique: isPrimary || index.unique === true,
		isSparse: index.sparse,
		expireAfterSeconds: index.expireAfterSeconds,
		method: keyValues.find((value) => typeof value === "string") ?? null,
		kind: isPrimary ? "primary" : "index",
		// `key` always leads so the string reads on its own; its order is the index order.
		definition: isPlain ? null : JSON.stringify({ key: index.key, ...options }),
	};
};

const UNREACHABLE_ERRORS = new Set([
	"MongoNetworkError",
	"MongoServerSelectionError",
	"MongoTopologyClosedError",
]);

/** 85 IndexOptionsConflict, 86 IndexKeySpecsConflict, 11000 duplicate key on a unique build. */
const INDEX_CONFLICT_CODES = new Set([85, 86, 11000]);

const inferValueType = (value: unknown): DataTypes => {
	if (value instanceof Date) return "date";

	if (value && typeof value === "object") {
		if (Array.isArray(value)) return "array";

		if ("_bsontype" in value) return "text";

		return "json";
	}

	if (typeof value === "boolean") return "boolean";

	if (typeof value === "number" || typeof value === "bigint") return "number";

	return "text";
};

const dataTypeLabel = (dt: DataTypes): string => {
	switch (dt) {
		case "number":
			return "numeric";
		case "boolean":
			return "boolean";
		case "json":
			return "json";
		case "date":
			return "date";
		case "array":
			return "array";
		case "enum":
			return "enum";
		default:
			return "text";
	}
};

const formatBytes = (bytes: number): string => {
	if (!Number.isFinite(bytes)) return "n/a";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let v = bytes;
	let i = 0;

	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}

	return `${v.toFixed(1)} ${units[i]}`;
};

const MONGO_BSON_TYPES = new Set([
	"double",
	"string",
	"object",
	"array",
	"binData",
	"undefined",
	"objectId",
	"bool",
	"date",
	"null",
	"regex",
	"dbPointer",
	"javascript",
	"symbol",
	"javascriptWithScope",
	"int",
	"timestamp",
	"long",
	"decimal",
	"minKey",
	"maxKey",
]);

const mapBsonType = (rawType: string): string => {
	const n = rawType.trim();

	if (MONGO_BSON_TYPES.has(n)) return n;

	switch (n.toLowerCase()) {
		case "boolean":
			return "bool";
		case "objectid":
			return "objectId";
		case "binary":
			return "binData";
		default:
			return n;
	}
};

const inferBsonType = (value: unknown): string => {
	if (value === null || value === undefined) return "null";

	if (value instanceof Date) return "date";

	if (typeof value === "boolean") return "bool";

	if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";

	if (typeof value === "bigint") return "long";

	if (Array.isArray(value)) return "array";

	if (typeof value === "object") {
		const bson = (value as { _bsontype?: string })._bsontype;

		if (bson === "ObjectId") return "objectId";

		if (bson === "Decimal128") return "decimal";

		if (bson === "Binary") return "binData";

		if (bson === "Timestamp") return "timestamp";

		if (bson) return bson.toLowerCase();

		return "object";
	}

	return "string";
};

type FieldDefault =
	| string
	| number
	| boolean
	| Date
	| null
	| FieldDefault[]
	| { [key: string]: FieldDefault };

const resolveFieldDefault = (
	defaultValue: string | null | undefined,
	columnType: string,
): FieldDefault => {
	if (defaultValue !== undefined && defaultValue !== null && defaultValue.trim() !== "") {
		try {
			return JSON.parse(defaultValue);
		} catch {
			return defaultValue;
		}
	}

	switch (columnType) {
		case "string":
			return "";
		case "int":
		case "long":
		case "double":
		case "decimal":
			return 0;
		case "bool":
			return false;
		case "array":
			return [];
		case "object":
			return {};
		case "date":
			return new Date();
		default:
			return null;
	}
};

const normalizeIdFilter = (filter: Record<string, unknown>): Record<string, unknown> => {
	if (filter._id && typeof filter._id === "string") {
		return { ...filter, _id: coerceObjectId(filter._id) };
	}

	if (filter._id && typeof filter._id === "object") {
		const obj = filter._id as Record<string, unknown>;

		if (Array.isArray(obj.$in)) {
			return {
				...filter,
				_id: {
					...obj,
					$in: obj.$in.map((v) => coerceObjectId(v)),
				},
			};
		}

		if (Array.isArray(obj.$nin)) {
			return {
				...filter,
				_id: {
					...obj,
					$nin: obj.$nin.map((v) => coerceObjectId(v)),
				},
			};
		}
	}

	return filter;
};

type MongoQueryPayload = {
	collection: string;
	operation:
		| "find"
		| "aggregate"
		| "insertOne"
		| "insertMany"
		| "updateOne"
		| "updateMany"
		| "deleteOne"
		| "deleteMany"
		| "count";
	filter?: Record<string, unknown>;
	pipeline?: Record<string, unknown>[];
	document?: Record<string, unknown> | Record<string, unknown>[];
	update?: Record<string, unknown>;
	options?: Record<string, unknown>;
	sort?: Record<string, 1 | -1>;
	limit?: number;
	skip?: number;
};

// ---------------------------------------------------------------------------
// MongoAdapter
// ---------------------------------------------------------------------------

const MONGO_UNAUTHORIZED = 13;
const MONGO_ATLAS_ERROR = 8000;

/** The log id MongoDB gives to a slow operation. */
const MONGO_SLOW_QUERY = 51803;

const MONGO_LOG_LEVELS: Record<string, ServerLogLevel> = {
	F: "fatal",
	E: "error",
	W: "warning",
	I: "info",
};

interface MongoLogLine {
	t: { $date: string };
	s: string;
	c: string;
	id: number;
	ctx: string;
	msg: string;
	attr?: Record<string, unknown>;
}

const toServerLogEntry = ({
	t,
	s,
	c,
	id,
	ctx,
	msg,
	attr = {},
}: MongoLogLine): ServerLogEntrySchemaType => {
	if (id === MONGO_SLOW_QUERY) {
		const { ns, command, durationMillis, ...rest } = attr;

		// Driver bookkeeping such as $db, lsid and $clusterTime says nothing about the query.
		const query = Object.fromEntries(
			Object.entries((command ?? {}) as Record<string, unknown>).filter(
				([key]) => !key.startsWith("$") && key !== "lsid",
			),
		);

		return {
			ts: new Date(t.$date).toISOString(),
			level: MONGO_LOG_LEVELS[s] ?? "debug",
			rawLevel: s,
			source: c,
			message: `${ns} ${JSON.stringify(query)}`,
			durationMs: Number(durationMillis),
			detail: logDetail({ id, ctx, ...rest }),
		};
	}

	return {
		ts: new Date(t.$date).toISOString(),
		level: MONGO_LOG_LEVELS[s] ?? "debug",
		rawLevel: s,
		source: c,
		message: msg,
		detail: logDetail({ id, ctx, ...attr }),
	};
};

export class MongoAdapter extends BaseAdapter {
	protected override classifyDriverError(e: Error): DriverErrorClass | undefined {
		if (
			UNREACHABLE_ERRORS.has(e.name) ||
			e.message.includes("MongoNetworkError") ||
			e.message.includes("MongoServerSelectionError")
		)
			return { status: 503 };

		return undefined;
	}

	// -----------------------------------------------------------------------
	// getTableData — full override (skip/limit pagination)
	// -----------------------------------------------------------------------

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		const { tableName, db, cursor, limit, direction = "asc", sort, order, filters } = params;

		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const filterObj = buildMatchStage(filters ?? []);
		const sortObj = buildSortStage(sort ?? "", order);

		const safeLimit = limit && limit > 0 ? limit : 50;
		const decodedOffset = decodeMongoCursor(cursor);
		const offset = Number.isFinite(decodedOffset) && decodedOffset >= 0 ? decodedOffset : 0;
		const skip = direction === "desc" ? Math.max(offset - safeLimit, 0) : offset;

		const [total, rows] = await Promise.all([
			collection.countDocuments(filterObj),
			collection.find(filterObj).sort(sortObj).skip(skip).limit(safeLimit).toArray(),
		]);

		const normalizedRows = rows.map((row) => normalizeDoc(row));
		const nextOffset = skip + safeLimit;
		const prevOffset = Math.max(skip - safeLimit, 0);

		return {
			data: normalizedRows,
			meta: {
				limit: safeLimit,
				total,
				hasNextPage: nextOffset < total,
				hasPreviousPage: skip > 0,
				nextCursor: nextOffset < total ? encodeMongoCursor(nextOffset) : null,
				prevCursor: skip > 0 ? encodeMongoCursor(prevOffset) : null,
			},
		};
	}

	// -----------------------------------------------------------------------
	// exportTableData — full override (no SELECT * in Mongo)
	// -----------------------------------------------------------------------

	override async exportTableData({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const rows = await collection.find({}).limit(10000).toArray();
		// Nested documents stay nested: the JSON export needs the real structure,
		// and `getExportFile` flattens them for the CSV/XLSX sheet writer.
		const normalized = rows.map((row) => normalizeDoc(row));
		const cols = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));

		return { cols, rows: normalized };
	}

	// -----------------------------------------------------------------------
	// Database operations
	// -----------------------------------------------------------------------

	override async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		const client = await connector("mongodb").client();
		const admin = client.db().admin();
		const result = await admin.listDatabases();
		const databases = result.databases ?? [];

		if (!databases[0]) {
			throw new HTTPException(500, { message: "No databases returned from MongoDB" });
		}

		return visibleMongoDatabases(databases, connector("mongodb").dbName).map((db) => ({
			name: db.name,
			size: formatBytes(db.sizeOnDisk ?? 0),
			owner: "n/a",
			encoding: "n/a",
		}));
	}

	override async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return { db: connector("mongodb").dbName };
	}

	override async getDatabaseConnectionInfo(
		server: ServerAddress,
	): Promise<ConnectionInfoSchemaType> {
		const client = await connector("mongodb").client();
		const admin = client.db().admin();

		let serverStatus: {
			version?: string;
			connections?: { current?: number; available?: number };
		} = {};

		try {
			serverStatus = await admin.serverStatus();
		} catch (error) {
			writeOperationalLog("warn", "db_server_status_failed", errorFields(error));
		}

		return {
			host: server.host,
			port: server.port,
			user: "n/a",
			database: connector("mongodb").dbName,
			version: serverStatus.version ?? "unknown",
			active_connections: serverStatus.connections?.current ?? 0,
			max_connections:
				(serverStatus.connections?.current ?? 0) + (serverStatus.connections?.available ?? 0),
		};
	}

	// -----------------------------------------------------------------------
	// Table operations
	// -----------------------------------------------------------------------

	override async getTablesList(db: DatabaseSchemaType["db"]): Promise<TableInfoSchemaType[]> {
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections().toArray();
		const results: TableInfoSchemaType[] = [];

		for (const col of collections) {
			// MongoDB reserves `system.*` for internal collections. A database with a view
			// holds `system.views`, which no role may count, so listing it failed every request.
			if (col.name.startsWith("system.")) continue;
			const rowCount = await mongoDb.collection(col.name).estimatedDocumentCount();
			results.push({ tableName: col.name, rowCount });
		}

		return results;
	}

	override async createTable({
		tableData,
		db,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		const tableName = tableData?.tableName ?? "";
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length > 0) {
			throw new HTTPException(400, {
				message: `Collection "${tableName}" already exists`,
			});
		}

		const fields = tableData?.fields ?? [];

		if (fields.length === 0) {
			await mongoDb.createCollection(tableName);

			return;
		}

		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const field of fields) {
			const bsonType = mapBsonType(field.columnType);

			if (!MONGO_BSON_TYPES.has(bsonType)) {
				throw new HTTPException(400, {
					message: `Unsupported MongoDB BSON type "${field.columnType}" for field "${field.columnName}"`,
				});
			}

			if (field.isArray) {
				const property: Record<string, unknown> = { bsonType: "array" };

				if (bsonType !== "array") property.items = { bsonType };

				properties[field.columnName] = property;
			} else {
				properties[field.columnName] = { bsonType };
			}

			if (!field.isNullable) required.push(field.columnName);
		}

		await mongoDb.createCollection(tableName, {
			validator: {
				$jsonSchema: {
					bsonType: "object",
					required,
					properties,
					additionalProperties: true,
				},
			},
			validationAction: "error",
		});
	}

	override async deleteTable({
		tableName,
		db,
	}: DeleteTableParams): Promise<DeleteTableResult> {
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const rowCount = await collection.estimatedDocumentCount();
		await collection.drop();

		return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
	}

	override async renameTable(params: RenameTableParamsSchemaType): Promise<void> {
		const { tableName, newTableName, db } = params;
		this.assertDifferentTableName(tableName, newTableName);
		const mongoDb = await connector("mongodb").db(db);
		const existing = await mongoDb.listCollections({ name: tableName }).toArray();

		if (existing.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		const target = await mongoDb.listCollections({ name: newTableName }).toArray();

		if (target.length > 0) {
			throw new HTTPException(409, {
				message: `Collection "${newTableName}" already exists`,
			});
		}

		await mongoDb.collection(tableName).rename(newTableName);
	}

	override async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		const collection = mongoDb.collection(tableName);
		const docs = await collection.find({}).limit(200).toArray();
		const totalDocs = await collection.estimatedDocumentCount();

		const fieldTypes = new Map<string, Set<string>>();
		const fieldPresence = new Map<string, number>();

		for (const doc of docs) {
			for (const [key, value] of Object.entries(doc)) {
				const bsonType = inferBsonType(value);

				if (!fieldTypes.has(key)) {
					fieldTypes.set(key, new Set());
					fieldPresence.set(key, 0);
				}

				fieldTypes.get(key)?.add(bsonType);
				fieldPresence.set(key, (fieldPresence.get(key) ?? 0) + 1);
			}
		}

		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const [field, types] of fieldTypes.entries()) {
			const presence = fieldPresence.get(field) ?? 0;
			const typeList = Array.from(types).filter((t) => t !== "null");
			const isNullable = types.has("null") || presence < docs.length;

			if (presence === docs.length && docs.length > 0 && !isNullable) required.push(field);
			properties[field] =
				typeList.length === 1
					? { bsonType: isNullable ? [typeList[0], "null"] : typeList[0] }
					: { bsonType: isNullable ? [...typeList, "null"] : typeList };
		}

		const schema = {
			collection: tableName,
			estimatedDocumentCount: totalDocs,
			sampledDocuments: docs.length,
			jsonSchema: {
				bsonType: "object",
				required: required.length > 0 ? required : undefined,
				properties,
			},
		};

		return JSON.stringify(schema, null, 2);
	}

	// -----------------------------------------------------------------------
	// Column operations
	// -----------------------------------------------------------------------

	override async getTableColumns({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<ColumnInfoSchemaType[]> {
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const documents = await collection.find({}).limit(200).toArray();
		const totalDocs = documents.length;

		const columnMap = new Map<
			string,
			{ types: Set<DataTypes>; nullable: boolean; presentCount: number }
		>();

		const ensureColumn = (columnName: string, value: unknown) => {
			const dt = inferValueType(value);

			if (!columnMap.has(columnName)) {
				columnMap.set(columnName, {
					types: new Set([dt]),
					nullable: false,
					presentCount: 1,
				});
			} else {
				const entry = columnMap.get(columnName)!;
				entry.types.add(dt);
				entry.presentCount += 1;
			}
		};

		for (const doc of documents) {
			for (const [key, value] of Object.entries(doc)) {
				if (value === null || value === undefined) {
					if (!columnMap.has(key)) {
						columnMap.set(key, {
							types: new Set(["text"]),
							nullable: true,
							presentCount: 1,
						});
					} else {
						const entry = columnMap.get(key)!;
						entry.nullable = true;
						entry.presentCount += 1;
					}

					continue;
				}

				ensureColumn(key, value);
			}
		}

		if (totalDocs > 0) {
			for (const entry of columnMap.values()) {
				if (entry.presentCount < totalDocs) entry.nullable = true;
			}
		}

		if (!columnMap.has("_id")) {
			columnMap.set("_id", {
				types: new Set(["text"]),
				nullable: false,
				presentCount: totalDocs,
			});
		}

		return Array.from(columnMap.entries()).map(([columnName, meta]) => {
			const dt = (meta.types.values().next().value ?? "text") as DataTypes;

			return {
				columnName,
				dataType: dt,
				dataTypeLabel: dataTypeLabel(dt) as ColumnInfoSchemaType["dataTypeLabel"],
				isNullable: meta.nullable,
				columnDefault: null,
				isPrimaryKey: columnName === "_id",
				isForeignKey: false,
				referencedTable: null,
				referencedColumn: null,
				enumValues: null,
			};
		});
	}

	override async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, defaultValue, isNullable, db } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		const conflict = await mongoDb
			.collection(tableName)
			.findOne({ [columnName]: { $exists: true } });

		if (conflict) {
			throw new HTTPException(409, {
				message: `Field "${columnName}" already exists in collection "${tableName}"`,
			});
		}

		const resolvedDefault = resolveFieldDefault(defaultValue, columnType);
		await mongoDb
			.collection(tableName)
			.updateMany({}, { $set: { [columnName]: resolvedDefault } });

		const collInfo = collections[0] as {
			options?: {
				validator?: {
					$jsonSchema?: {
						properties?: Record<string, unknown>;
						required?: string[];
					};
				};
			};
		};

		const existingSchema = collInfo.options?.validator?.$jsonSchema ?? {};

		const properties: Record<string, unknown> = {
			...existingSchema.properties,
			[columnName]: { bsonType: isNullable ? [columnType, "null"] : columnType },
		};

		const required: string[] = [...(existingSchema.required ?? [])];

		if (!isNullable && !required.includes(columnName)) required.push(columnName);

		const jsonSchema: Record<string, unknown> = {
			...existingSchema,
			bsonType: "object",
			properties,
		};

		if (required.length > 0) jsonSchema.required = required;

		await mongoDb.command({
			collMod: tableName,
			validator: { $jsonSchema: jsonSchema },
			validationAction: "warn",
		});
	}

	override async deleteColumn({
		tableName,
		columnName,
		db,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const result = await collection.updateMany({}, { $unset: { [columnName]: "" } });

		return { deletedCount: result.modifiedCount };
	}

	override async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, columnType, isNullable, db } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		if (columnName === "_id") {
			throw new HTTPException(400, { message: 'Cannot alter the "_id" field' });
		}

		const collInfo = collections[0] as {
			options?: {
				validator?: {
					$jsonSchema?: {
						properties?: Record<string, unknown>;
						required?: string[];
					};
				};
			};
		};

		const existingSchema = collInfo.options?.validator?.$jsonSchema ?? {};

		const properties: Record<string, unknown> = { ...existingSchema.properties };

		const required: string[] = [...(existingSchema.required ?? [])];

		properties[columnName] = {
			bsonType: isNullable ? [columnType, "null"] : columnType,
		};

		const reqIndex = required.indexOf(columnName);

		if (!isNullable && reqIndex === -1) required.push(columnName);
		else if (isNullable && reqIndex !== -1) required.splice(reqIndex, 1);

		const jsonSchema: Record<string, unknown> = {
			...existingSchema,
			bsonType: "object",
			properties,
		};

		if (required.length > 0) jsonSchema.required = required;

		await mongoDb.command({
			collMod: tableName,
			validator: { $jsonSchema: jsonSchema },
			validationAction: "warn",
		});
	}

	override async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		const { tableName, columnName, newColumnName, db } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		if (columnName === "_id") {
			throw new HTTPException(400, { message: 'Cannot rename the "_id" field' });
		}

		const sample = await mongoDb
			.collection(tableName)
			.findOne({ [columnName]: { $exists: true } });

		if (!sample) {
			throw new HTTPException(404, {
				message: `Field "${columnName}" does not exist in collection "${tableName}"`,
			});
		}

		const conflict = await mongoDb
			.collection(tableName)
			.findOne({ [newColumnName]: { $exists: true } });

		if (conflict) {
			throw new HTTPException(409, {
				message: `Field "${newColumnName}" already exists in collection "${tableName}"`,
			});
		}

		await mongoDb
			.collection(tableName)
			.updateMany(
				{ [columnName]: { $exists: true } },
				{ $rename: { [columnName]: newColumnName } },
			);
	}

	// -----------------------------------------------------------------------
	// Indexes
	// -----------------------------------------------------------------------

	override async getServerLogs(): Promise<ServerLogsResult> {
		try {
			const client = await connector("mongodb").client();

			const { log } = (await client.db("admin").command({ getLog: "global" })) as {
				log: string[];
			};

			const entries = log.flatMap((line) => {
				try {
					return [toServerLogEntry(JSON.parse(line) as MongoLogLine)];
				} catch {
					// MongoDB before 4.4 writes plain-text lines, which carry no structure to read.
					return [];
				}
			});

			return {
				available: true,
				source: "getLog: 'global' (the server keeps the newest 1024 entries)",
				entries: newestEntries(entries),
			};
		} catch (e) {
			const code = (e as { code?: unknown }).code;

			if (code === MONGO_UNAUTHORIZED) {
				return logsUnavailable(
					"Reading the server log needs the getLog action, which the clusterMonitor role grants.",
				);
			}

			if (code === MONGO_ATLAS_ERROR) {
				return logsUnavailable("This Atlas tier does not allow getLog.");
			}

			throw e;
		}
	}

	private async listIndexes(mongoDb: Db, tableName: string): Promise<IndexInfoSchemaType[]> {
		const collections = await mongoDb.listCollections({ name: tableName }).toArray();

		if (collections.length === 0) {
			throw new HTTPException(404, {
				message: `Collection "${tableName}" does not exist`,
			});
		}

		const indexes = (await mongoDb.collection(tableName).listIndexes().toArray()).map(
			toIndexInfo,
		);

		return indexes.sort(
			(a, b) =>
				Number(b.kind === "primary") - Number(a.kind === "primary") ||
				(a.indexName < b.indexName ? -1 : a.indexName > b.indexName ? 1 : 0),
		);
	}

	override async getTableIndexes({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<IndexInfoSchemaType[]> {
		return await this.listIndexes(await connector("mongodb").db(db), tableName);
	}

	override async createIndex(params: CreateIndexParamsSchemaType): Promise<void> {
		const { tableName, indexName, columns, isUnique, method, db } = params;

		try {
			if (method !== undefined)
				throw new HTTPException(400, { message: `Unsupported index method "${method}"` });

			const invalid = columns.find((path) =>
				path.split(".").some((segment) => segment === "" || segment.startsWith("$")),
			);

			if (invalid !== undefined)
				throw new HTTPException(400, { message: `Invalid field path "${invalid}"` });

			if (new Set(columns).size !== columns.length)
				throw new HTTPException(400, { message: "A field can appear only once in an index" });

			const mongoDb = await connector("mongodb").db(db);
			// MongoDB answers ok when the name and spec both match an existing index.
			const existing = await this.listIndexes(mongoDb, tableName);

			if (existing.some((index) => index.indexName === indexName))
				throw new HTTPException(409, {
					message: `Index "${indexName}" already exists on collection "${tableName}"`,
				});

			await mongoDb
				.collection(tableName)
				.createIndex(new Map(columns.map((path) => [path, 1])), {
					name: indexName,
					unique: isUnique,
				});
		} catch (e) {
			const code = (e as { code?: unknown }).code;

			if (e instanceof Error && typeof code === "number" && INDEX_CONFLICT_CODES.has(code))
				throw new HTTPException(409, { message: e.message, cause: e });
			throw e;
		}
	}

	override async dropIndex({
		tableName,
		indexName,
		db,
	}: DropIndexParamsSchemaType): Promise<void> {
		const mongoDb = await connector("mongodb").db(db);

		const index = (await this.listIndexes(mongoDb, tableName)).find(
			(candidate) => candidate.indexName === indexName,
		);

		if (!index)
			throw new HTTPException(404, {
				message: `Index "${indexName}" does not exist on collection "${tableName}"`,
			});

		if (index.kind === "primary")
			throw new HTTPException(400, {
				message: `Index "${indexName}" backs the primary key and cannot be dropped`,
			});
		await mongoDb.collection(tableName).dropIndex(indexName);
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
		const { tableName, data } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const payload = normalizeDoc(data);

		if (payload._id === "" || payload._id === null) delete payload._id;
		const result = await collection.insertOne(payload);

		if (!result.insertedId) {
			throw new HTTPException(500, {
				message: `Failed to insert record into "${tableName}"`,
			});
		}

		return { insertedCount: 1 };
	}

	override async updateRecords({
		db,
		params,
	}: {
		db: DatabaseSchemaType["db"];
		params: UpdateRecordsSchemaType;
	}): Promise<{ updatedCount: number }> {
		const { tableName } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);

		let totalUpdated = 0;
		const keyColumns = this.resolveKeyColumns(params).map((column) => column || "_id");

		const groups = this.groupUpdatesByKey({ ...params, primaryKeys: keyColumns }, keyColumns);

		for (const { keyValues, rowUpdates } of groups) {
			// MongoDB rejects $set on the immutable _id field, so surface it as a
			// client error instead of letting the driver fail mid-write.
			if (rowUpdates.some((update) => update.columnName === "_id")) {
				throw new HTTPException(400, {
					message: 'The "_id" field is immutable and cannot be updated.',
				});
			}

			const updateSet: Record<string, unknown> = {};

			for (const update of rowUpdates) updateSet[update.columnName] = update.value;

			const filter: Record<string, unknown> = {};
			keyColumns.forEach((column, i) => {
				const value = keyValues[i];
				filter[column] = column === "_id" ? coerceObjectId(value) : value;
			});

			const result = await collection.updateOne(filter, { $set: updateSet });

			if (result.matchedCount === 0) {
				throw new HTTPException(404, {
					message: `Record with ${this.describeKey(keyColumns, keyValues)} not found in "${tableName}"`,
				});
			}

			totalUpdated += result.modifiedCount;
		}

		return { updatedCount: totalUpdated };
	}

	override async deleteRecords(params: DeleteRecordParams): Promise<DeleteRecordResult> {
		const { tableName, primaryKeys, db } = params;
		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);
		const pkColumn = primaryKeys[0]?.columnName ?? "_id";

		const pkValues = primaryKeys.map((pk) =>
			pkColumn === "_id" ? coerceObjectId(pk.value) : pk.value,
		);

		const result = await collection.deleteMany({ [pkColumn]: { $in: pkValues } });

		return {
			deletedCount: result.deletedCount ?? 0,
			fkViolation: false,
			relatedRecords: [],
		};
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
		const { tableName, records, db } = params;

		if (!records || records.length === 0) {
			throw new HTTPException(400, { message: "At least one record is required" });
		}

		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(tableName);

		const docs = records.map((record) => {
			const normalized = normalizeDoc(record);

			if (normalized._id === "" || normalized._id === null) delete normalized._id;

			return normalized;
		});

		const result = await collection.insertMany(docs, { ordered: false });

		return {
			success: true,
			message: `Successfully inserted ${result.insertedCount} record${result.insertedCount !== 1 ? "s" : ""}`,
			successCount: result.insertedCount,
			failureCount: records.length - result.insertedCount,
		};
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
		if (!query?.trim()) {
			throw new HTTPException(400, { message: "Query is required" });
		}

		let payload: MongoQueryPayload;

		try {
			payload = JSON.parse(query) as MongoQueryPayload;
		} catch {
			throw new HTTPException(400, { message: "Mongo query must be valid JSON" });
		}

		if (!payload.collection || !payload.operation) {
			throw new HTTPException(400, {
				message: "Mongo query must include collection and operation",
			});
		}

		const mongoDb = await connector("mongodb").db(db);
		const collection = mongoDb.collection(payload.collection);

		const startTime = performance.now();
		let rows: Record<string, unknown>[] = [];
		let rowCount = 0;
		let message: string | undefined;

		switch (payload.operation) {
			case "find": {
				const filter = normalizeIdFilter(payload.filter ?? {});
				const cursor = collection.find(filter, payload.options ?? {});
				cursor.sort(payload.sort ?? buildSortStage("", undefined));

				if (payload.skip) cursor.skip(payload.skip);

				if (payload.limit) cursor.limit(payload.limit);
				rows = await cursor.toArray();
				rowCount = rows.length;
				break;
			}

			case "aggregate": {
				rows = await collection
					.aggregate(payload.pipeline ?? [], payload.options ?? {})
					.toArray();
				rowCount = rows.length;
				break;
			}

			case "insertOne": {
				const doc = payload.document as Record<string, unknown> | undefined;

				if (!doc) throw new HTTPException(400, { message: "document is required" });
				const result = await collection.insertOne(doc);
				rowCount = result.insertedId ? 1 : 0;
				message = "OK";
				break;
			}

			case "insertMany": {
				const docs = payload.document as Record<string, unknown>[] | undefined;

				if (!Array.isArray(docs))
					throw new HTTPException(400, { message: "document array is required" });
				const result = await collection.insertMany(docs);
				rowCount = result.insertedCount ?? 0;
				message = "OK";
				break;
			}

			case "updateOne": {
				const filter = normalizeIdFilter(payload.filter ?? {});

				if (!payload.update) throw new HTTPException(400, { message: "update is required" });

				const result = await collection.updateOne(
					filter,
					payload.update,
					payload.options ?? {},
				);

				rowCount = result.matchedCount ?? 0;
				message = `OK (${result.modifiedCount ?? 0} modified)`;
				break;
			}

			case "updateMany": {
				const filter = normalizeIdFilter(payload.filter ?? {});

				if (!payload.update) throw new HTTPException(400, { message: "update is required" });

				const result = await collection.updateMany(
					filter,
					payload.update,
					payload.options ?? {},
				);

				rowCount = result.matchedCount ?? 0;
				message = `OK (${result.modifiedCount ?? 0} modified)`;
				break;
			}

			case "deleteOne": {
				const filter = normalizeIdFilter(payload.filter ?? {});
				const result = await collection.deleteOne(filter, payload.options ?? {});
				rowCount = result.deletedCount ?? 0;
				message = "OK";
				break;
			}

			case "deleteMany": {
				const filter = normalizeIdFilter(payload.filter ?? {});
				const result = await collection.deleteMany(filter, payload.options ?? {});
				rowCount = result.deletedCount ?? 0;
				message = "OK";
				break;
			}

			case "count": {
				const filter = normalizeIdFilter(payload.filter ?? {});
				rowCount = await collection.countDocuments(filter);
				rows = [{ count: rowCount }];
				message = "OK";
				break;
			}

			default:
				throw new HTTPException(400, { message: "Unsupported Mongo operation" });
		}

		const duration = performance.now() - startTime;
		const normalizedRows = rows.map((row) => normalizeDoc(row));
		const columns = normalizedRows[0] ? Object.keys(normalizedRows[0]) : [];

		return { columns, rows: normalizedRows, rowCount, duration, message };
	}
}
