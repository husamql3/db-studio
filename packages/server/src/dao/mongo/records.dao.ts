import { HTTPException } from "hono/http-exception";
import type {
	AddRecordSchemaType,
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteResult,
	UpdateRecordsSchemaType,
} from "shared/types";
import { getMongoDb } from "@/mongo-manager.js";
import {
	canCoerceObjectId,
	normalizeMongoDocument,
	toMongoId,
} from "./tables.dao.js";

export async function addMongoRecord({
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

export async function updateMongoRecords({
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

		const result = await collection.updateOne(
			{ [pkField]: queryValue },
			{ $set: updateSet },
		);

		if (result.matchedCount === 0) {
			throw new HTTPException(404, {
				message: `Record with ${pkField} = ${String(pkValue)} not found in "${tableName}"`,
			});
		}

		totalUpdated += result.modifiedCount;
	}

	return { updatedCount: totalUpdated };
}

export async function deleteMongoRecords({
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

export async function forceDeleteMongoRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<{ deletedCount: number }> {
	const result = await deleteMongoRecords({ tableName, primaryKeys, db });
	return { deletedCount: result.deletedCount };
}
