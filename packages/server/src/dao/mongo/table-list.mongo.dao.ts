import type { TableInfoSchemaType } from "@db-studio/shared/types";
import type { DatabaseSchemaType } from "@db-studio/shared/types/database.types.js";
import { getMongoDb } from "@/adapters/connections.js";

export async function getTablesList(
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
