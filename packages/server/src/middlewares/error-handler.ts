import type { ApiError } from "@db-studio/shared/types/api-response.types.js";
import { NotFoundError, ParseError, ValidationError } from "elysia";
import { ZodError } from "zod";
import { isPgDatabaseError } from "@/drivers.js";
import { HTTPException } from "@/http-exception.js";
import {
	captureServerError,
	databaseTypeForRequest,
	operationForRequest,
} from "@/observability.js";
import { currentRequestId, errorFields, writeOperationalLog } from "@/operational-log.js";

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
		(isPgDatabaseError(e) && e.code?.startsWith("08") === true)
	);
};

const toApiError = (e: unknown): { status: number; body: Omit<ApiError, "requestId"> } => {
	if (e instanceof HTTPException) return { status: e.status, body: { error: e.message } };
	if (e instanceof ValidationError) {
		return {
			status: 400,
			body: { error: "Validation error", details: e.all[0]?.message ?? "Invalid request" },
		};
	}
	if (e instanceof ZodError) {
		return { status: 400, body: { error: "Validation error", details: e.issues[0].message } };
	}
	if (e instanceof ParseError) {
		return { status: 400, body: { error: "Malformed JSON in request body" } };
	}
	if (e instanceof NotFoundError) return { status: 404, body: { error: "Not found" } };
	if (e instanceof Error && isConnectionError(e)) {
		return { status: 503, body: { error: "Database connection failed", details: e.message } };
	}
	return {
		status: 500,
		body: { error: e instanceof Error ? e.message : "Internal server error" },
	};
};

/**
 * Centralized error handler: logs the failure and answers with the `ApiError` body.
 */
export function handleError(e: unknown, request: Request): Response {
	const { pathname } = new URL(request.url);
	const operation = operationForRequest(request.method, pathname);
	const dbType = databaseTypeForRequest(pathname);
	const { status, body } = toApiError(e);
	writeOperationalLog(status >= 500 ? "error" : "warn", "request_failed", {
		operation,
		db_type: dbType,
		method: request.method,
		status,
		...errorFields(e),
	});
	captureServerError(e, { operation, status, dbType });
	return Response.json({ ...body, requestId: currentRequestId() } satisfies ApiError, {
		status,
	});
}
