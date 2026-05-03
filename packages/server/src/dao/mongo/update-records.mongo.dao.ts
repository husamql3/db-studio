import { HTTPException } from "hono/http-exception";
import type { DatabaseSchemaType, UpdateRecordsSchemaType } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { canCoerceObjectId, toMongoId } from "./mongo.utils.js";

export async function updateRecords({
	params,
	db,
}: {
	params: UpdateRecordsSchemaType;
	db: DatabaseSchemaType["db"];
}): Promise<{ updatedCount: number }> {
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
		if (!updatesByRow.has(pkValue)) {
			updatesByRow.set(pkValue, {});
		}
		updatesByRow.get(pkValue)![update.columnName] = update.value;
	}

	for (const [pkValue, updateSet] of updatesByRow.entries()) {
		const queryValue =
			pkField === "_id" && canCoerceObjectId(pkValue) ? toMongoId(pkValue) : pkValue;

		const result = await collection.updateOne({ [pkField]: queryValue }, { $set: updateSet });

		if (result.matchedCount === 0) {
			throw new HTTPException(404, {
				message: `Record with ${pkField} = ${String(pkValue)} not found in "${tableName}"`,
			});
		}

		totalUpdated += result.modifiedCount;
	}

	return { updatedCount: totalUpdated };
}
