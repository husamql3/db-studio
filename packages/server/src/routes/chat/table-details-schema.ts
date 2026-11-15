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
import { tablesWithColumns } from "@/routes/tables-with-columns.js";

/** A table as the prompt names it: schema-qualified where the engine has schemas. */
const qualifiedName = (schemaName: string | undefined, tableName: string) =>
	schemaName ? `${schemaName}.${tableName}` : tableName;

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
		column.foreignKey = `${qualifiedName(col.referencedSchema, col.referencedTable)}.${col.referencedColumn}`;
	}

	if (col.enumValues && col.enumValues.length > 0) {
		column.enumValues = col.enumValues;
		column.description = `Enum values: ${col.enumValues.join(", ")}`;
	}

	return column;
}

export async function getDetailedSchema(
	db: DatabaseSchemaType["db"],
): Promise<DatabaseSchema> {
	const { dbType } = requestConnection();
	const tables: Table[] = [];
	const relationships: Relationship[] = [];

	// Structure only: the prompt goes to an external AI provider, and the setting promises table
	// and column metadata, never row values.
	for (const { schemaName, tableName, columns } of await tablesWithColumns(
		ADAPTERS[dbType],
		db,
	)) {
		const name = qualifiedName(schemaName, tableName);
		tables.push({ name, columns: columns.map(convertColumnInfo) });

		for (const col of columns)
			if (col.isForeignKey && col.referencedTable && col.referencedColumn)
				relationships.push({
					fromTable: name,
					fromColumn: col.columnName,
					toTable: qualifiedName(col.referencedSchema, col.referencedTable),
					toColumn: col.referencedColumn,
				});
	}

	return { dbType, tables, relationships };
}
