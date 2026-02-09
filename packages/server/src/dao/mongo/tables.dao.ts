import { HTTPException } from "hono/http-exception";
import type {
	ColumnInfoSchemaType,
	DataTypes,
	DatabaseSchemaType,
	TableDataResultSchemaType,
	TableInfoSchemaType,
	TableDataQuerySchemaType,
	FilterType,
	SortType,
} from "shared/types";
import { getMongoDb, coerceObjectId, isValidObjectId } from "@/mongo-manager.js";

const SAMPLE_LIMIT = 200;
const encodeCursor = (offset: number): string =>
	Buffer.from(JSON.stringify({ offset })).toString("base64url");
const decodeCursor = (cursor?: string): number => {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as {
			offset?: number;
		};
		return typeof parsed.offset === "number" ? parsed.offset : 0;
	} catch {
		return 0;
	}
};

const normalizeValue = (value: unknown): unknown => {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	if (value && typeof value === "object") {
		if ("_bsontype" in value && (value as { _bsontype?: string })._bsontype === "ObjectId") {
			return (value as { toHexString: () => string }).toHexString();
		}
		if (Array.isArray(value)) {
			return value.map((item) => normalizeValue(item));
		}
		const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [
			k,
			normalizeValue(v),
		]);
		return Object.fromEntries(entries);
	}
	return value;
};

