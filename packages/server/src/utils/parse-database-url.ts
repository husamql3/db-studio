import type { DatabaseTypeSchema } from "@db-studio/shared/types";

type UrlScheme = {
	dbType: DatabaseTypeSchema;
	defaultPort: number;
	/** Wire-compatible engines are handed to the driver under this scheme. */
	driverScheme?: string;
};

const URL_SCHEMES = new Map<string, UrlScheme>([
	["postgres", { dbType: "pg", defaultPort: 5432 }],
	["postgresql", { dbType: "pg", defaultPort: 5432 }],
	["cockroachdb", { dbType: "pg", defaultPort: 26257, driverScheme: "postgresql" }],
	["mysql", { dbType: "mysql", defaultPort: 3306 }],
	["mysql2", { dbType: "mysql", defaultPort: 3306 }],
	["mariadb", { dbType: "mysql", defaultPort: 3306, driverScheme: "mysql" }],
	["tidb", { dbType: "mysql", defaultPort: 4000, driverScheme: "mysql" }],
	["mssql", { dbType: "mssql", defaultPort: 1433 }],
	["sqlserver", { dbType: "mssql", defaultPort: 1433 }],
	["mongodb", { dbType: "mongodb", defaultPort: 27017 }],
	["mongodb+srv", { dbType: "mongodb", defaultPort: 27017 }],
	["sqlite", { dbType: "sqlite", defaultPort: 0 }],
	["redis", { dbType: "redis", defaultPort: 6379 }],
	["rediss", { dbType: "redis", defaultPort: 6379 }],
]);

export const resolveUrlScheme = (url: URL): UrlScheme | undefined =>
	URL_SCHEMES.get(url.protocol.replace(":", ""));

/**
 * Rewrite a wire-compatible alias (e.g. `cockroachdb://`) to the scheme its driver
 * understands, pinning the alias's default port so the driver does not substitute its own.
 */
export const toDriverUrl = (databaseUrl: string): string => {
	const url = new URL(databaseUrl);
	const scheme = resolveUrlScheme(url);
	if (!scheme?.driverScheme) return databaseUrl;
	url.port ||= String(scheme.defaultPort);
	url.protocol = scheme.driverScheme;
	return url.toString();
};

/**
 * Parse DATABASE_URL to extract host and port
 */
export function parseDatabaseUrl(databaseUrl = process.env.DATABASE_URL): {
	host: string;
	port: number;
} {
	if (!databaseUrl) {
		return { host: "localhost", port: 5432 };
	}

	try {
		const url = new URL(databaseUrl);
		return {
			host: url.hostname || "localhost",
			port: Number.parseInt(url.port, 10) || (resolveUrlScheme(url)?.defaultPort ?? 5432),
		};
	} catch (error) {
		console.error("Failed to parse DATABASE_URL:", error);
		return { host: "localhost", port: 5432 };
	}
}
