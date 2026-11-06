import type {
	Column,
	ColumnInfoSchemaType,
	DatabaseSchema,
	DatabaseSchemaType,
	Relationship,
	Table,
} from "@db-studio/shared/types";
import { ADAPTERS } from "@/adapters/adapter.registry.js";
import { requestConnection } from "@/open-connections.js";
import { tablesWithColumns } from "@/routes/tables.routes.js";

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

export async function getDetailedSchema(
	db: DatabaseSchemaType["db"],
): Promise<DatabaseSchema> {
	const { dbType } = requestConnection();

	// Structure only: the prompt goes to an external AI provider, and the setting promises table
	// and column metadata, never row values.
	const tables = (await tablesWithColumns(ADAPTERS[dbType], db)).map(
		({ schemaName, tableName, columns }): Table => ({
			name: schemaName ? `${schemaName}.${tableName}` : tableName,
			columns: columns.map(convertColumnInfo),
		}),
	);

	return { dbType, tables, relationships: extractRelationships(tables) };
}
