import type { DatabaseTypeSchema } from "@db-studio/shared/types";

const SCHEME_TO_DB_TYPE: Record<string, DatabaseTypeSchema> = {
	postgres: "pg",
	postgresql: "pg",
	mysql: "mysql",
	mysql2: "mysql",
	mssql: "mssql",
	sqlserver: "mssql",
	mongodb: "mongodb",
	"mongodb+srv": "mongodb",
	sqlite: "sqlite",
	redis: "redis",
	rediss: "redis",
};

export const SUPPORTED_SCHEMES = Object.keys(SCHEME_TO_DB_TYPE);

export type ConnectionDescription = {
	dbType: DatabaseTypeSchema;
	/** Host, port, and database path with credentials stripped. */
	summary: string;
};

/**
 * Validates a connection URL against the schemes the server understands and produces a
 * credential-free summary for display. Throws for anything the server would reject.
 */
export const describeConnectionUrl = (raw: string): ConnectionDescription => {
	const value = raw.trim();
	const scheme = value.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
	const dbType = scheme ? SCHEME_TO_DB_TYPE[scheme] : undefined;
	if (!scheme || !dbType) {
		throw new Error(
			`Unsupported connection URL. Expected one of: ${SUPPORTED_SCHEMES.map((s) => `${s}://`).join(", ")}`,
		);
	}

	if (dbType === "sqlite") {
		return { dbType, summary: value.slice(`${scheme}://`.length) || "in-memory" };
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Connection URL is malformed");
	}
	if (!url.hostname) throw new Error("Connection URL is missing a host");

	const port = url.port ? `:${url.port}` : "";
	const database = url.pathname && url.pathname !== "/" ? url.pathname : "";
	return { dbType, summary: `${url.hostname}${port}${database}` };
};
