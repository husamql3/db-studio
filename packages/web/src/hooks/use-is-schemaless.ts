import { useDatabaseEngine } from "@/hooks/use-database-engine";

/**
 * Returns true when the connected database has no user-defined schema, so DDL
 * operations (add column, alter column, etc.) do not apply. False until the
 * engine is known.
 */
export const useIsSchemaless = (): boolean => {
	const engine = useDatabaseEngine();
	return engine !== undefined && engine.dataModel !== "relational";
};
