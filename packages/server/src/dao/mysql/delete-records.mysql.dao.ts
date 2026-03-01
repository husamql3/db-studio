import { HTTPException } from "hono/http-exception";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type {
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteRecordSchemaType,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	RelatedRecord,
} from "shared/types";
import { getMysqlPool } from "@/db-manager.js";

// MySQL FK violation error number
const MYSQL_FK_VIOLATION = 1451;

async function getForeignKeyReferences(
	tableName: string,
	db: DatabaseSchemaType["db"],
): Promise<ForeignKeyConstraint[]> {
	const pool = getMysqlPool(db);
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT
			kcu.CONSTRAINT_NAME     AS constraint_name,
			kcu.TABLE_NAME          AS referencing_table,
			kcu.COLUMN_NAME         AS referencing_column,
			kcu.REFERENCED_TABLE_NAME  AS referenced_table,
			kcu.REFERENCED_COLUMN_NAME AS referenced_column
		FROM information_schema.KEY_COLUMN_USAGE kcu
		JOIN information_schema.TABLE_CONSTRAINTS tc
		  ON kcu.CONSTRAINT_NAME  = tc.CONSTRAINT_NAME
		  AND kcu.TABLE_SCHEMA    = tc.TABLE_SCHEMA
		  AND kcu.TABLE_NAME      = tc.TABLE_NAME
		WHERE tc.CONSTRAINT_TYPE      = 'FOREIGN KEY'
		  AND kcu.TABLE_SCHEMA        = DATABASE()
		  AND kcu.REFERENCED_TABLE_NAME = ?`,
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

async function getRelatedRecords(
	tableName: string,
	primaryKeys: DeleteRecordSchemaType["primaryKeys"],
	db: DatabaseSchemaType["db"],
): Promise<RelatedRecord[]> {
	const fkConstraints = await getForeignKeyReferences(tableName, db);
	if (fkConstraints.length === 0) return [];

	const relatedRecords: RelatedRecord[] = [];
	const pool = getMysqlPool(db);
	const pkValues = primaryKeys.map((pk) => pk.value);

	const constraintsByTable = new Map<string, ForeignKeyConstraint[]>();
	for (const constraint of fkConstraints) {
		const key = `${constraint.referencingTable}.${constraint.referencingColumn}`;
		if (!constraintsByTable.has(key)) constraintsByTable.set(key, []);
		constraintsByTable.get(key)?.push(constraint);
	}

	for (const [_tableColumn, constraints] of constraintsByTable) {
		const constraint = constraints[0];
		if (!constraint) continue;

		const matchingPk = primaryKeys.find((pk) => pk.columnName === constraint.referencedColumn);
		if (!matchingPk) continue;

		const placeholders = pkValues.map(() => "?").join(", ");
		const [relatedRows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM \`${constraint.referencingTable}\`
			 WHERE \`${constraint.referencingColumn}\` IN (${placeholders})
			 LIMIT 100`,
			pkValues,
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

export async function deleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<DeleteRecordResult> {
	const pool = getMysqlPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, { message: "Primary key column name is required" });
	}

	const pkValues = primaryKeys.map((pk) => pk.value);
	const placeholders = pkValues.map(() => "?").join(", ");

	const connection = await pool.getConnection();
	await connection.beginTransaction();

	try {
		const [result] = await connection.execute<ResultSetHeader>(
			`DELETE FROM \`${tableName}\` WHERE \`${pkColumn}\` IN (${placeholders})`,
			pkValues,
		);
		await connection.commit();
		return { deletedCount: result.affectedRows, fkViolation: false, relatedRecords: [] };
	} catch (error) {
		await connection.rollback();

		const mysqlError = error as { errno?: number };
		if (mysqlError.errno === MYSQL_FK_VIOLATION) {
			const relatedRecords = await getRelatedRecords(tableName, primaryKeys, db);
			return { deletedCount: 0, fkViolation: true, relatedRecords };
		}

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to delete records from "${tableName}"`,
		});
	} finally {
		connection.release();
	}
}

export async function forceDeleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<{ deletedCount: number }> {
	const pool = getMysqlPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, { message: "Primary key column name is required" });
	}

	const pkValues = primaryKeys.map((pk) => pk.value);
	const connection = await pool.getConnection();
	await connection.beginTransaction();

	try {
		// Disable FK checks temporarily for cascade delete
		await connection.execute("SET FOREIGN_KEY_CHECKS = 0");

		const fkConstraints = await getForeignKeyReferences(tableName, db);
		let totalRelatedDeleted = 0;
		const deletedTables = new Set<string>();
		const visited = new Set<string>();

		const deleteRelatedRecursively = async (
			targetTable: string,
			targetColumn: string,
			values: unknown[],
			visitedSet: Set<string>,
		) => {
			const key = `${targetTable}.${targetColumn}`;
			if (visitedSet.has(key)) return;
			visitedSet.add(key);

			const nestedFks = await getForeignKeyReferences(targetTable, db);
			for (const nestedFk of nestedFks) {
				const nestedPlaceholders = values.map(() => "?").join(", ");
				const [selectRows] = await connection.execute<RowDataPacket[]>(
					`SELECT \`${nestedFk.referencedColumn}\` FROM \`${targetTable}\`
					 WHERE \`${targetColumn}\` IN (${nestedPlaceholders})`,
					values as any[],
				);
				const nestedValues = (selectRows as Record<string, unknown>[]).map(
					(row) => row[nestedFk.referencedColumn],
				);
				if (nestedValues.length > 0) {
					await deleteRelatedRecursively(
						nestedFk.referencingTable,
						nestedFk.referencingColumn,
						nestedValues,
						visitedSet,
					);
				}
			}

			const deletePlaceholders = values.map(() => "?").join(", ");
			const [deleteResult] = await connection.execute<ResultSetHeader>(
				`DELETE FROM \`${targetTable}\` WHERE \`${targetColumn}\` IN (${deletePlaceholders})`,
				values as any[],
			);
			totalRelatedDeleted += deleteResult.affectedRows;
			deletedTables.add(targetTable);
		};

		for (const constraint of fkConstraints) {
			if (deletedTables.has(constraint.referencingTable)) continue;
			await deleteRelatedRecursively(
				constraint.referencingTable,
				constraint.referencingColumn,
				pkValues,
				visited,
			);
		}

		const mainPlaceholders = pkValues.map(() => "?").join(", ");
		const [result] = await connection.execute<ResultSetHeader>(
			`DELETE FROM \`${tableName}\` WHERE \`${pkColumn}\` IN (${mainPlaceholders})`,
			pkValues,
		);

		await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
		await connection.commit();

		return { deletedCount: result.affectedRows + totalRelatedDeleted };
	} catch (error) {
		await connection.execute("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
		await connection.rollback();

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to force delete records from "${tableName}"`,
		});
	} finally {
		connection.release();
	}
}
