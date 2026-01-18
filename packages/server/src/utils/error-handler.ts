import type { Context } from "hono";

export const handleConnectionError = (
	c: Context,
	error: unknown,
	fallbackMessage: string,
) => {
	const errorMessage = error instanceof Error ? error.message : fallbackMessage;

	let isConnectionError = false;
	if (error && typeof error === "object" && "code" in error) {
		isConnectionError = (error as { code?: string }).code === "ECONNREFUSED";
	} else if (
		error &&
		typeof error === "object" &&
		"errors" in error &&
		Array.isArray((error as { errors?: unknown[] }).errors)
	) {
		const aggregateError = error as {
			errors?: Array<{ code?: string }>;
		};
		isConnectionError =
			aggregateError.errors?.some((err) => err.code === "ECONNREFUSED") ??
			false;
	}

	if (isConnectionError) {
		console.error("handleConnectionError Error:", error);
		return c.json(
			{
				success: false,
				message:
					"Cannot connect to database. Please check your DATABASE_URL and ensure the database server is running.",
				error: errorMessage,
			},
			503,
		);
	}

	console.error("handleConnectionError Error:", error);
	return c.json(
		{
			success: false,
			message: errorMessage,
		},
		500,
	);
};
