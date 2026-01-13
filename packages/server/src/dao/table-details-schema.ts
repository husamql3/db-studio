import { db } from "@/db.js";
import { type ColumnInfo, getTableColumns } from "./table-columns.dao.js";

export interface DatabaseSchema {
	dbType: string;
	tables: Table[];
	relationships: Relationship[];
}

interface Table {
	name: string;
	description?: string;
	columns: Column[];
	sampleData?: Record<string, string>[];
}

interface Column {
	name: string;
	type: string;
	nullable: boolean;
	isPrimaryKey?: boolean;
	foreignKey?: string;
	description?: string;
	enumValues?: string[];
}

interface Relationship {
	fromTable: string;
	fromColumn: string;
	toTable: string;
	toColumn: string;
}

/**
 * Get all table names from the database
 */
async function getTableNames(): Promise<string[]> {
	const client = await db.connect();
	try {
		const res = await client.query(
			`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `,
		);
		return res.rows.map((r) => r.table_name);
	} finally {
		client.release();
	}
}

/**
 * Get table comment/description if available
 */
async function getTableDescription(tableName: string): Promise<string | undefined> {
	const client = await db.connect();
	try {
		const res = await client.query(
			`
      SELECT obj_description(oid) as description
      FROM pg_class
      WHERE relname = $1
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `,
			[tableName],
		);
		return res.rows[0]?.description || undefined;
	} finally {
		client.release();
	}
}

/**
 * Get sample data from a table (first 3 rows)
 */
async function getSampleData(tableName: string): Promise<Record<string, any>[]> {
	const client = await db.connect();
	try {
		// Sanitize table name to prevent SQL injection
		// In production, validate tableName against known tables list
		const res = await client.query(`SELECT * FROM "${tableName}" LIMIT 3`);
		return res.rows;
	} catch (error) {
		console.warn(`Could not fetch sample data for table ${tableName}:`, error);
		return [];
	} finally {
		client.release();
	}
}

/**
 * Convert ColumnInfo to the schema Column format
 */
function convertColumnInfo(col: ColumnInfo): Column {
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

/**
 * Extract all relationships from table columns
 */
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

/**
 * Get complete database schema with all tables, columns, and relationships
 */
export async function getDatabaseSchema(
	// connectionId: string,
	options: {
		includeSampleData?: boolean;
		includeDescriptions?: boolean;
		maxTables?: number;
	} = {},
): Promise<DatabaseSchema> {
	const {
		includeSampleData = false,
		includeDescriptions = true,
		// maxTables = 50, // Prevent overwhelming the context
	} = options;

	try {
		// Get all table names
		const tableNames = await getTableNames();

		// Limit tables if needed to prevent token overflow
		// const limitedTableNames = tableNames.slice(0, maxTables);

		// if (tableNames.length > maxTables) {
		//   console.warn(
		//     `Database has ${tableNames.length} tables, only including first ${maxTables} in schema context`
		//   );
		// }

		// Fetch schema info for each table in parallel
		// const tablePromises = limitedTableNames.map(async (tableName) => {
		const tablePromises = tableNames.map(async (tableName) => {
			const [columns, description, sampleData] = await Promise.all([
				getTableColumns(tableName),
				includeDescriptions ? getTableDescription(tableName) : Promise.resolve(undefined),
				includeSampleData ? getSampleData(tableName) : Promise.resolve([]),
			]);

			const table: Table = {
				name: tableName,
				columns: columns.map(convertColumnInfo),
			};

			if (description) {
				table.description = description;
			}

			if (sampleData.length > 0) {
				table.sampleData = sampleData;
			}

			return table;
		});

		const tables = await Promise.all(tablePromises);

		// Extract relationships from foreign keys
		const relationships = extractRelationships(tables);

		return {
			dbType: "PostgreSQL",
			tables,
			relationships,
		};
	} catch (error) {
		console.error("Error fetching database schema:", error);
		throw new Error(
			`Failed to fetch database schema: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Get lightweight schema (no sample data, useful for token efficiency)
 */
export async function getLightweightSchema(): Promise<DatabaseSchema> {
	return getDatabaseSchema({
		includeSampleData: false,
		includeDescriptions: false,
	});
}

/**
 * Get detailed schema with sample data (for initial conversation context)
 */
export async function getDetailedSchema(): Promise<DatabaseSchema> {
	return getDatabaseSchema({
		includeSampleData: true,
		includeDescriptions: true,
		// maxTables: 30, // todo: DELETE THIS AFTER TESTING
	});
}
