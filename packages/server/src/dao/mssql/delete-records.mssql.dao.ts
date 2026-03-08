import { HTTPException } from "hono/http-exception";
import type {
	DatabaseSchemaType,
	DeleteRecordParams,
	DeleteRecordResult,
	DeleteRecordSchemaType,
	ForeignKeyConstraint,
	RelatedRecord,
} from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

// SQL Server FK violation error number
const MSSQL_FK_VIOLATION = 547;

interface FkConstraintRow {
	constraint_name: string;
	referencing_table: string;
	referencing_column: string;
	referenced_table: string;
	referenced_column: string;
}

async function getForeignKeyReferences(
	tableName: string,
	db: DatabaseSchemaType["db"],
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

async function getRelatedRecords(
	tableName: string,
	primaryKeys: DeleteRecordSchemaType["primaryKeys"],
	db: DatabaseSchemaType["db"],
): Promise<RelatedRecord[]> {
	const fkConstraints = await getForeignKeyReferences(tableName, db);
	if (fkConstraints.length === 0) return [];

	const relatedRecords: RelatedRecord[] = [];
	const pool = await getMssqlPool(db);
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

		const request = pool.request();
		pkValues.forEach((value, idx) => {
			request.input(`pk${idx}`, value);
		});
		const paramList = pkValues.map((_, idx) => `@pk${idx}`).join(", ");

		const relatedResult = await request.query(`
			SELECT TOP 100 * FROM [${constraint.referencingTable}]
			WHERE [${constraint.referencingColumn}] IN (${paramList})
		`);

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

export async function deleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<DeleteRecordResult> {
	const pool = await getMssqlPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, { message: "Primary key column name is required" });
	}

	const pkValues = primaryKeys.map((pk) => pk.value);
	const transaction = pool.transaction();
	await transaction.begin();

	try {
		const request = transaction.request();
		pkValues.forEach((value, idx) => {
			request.input(`pk${idx}`, value);
		});
		const paramList = pkValues.map((_, idx) => `@pk${idx}`).join(", ");

		const result = await request.query(
			`DELETE FROM [${tableName}] WHERE [${pkColumn}] IN (${paramList})`,
		);

		await transaction.commit();
		return {
			deletedCount: result.rowsAffected[0] ?? 0,
			fkViolation: false,
			relatedRecords: [],
		};
	} catch (error: any) {
		await transaction.rollback();

		if (error.number === MSSQL_FK_VIOLATION) {
			const relatedRecords = await getRelatedRecords(tableName, primaryKeys, db);
			return { deletedCount: 0, fkViolation: true, relatedRecords };
		}

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to delete records from "${tableName}"`,
		});
	}
}

export async function forceDeleteRecords({
	tableName,
	primaryKeys,
	db,
}: DeleteRecordParams): Promise<{ deletedCount: number }> {
	const pool = await getMssqlPool(db);

	const pkColumn = primaryKeys[0]?.columnName;
	if (!pkColumn) {
		throw new HTTPException(400, { message: "Primary key column name is required" });
	}

	const pkValues = primaryKeys.map((pk) => pk.value);
	const transaction = pool.transaction();
	await transaction.begin();

	try {
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
				const selectRequest = transaction.request();
				values.forEach((val, idx) => {
					selectRequest.input(`val${idx}`, val);
				});
				const selectParamList = values.map((_, idx) => `@val${idx}`).join(", ");

				const selectResult = await selectRequest.query(`
					SELECT [${nestedFk.referencedColumn}] FROM [${targetTable}]
					WHERE [${targetColumn}] IN (${selectParamList})
				`);

				const nestedValues = (selectResult.recordset as Record<string, unknown>[]).map(
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

			const deleteRequest = transaction.request();
			values.forEach((val, idx) => {
				deleteRequest.input(`delVal${idx}`, val);
			});
			const deleteParamList = values.map((_, idx) => `@delVal${idx}`).join(", ");

			const deleteResult = await deleteRequest.query(
				`DELETE FROM [${targetTable}] WHERE [${targetColumn}] IN (${deleteParamList})`,
			);
			totalRelatedDeleted += deleteResult.rowsAffected[0] ?? 0;
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

		const mainRequest = transaction.request();
		pkValues.forEach((val, idx) => {
			mainRequest.input(`mainPk${idx}`, val);
		});
		const mainParamList = pkValues.map((_, idx) => `@mainPk${idx}`).join(", ");

		const result = await mainRequest.query(
			`DELETE FROM [${tableName}] WHERE [${pkColumn}] IN (${mainParamList})`,
		);

		await transaction.commit();

		return { deletedCount: (result.rowsAffected[0] ?? 0) + totalRelatedDeleted };
	} catch (error) {
		await transaction.rollback();

		if (error instanceof HTTPException) throw error;

		throw new HTTPException(500, {
			message: `Failed to force delete records from "${tableName}"`,
		});
	}
}
