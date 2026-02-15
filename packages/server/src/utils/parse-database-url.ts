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
		const protocol = url.protocol.replace(":", "");
		const defaultPort = protocol === "mongodb" || protocol === "mongodb+srv" ? 27017 : 5432;
		return {
			host: url.hostname || "localhost",
			port: Number.parseInt(url.port, 10) || defaultPort,
		};
	} catch (error) {
		console.error("Failed to parse DATABASE_URL:", error);
		return { host: "localhost", port: 5432 };
	}
}
