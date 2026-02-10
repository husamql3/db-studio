import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	addRecordSchema,
	bulkInsertRecordsSchema,
	databaseSchema,
	deleteRecordSchema,
	updateRecordsSchema,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { addRecord } from "@/dao/add-record.dao.js";
import { bulkInsertRecords } from "@/dao/bulk-insert-records.dao.js";
import { deleteRecords, forceDeleteRecords } from "@/dao/delete-records.dao.js";
import { updateRecords } from "@/dao/update-records.dao.js";

export const recordsRoutes = new Hono()
	/**
	 * Base path for the endpoints, /:dbType/records/...
	 */
	.basePath("/records")

	/**
	 * POST /records
	 * Adds a new record into a table
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {AddRecordSchemaType} json - The data for the new record
	 * @returns {BaseResponseType<string>} A success message
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", addRecordSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, data } = c.req.valid("json");
			const { insertedCount } = await addRecord({
				db,
				params: {
					tableName,
					data,
				},
			});
			return c.json(
				{
					data: `Record inserted into "${tableName}" with ${insertedCount} rows inserted`,
				},
				200,
			);
		},
	)

	/**
	 * PATCH /records
	 * Updates one or more cells in a table
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {UpdateRecordsSchemaType} json - The data for the updates
	 * @returns {ApiHandler<string>} A success message
	 */
	.patch(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", updateRecordsSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKey, updates } = c.req.valid("json");
			const { updatedCount } = await updateRecords({
				params: {
					tableName,
					primaryKey,
					updates,
				},
				db,
			});
			return c.json(
				{
					data: `Updated ${updatedCount} records in "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * DELETE /records
	 * Deletes records from a table
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {DeleteRecordSchemaType} json - The data for the deletes
	 * @returns {ApiHandler<string>} A success message
	 */
	.delete(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const { deletedCount } = await deleteRecords({
				tableName,
				primaryKeys,
				db,
			});
			return c.json(
				{
					data: `Deleted ${deletedCount} records from "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * DELETE /records/force
	 * Force deletes records and all related FK records
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {DeleteRecordSchemaType} json - The data for the deletes
	 * @returns {ApiHandler<string>} A success message
	 */
	.delete(
		"/force",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const { deletedCount } = await forceDeleteRecords({
				tableName,
				primaryKeys,
				db,
			});
			return c.json(
				{
					data: `Deleted ${deletedCount} records from "${tableName}"`,
				},
				200,
			);
		},
	)

	/**
	 * POST /records/bulk
	 * Bulk inserts multiple records into a table
	 * @param {DatabaseSchemaType} query - The database to use
	 * @param {BulkInsertRecordsParamsType} json - The data for the bulk insert
	 * @returns {BaseResponseType<BulkInsertResult>} Success and failure counts
	 */
	.post(
		"/bulk",
		zValidator("query", databaseSchema),
		zValidator("json", bulkInsertRecordsSchema),
		async (c): ApiHandler<object> => {
			const { db } = c.req.valid("query");
			const { tableName, records } = c.req.valid("json");
			const result = await bulkInsertRecords({ tableName, records, db });
			console.log("result", result);
			return c.json({ data: result }, 200);
		},
	);

export type RecordsRoutes = typeof recordsRoutes;
