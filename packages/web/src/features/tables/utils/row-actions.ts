import type { ColumnInfoSchemaType, SqlInsertDialect } from "@db-studio/shared/types";
import type { TableRecord } from "@/types/table.type";
import { isGeneratedColumn, toFormValues } from "./row-details-utils";

const quoteIdentifier = (name: string, { quote }: SqlInsertDialect) => {
	const close = quote === "[" ? "]" : quote;
	return `${quote}${name.replaceAll(close, close + close)}${close}`;
};

// shortcut: arrays are written as JSON text, which PostgreSQL array columns reject; format
// them per engine if users copy array rows.
const toSqlLiteral = (value: unknown, dialect: SqlInsertDialect) => {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "boolean") {
		if (dialect.booleanKeywords) return value ? "TRUE" : "FALSE";
		return value ? "1" : "0";
	}
	if (typeof value === "number") return String(value);
	let text = typeof value === "object" ? JSON.stringify(value) : String(value);
	if (dialect.backslashEscapes) text = text.replaceAll("\\", "\\\\");
	return `${dialect.unicodePrefix ? "N" : ""}'${text.replaceAll("'", "''")}'`;
};

export const toInsertStatement = ({
	tableName,
	schemaName,
	row,
	dialect,
}: {
	tableName: string;
	schemaName?: string;
	row: TableRecord;
	dialect: SqlInsertDialect;
}) => {
	const table = `${schemaName ? `${quoteIdentifier(schemaName, dialect)}.` : ""}${quoteIdentifier(tableName, dialect)}`;
	const columns = Object.keys(row);
	const names = columns.map((name) => quoteIdentifier(name, dialect)).join(", ");
	const values = columns.map((name) => toSqlLiteral(row[name], dialect)).join(", ");
	return `INSERT INTO ${table} (${names}) VALUES (${values});`;
};

/**
 * Add-record form values for a copy of the row. Leaves out what the database generates, a
 * lone primary key (a copy can never reuse it), and NULLs, so those columns take their default.
 */
export const toDuplicateValues = (row: TableRecord, tableCols: ColumnInfoSchemaType[]) => {
	const isLonePrimaryKey = tableCols.filter((col) => col.isPrimaryKey).length === 1;
	const omitted = new Set(
		tableCols
			.filter((col) => isGeneratedColumn(col) || (col.isPrimaryKey && isLonePrimaryKey))
			.map((col) => col.columnName),
	);
	return Object.fromEntries(
		Object.entries(toFormValues(row, tableCols)).filter(
			([name]) => !omitted.has(name) && row[name] !== null && row[name] !== undefined,
		),
	);
};
