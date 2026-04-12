import type { ResultSetHeader } from "mysql2";
import type {
	CreateTableSchemaType,
	DatabaseSchemaType,
	ForeignKeyDataType,
} from "shared/types";
import { getMysqlPool } from "@/db-manager.js";
import { buildMysqlColumnDefinition } from "./mysql-column.utils.js";

export async function createTable({
	tableData,
	db,
}: {
	tableData: CreateTableSchemaType;
	db: DatabaseSchemaType["db"];
}) {
	const { tableName, fields, foreignKeys } = tableData;
	const pool = getMysqlPool(db);

	const columnDefinitions = fields.map((field) => buildMysqlColumnDefinition(field));

	// Primary key constraint
	const primaryKeyFields = fields.filter((f) => f.isPrimaryKey);
	const constraintDefs: string[] = [];

	if (primaryKeyFields.length > 0) {
		const pkColumns = primaryKeyFields.map((f) => `\`${f.columnName}\``).join(", ");
		constraintDefs.push(`PRIMARY KEY (${pkColumns})`);
	}

	// Unique constraints
	for (const field of fields) {
		if (field.isUnique && !field.isPrimaryKey) {
			constraintDefs.push(
				`UNIQUE KEY \`uq_${tableName}_${field.columnName}\` (\`${field.columnName}\`)`,
			);
		}
	}

	// Foreign key constraints
	const foreignKeyConstraints =
		foreignKeys?.map((fk: ForeignKeyDataType) => {
			const constraintName = `fk_${tableName}_${fk.columnName}_${fk.referencedTable}_${fk.referencedColumn}`;
			return `CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${fk.columnName}\`) REFERENCES \`${fk.referencedTable}\` (\`${fk.referencedColumn}\`) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
		}) || [];

	const allDefinitions = [...columnDefinitions, ...constraintDefs, ...foreignKeyConstraints];

	const createTableSQL = `
		CREATE TABLE \`${tableName}\` (
			${allDefinitions.join(",\n\t\t\t")}
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`;

	await pool.execute<ResultSetHeader>(createTableSQL);
}
