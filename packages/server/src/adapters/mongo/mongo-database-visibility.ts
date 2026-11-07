/**
 * Mongo reports only databases that physically exist, so a freshly created
 * (empty) database never appears in `listDatabases`. Filtering system databases
 * therefore has to re-add the connected database explicitly, otherwise a user
 * connected to an empty database sees an empty selector — or, worse, a fallback
 * that shows exactly the `admin`/`config`/`local` entries we set out to hide.
 */

const SYSTEM_DATABASES = new Set(["admin", "config", "local"]);

export interface MongoDatabaseSummary {
	name: string;
	sizeOnDisk?: number;
}

export const visibleMongoDatabases = (
	databases: readonly MongoDatabaseSummary[],
	currentDb: string,
): MongoDatabaseSummary[] => {
	const visible = databases.filter(
		(db) => !SYSTEM_DATABASES.has(db.name) || db.name === currentDb,
	);

	if (!currentDb || visible.some((db) => db.name === currentDb)) return visible;

	return [...visible, { name: currentDb, sizeOnDisk: 0 }];
};
