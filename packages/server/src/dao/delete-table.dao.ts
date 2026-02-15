import { HTTPException } from "hono/http-exception";
import type {
	DeleteTableParams,
	DeleteTableResult,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	RelatedRecord,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Gets foreign key constraints that reference the given table
 */
async function getForeignKeyReferences(
	tableName: string,
	db: string,
): Promise<ForeignKeyConstraint[]> {
	const query = `
		SELECT
			tc.constraint_name,
			tc.table_name as referencing_table,
			kcu.column_name as referencing_column,
			ccu.table_name AS referenced_table,
			ccu.column_name AS referenced_column
		FROM information_schema.table_constraints AS tc
		JOIN information_schema.key_column_usage AS kcu
			ON tc.constraint_name = kcu.constraint_name
			AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage AS ccu
			ON ccu.constraint_name = tc.constraint_name
			AND ccu.table_schema = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
			AND ccu.table_name = $1
	`;

	const pool = getDbPool(db);
	const result = await pool.query(query, [tableName]);

	return result.rows.map((row: ForeignKeyConstraintRow) => ({
		constraintName: row.constraint_name,
		referencingTable: row.referencing_table,
		referencingColumn: row.referencing_column,
		referencedTable: row.referenced_table,
		referencedColumn: row.referenced_column,
	}));
}

/**
 * Gets related records from tables that reference this table
 */
async function getRelatedRecordsForTable(
	tableName: string,
	db: string,
): Promise<RelatedRecord[]> {
	const fkConstraints = await getForeignKeyReferences(tableName, db);

	if (fkConstraints.length === 0) {
		return [];
	}

	const relatedRecords: RelatedRecord[] = [];
	const pool = getDbPool(db);

	for (const constraint of fkConstraints) {
		const relatedQuery = `
			SELECT * FROM "${constraint.referencingTable}"
			LIMIT 100
		`;

		const relatedResult = await pool.query(relatedQuery);

		if (relatedResult.rows.length > 0) {
			relatedRecords.push({
				tableName: constraint.referencingTable,
				columnName: constraint.referencingColumn,
				constraintName: constraint.constraintName,
				records: relatedResult.rows,
			});
		}
	}

	return relatedRecords;
}

/**
 * Gets the total row count for a table
 */
async function getTableRowCount(tableName: string, db: string): Promise<number> {
	const pool = getDbPool(db);
	const result = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
	return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

/**
 * Deletes a table from the database.
 * If there are FK constraints referencing this table, returns the related records.
 *
 * @param params.tableName - Name of the table to delete
 * @param params.db - Database name
 * @param params.cascade - If true, uses CASCADE to drop dependent objects
 * @returns DeleteTableResult with deletedCount, fkViolation flag, and relatedRecords
 */
export async function deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
	const { tableName, db, cascade } = params;
	const pool = getDbPool(db);

	// Check if table exists
	const tableExistsQuery = `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables 
			WHERE table_name = $1 AND table_schema = 'public'
		) as exists;
	`;
	const { rows: tableRows } = await pool.query(tableExistsQuery, [tableName]);
	if (!tableRows[0]?.exists) {
		throw new HTTPException(404, {
			message: `Table "${tableName}" does not exist`,
		});
	}

	// Get row count before deletion
	const rowCount = await getTableRowCount(tableName, db);

	// If not cascade, check for FK constraints first
	if (!cascade) {
		const relatedRecords = await getRelatedRecordsForTable(tableName, db);

		if (relatedRecords.length > 0) {
			return {
				deletedCount: 0,
				fkViolation: true,
				relatedRecords,
			};
		}
	}

	try {
		const dropMode = cascade ? "CASCADE" : "RESTRICT";
		const dropTableSQL = `DROP TABLE "${tableName}" ${dropMode}`;

		await pool.query(dropTableSQL);

		return {
			deletedCount: rowCount,
			fkViolation: false,
			relatedRecords: [],
		};
	} catch (error) {
		const pgError = error as { code?: string; detail?: string };

		// Check if this is a dependency error (foreign key constraint)
		if (pgError.code === "2BP01") {
			const relatedRecords = await getRelatedRecordsForTable(tableName, db);
			return {
				deletedCount: 0,
				fkViolation: true,
				relatedRecords,
			};
		}

		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to delete table "${tableName}"`,
		});
	}
}
