import type {
	CreateTableSchemaType,
	DatabaseSchemaType,
	FieldDataType,
	ForeignKeyDataType,
} from "shared/types";
import { getMssqlPool } from "@/db-manager.js";

/**
 * Formats default values for SQL Server compatibility
 */
function formatMssqlDefaultValue(defaultValue: string, columnType: string): string | null {
	const trimmed = defaultValue.trim().toLowerCase();

	// Function calls
	if (trimmed.includes("(") && trimmed.includes(")")) {
		if (trimmed.includes("newid()")) {
			// NEWID() for uniqueidentifier columns
			if (!columnType.toUpperCase().includes("UNIQUEIDENTIFIER")) {
				return null;
			}
			return "NEWID()";
		}

		if (trimmed.includes("getdate") || trimmed.includes("current_timestamp")) {
			return "GETDATE()";
		}

		return defaultValue.trim();
	}

	// Keywords
	if (trimmed === "null") {
		return "NULL";
	}

	if (trimmed === "true" || trimmed === "false") {
		return trimmed === "true" ? "1" : "0";
	}

	return defaultValue.trim();
}

/**
 * Maps PostgreSQL-style column types to SQL Server types
 */
function mapColumnTypeToMssql(columnType: string, isArray: boolean): string {
	if (isArray) {
		// SQL Server doesn't support native array types — use NVARCHAR(MAX) for JSON
		return "NVARCHAR(MAX)";
	}

	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> = {
		// Integer types
		serial: "INT IDENTITY(1,1)",
		serial4: "INT IDENTITY(1,1)",
		bigserial: "BIGINT IDENTITY(1,1)",
		serial8: "BIGINT IDENTITY(1,1)",
		int: "INT",
		int4: "INT",
		integer: "INT",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		tinyint: "TINYINT",
		// Decimal / numeric
		numeric: "NUMERIC",
		decimal: "DECIMAL",
		real: "REAL",
		float4: "REAL",
		float: "FLOAT",
		"double precision": "FLOAT",
		float8: "FLOAT",
		money: "MONEY",
		// Boolean
		boolean: "BIT",
		bool: "BIT",
		// Text
		text: "NVARCHAR(MAX)",
		varchar: "VARCHAR(255)",
		"character varying": "VARCHAR(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR",
		uuid: "UNIQUEIDENTIFIER",
		// JSON
		json: "NVARCHAR(MAX)",
		jsonb: "NVARCHAR(MAX)",
		xml: "XML",
		// Date/time
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "DATETIME2",
		"timestamp without time zone": "DATETIME2",
		"timestamp with time zone": "DATETIMEOFFSET",
		timestamptz: "DATETIMEOFFSET",
		interval: "VARCHAR(255)",
		// Binary
		bytea: "VARBINARY(MAX)",
		// Network / geometric — store as text in SQL Server
		inet: "VARCHAR(45)",
		cidr: "VARCHAR(45)",
		macaddr: "VARCHAR(17)",
		macaddr8: "VARCHAR(23)",
	};

	return typeMap[normalized] || columnType.toUpperCase();
}

export async function createTable({
	tableData,
	db,
}: {
	tableData: CreateTableSchemaType;
	db: DatabaseSchemaType["db"];
}) {
	const { tableName, fields, foreignKeys } = tableData;
	const pool = await getMssqlPool(db);

	const columnDefinitions = fields.map((field: FieldDataType) => {
		const mappedType = mapColumnTypeToMssql(field.columnType, field.isArray ?? false);
		let columnDef = `[${field.columnName}] ${mappedType}`;

		// NOT NULL
		if (!field.isNullable && !field.isPrimaryKey) {
			columnDef += " NOT NULL";
		}

		// Default value (skip for IDENTITY columns)
		if (field.defaultValue && !mappedType.includes("IDENTITY")) {
			const defaultValue = formatMssqlDefaultValue(field.defaultValue, mappedType);
			if (defaultValue !== null) {
				columnDef += ` DEFAULT ${defaultValue}`;
			}
		}

		return columnDef;
	});

	// Primary key constraint
	const primaryKeyFields = fields.filter((f) => f.isPrimaryKey);
	const constraintDefs: string[] = [];

	if (primaryKeyFields.length > 0) {
		const pkColumns = primaryKeyFields.map((f) => `[${f.columnName}]`).join(", ");
		constraintDefs.push(`PRIMARY KEY (${pkColumns})`);
	}

	// Unique constraints
	for (const field of fields) {
		if (field.isUnique && !field.isPrimaryKey) {
			constraintDefs.push(`UNIQUE ([${field.columnName}])`);
		}
	}

	// Foreign key constraints
	const foreignKeyConstraints =
		foreignKeys?.map((fk: ForeignKeyDataType) => {
			const constraintName = `FK_${tableName}_${fk.columnName}`;
			return `CONSTRAINT [${constraintName}] FOREIGN KEY ([${fk.columnName}]) REFERENCES [${fk.referencedTable}] ([${fk.referencedColumn}]) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`;
		}) || [];

	const allDefinitions = [...columnDefinitions, ...constraintDefs, ...foreignKeyConstraints];

	const createTableSQL = `
		CREATE TABLE [${tableName}] (
			${allDefinitions.join(",\n\t\t\t")}
		)
	`;

	await pool.request().query(createTableSQL);
}
