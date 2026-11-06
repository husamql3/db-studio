import type { DatabaseTypeSchema } from "@db-studio/shared/types";
import type { ApiError } from "@db-studio/shared/types/api-response.types.js";
import { NotFoundError, ParseError, ValidationError } from "elysia";
import { ZodError } from "zod";
import { ADAPTERS } from "@/adapters/adapter.registry.js";
import { HTTPException } from "@/http-exception.js";
import { captureServerError } from "@/observability.js";
import { findRequestConnection } from "@/open-connections.js";
import {
	currentRequestContext,
	currentRequestId,
	errorFields,
	writeOperationalLog,
} from "@/operational-log.js";
import { sanitizeErrorMessage } from "@/sanitize-error.js";

const toApiError = (
	e: unknown,
	dbType: DatabaseTypeSchema | undefined,
): { status: number; body: Omit<ApiError, "requestId"> } => {
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

	// V8 caps one string near 2^29 characters; a response body past it cannot be written.
	if (e instanceof RangeError && e.message === "Invalid string length") {
		return {
			status: 400,
			body: {
				error: "The result is too large to send. Add a LIMIT or select fewer rows or columns.",
			},
		};
	}

	// The engine whose driver threw: the one the path names, else the one the request reached.
	const engine = dbType ?? findRequestConnection()?.dbType;

	if (engine) {
		const { status, message } = ADAPTERS[engine].classifyError(e);

		return { status, body: { error: message } };
	}

	return {
		status: 500,
		body: {
			error: e instanceof Error ? sanitizeErrorMessage(e.message) : "Internal server error",
		},
	};
};

/** Runs inside the request's context, which already names its operation and engine. */
export function handleError(e: unknown, request: Request): Response {
	const context = currentRequestContext();
	const operation = context?.operation ?? "unknown";
	const dbType = context?.dbType;
	const { status, body } = toApiError(e, dbType);
	writeOperationalLog(status >= 500 ? "error" : "warn", "request_failed", {
		method: request.method,
		status,
		...errorFields(e),
	});
	captureServerError(e, { operation, status, dbType });

	return Response.json({ ...body, requestId: currentRequestId() } satisfies ApiError, {
		status,
	});
}
