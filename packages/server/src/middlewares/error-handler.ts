import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import { ZodError } from "zod";
import type { ApiError } from "@/app.types.js";

/**
 * Centralized error handler for the application
 */
export function handleError(e: Error | unknown, c: Context) {
	console.error("handleError:", e);

	if (e instanceof HTTPException) {
		return e.getResponse();
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
		const isConnectionError =
			e.message.includes("ECONNREFUSED") ||
			e.message.includes("connection refused") ||
			e.message.includes("timeout expired") ||
			e.message.includes("Connection terminated") ||
			(e instanceof DatabaseError && e.code?.startsWith("08")); // Connection exception class

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
	result: { success: boolean; data?: unknown; error?: ZodError },
	c: Context,
) => {
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
