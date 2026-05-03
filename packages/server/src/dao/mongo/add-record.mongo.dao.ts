import { HTTPException } from "hono/http-exception";
import type { AddRecordSchemaType, DatabaseSchemaType } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { normalizeMongoDocument } from "./mongo.utils.js";

export async function addRecord({
	db,
	params,
}: {
	db: DatabaseSchemaType["db"];
	params: AddRecordSchemaType;
}): Promise<{ insertedCount: number }> {
	const { tableName, data } = params;
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);
	const payload = normalizeMongoDocument(data) as Record<string, unknown>;
	if (payload._id === "" || payload._id === null) {
		delete payload._id;
	}
	const result = await collection.insertOne(payload);
	if (!result.insertedId) {
		throw new HTTPException(500, {
			message: `Failed to insert record into "${tableName}"`,
		});
	}
	return { insertedCount: 1 };
}
