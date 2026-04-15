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
import type { ApiHandler, RouteEnv } from "@/app.types.js";
import { getDaoFactory } from "@/dao/dao-factory.js";

export const recordsRoutes = new Hono<RouteEnv>()
	/**
	 * Base path for the endpoints, /:dbType/records/...
	 */
	.basePath("/records")

	/**
	 * POST /records
	 * Adds a new record into a table
	 */
	.post(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", addRecordSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, data } = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getDaoFactory(dbType);
			const { insertedCount } = await dao.addRecord({ db, params: { tableName, data } });
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
	 */
	.patch(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", updateRecordsSchema),
		async (c): ApiHandler<string> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKey, updates } = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getDaoFactory(dbType);
			const { updatedCount } = await dao.updateRecords({
				params: { tableName, primaryKey, updates },
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
	 */
	.delete(
		"/",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<DeleteRecordResult, 409 | 200> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getDaoFactory(dbType);
			const { deletedCount, fkViolation, relatedRecords } = await dao.deleteRecords({
				tableName,
				primaryKeys,
				db,
			});
			if (fkViolation) {
				return c.json(
					{
						data: {
							deletedCount: 0,
							fkViolation: true,
							relatedRecords,
						},
					},
					409,
				);
			}
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
	 */
	.delete(
		"/force",
		zValidator("query", databaseSchema),
		zValidator("json", deleteRecordSchema),
		async (c): ApiHandler<{ deletedCount: number }> => {
			const { db } = c.req.valid("query");
			const { tableName, primaryKeys } = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getDaoFactory(dbType);
			const deletedCount = await dao.forceDeleteRecords({ tableName, primaryKeys, db });
			return c.json({ data: deletedCount }, 200);
		},
	)

	/**
	 * POST /records/bulk
	 * Bulk inserts multiple records into a table
	 */
	.post(
		"/bulk",
		zValidator("query", databaseSchema),
		zValidator("json", bulkInsertRecordsSchema),
		async (c): ApiHandler<object> => {
			const { db } = c.req.valid("query");
			const { tableName, records } = c.req.valid("json");
			const dbType = c.get("dbType");
			const dao = getDaoFactory(dbType);
			const result = await dao.bulkInsertRecords({ tableName, records, db });
			console.log("result", result);
			return c.json({ data: result }, 200);
		},
	);

export type RecordsRoutes = typeof recordsRoutes;
