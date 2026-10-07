import { DATABASE_ENGINES, dbTypeFromProtocol } from "@db-studio/shared/types";

/** Wire-compatible aliases the drivers don't understand, with the alias engine's own default port. */
const DRIVER_ALIASES: Record<string, { driverScheme: string; defaultPort: number }> = {
	cockroachdb: { driverScheme: "postgresql", defaultPort: 26257 },
	mariadb: { driverScheme: "mysql", defaultPort: 3306 },
	tidb: { driverScheme: "mysql", defaultPort: 4000 },
};

const schemeOf = (url: URL) => url.protocol.replace(":", "");

export const defaultPortFor = (url: URL): number => {
	const scheme = schemeOf(url);
	const dbType = dbTypeFromProtocol(scheme);
	return (
		DRIVER_ALIASES[scheme]?.defaultPort ??
		(dbType && DATABASE_ENGINES[dbType].defaultPort) ??
		5432
	);
};

/**
 * Rewrite a wire-compatible alias (e.g. `cockroachdb://`) to the scheme its driver
 * understands, pinning the alias's default port so the driver does not substitute its own.
 */
export const toDriverUrl = (databaseUrl: string): string => {
	const url = new URL(databaseUrl);
	const alias = DRIVER_ALIASES[schemeOf(url)];
	if (!alias) return databaseUrl;
	url.port ||= String(alias.defaultPort);
	url.protocol = alias.driverScheme;
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
			port: Number.parseInt(url.port, 10) || defaultPortFor(url),
		};
	} catch (error) {
		console.error("Failed to parse DATABASE_URL:", error);
		return { host: "localhost", port: 5432 };
	}
}
