import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteRecords, forceDeleteRecords } from "@/dao/delete-records.dao.js";
import { insertRecord } from "@/dao/insert-record.dao.js";
import { updateRecords } from "@/dao/update-records.dao.js";
import {
	deleteRecordsSchema,
	insertRecordSchema,
	updateRecordsSchema,
} from "@/types/create-table.type.js";

export const recordsRoutes = new Hono();

/**
 * POST /records - Insert a new record into a table
 */
recordsRoutes.post("/", zValidator("json", insertRecordSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		const { tableName, data } = body;

		console.log("POST /records body", { tableName, data });
		const result = await insertRecord({ tableName, data });
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
				message: error instanceof Error ? error.message : "Failed to create record",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * PATCH /records - Update one or more cells in a table
 */
recordsRoutes.patch("/", zValidator("json", updateRecordsSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		const { tableName, updates, primaryKey } = body;

		console.log("PATCH /records body", { tableName, updates, primaryKey });
		const result = await updateRecords({ tableName, updates, primaryKey });
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
				message: error instanceof Error ? error.message : "Failed to update records",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * DELETE /records - Delete records from a table
 */
recordsRoutes.delete("/", zValidator("json", deleteRecordsSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		const { tableName, primaryKeys } = body;

		console.log("DELETE /records body", { tableName, primaryKeys });
		const result = await deleteRecords({ tableName, primaryKeys });
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
				message: error instanceof Error ? error.message : "Failed to delete records",
				detail: errorDetail,
			},
			500,
		);
	}
});

/**
 * DELETE /records/force - Force delete records and all related FK records
 */
recordsRoutes.delete("/force", zValidator("json", deleteRecordsSchema), async (c) => {
	try {
		const body = c.req.valid("json");
		const { tableName, primaryKeys } = body;

		console.log("DELETE /records/force body", { tableName, primaryKeys });
		const result = await forceDeleteRecords({ tableName, primaryKeys });
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
					error instanceof Error ? error.message : "Failed to force delete records",
				detail: errorDetail,
			},
			500,
		);
	}
});
