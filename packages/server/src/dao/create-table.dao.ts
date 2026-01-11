import { getDbPool } from "@/db-manager.js";
import type { FieldDataType } from "@/types/create-table.type.js";
import type { CreateTableFormData } from "@/types/create-table.type.js";

export const createTable = async (tableData: CreateTableFormData, database?: string) => {
	const pool = getDbPool(database);
	const client = await pool.connect();
	try {
		const { tableName, fields, foreignKeys } = tableData;

		// Build column definitions
		const columnDefinitions = fields.map((field: FieldDataType) => {
			let columnDef = `"${field.columnName}" ${field.columnType}`;

			// Add array suffix if needed
			if (field.isArray) {
				columnDef += "[]";
			}

			// Add PRIMARY KEY constraint
			if (field.isPrimaryKey) {
				columnDef += " PRIMARY KEY";
			}

			// Add UNIQUE constraint
			if (field.isUnique && !field.isPrimaryKey) {
				columnDef += " UNIQUE";
			}

			// Add NOT NULL constraint (if not nullable)
			if (!field.isNullable) {
				columnDef += " NOT NULL";
			}

			// Add GENERATED ALWAYS AS IDENTITY for identity columns
			if (field.isIdentity) {
				columnDef += " GENERATED ALWAYS AS IDENTITY";
			}

			// Add default value
			if (field.defaultValue && !field.isIdentity) {
				columnDef += ` DEFAULT ${field.defaultValue}`;
			}

			return columnDef;
		});

		// Build foreign key constraints
		const foreignKeyConstraints =
			foreignKeys?.map((fk) => {
				const constraintName = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;
				return `CONSTRAINT "${constraintName}" FOREIGN KEY ("${fk.columnName}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}") ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
			}) || [];

		// Combine column definitions and foreign key constraints
		const allDefinitions = [...columnDefinitions, ...foreignKeyConstraints];

		// Create the table
		const createTableSQL = `
			CREATE TABLE "${tableName}" (
				${allDefinitions.join(",\n\t\t\t\t")}
			);
		`;

		console.log("Creating table with SQL:", createTableSQL);
		await client.query(createTableSQL);

		return {
			success: true,
			tableName,
			message: `Table "${tableName}" created successfully`,
		};
	} catch (error) {
		console.error("Error creating table:", error);
		throw error;
	} finally {
		client.release();
	}
};
