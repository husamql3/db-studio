import { HTTPException } from "hono/http-exception";
import type { BulkInsertRecordsParams, BulkInsertResult } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { normalizeMongoDocument } from "./mongo.utils.js";

export const bulkInsertRecords = async ({
	tableName,
	records,
	db,
}: BulkInsertRecordsParams): Promise<BulkInsertResult> => {
	if (!records || records.length === 0) {
		throw new HTTPException(400, { message: "At least one record is required" });
	}

	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);

	const docs = records.map((record) => {
		const normalized = normalizeMongoDocument(record) as Record<string, unknown>;
		if (normalized._id === "" || normalized._id === null) delete normalized._id;
		return normalized;
	});

	try {
		const result = await collection.insertMany(docs, { ordered: false });
		return {
			success: true,
			message: `Successfully inserted ${result.insertedCount} record${result.insertedCount !== 1 ? "s" : ""}`,
			successCount: result.insertedCount,
			failureCount: records.length - result.insertedCount,
		};
	} catch (error) {
		throw new HTTPException(500, {
			message: `Bulk insert failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
};
