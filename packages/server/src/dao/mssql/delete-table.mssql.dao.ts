import { HTTPException } from "hono/http-exception";
import type {
	DeleteTableParams,
	DeleteTableResult,
	ForeignKeyConstraint,
	RelatedRecord,
} from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

// SQL Server error number for FK dependency
const MSSQL_FK_DEPENDENCY = 3726;

interface FkConstraintRow {
	constraint_name: string;
	referencing_table: string;
	referencing_column: string;
	referenced_table: string;
	referenced_column: string;
}

async function getForeignKeyReferences(
	tableName: string,
	db: string,
): Promise<ForeignKeyConstraint[]> {
	const pool = await getMssqlPool(db);
	const result = await pool
		.request()
		.input("tableName", tableName)
		.query(`
			SELECT
				fk.name AS constraint_name,
				OBJECT_NAME(fk.parent_object_id) AS referencing_table,
				COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS referencing_column,
				OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
				COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
			FROM sys.foreign_keys fk
			INNER JOIN sys.foreign_key_columns fkc
				ON fk.object_id = fkc.constraint_object_id
			WHERE OBJECT_NAME(fk.referenced_object_id) = @tableName
		`);

	return (result.recordset as FkConstraintRow[]).map((row) => ({
		constraintName: row.constraint_name,
		referencingTable: row.referencing_table,
		referencingColumn: row.referencing_column,
		referencedTable: row.referenced_table,
		referencedColumn: row.referenced_column,
	}));
}

async function getRelatedRecordsForTable(
	tableName: string,
	db: string,
): Promise<RelatedRecord[]> {
	const fkConstraints = await getForeignKeyReferences(tableName, db);
	if (fkConstraints.length === 0) return [];

	const relatedRecords: RelatedRecord[] = [];
	const pool = await getMssqlPool(db);

	for (const constraint of fkConstraints) {
		const relatedResult = await pool
			.request()
			.query(`SELECT TOP 100 * FROM [${constraint.referencingTable}]`);

		if (relatedResult.recordset.length > 0) {
			relatedRecords.push({
				tableName: constraint.referencingTable,
				columnName: constraint.referencingColumn,
				constraintName: constraint.constraintName,
				records: relatedResult.recordset as Record<string, unknown>[],
			});
		}
	}

	return relatedRecords;
}

async function getTableRowCount(tableName: string, db: string): Promise<number> {
	const pool = await getMssqlPool(db);
	const result = await pool.request().query(`SELECT COUNT(*) as count FROM [${tableName}]`);
	return Number(result.recordset[0]?.count ?? 0);
}

export async function deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
	const { tableName, db, cascade } = params;
	const pool = await getMssqlPool(db);

	// Check if table exists
	const tableCheckResult = await pool
		.request()
		.input("tableName", tableName)
		.query(`
			SELECT COUNT(*) as cnt
			FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_CATALOG = DB_NAME()
			  AND TABLE_NAME = @tableName
			  AND TABLE_SCHEMA = 'dbo'
		`);

	const tableExists = Number(tableCheckResult.recordset[0]?.cnt ?? 0) > 0;
	if (!tableExists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	const rowCount = await getTableRowCount(tableName, db);

	if (!cascade) {
		const relatedRecords = await getRelatedRecordsForTable(tableName, db);
		if (relatedRecords.length > 0) {
			return { deletedCount: 0, fkViolation: true, relatedRecords };
		}
	}

	try {
		if (cascade) {
			// Drop all FK constraints referencing this table first
			const fkConstraints = await getForeignKeyReferences(tableName, db);
			for (const fk of fkConstraints) {
				await pool
					.request()
					.query(
						`ALTER TABLE [${fk.referencingTable}] DROP CONSTRAINT [${fk.constraintName}]`,
					);
			}
		}

		await pool.request().query(`DROP TABLE [${tableName}]`);

		return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
	} catch (error: any) {
		if (error.number === MSSQL_FK_DEPENDENCY) {
			const relatedRecords = await getRelatedRecordsForTable(tableName, db);
			return { deletedCount: 0, fkViolation: true, relatedRecords };
		}

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to delete table "${tableName}"`,
		});
	}
}
