import {
	addRecordSchema,
	bulkInsertRecordsSchema,
	databaseSchema,
	deleteRecordSchema,
	updateRecordsSchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const recordsRoutes = new Elysia({ prefix: "/records" })
	.use(adapterPlugin)

	/**
	 * POST /records
	 * Adds a new record into a table
	 */
	.post(
		"/",
		async ({ adapter, query: { db }, body: { tableName, data } }) => {
			const { insertedCount } = await adapter.addRecord({ db, params: { tableName, data } });
			return {
				data: `Record inserted into "${tableName}" with ${insertedCount} rows inserted`,
			};
		},
		{ query: databaseSchema, body: addRecordSchema },
	)

	/**
	 * PATCH /records
	 * Updates one or more cells in a table
	 */
	.patch(
		"/",
		async ({ adapter, query: { db }, body }) => {
			const { updatedCount } = await adapter.updateRecords({ params: body, db });
			return { data: `Updated ${updatedCount} records in "${body.tableName}"` };
		},
		{ query: databaseSchema, body: updateRecordsSchema },
	)

	/**
	 * DELETE /records
	 * Deletes records from a table
	 */
	.delete(
		"/",
		async ({ adapter, query: { db }, body: { tableName, primaryKeys }, status }) => {
			const { deletedCount, fkViolation, relatedRecords } = await adapter.deleteRecords({
				tableName,
				primaryKeys,
				db,
			});
			if (fkViolation) {
				return status(409, { data: { deletedCount: 0, fkViolation: true, relatedRecords } });
			}
			return { data: { deletedCount, fkViolation: false, relatedRecords: [] } };
		},
		{ query: databaseSchema, body: deleteRecordSchema },
	)

	/**
	 * DELETE /records/force
	 * Force deletes records and all related FK records
	 */
	.delete(
		"/force",
		async ({ adapter, query: { db }, body: { tableName, primaryKeys } }) => ({
			data: await adapter.forceDeleteRecords({ tableName, primaryKeys, db }),
		}),
		{ query: databaseSchema, body: deleteRecordSchema },
	)

	/**
	 * POST /records/bulk
	 * Bulk inserts multiple records into a table
	 */
	.post(
		"/bulk",
		async ({ adapter, query: { db }, body: { tableName, records } }) => ({
			data: await adapter.bulkInsertRecords({ tableName, records, db }),
		}),
		{ query: databaseSchema, body: bulkInsertRecordsSchema },
	);
