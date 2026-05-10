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

function stringifySampleValue(value: unknown): string {
	if (value == null) {
		return "";
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

async function getSampleData(
	adapter: IDbAdapter,
	tableName: string,
	db: DatabaseSchemaType["db"],
): Promise<Record<string, string>[]> {
	try {
		const result = await adapter.getTableData({ tableName, db, limit: 3 });
		return result.data.map((row) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => [key, stringifySampleValue(value)]),
			),
		);
	} catch (error) {
		console.warn(`Could not fetch sample data for table ${tableName}:`, error);
		return [];
	}
}

async function getDatabaseSchema(
	db: DatabaseSchemaType["db"],
	options: {
		includeSampleData?: boolean;
		includeDescriptions?: boolean;
		maxTables?: number;
	} = {},
): Promise<DatabaseSchema> {
	const dbType = getDbType();
	const { includeSampleData = false, maxTables } = options;
	const adapter = getAdapter(dbType);

	try {
		const tablesList = await adapter.getTablesList(db);
		const tableNames = tablesList
			.slice(0, maxTables ?? tablesList.length)
			.map((t) => t.tableName);

		const tablePromises = tableNames.map(async (tableName) => {
			const [columns, sampleData] = await Promise.all([
				adapter.getTableColumns({ tableName, db }),
				includeSampleData ? getSampleData(adapter, tableName, db) : Promise.resolve([]),
			]);

			const table: Table = {
				name: tableName,
				columns: columns.map(convertColumnInfo),
			};

			if (sampleData.length > 0) {
				table.sampleData = sampleData;
			}

			return table;
		});

		const tables = await Promise.all(tablePromises);
		const relationships = extractRelationships(tables);

		return { dbType, tables, relationships };
	} catch (error) {
		console.error("Error fetching database schema:", error);
		throw new Error(
			`Failed to fetch database schema: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

export async function getDetailedSchema(
	db: DatabaseSchemaType["db"],
): Promise<DatabaseSchema> {
	return getDatabaseSchema(db, {
		includeSampleData: true,
		includeDescriptions: true,
	});
}
