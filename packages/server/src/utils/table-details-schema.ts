import type {
	Column,
	ColumnInfoSchemaType,
	DatabaseSchema,
	DatabaseSchemaType,
	Relationship,
	Table,
} from "@db-studio/shared/types";
import type { IDbAdapter } from "@/adapters/adapter.interface.js";
import { getAdapter } from "@/adapters/adapter.registry.js";
import { getDbType } from "@/db-manager.js";
import { errorFields, writeOperationalLog } from "@/operational-log.js";

function convertColumnInfo(col: ColumnInfoSchemaType): Column {
	const column: Column = {
		name: col.columnName,
		type: col.dataTypeLabel,
		nullable: col.isNullable,
	};

	if (col.isPrimaryKey) {
		column.isPrimaryKey = true;
	}

	if (col.isForeignKey && col.referencedTable && col.referencedColumn) {
		column.foreignKey = `${col.referencedTable}.${col.referencedColumn}`;
	}

	if (col.enumValues && col.enumValues.length > 0) {
		column.enumValues = col.enumValues;
		column.description = `Enum values: ${col.enumValues.join(", ")}`;
	}

	return column;
}

function extractRelationships(tables: Table[]): Relationship[] {
	const relationships: Relationship[] = [];

	for (const table of tables) {
		for (const column of table.columns) {
			if (column.foreignKey) {
				const [toTable, toColumn] = column.foreignKey.split(".");
				relationships.push({
					fromTable: table.name,
					fromColumn: column.name,
					toTable,
					toColumn,
				});
			}
		}
	}

	return relationships;
}

async function getTableColumns(
	adapter: IDbAdapter,
	tableName: string,
	db: DatabaseSchemaType["db"],
): Promise<ColumnInfoSchemaType[]> {
	try {
		return await adapter.getTableColumns({ tableName, db });
	} catch (error) {
		writeOperationalLog("warn", "schema_columns_failed", errorFields(error));
		return [];
	}
}

export async function getDetailedSchema(
	db: DatabaseSchemaType["db"],
): Promise<DatabaseSchema> {
	const dbType = getDbType();
	const adapter = getAdapter(dbType);

	try {
		const tablesList = await adapter.getTablesList(db);
		// Structure only: the prompt goes to an external AI provider, and the setting
		// promises table and column metadata, never row values.
		const tables = await Promise.all(
			tablesList.map(
				async ({ schemaName, tableName }): Promise<Table> => ({
					name: schemaName ? `${schemaName}.${tableName}` : tableName,
					columns: (await getTableColumns(adapter, tableName, db)).map(convertColumnInfo),
				}),
			),
		);
		const relationships = extractRelationships(tables);

		return { dbType, tables, relationships };
	} catch (error) {
		writeOperationalLog("error", "schema_fetch_failed", errorFields(error));
		throw new Error(
			`Failed to fetch database schema: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}
