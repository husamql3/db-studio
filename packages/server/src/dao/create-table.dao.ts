import type {
	CreateTableSchemaType,
	DatabaseSchemaType,
	FieldDataType,
	ForeignKeyDataType,
} from "shared/types";
import { getDbPool } from "@/db-manager.js";

export async function createTable({
	tableData,
	db,
}: {
	tableData: CreateTableSchemaType;
	db: DatabaseSchemaType["db"];
}) {
	const { tableName, fields, foreignKeys } = tableData;
	const pool = getDbPool(db);

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
		foreignKeys?.map((fk: ForeignKeyDataType) => {
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

	await pool.query(createTableSQL);
}
