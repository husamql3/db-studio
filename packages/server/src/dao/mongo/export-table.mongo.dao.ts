import type { DatabaseSchemaType } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { normalizeMongoDocument } from "./mongo.utils.js";

export async function exportTableData({
	tableName,
	db,
}: {
	tableName: string;
	db: DatabaseSchemaType["db"];
}): Promise<{ cols: string[]; rows: Record<string, unknown>[] }> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const rows = await collection.find({}).limit(10000).toArray();
	const normalized = rows.map((row) => normalizeMongoDocument(row) as Record<string, unknown>);
	const cols = Array.from(new Set(normalized.flatMap((row) => Object.keys(row))));
	return { cols, rows: normalized };
}
