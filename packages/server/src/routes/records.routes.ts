import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	addRecordSchema,
	bulkInsertRecordsSchema,
	type DeleteRecordResult,
	databaseSchema,
	deleteRecordSchema,
	updateRecordsSchema,
} from "shared/types";
import type { ApiHandler } from "@/app.types.js";
import { addRecord } from "@/dao/add-record.dao.js";
import { bulkInsertRecords } from "@/dao/bulk-insert-records.dao.js";
import { deleteRecords, forceDeleteRecords } from "@/dao/delete-records.dao.js";
import { updateRecords } from "@/dao/update-records.dao.js";
import {
	addMongoRecord,
	deleteMongoRecords,
	forceDeleteMongoRecords,
	updateMongoRecords,
} from "@/dao/mongo/records.dao.js";

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
			const dbType = c.get("dbType");
			const { insertedCount } =
				dbType === "mongodb"
					? await addMongoRecord({ db, params: { tableName, data } })
					: await addRecord({ db, params: { tableName, data } });
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
			const dbType = c.get("dbType");
			const { updatedCount } =
				dbType === "mongodb"
					? await updateMongoRecords({ params: { tableName, primaryKey, updates }, db })
					: await updateRecords({ params: { tableName, primaryKey, updates }, db });
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
	 * @returns {ApiHandler<string, 409 | 200>} A success message
	 */
	.delete(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<DeleteRecordResult, 409 | 200> => {
			// TODO: refactor this shit, the backend responses should be consistent
			// TODO: the frontend could be simplified too
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const dbType = c.get("dbType");
			const { deletedCount } =
				dbType === "mongodb"
					? await deleteMongoRecords({ tableName, primaryKeys, db })
					: await deleteRecords({ tableName, primaryKeys, db });
			return c.json(
				{
					data: {
						deletedCount,
						fkViolation: false,
						relatedRecords: [],
					},
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
		async (c): ApiHandler<{ deletedCount: number }> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const dbType = c.get("dbType");
			const { deletedCount } =
				dbType === "mongodb"
					? await forceDeleteMongoRecords({ tableName, primaryKeys, db })
					: await forceDeleteRecords({ tableName, primaryKeys, db });
			return c.json(
				{
					data: `Deleted ${deletedCount} records from "${tableName}"`,
				},
				200,
			);
		},
	);

export type RecordsRoutes = typeof recordsRoutes;
