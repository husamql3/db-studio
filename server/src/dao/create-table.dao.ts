import { db } from "../db.js";
import type { AddTableFormData } from "../types/index.js";

export const createTable = async (tableData: AddTableFormData) => {
	const client = await db.connect();
	try {
		const { tableName, fields } = tableData;

		// Build column definitions
		const columnDefinitions = fields.map((field) => {
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

		// Create the table
		const createTableSQL = `
			CREATE TABLE "${tableName}" (
				${columnDefinitions.join(",\n\t\t\t\t")}
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
