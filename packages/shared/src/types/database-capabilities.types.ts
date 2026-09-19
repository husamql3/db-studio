import type { DatabaseTypeSchema } from "./database.types.js";

export type DatabaseCapability = "liveMode";

export interface DatabaseCapabilities {
	liveMode: boolean;
}

export const DATABASE_CAPABILITIES: Record<DatabaseTypeSchema, DatabaseCapabilities> = {
	pg: { liveMode: true },
	mysql: { liveMode: false },
	mssql: { liveMode: false },
	sqlite: { liveMode: false },
	mongodb: { liveMode: false },
	redis: { liveMode: false },
};

export function hasDatabaseCapability(
	dbType: DatabaseTypeSchema | null | undefined,
	capability: DatabaseCapability,
): boolean {
	if (!dbType) return false;
	return DATABASE_CAPABILITIES[dbType]?.[capability] ?? false;
}
