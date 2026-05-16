import { useDatabaseStore } from "@/stores/database.store";

/**
 * Returns true when the connected database has a fixed/synthesized schema
 * that does not support DDL operations (add column, alter column, etc.)
 * or arbitrary sort/filter on table data.
 *
 * Today this is only Redis — schema is fixed to six type-tables and SCAN
 * pagination has no global ordering.
 */
export const useIsSchemaless = (): boolean => {
	const { dbType } = useDatabaseStore();
	return dbType === "mongodb"; // || dbType === "redis";
};
