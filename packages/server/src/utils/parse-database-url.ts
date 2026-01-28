/**
 * Parse DATABASE_URL to extract host and port
 */
export function parseDatabaseUrl(): { host: string; port: number } {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		return { host: "localhost", port: 5432 };
	}

	try {
		const url = new URL(databaseUrl);
		return {
			host: url.hostname || "localhost",
			port: Number.parseInt(url.port, 10) || 5432,
		};
	} catch (error) {
		console.error("Failed to parse DATABASE_URL:", error);
		return { host: "localhost", port: 5432 };
	}
}
