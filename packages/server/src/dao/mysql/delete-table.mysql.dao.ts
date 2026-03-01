import { HTTPException } from "hono/http-exception";
import type { RowDataPacket } from "mysql2";
import type {
	DeleteTableParams,
	DeleteTableResult,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	RelatedRecord,
} from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

// MySQL error number for FK dependency preventing DROP TABLE
const MYSQL_FK_DEPENDENCY = 1217;
const MYSQL_FK_ROW_REFERENCED = 1451;

async function getForeignKeyReferences(
	tableName: string,
	db: string,
): Promise<ForeignKeyConstraint[]> {
	const pool = getMysqlPool(db);
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT
			kcu.CONSTRAINT_NAME        AS constraint_name,
			kcu.TABLE_NAME             AS referencing_table,
			kcu.COLUMN_NAME            AS referencing_column,
			kcu.REFERENCED_TABLE_NAME  AS referenced_table,
			kcu.REFERENCED_COLUMN_NAME AS referenced_column
		FROM information_schema.KEY_COLUMN_USAGE kcu
		JOIN information_schema.TABLE_CONSTRAINTS tc
		  ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
		  AND kcu.TABLE_SCHEMA   = tc.TABLE_SCHEMA
		  AND kcu.TABLE_NAME     = tc.TABLE_NAME
		WHERE tc.CONSTRAINT_TYPE          = 'FOREIGN KEY'
		  AND kcu.TABLE_SCHEMA            = DATABASE()
		  AND kcu.REFERENCED_TABLE_NAME   = ?`,
		[tableName],
	);

	return (rows as ForeignKeyConstraintRow[]).map((row) => ({
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
	const pool = getMysqlPool(db);

	for (const constraint of fkConstraints) {
		const [relatedRows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM \`${constraint.referencingTable}\` LIMIT 100`,
		);

		if (relatedRows.length > 0) {
			relatedRecords.push({
				tableName: constraint.referencingTable,
				columnName: constraint.referencingColumn,
				constraintName: constraint.constraintName,
				records: relatedRows as Record<string, unknown>[],
			});
		}
	}

	return relatedRecords;
}

async function getTableRowCount(tableName: string, db: string): Promise<number> {
	const pool = getMysqlPool(db);
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as count FROM \`${tableName}\``,
	);
	return Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
}

export async function deleteTable(params: DeleteTableParams): Promise<DeleteTableResult> {
	const { tableName, db, cascade } = params;
	const pool = getMysqlPool(db);

	// Check if table exists
	const [tableRows] = await pool.execute<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt
		 FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		[tableName],
	);
	const tableExists = Number((tableRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
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
			// MySQL doesn't support CASCADE on DROP TABLE natively the same way PG does.
			// We disable FK checks, drop the table, then re-enable.
			const connection = await pool.getConnection();
			try {
				await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
				await connection.execute(`DROP TABLE \`${tableName}\``);
				await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
			} finally {
				connection.release();
			}
		} else {
			await pool.execute(`DROP TABLE \`${tableName}\``);
		}

		return { deletedCount: rowCount, fkViolation: false, relatedRecords: [] };
	} catch (error) {
		// Re-enable FK checks in case we disabled them
		await pool.execute("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});

		const mysqlError = error as { errno?: number };
		if (
			mysqlError.errno === MYSQL_FK_DEPENDENCY ||
			mysqlError.errno === MYSQL_FK_ROW_REFERENCED
		) {
			const relatedRecords = await getRelatedRecordsForTable(tableName, db);
			return { deletedCount: 0, fkViolation: true, relatedRecords };
		}

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to delete table "${tableName}"`,
		});
	}
}
