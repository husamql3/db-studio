import type { DeleteRecordParams, DeleteResult } from "shared/types";
import { getMongoDb } from "@/adapters/connections.js";
import { canCoerceObjectId, toMongoId } from "./mongo.utils.js";

export async function deleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<DeleteResult> {
	const mongoDb = await getMongoDb(db);
	const collection = mongoDb.collection(tableName);

	const pkColumn = primaryKeys[0]?.columnName ?? "_id";
	const pkValues = primaryKeys.map((pk) =>
		pkColumn === "_id" && canCoerceObjectId(pk.value) ? toMongoId(pk.value) : pk.value,
	);

	const result = await collection.deleteMany({ [pkColumn]: { $in: pkValues } });
	return { deletedCount: result.deletedCount ?? 0 };
}

export async function forceDeleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<{ deletedCount: number }> {
	const result = await deleteRecords({ tableName, primaryKeys, db });
	return { deletedCount: result.deletedCount };
}
