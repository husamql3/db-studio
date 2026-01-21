import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import z, { ZodError } from "zod";

/**
 * Centralized error handler for the application
 */
export function handleError(e: Error | unknown, c: Context) {
	console.error("Server error:", e);

	if (e instanceof HTTPException) {
		return e.getResponse();
	}

	if (e instanceof ZodError) {
		return c.json(
			{
				error: "Validation error",
				details: z.treeifyError(e),
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
			return c.json(
				{ error: "Database connection failed", cause: e.message },
				503,
			);
		}
	}

	return c.json(
		{
			error: e instanceof Error ? e.message : "Internal server error",
		},
		500,
	);
}
