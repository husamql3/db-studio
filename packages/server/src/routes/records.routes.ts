import {
	addRecordSchema,
	bulkInsertRecordsSchema,
	DATABASE_ENGINES,
	deleteRecordSchema,
	tableQuerySchema,
	updateRecordsSchema,
} from "@db-studio/shared/types";
import { Elysia } from "elysia";
import { HTTPException } from "@/http-exception.js";
import { adapterPlugin } from "@/routes/adapter.plugin.js";

export const recordsRoutes = new Elysia({ prefix: "/records" })
	.use(adapterPlugin)

	/**
	 * POST /records
	 * Adds a new record into a table
	 */
	.post(
		"/",
		async ({ adapter, query: { db, schemaName }, body: { tableName, data } }) => {
			const { insertedCount } = await adapter.addRecord({
				db,
				schemaName,
				params: { tableName, data },
			});
			return {
				data: `Record inserted into "${tableName}" with ${insertedCount} rows inserted`,
			};
		},
		{ query: tableQuerySchema, body: addRecordSchema },
	)

	/**
	 * PATCH /records
	 * Updates one or more cells in a table
	 */
	.patch(
		"/",
		async ({ adapter, dbType, query: { db, schemaName }, body }) => {
			if (!DATABASE_ENGINES[dbType].cellDefault && body.updates.some((u) => u.useDefault))
				throw new HTTPException(400, {
					message: `${DATABASE_ENGINES[dbType].label} cannot set a cell to its column default`,
				});
			const { updatedCount } = await adapter.updateRecords({ params: body, schemaName, db });
			return { data: `Updated ${updatedCount} records in "${body.tableName}"` };
		},
		{ query: tableQuerySchema, body: updateRecordsSchema },
	)

	/**
	 * DELETE /records
	 * Deletes records from a table
	 */
	.delete(
		"/",
		async ({
			adapter,
			query: { db, schemaName },
			body: { tableName, primaryKeys },
			status,
		}) => {
			const { deletedCount, fkViolation, relatedRecords } = await adapter.deleteRecords({
				tableName,
				schemaName,
				primaryKeys,
				db,
			});
			if (fkViolation) {
				return status(409, { data: { deletedCount: 0, fkViolation: true, relatedRecords } });
			}
			return { data: { deletedCount, fkViolation: false, relatedRecords: [] } };
		},
		{ query: tableQuerySchema, body: deleteRecordSchema },
	)

	/**
	 * DELETE /records/force
	 * Force deletes records and all related FK records
	 */
	.delete(
		"/force",
		async ({ adapter, query: { db, schemaName }, body: { tableName, primaryKeys } }) => ({
			data: await adapter.forceDeleteRecords({ tableName, schemaName, primaryKeys, db }),
		}),
		{ query: tableQuerySchema, body: deleteRecordSchema },
	)

	/**
	 * POST /records/bulk
	 * Bulk inserts multiple records into a table
	 */
	.post(
		"/bulk",
		async ({ adapter, query: { db, schemaName }, body: { tableName, records } }) => ({
			data: await adapter.bulkInsertRecords({ tableName, schemaName, records, db }),
		}),
		{ query: tableQuerySchema, body: bulkInsertRecordsSchema },
	);
