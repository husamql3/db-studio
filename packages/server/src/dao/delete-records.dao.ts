import type {
	DeleteRecordParams,
	DeleteResult,
	ForeignKeyConstraint,
	ForeignKeyConstraintRow,
	RelatedRecord,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

/**
 * Gets foreign key constraints that reference the given table
 */
const getForeignKeyReferences = async (
	tableName: string,
	database?: string,
): Promise<ForeignKeyConstraint[]> => {
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

	const pool = getDbPool(database);
	const result = await pool.query(query, [tableName]);

	return result.rows.map(({ row }: { row: ForeignKeyConstraintRow }) => ({
		constraintName: row.constraint_name,
		referencingTable: row.referencing_table,
		referencingColumn: row.referencing_column,
		referencedTable: row.referenced_table,
		referencedColumn: row.referenced_column,
	}));
};

/**
 * Finds all records in other tables that reference the given primary key values
 */
const getRelatedRecords = async (
	tableName: string,
	primaryKeys: Array<{ columnName: string; value: unknown }>,
	database?: string,
): Promise<RelatedRecord[]> => {
	const fkConstraints = await getForeignKeyReferences(tableName, database);

	if (fkConstraints.length === 0) {
		return [];
	}

	const relatedRecords: RelatedRecord[] = [];
	const pool = getDbPool(database);

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
		const matchingPk = primaryKeys.find(
			(pk) => pk.columnName === constraint.referencedColumn,
		);
		if (!matchingPk) continue;

		// Build query to find related records
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");
		const query = `
			SELECT * FROM "${constraint.referencingTable}"
			WHERE "${constraint.referencingColumn}" IN (${placeholders})
			LIMIT 100
		`;

		try {
			const result = await pool.query(query, pkValues);

			if (result.rows.length > 0) {
				relatedRecords.push({
					tableName: constraint.referencingTable,
					columnName: constraint.referencingColumn,
					constraintName: constraint.constraintName,
					records: result.rows,
				});
			}
		} catch (error) {
			console.error(
				`Error fetching related records from ${constraint.referencingTable}:`,
				error,
			);
		}
	}

	return relatedRecords;
};

/**
 * Attempts to delete records. If FK violation occurs, returns related records.
 */
export const deleteRecords = async (
	params: DeleteRecordParams,
): Promise<DeleteResult> => {
	const { tableName, primaryKeys, database } = params;
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		// Build the delete query
		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn) {
			throw new Error("Primary key column name is required");
		}

		const pkValues = primaryKeys.map((pk) => pk.value);
		const placeholders = pkValues.map((_, i) => `$${i + 1}`).join(", ");

		const deleteSQL = `
			DELETE FROM "${tableName}"
			WHERE "${pkColumn}" IN (${placeholders})
			RETURNING *
		`;

		console.log("Deleting records with SQL:", deleteSQL, "Values:", pkValues);
		const result = await client.query(deleteSQL, pkValues);

		await client.query("COMMIT");

		return {
			success: true,
			message: `Successfully deleted ${result.rowCount} ${result.rowCount === 1 ? "record" : "records"} from "${tableName}"`,
			deletedCount: result.rowCount ?? 0,
		};
	} catch (error) {
		await client.query("ROLLBACK");

		// Check if this is a foreign key violation
		const pgError = error as { code?: string; detail?: string; constraint?: string };

		if (pgError.code === "23503") {
			// Foreign key violation
			console.log("FK violation detected, fetching related records...");

			// Fetch related records to show the user
			const relatedRecords = await getRelatedRecords(tableName, primaryKeys);

			return {
				success: false,
				message: "Cannot delete: Records are referenced by other tables",
				fkViolation: true,
				relatedRecords,
			};
		}

		console.error("Error deleting records:", error);
		throw error;
	} finally {
		client.release();
	}
};

/**
 * Force deletes records by first deleting all related records in referencing tables (cascade)
 */
export const forceDeleteRecords = async (
	params: DeleteRecordParams,
): Promise<DeleteResult> => {
	const { tableName, primaryKeys, database } = params;
	const pool = getDbPool(database);
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		const pkColumn = primaryKeys[0]?.columnName;
		if (!pkColumn) {
			throw new Error("Primary key column name is required");
		}

		const pkValues = primaryKeys.map((pk) => pk.value);

		// Get all FK constraints that reference this table
		const fkConstraints = await getForeignKeyReferences(tableName, database);

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
			const nestedFks = await getForeignKeyReferences(targetTable, database);

			for (const nestedFk of nestedFks) {
				// Get the values that will be deleted from the target table
				const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
				const selectQuery = `
					SELECT "${nestedFk.referencedColumn}" FROM "${targetTable}"
					WHERE "${targetColumn}" IN (${placeholders})
				`;

				const selectResult = await client.query(selectQuery, values);
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
			const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
			const deleteQuery = `
				DELETE FROM "${targetTable}"
				WHERE "${targetColumn}" IN (${placeholders})
			`;

			const deleteResult = await client.query(deleteQuery, values);
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
		const deleteSQL = `
			DELETE FROM "${tableName}"
			WHERE "${pkColumn}" IN (${placeholders})
			RETURNING *
		`;

		console.log("Force deleting records with SQL:", deleteSQL, "Values:", pkValues);
		const result = await client.query(deleteSQL, pkValues);

		await client.query("COMMIT");

		const mainDeleted = result.rowCount ?? 0;
		const message =
			totalRelatedDeleted > 0
				? `Successfully deleted ${mainDeleted} ${mainDeleted === 1 ? "record" : "records"} from "${tableName}" and ${totalRelatedDeleted} related ${totalRelatedDeleted === 1 ? "record" : "records"} from other tables`
				: `Successfully deleted ${mainDeleted} ${mainDeleted === 1 ? "record" : "records"} from "${tableName}"`;

		return {
			success: true,
			message,
			deletedCount: mainDeleted + totalRelatedDeleted,
		};
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("Error force deleting records:", error);
		throw error;
	} finally {
		client.release();
	}
};
