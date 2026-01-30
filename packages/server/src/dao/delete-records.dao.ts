import { HTTPException } from "hono/http-exception";
import type {
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteRecordSchemaType,
	DeleteResult,
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
	db: DatabaseSchemaType["db"],
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

	return result.rows.map(( row : ForeignKeyConstraintRow ) => ({
		constraintName: row.constraint_name,
		referencingTable: row.referencing_table,
		referencingColumn: row.referencing_column,
		referencedTable: row.referenced_table,
		referencedColumn: row.referenced_column,
	}));
}

/**
 * Finds all records in other tables that reference the given primary key values
 */
async function getRelatedRecords(
	tableName: string,
	primaryKeys: DeleteRecordSchemaType["primaryKeys"],
	db: DatabaseSchemaType["db"],
): Promise<RelatedRecord[]> {
	const fkConstraints = await getForeignKeyReferences(tableName, db);

	if (fkConstraints.length === 0) {
		return [];
	}

	const relatedRecords: RelatedRecord[] = [];
	const pool = getDbPool(db);

	// Group constraints by referencing table and column for efficiency
	const constraintsByTable = new Map<string, ForeignKeyConstraint[]>();
	for (const constraint of fkConstraints) {
		const key = `${constraint.referencingTable}.${constraint.referencingColumn}`;
		if (!constraintsByTable.has(key)) {
			constraintsByTable.set(key, []);
		}
		constraintsByTable.get(key)?.push(constraint);
	}

	// Get the primary key values that we're looking for
	const pkValues = primaryKeys.map((pk) => pk.value);

	for (const [_tableColumn, constraints] of constraintsByTable) {
		const constraint = constraints[0];
		if (!constraint) continue;

		// Find which primary key column matches this FK's referenced column
		const matchingPk = primaryKeys.find((pk) => pk.columnName === constraint.referencedColumn);
		if (!matchingPk) continue;

		// Build query to find related records
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");
		const relatedQuery = `
			SELECT * FROM "${constraint.referencingTable}"
			WHERE "${constraint.referencingColumn}" IN (${placeholders})
			LIMIT 100
		`;

		const relatedResult = await pool.query(relatedQuery, pkValues);

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
 * Attempts to delete records. If FK violation occurs, returns related records.
 */
export async function deleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<DeleteResult> {
	const pool = getDbPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, {
			message: "Primary key column name is required",
		});
	}

	const pkValues = primaryKeys.map((pk) => pk.value);
	const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");

	const query = `
		DELETE FROM "${tableName}"
		WHERE "${pkColumn}" IN (${placeholders})
		RETURNING *
	`;

	await pool.query("BEGIN");

	try {
		const result = await pool.query(query, pkValues);

		await pool.query("COMMIT");

		return { deletedCount: result.rowCount ?? 0 , fkViolation: undefined, relatedRecords: [] };
	} catch (error) {
		await pool.query("ROLLBACK");

		// Check if this is a foreign key violation
		const pgError = error as {
			code?: string;
			detail?: string;
			constraint?: string;
		};

		if (pgError.code === "23503") {
			// Fetch related records to show the user
			const relatedRecords = await getRelatedRecords(tableName, primaryKeys, db);

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
			message: `Failed to delete records from "${tableName}"`,
		});
	}
}

/**
 * Force deletes records by first deleting all related records in referencing tables (cascade)
 */
export async function forceDeleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<{ deletedCount: number }> {
	const pool = getDbPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, {
			message: "Primary key column name is required",
		});
	}

	const pkValues = primaryKeys.map((pk) => pk.value);

	await pool.query("BEGIN");

	try {
		// Get all FK constraints that reference this table
		const fkConstraints = await getForeignKeyReferences(tableName, db);

		let totalRelatedDeleted = 0;

		// Delete related records in reverse dependency order
		// We need to handle nested FKs recursively
		const deletedTables = new Set<string>();

		const deleteRelatedRecursively = async (
			targetTable: string,
			targetColumn: string,
			values: unknown[],
		) => {
			// First, find if there are tables referencing the target table
			const nestedFks = await getForeignKeyReferences(targetTable, db);

			for (const nestedFk of nestedFks) {
				// Get the values that will be deleted from the target table
				const nestedPlaceholders = values.map((_, i) => `$${i + 1}`).join(", ");
				const selectQuery = `
					SELECT "${nestedFk.referencedColumn}" FROM "${targetTable}"
					WHERE "${targetColumn}" IN (${nestedPlaceholders})
				`;

				const selectResult = await pool.query(selectQuery, values);
				const nestedValues = selectResult.rows.map(
					({ row }: { row: { [nestedFk.referencedColumn]: unknown } }) =>
						row[nestedFk.referencedColumn],
				);

				if (nestedValues.length > 0) {
					await deleteRelatedRecursively(
						nestedFk.referencingTable,
						nestedFk.referencingColumn,
						nestedValues,
					);
				}
			}

			// Now delete from the target table
			const deletePlaceholders = values.map((_, i) => `$${i + 1}`).join(", ");
			const deleteQuery = `
				DELETE FROM "${targetTable}"
				WHERE "${targetColumn}" IN (${deletePlaceholders})
			`;

			const deleteResult = await pool.query(deleteQuery, values);
			totalRelatedDeleted += deleteResult.rowCount ?? 0;
			deletedTables.add(targetTable);
		};

		// Delete from all referencing tables first
		for (const constraint of fkConstraints) {
			if (deletedTables.has(constraint.referencingTable)) continue;

			await deleteRelatedRecursively(
				constraint.referencingTable,
				constraint.referencingColumn,
				pkValues,
			);
		}

		// Finally delete the main records
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");
		const query = `
			DELETE FROM "${tableName}"
			WHERE "${pkColumn}" IN (${placeholders})
			RETURNING *
		`;

		const result = await pool.query(query, pkValues);

		await pool.query("COMMIT");

		const mainDeleted = result.rowCount ?? 0;

		return { deletedCount: mainDeleted + totalRelatedDeleted };
	} catch (error) {
		await pool.query("ROLLBACK");

		if (error instanceof HTTPException) {
			throw error;
		}

		throw new HTTPException(500, {
			message: `Failed to force delete records from "${tableName}"`,
		});
	}
}
