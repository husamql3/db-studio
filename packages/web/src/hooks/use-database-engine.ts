import { DATABASE_ENGINES, type DatabaseEngine } from "@db-studio/shared/types";
import { useDatabaseStore } from "@/stores/database.store";

/** The connected engine's registry entry, or `undefined` before a connection is known. */
export const useDatabaseEngine = (): DatabaseEngine | undefined => {
	const { dbType } = useDatabaseStore();
	return dbType ? DATABASE_ENGINES[dbType] : undefined;
};
