import { HTTPException } from "hono/http-exception";
import type { DeleteTableParams, DeleteTableResult } from "shared/types";
import { getMongoDb } from "@/db-manager.js";

export async function deleteTable({
	tableName,
	db,
}: DeleteTableParams): Promise<DeleteTableResult> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);

	try {
		const rowCount = await collection.estimatedDocumentCount();
		await collection.drop();
		return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to delete table "${tableName}"`,
		});
	}
}
