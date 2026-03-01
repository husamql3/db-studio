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
import { addRecord as pgAddRecord } from "@/dao/add-record.dao.js";
import { bulkInsertRecords as pgBulkInsertRecords } from "@/dao/bulk-insert-records.dao.js";
import {
	deleteRecords as pgDeleteRecords,
	forceDeleteRecords as pgForceDeleteRecords,
} from "@/dao/delete-records.dao.js";
import { addRecord as mysqlAddRecord } from "@/dao/mysql/add-record.mysql.dao.js";
import { bulkInsertRecords as mysqlBulkInsertRecords } from "@/dao/mysql/bulk-insert-records.mysql.dao.js";
import {
	deleteRecords as mysqlDeleteRecords,
	forceDeleteRecords as mysqlForceDeleteRecords,
} from "@/dao/mysql/delete-records.mysql.dao.js";
import { updateRecords as mysqlUpdateRecords } from "@/dao/mysql/update-records.mysql.dao.js";
import { updateRecords as pgUpdateRecords } from "@/dao/update-records.dao.js";

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
			const { insertedCount } =
				dbType === "mysql"
					? await mysqlAddRecord({ db, params: { tableName, data } })
					: await pgAddRecord({ db, params: { tableName, data } });
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
			const { updatedCount } =
				dbType === "mysql"
					? await mysqlUpdateRecords({ params: { tableName, primaryKey, updates }, db })
					: await pgUpdateRecords({ params: { tableName, primaryKey, updates }, db });
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
			const { deletedCount, fkViolation, relatedRecords } =
				dbType === "mysql"
					? await mysqlDeleteRecords({ tableName, primaryKeys, db })
					: await pgDeleteRecords({ tableName, primaryKeys, db });
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
			const deletedCount =
				dbType === "mysql"
					? await mysqlForceDeleteRecords({ tableName, primaryKeys, db })
					: await pgForceDeleteRecords({ tableName, primaryKeys, db });
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
			const result =
				dbType === "mysql"
					? await mysqlBulkInsertRecords({ tableName, records, db })
					: await pgBulkInsertRecords({ tableName, records, db });
			console.log("result", result);
			return c.json({ data: result }, 200);
		},
	);

export type RecordsRoutes = typeof recordsRoutes;
