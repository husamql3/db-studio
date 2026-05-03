import { HTTPException } from "hono/http-exception";
import type {
	AddColumnParamsSchemaType,
	AddRecordSchemaType,
	AlterColumnParamsSchemaType,
	BulkInsertRecordsParams,
	BulkInsertResult,
	ColumnInfoSchemaType,
	ConnectionInfoSchemaType,
	CreateTableSchemaType,
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
} from "shared/types";
import type { GetTableDataParams } from "@/adapters/adapter.interface.js";
import { BaseAdapter, type NormalizedRow, type QueryBundle } from "@/adapters/base.adapter.js";
import { getMongoClient, getMongoDb, getMongoDbName } from "@/adapters/connections.js";
import { coerceObjectId, isValidObjectId } from "@/db-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";
import {
	buildMatchStage,
	buildSortStage,
	decodeMongoCursor,
	encodeMongoCursor,
} from "./mongo.pipeline-builder.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const normalizeValue = (value: unknown): unknown => {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "bigint") return value.toString();
	if (value && typeof value === "object") {
		if ("_bsontype" in value && (value as { _bsontype?: string })._bsontype === "ObjectId") {
			return (value as { toHexString: () => string }).toHexString();
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

const canCoerce = (value: unknown): boolean =>
	typeof value === "string" && isValidObjectId(value);

const toMongoId = (value: unknown) => coerceObjectId(value as string);

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

const resolveFieldDefault = (
	defaultValue: string | null | undefined,
	columnType: string,
): unknown => {
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
		return { ...filter, _id: toMongoId(filter._id) };
	}
	if (filter._id && typeof filter._id === "object") {
		const obj = filter._id as Record<string, unknown>;
		if (Array.isArray(obj.$in)) {
			return {
				...filter,
				_id: {
					...obj,
					$in: obj.$in.map((v) => (typeof v === "string" ? toMongoId(v) : v)),
				},
			};
		}
		if (Array.isArray(obj.$nin)) {
			return {
				...filter,
				_id: {
					...obj,
					$nin: obj.$nin.map((v) => (typeof v === "string" ? toMongoId(v) : v)),
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

export class MongoAdapter extends BaseAdapter {
	// -----------------------------------------------------------------------
	// Abstract stubs — MongoDB does not use SQL
	// -----------------------------------------------------------------------

	protected runQuery<T>(): Promise<T> {
		throw new HTTPException(501, { message: "runQuery is not supported for MongoDB" });
	}

	protected buildTableDataQuery(_params: GetTableDataParams): QueryBundle {
		throw new HTTPException(501, {
			message: "buildTableDataQuery is not supported for MongoDB",
		});
	}

	protected normalizeRows(rawRows: unknown[]): NormalizedRow[] {
		return rawRows.map((row) => this.normalizeRow(normalizeDoc(row)));
	}

	protected buildCursors(): { nextCursor: string | null; prevCursor: string | null } {
		return { nextCursor: null, prevCursor: null };
	}

	protected quoteIdentifier(name: string): string {
		return name;
	}

	// -----------------------------------------------------------------------
	// Type mapping
	// -----------------------------------------------------------------------

	mapToUniversalType(nativeType: string): DataTypes {
		switch (nativeType.toLowerCase()) {
			case "int":
			case "long":
			case "double":
			case "decimal":
				return "number";
			case "bool":
				return "boolean";
			case "date":
				return "date";
			case "array":
				return "array";
			case "object":
				return "json";
			default:
				return "text";
		}
	}

	mapFromUniversalType(universalType: string): string {
		switch (universalType) {
			case "number":
				return "double";
			case "boolean":
				return "bool";
			case "date":
				return "date";
			case "array":
				return "array";
			case "json":
				return "object";
			default:
				return "string";
		}
	}

	// -----------------------------------------------------------------------
	// wrapError override — adds MongoDB-specific connection error names
	// -----------------------------------------------------------------------

	protected override wrapError(e: unknown): HTTPException {
		if (e instanceof HTTPException) return e;
		if (e instanceof Error) {
			const name = (e as { name?: string }).name ?? "";
			if (
				name === "MongoNetworkError" ||
				name === "MongoServerSelectionError" ||
				name === "MongoTopologyClosedError"
			) {
				return new HTTPException(503, { message: e.message });
			}
		}
		return super.wrapError(e);
	}

	// -----------------------------------------------------------------------
	// getTableData — full override (skip/limit pagination)
	// -----------------------------------------------------------------------

	override async getTableData(params: GetTableDataParams): Promise<TableDataResultSchemaType> {
		try {
			const { tableName, db, cursor, limit, direction = "asc", sort, order, filters } = params;

			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
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
		try {
			const mongoDb = await getMongoDb(db);
			const collection = mongoDb.collection(tableName);
			const rows = await collection.find({}).limit(10000).toArray();
			const normalized = rows.map((row) => normalizeDoc(row));
			const cols = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));
			return { cols, rows: normalized };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	// -----------------------------------------------------------------------
	// Database operations
	// -----------------------------------------------------------------------

	override async getDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
		try {
			const client = await getMongoClient();
			const admin = client.db().admin();
			const result = await admin.listDatabases();
			const databases = result.databases ?? [];
			if (!databases[0]) {
				throw new HTTPException(500, { message: "No databases returned from MongoDB" });
			}
			return databases.map((db) => ({
				name: db.name,
				size: formatBytes(db.sizeOnDisk ?? 0),
				owner: "n/a",
				encoding: "n/a",
			}));
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async getCurrentDatabase(): Promise<DatabaseSchemaType> {
		return { db: getMongoDbName() };
	}

	override async getDatabaseConnectionInfo(): Promise<ConnectionInfoSchemaType> {
		try {
			const client = await getMongoClient();
			const admin = client.db().admin();
			const urlDefaults = parseDatabaseUrl();
			let serverStatus: {
				version?: string;
				connections?: { current?: number; available?: number };
			} = {};
			try {
				serverStatus = await admin.serverStatus();
			} catch (error) {
				console.warn("Failed to read MongoDB serverStatus:", error);
			}
			return {
				host: urlDefaults.host,
				port: urlDefaults.port,
				user: "n/a",
				database: getMongoDbName(),
				version: serverStatus.version ?? "unknown",
				active_connections: serverStatus.connections?.current ?? 0,
				max_connections:
					(serverStatus.connections?.current ?? 0) +
					(serverStatus.connections?.available ?? 0),
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
			const mongoDb = await getMongoDb(db);
			const collections = await mongoDb.listCollections().toArray();
			const results: TableInfoSchemaType[] = [];
			for (const col of collections) {
				const rowCount = await mongoDb.collection(col.name).estimatedDocumentCount();
				results.push({ tableName: col.name, rowCount });
			}
			return results;
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async createTable({
		tableData,
		db,
	}: {
		tableData: CreateTableSchemaType;
		db: DatabaseSchemaType["db"];
	}): Promise<void> {
		try {
			const tableName = tableData?.tableName ?? "";
			const mongoDb = await getMongoDb(db);
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
					properties[field.columnName] = {
						bsonType: "array",
						...(bsonType !== "array" ? { items: { bsonType } } : {}),
					};
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async deleteTable({
		tableName,
		db,
	}: DeleteTableParams): Promise<DeleteTableResult> {
		try {
			const mongoDb = await getMongoDb(db);
			const collection = mongoDb.collection(tableName);
			const rowCount = await collection.estimatedDocumentCount();
			await collection.drop();
			return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async getTableSchema({
		tableName,
		db,
	}: {
		tableName: string;
		db: DatabaseSchemaType["db"];
	}): Promise<string> {
		try {
			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
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
		try {
			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async addColumn(params: AddColumnParamsSchemaType): Promise<void> {
		try {
			const { tableName, columnName, columnType, defaultValue, isNullable, db } = params;
			const mongoDb = await getMongoDb(db);
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
				...((existingSchema.properties as Record<string, unknown>) ?? {}),
				[columnName]: { bsonType: isNullable ? [columnType, "null"] : columnType },
			};
			const required: string[] = [...(existingSchema.required ?? [])];
			if (!isNullable && !required.includes(columnName)) required.push(columnName);

			await mongoDb.command({
				collMod: tableName,
				validator: {
					$jsonSchema: {
						...existingSchema,
						bsonType: "object",
						properties,
						...(required.length > 0 ? { required } : {}),
					},
				},
				validationAction: "warn",
			});
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async deleteColumn({
		tableName,
		columnName,
		db,
	}: DeleteColumnParamsSchemaType): Promise<{ deletedCount: number }> {
		try {
			const mongoDb = await getMongoDb(db);
			const collection = mongoDb.collection(tableName);
			const result = await collection.updateMany({}, { $unset: { [columnName]: "" } });
			return { deletedCount: result.modifiedCount };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async alterColumn(params: AlterColumnParamsSchemaType): Promise<void> {
		try {
			const { tableName, columnName, columnType, isNullable, db } = params;
			const mongoDb = await getMongoDb(db);
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
			const properties: Record<string, unknown> = {
				...((existingSchema.properties as Record<string, unknown>) ?? {}),
			};
			const required: string[] = [...(existingSchema.required ?? [])];

			properties[columnName] = {
				bsonType: isNullable ? [columnType, "null"] : columnType,
			};

			const reqIndex = required.indexOf(columnName);
			if (!isNullable && reqIndex === -1) required.push(columnName);
			else if (isNullable && reqIndex !== -1) required.splice(reqIndex, 1);

			await mongoDb.command({
				collMod: tableName,
				validator: {
					$jsonSchema: {
						...existingSchema,
						bsonType: "object",
						properties,
						...(required.length > 0 ? { required } : {}),
					},
				},
				validationAction: "warn",
			});
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async renameColumn(params: RenameColumnParamsSchemaType): Promise<void> {
		try {
			const { tableName, columnName, newColumnName, db } = params;
			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
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
			const mongoDb = await getMongoDb(db);
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
			const mongoDb = await getMongoDb(db);
			const collection = mongoDb.collection(tableName);

			let totalUpdated = 0;
			const pkField = primaryKey || "_id";
			const updatesByRow = new Map<unknown, Record<string, unknown>>();

			for (const update of updates) {
				const pkValue = update.rowData[pkField];
				if (pkValue === undefined || pkValue === null) {
					throw new HTTPException(400, {
						message: `Primary key "${pkField}" not found in row data.`,
					});
				}
				if (!updatesByRow.has(pkValue)) updatesByRow.set(pkValue, {});
				updatesByRow.get(pkValue)![update.columnName] = update.value;
			}

			for (const [pkValue, updateSet] of updatesByRow.entries()) {
				const queryValue =
					pkField === "_id" && canCoerce(pkValue) ? toMongoId(pkValue) : pkValue;
				const result = await collection.updateOne(
					{ [pkField]: queryValue },
					{ $set: updateSet },
				);
				if (result.matchedCount === 0) {
					throw new HTTPException(404, {
						message: `Record with ${pkField} = ${String(pkValue)} not found in "${tableName}"`,
					});
				}
				totalUpdated += result.modifiedCount;
			}

			return { updatedCount: totalUpdated };
		} catch (e) {
			throw this.wrapError(e);
		}
	}

	override async deleteRecords(params: DeleteRecordParams): Promise<DeleteRecordResult> {
		try {
			const { tableName, primaryKeys, db } = params;
			const mongoDb = await getMongoDb(db);
			const collection = mongoDb.collection(tableName);
			const pkColumn = primaryKeys[0]?.columnName ?? "_id";
			const pkValues = primaryKeys.map((pk) =>
				pkColumn === "_id" && canCoerce(pk.value) ? toMongoId(pk.value) : pk.value,
			);
			const result = await collection.deleteMany({ [pkColumn]: { $in: pkValues } });
			return { deletedCount: result.deletedCount ?? 0 };
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
			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
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
		try {
			if (!query || !query.trim()) {
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

			const mongoDb = await getMongoDb(db);
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
		} catch (e) {
			throw this.wrapError(e);
		}
	}
}
