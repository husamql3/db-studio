import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import type { ApiError } from "shared/types/api-response.types.js";
import { ZodError } from "zod";

/**
 * Centralized error handler for the application
 */
export function handleError(e: Error | unknown, c: Context) {
	console.error("handleError:", e);

	if (e instanceof HTTPException) {
		return c.json<ApiError>(
			{
				error: e.message ?? "Internal server error",
			},
			e.status,
		);
	}

	if (e instanceof ZodError) {
		const issue = e.issues[0];
		return c.json<ApiError>(
			{
				error: "Validation error",
				details: issue.message,
			},
			400,
		);
	}

	if (e instanceof Error) {
		// MySQL-specific error codes
		const mysqlError = e as { code?: string; errno?: number };
		const isMysqlConnectionError =
			mysqlError.code === "ECONNREFUSED" ||
			mysqlError.code === "ENOTFOUND" ||
			mysqlError.code === "ETIMEDOUT" ||
			mysqlError.code === "ER_ACCESS_DENIED_ERROR" ||
			mysqlError.code === "ER_BAD_HOST_ERROR" ||
			mysqlError.code === "ECONNRESET" ||
			mysqlError.errno === 1045 || // ER_ACCESS_DENIED_ERROR
			mysqlError.errno === 2003 || // Can't connect to MySQL server
			mysqlError.errno === 2002; // Can't connect to local MySQL server

		const isConnectionError =
			isMysqlConnectionError ||
			e.message.includes("ECONNREFUSED") ||
			e.message.includes("connection refused") ||
			e.message.includes("timeout expired") ||
			e.message.includes("Connection terminated") ||
			(e instanceof DatabaseError && e.code?.startsWith("08")); // PostgreSQL connection exception class

		if (isConnectionError) {
			return c.json<ApiError>(
				{ error: "Database connection failed", details: e.message },
				503,
			);
		}
	}

	return c.json<ApiError>(
		{
			error: e instanceof Error ? e.message : "Internal server error",
		},
		500,
	);
}

export const validationHook = (
	result: {
		success: boolean;
		data?: unknown;
		error?: { issues: { message: string }[] };
	},
	c: Context,
): Response | undefined => {
	if (!result.success) {
		const issue = result.error?.issues[0];
		return c.json<ApiError>(
			{
				error: "Validation error",
				details: issue?.message ?? "Unknown validation error",
			},
			400,
		);
	}
};
