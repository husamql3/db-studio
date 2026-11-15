import type { DatabaseSchemaType } from "@db-studio/shared/types";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";

/** Every table with its columns: the schema visualizer's graph and the AI assistant's schema. */
export const tablesWithColumns = async (adapter: IDbAdapter, db: DatabaseSchemaType["db"]) =>
	Promise.all(
		(await adapter.getTablesList(db)).map(async (table) => ({
			...table,
			columns: await adapter.getTableColumns({
				tableName: table.tableName,
				schemaName: table.schemaName,
				db,
			}),
		})),
	);
