import type {
	DatabaseSchemaType,
	TableDataQuerySchemaType,
	TableDataResultSchemaType,
} from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { buildMongoFilters, buildMongoSort, normalizeMongoDocument } from "./mongo.utils.js";

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

export async function getTableData({
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
		collection.find(filterObject).sort(sortObject).skip(skip).limit(safeLimit).toArray(),
	]);

	const normalizedRows = rows.map(
		(row) => normalizeMongoDocument(row) as Record<string, unknown>,
	);
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
