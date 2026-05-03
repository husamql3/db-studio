import type { DatabaseSchemaType } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";

export async function deleteColumn({
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
