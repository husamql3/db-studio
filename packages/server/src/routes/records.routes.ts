import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	addRecordSchema,
	databaseSchema,
	deleteRecordSchema,
	updateRecordsSchema,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { addRecord } from "@/dao/add-record.dao.js";
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
	 * @returns {BaseResponseType<{ message: string }>} A success message
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", addRecordSchema),
		async (c): ApiHandler<{ message: string }> => {
			const { database } = c.req.valid("query");
			const { tableName, data } = c.req.valid("json");
			const { insertedCount } = await addRecord({
				database,
				params: {
					tableName,
					data,
				},
			});
			return c.json(
				{
					message: `Record inserted into "${tableName}" with ${insertedCount} rows inserted`,
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
	 * @returns {ApiHandler<{ message: string }>} A success message
	 */
	.patch(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", updateRecordsSchema),
		async (c): ApiHandler<{ message: string }> => {
			const { database } = c.req.valid("query");
			const { tableName, primaryKey, updates } = c.req.valid("json");
			const { updatedCount } = await updateRecords({
				params: {
					tableName,
					primaryKey,
					updates,
				},
				database,
			});
			return c.json(
				{
					message: `Updated ${updatedCount} records in "${tableName}"`,
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
	 * @returns {ApiHandler<{ message: string }>} A success message
	 */
	.delete(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<{ message: string }> => {
			const { database } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const { deletedCount } = await deleteRecords({
				tableName,
				primaryKeys,
				database,
			});
			return c.json(
				{
					message: `Deleted ${deletedCount} records from "${tableName}"`,
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
	 * @returns {ApiHandler<{ message: string }>} A success message
	 */
	.delete(
		"/force",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<{ message: string }> => {
			const { database } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const { deletedCount } = await forceDeleteRecords({
				tableName,
				primaryKeys,
				database,
			});
			return c.json(
				{
					message: `Deleted ${deletedCount} records from "${tableName}"`,
				},
				200,
			);
		},
	);

export type RecordsRoutes = typeof recordsRoutes;
