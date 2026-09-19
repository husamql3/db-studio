import type { ApiError } from "@db-studio/shared/types/api-response.types.js";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import { ZodError } from "zod";
import {
	captureServerError,
	databaseTypeForRequest,
	operationForRequest,
	writeOperationalLog,
} from "@/observability.js";

/** HTTPException leaves `name` as "Error", so it needs an explicit check. */
const errorTypeName = (e: unknown): string => {
	if (e instanceof HTTPException) return "HTTPException";
	return e instanceof Error ? e.name : "UnknownError";
};

const isConnectionError = (e: Error): boolean => {
	const mysqlError = e as Error & { code?: string; errno?: number };
	const isMysqlConnectionError =
		mysqlError.code === "ECONNREFUSED" ||
		mysqlError.code === "ENOTFOUND" ||
		mysqlError.code === "ETIMEDOUT" ||
		mysqlError.code === "ER_ACCESS_DENIED_ERROR" ||
		mysqlError.code === "ER_BAD_HOST_ERROR" ||
		mysqlError.code === "ECONNRESET" ||
		mysqlError.errno === 1045 ||
		mysqlError.errno === 2003 ||
		mysqlError.errno === 2002;

	return (
		isMysqlConnectionError ||
		e.message.includes("ECONNREFUSED") ||
		e.message.includes("connection refused") ||
		e.message.includes("timeout expired") ||
		e.message.includes("Connection terminated") ||
		e.message.includes("MongoNetworkError") ||
		e.message.includes("MongoServerSelectionError") ||
		(e instanceof DatabaseError && e.code?.startsWith("08") === true)
	);
};

const statusForError = (e: unknown): number => {
	if (e instanceof HTTPException) return e.status;
	if (e instanceof ZodError) return 400;
	if (e instanceof Error && isConnectionError(e)) return 503;
	return 500;
};

/**
 * Centralized error handler for the application
 */
export function handleError(e: Error | unknown, c: Context) {
	const operation = operationForRequest(c.req.method, c.req.path);
	const errorType = errorTypeName(e);
	const status = statusForError(e);
	writeOperationalLog("error", "request_failed", { operation, error_type: errorType });
	captureServerError(e, {
		operation,
		status,
		dbType: databaseTypeForRequest(c.req.path),
	});

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
		if (isConnectionError(e)) {
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
