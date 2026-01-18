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

			console.log("POST /records body", { tableName, data });
			const result = await insertRecord({
				tableName,
				data,
				database,
			});
			console.log("POST /records", result);
			return c.json(result);
		} catch (error) {
			console.error("POST /records error:", error);
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

			console.log("PATCH /records body", {
				tableName,
				updates,
				primaryKey,
			});
			const result = await updateRecords({
				tableName,
				updates,
				primaryKey,
				database,
			});
			console.log("PATCH /records", result);
			return c.json(result);
		} catch (error) {
			console.error("PATCH /records error:", error);
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

			console.log("DELETE /records body", { tableName, primaryKeys });
			const result = await deleteRecords({
				tableName,
				primaryKeys,
				database,
			});
			console.log("DELETE /records result", result);

			if (result.fkViolation) {
				return c.json(result, 409);
			}

			return c.json(result);
		} catch (error) {
			console.error("DELETE /records error:", error);
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

			console.log("DELETE /records/force body", {
				tableName,
				primaryKeys,
			});
			const result = await forceDeleteRecords({
				tableName,
				primaryKeys,
				database,
			});
			console.log("DELETE /records/force result", result);

			return c.json(result);
		} catch (error) {
			console.error("DELETE /records/force error:", error);
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
