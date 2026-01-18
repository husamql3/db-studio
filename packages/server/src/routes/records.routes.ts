import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	databaseQuerySchema,
	deleteRecordsSchema,
	insertRecordSchema,
	updateRecordsSchema,
} from "shared/types";
import { deleteRecords, forceDeleteRecords } from "@/dao/delete-records.dao.js";
import { insertRecord } from "@/dao/insert-record.dao.js";
import { updateRecords } from "@/dao/update-records.dao.js";

export const recordsRoutes = new Hono();

/**
 * POST /records - Insert a new record into a table
 */
recordsRoutes.post(
	"/",
	zValidator("json", insertRecordSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, data } = body;
			const { database } = c.req.valid("query");

			const result = await insertRecord({
				tableName,
				data,
				database,
			});
			return c.json(result);
		} catch (error) {
			const errorDetail =
				error && typeof error === "object" && "detail" in error
					? (error as { detail?: string }).detail
					: undefined;
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Failed to create record",
					detail: errorDetail,
				},
				500,
			);
		}
	},
);

/**
 * PATCH /records - Update one or more cells in a table
 */
recordsRoutes.patch(
	"/",
	zValidator("json", updateRecordsSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, updates, primaryKey } = body;
			const { database } = c.req.valid("query");

			const result = await updateRecords({
				tableName,
				updates,
				primaryKey,
				database,
			});
			return c.json(result);
		} catch (error) {
			const errorDetail =
				error && typeof error === "object" && "detail" in error
					? (error as { detail?: string }).detail
					: undefined;
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Failed to update records",
					detail: errorDetail,
				},
				500,
			);
		}
	},
);

/**
 * DELETE /records - Delete records from a table
 */
recordsRoutes.delete(
	"/",
	zValidator("json", deleteRecordsSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, primaryKeys } = body;
			const { database } = c.req.valid("query");

			const result = await deleteRecords({
				tableName,
				primaryKeys,
				database,
			});

			if (result.fkViolation) {
				return c.json(result, 409);
			}

			return c.json(result);
		} catch (error) {
			const errorDetail =
				error && typeof error === "object" && "detail" in error
					? (error as { detail?: string }).detail
					: undefined;
			return c.json(
				{
					success: false,
					message:
						error instanceof Error ? error.message : "Failed to delete records",
					detail: errorDetail,
				},
				500,
			);
		}
	},
);

/**
 * DELETE /records/force - Force delete records and all related FK records
 */
recordsRoutes.delete(
	"/force",
	zValidator("json", deleteRecordsSchema),
	zValidator("query", databaseQuerySchema),
	async (c) => {
		try {
			const body = c.req.valid("json");
			const { tableName, primaryKeys } = body;
			const { database } = c.req.valid("query");

			const result = await forceDeleteRecords({
				tableName,
				primaryKeys,
				database,
			});

			return c.json(result);
		} catch (error) {
			const errorDetail =
				error && typeof error === "object" && "detail" in error
					? (error as { detail?: string }).detail
					: undefined;
			return c.json(
				{
					success: false,
					message:
						error instanceof Error
							? error.message
							: "Failed to force delete records",
					detail: errorDetail,
				},
				500,
			);
		}
	},
);