const inferDataType = (value: unknown): DataTypes => {
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

const mapDataTypeLabel = (dataType: DataTypes): ColumnInfoSchemaType["dataTypeLabel"] => {
	switch (dataType) {
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

const buildMongoFilters = (filters: FilterType[]): Record<string, unknown> => {
	if (!filters || filters.length === 0) return {};
	const andConditions: Record<string, unknown>[] = [];
	const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parseValue = (raw: string) => {
		const trimmed = raw.trim();
		if (trimmed === "null") return null;
		if (trimmed === "true") return true;
		if (trimmed === "false") return false;
		const asNumber = Number(trimmed);
		if (!Number.isNaN(asNumber) && trimmed !== "") return asNumber;
		if (isValidObjectId(trimmed)) return coerceObjectId(trimmed);
		return raw;
	};

	for (const filter of filters) {
		const field = filter.columnName;
		const value = parseValue(filter.value);
		const op = filter.operator.toLowerCase();

		if (!field) continue;

		switch (op) {
			case "=":
				andConditions.push({ [field]: value });
				break;
			case "!=":
				andConditions.push({ [field]: { $ne: value } });
				break;
			case ">":
				andConditions.push({ [field]: { $gt: value } });
				break;
			case ">=":
				andConditions.push({ [field]: { $gte: value } });
				break;
			case "<":
				andConditions.push({ [field]: { $lt: value } });
				break;
			case "<=":
				andConditions.push({ [field]: { $lte: value } });
				break;
			case "is":
				andConditions.push({ [field]: value });
				break;
			case "is not":
				andConditions.push({ [field]: { $ne: value } });
				break;
			case "like":
				andConditions.push({
					[field]: {
						$regex: escapeRegex(String(value)),
						$options: "",
					},
				});
				break;
			case "not like":
				andConditions.push({
					[field]: {
						$not: { $regex: escapeRegex(String(value)), $options: "" },
					},
				});
				break;
			case "ilike":
				andConditions.push({
					[field]: {
						$regex: escapeRegex(String(value)),
						$options: "i",
					},
				});
				break;
			case "not ilike":
				andConditions.push({
					[field]: {
						$not: { $regex: escapeRegex(String(value)), $options: "i" },
					},
				});
				break;
			default:
				andConditions.push({ [field]: value });
				break;
		}
	}

	return andConditions.length ? { $and: andConditions } : {};
};

const buildMongoSort = (
	sort: TableDataQuerySchemaType["sort"],
	order?: TableDataQuerySchemaType["order"],
): Record<string, 1 | -1> => {
	if (!sort) return { _id: 1 };

	if (Array.isArray(sort)) {
		const sortEntries = (sort as SortType[]).map((s) => [
			s.columnName,
			s.direction === "desc" ? -1 : 1,
		]);
		return Object.fromEntries(sortEntries);
	}

	if (typeof sort === "string" && sort.length > 0) {
		return { [sort]: order === "desc" ? -1 : 1 };
	}

	return { _id: 1 };
};

export async function getMongoTablesList(
	db: DatabaseSchemaType["db"],
): Promise<TableInfoSchemaType[]> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections().toArray();

	const results: TableInfoSchemaType[] = [];
	for (const collection of collections) {
		const name = collection.name;
		const rowCount = await mongoDb.collection(name).estimatedDocumentCount();
		results.push({ tableName: name, rowCount });
	}

	return results;
}

export async function getMongoTableColumns({
	tableName,
	db,
}: {
	tableName: string;
	db: DatabaseSchemaType["db"];
}): Promise<ColumnInfoSchemaType[]> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const documents = await collection.find({}).limit(SAMPLE_LIMIT).toArray();

	const columnMap = new Map<
		string,
		{
			types: Set<DataTypes>;
			nullable: boolean;
		}
	>();

	const ensureColumn = (columnName: string, value: unknown) => {
		const dataType = inferDataType(value);
		if (!columnMap.has(columnName)) {
			columnMap.set(columnName, { types: new Set([dataType]), nullable: false });
		} else {
			columnMap.get(columnName)?.types.add(dataType);
		}
	};

	for (const doc of documents) {
		for (const [key, value] of Object.entries(doc)) {
			if (value === null || value === undefined) {
				if (!columnMap.has(key)) {
					columnMap.set(key, { types: new Set(["text"]), nullable: true });
				} else {
					const entry = columnMap.get(key);
					if (entry) entry.nullable = true;
				}
				continue;
			}
			ensureColumn(key, value);
		}
	}

	if (!columnMap.has("_id")) {
		columnMap.set("_id", { types: new Set(["text"]), nullable: false });
	}

	return Array.from(columnMap.entries()).map(([columnName, meta]) => {
		const dataType = meta.types.values().next().value ?? "text";
		return {
			columnName,
			dataType,
			dataTypeLabel: mapDataTypeLabel(dataType),
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

export async function getMongoTableData({
	tableName,
	cursor,
	limit,
	direction,
	sort,
	order,
	filters,
	db,
}: {
	tableName: string;
	cursor?: string;
	limit?: number;
	direction?: TableDataQuerySchemaType["direction"];
	sort?: TableDataQuerySchemaType["sort"];
	order?: TableDataQuerySchemaType["order"];
	filters?: TableDataQuerySchemaType["filters"];
	db: DatabaseSchemaType["db"];
}): Promise<TableDataResultSchemaType> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const filterObject = buildMongoFilters(filters ?? []);
	const sortObject = buildMongoSort(sort ?? "", order);

	const safeLimit = limit && limit > 0 ? limit : 50;
	const decodedCursor = decodeCursor(cursor);
	const offset = Number.isFinite(decodedCursor) && decodedCursor >= 0 ? decodedCursor : 0;
	const skip = direction === "desc" ? Math.max(offset - safeLimit, 0) : offset;

	const [total, rows] = await Promise.all([
		collection.countDocuments(filterObject),
		collection
			.find(filterObject)
			.sort(sortObject)
			.skip(skip)
			.limit(safeLimit)
			.toArray(),
	]);

	const normalizedRows = rows.map((row) => normalizeValue(row) as Record<string, unknown>);
	const nextOffset = skip + safeLimit;
	const prevOffset = Math.max(skip - safeLimit, 0);

	return {
		data: normalizedRows,
		meta: {
			limit: safeLimit,
			total,
			hasNextPage: nextOffset < total,
			hasPreviousPage: skip > 0,
			nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
			prevCursor: skip > 0 ? encodeCursor(prevOffset) : null,
		},
	};
}

export async function createMongoCollection({
	tableName,
	db,
}: {
	tableName: string;
	db: DatabaseSchemaType["db"];
}): Promise<void> {
	const mongoDb = await getMongoDb(db);
	const collections = await mongoDb.listCollections({ name: tableName }).toArray();
	if (collections.length > 0) {
		throw new HTTPException(400, { message: `Collection "${tableName}" already exists` });
	}
	await mongoDb.createCollection(tableName);
}

export async function deleteMongoColumn({
	tableName,
	columnName,
	db,
}: {
	tableName: string;
	columnName: string;
	db: DatabaseSchemaType["db"];
}): Promise<{ deletedCount: number }> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const result = await collection.updateMany({}, { $unset: { [columnName]: "" } });
	return { deletedCount: result.modifiedCount };
}

export async function exportMongoTableData({
	tableName,
	db,
}: {
	tableName: string;
	db: DatabaseSchemaType["db"];
}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const rows = await collection.find({}).limit(10000).toArray();
	const normalized = rows.map((row) => normalizeValue(row) as Record<string, unknown>);
	const cols = Array.from(
		new Set(normalized.flatMap((row) => Object.keys(row))),
	);
	return { cols, rows: normalized };
}

export const normalizeMongoDocument = normalizeValue;
export const buildMongoFiltersForQuery = buildMongoFilters;
export const buildMongoSortForQuery = buildMongoSort;
export const toMongoId = coerceObjectId;
export const canCoerceObjectId = isValidObjectId;
