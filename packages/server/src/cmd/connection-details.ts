import { DATABASE_ENGINES, type DatabaseTypeSchema } from "@db-studio/shared/types";
import { parseConnectionUrl } from "@/connection-url.js";

export type DatabaseConnectionDetails = {
	type: DatabaseTypeSchema;
	name: string;
	destination: string;
};

/** What the CLI names while it connects; `null` for a URL that does not parse. */
export const getDatabaseConnectionDetails = (
	databaseUrl: string,
): DatabaseConnectionDetails | null => {
	let url: ReturnType<typeof parseConnectionUrl>;

	try {
		url = parseConnectionUrl(databaseUrl);
	} catch {
		return null;
	}

	const { dbType: type, scheme, file, host, port } = url;
	const { label: name } = DATABASE_ENGINES[type];

	if (file !== null) return { type, name, destination: "local file" };

	if (scheme === "d1") return { type, name, destination: "Cloudflare D1" };

	return { type, name, destination: port ? `${host}:${port}` : host };
};
