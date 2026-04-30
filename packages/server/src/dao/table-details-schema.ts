import type {
	Column,
	ColumnInfoSchemaType,
	DatabaseSchema,
	DatabaseSchemaType,
	Relationship,
	Table,
} from "shared/types";
import { getDaoFactory } from "@/dao/dao-factory.js";
import { getMongoDatabaseSchema } from "@/dao/mongo/schema.dao.js";
import { getDbPool, getDbType } from "@/db-manager.js";

/**
 * Fetch the pg_class description for a table — PostgreSQL only.
 */
async function getTableDescription(
	tableName: string,
	database: string,
): Promise<string | undefined> {
	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		const res = await client.query(
			`SELECT obj_description(oid) as description
			 FROM pg_class
			 WHERE relname = $1
			   AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
			[tableName],
		);
		return res.rows[0]?.description || undefined;
	} finally {
		client.release();
	}
}

/**
 * Fetch the first 3 rows of a table as sample data — PostgreSQL only.
 */
async function getSampleData(
	tableName: string,
	database: string,
): Promise<Record<string, unknown>[]> {
	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		const res = await client.query(`SELECT * FROM "${tableName}" LIMIT 3`);
		return res.rows;
	} catch (error) {
		console.warn(`Could not fetch sample data for table ${tableName}:`, error);
		return [];
	} finally {
		client.release();
	}
}

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

async function getDatabaseSchema(
	db: DatabaseSchemaType["db"],
	options: {
		includeSampleData?: boolean;
		includeDescriptions?: boolean;
		maxTables?: number;
	} = {},
): Promise<DatabaseSchema> {
	const dbType = getDbType();

	if (dbType === "mongodb") {
		return getMongoDatabaseSchema(db, {
			includeSampleData: options.includeSampleData,
		});
	}

	const { includeSampleData = false, includeDescriptions = true } = options;

	const dao = getDaoFactory(dbType);

	try {
		const tablesList = await dao.getTablesList(db);
		const tableNames = tablesList.map((t) => t.tableName);

		const tablePromises = tableNames.map(async (tableName) => {
			const [columns, description, sampleData] = await Promise.all([
				dao.getTableColumns({ tableName, db }),
				includeDescriptions && dbType === "pg"
					? getTableDescription(tableName, db)
					: Promise.resolve(undefined),
				includeSampleData && dbType === "pg"
					? getSampleData(tableName, db)
					: Promise.resolve([]),
			]);

			const table: Table = {
				name: tableName,
				columns: columns.map(convertColumnInfo),
			};

			if (description) {
				table.description = description;
			}

			if (sampleData.length > 0) {
				table.sampleData = sampleData.map((row) =>
					Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])),
				);
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
