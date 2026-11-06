import { DataTypes, StandardizedDataType } from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import type { KeysetDialect } from "@/adapters/sql-pagination.js";

export const quotePgIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export const pgFilters: FilterDialect = {
	quote: quotePgIdent,
	likeOperand: (column) => `${column}::text`,
	ilike: "keyword",
};

export const pgPlaceholder = (position: number) => `$${position}`;

export const pgKeyset: KeysetDialect = { quote: quotePgIdent, nulls: "keyword" };

/**
 * Postgres resolves a bare table name through search_path, but catalog queries
 * filter on a literal schema and would otherwise disagree with the data queries
 * — the reason a table outside "public" used to list yet 404 on its columns.
 * The helpers below mirror Postgres' own resolution.
 */

/**
 * The single schema a bare table name resolves to, honouring search_path order
 * so a name present in several schemas picks the same one Postgres would.
 */
const resolvedSchemaFor = (tableParam: string): string =>
	`(SELECT sp.schema_name FROM unnest(current_schemas(false)) WITH ORDINALITY AS sp(schema_name, position)
	  JOIN information_schema.tables it
	    ON it.table_schema = sp.schema_name AND it.table_name = ${tableParam}
	  ORDER BY sp.position LIMIT 1)`;

/**
 * The schema of the table named by `tableParam`: the one in `schemaParam`, or the search_path
 * one when `schemaParam` is null. Pass `schemaName ?? null` as the schema value.
 */
export const schemaOf = (tableParam: string, schemaParam: string): string =>
	`COALESCE(${schemaParam}::text, ${resolvedSchemaFor(tableParam)})`;

/** `"schema"."table"`, or the bare `"table"`, which resolves through search_path. */
export const qualifiedTable = (tableName: string, schemaName?: string): string =>
	schemaName
		? `${quotePgIdent(schemaName)}.${quotePgIdent(tableName)}`
		: quotePgIdent(tableName);

export function mapPostgresToDataType(pgType: string): DataTypes {
	const normalized = pgType?.toLowerCase().trim() || "";

	if (
		normalized.includes("[]") ||
		normalized === "date" ||
		normalized === "time" ||
		normalized === "time without time zone" ||
		normalized.startsWith("time(") ||
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(") ||
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(")
	) {
		return DataTypes.date;
	}

	if (
		normalized === "integer" ||
		normalized === "int" ||
		normalized === "int4" ||
		normalized === "bigint" ||
		normalized === "int8" ||
		normalized === "smallint" ||
		normalized === "int2" ||
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(") ||
		normalized === "real" ||
		normalized === "float4" ||
		normalized === "double precision" ||
		normalized === "float8" ||
		normalized === "float" ||
		normalized === "serial" ||
		normalized === "serial4" ||
		normalized === "bigserial" ||
		normalized === "serial8" ||
		normalized === "money"
	) {
		return DataTypes.number;
	}

	if (normalized === "boolean" || normalized === "bool") {
		return DataTypes.boolean;
	}

	if (normalized === "json" || normalized === "jsonb") {
		return DataTypes.json;
	}

	if (
		normalized.startsWith("user-defined") ||
		normalized === "enum" ||
		normalized === "text" ||
		normalized === "xml"
	) {
		return DataTypes.text;
	}

	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(") ||
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar" ||
		normalized === "uuid" ||
		normalized === "interval" ||
		normalized.startsWith("interval") ||
		normalized === "bytea" ||
		normalized === "point" ||
		normalized === "line" ||
		normalized === "polygon" ||
		normalized === "inet" ||
		normalized === "cidr" ||
		normalized === "macaddr" ||
		normalized === "macaddr8"
	) {
		return DataTypes.text;
	}

	return DataTypes.text;
}

export function standardizeDataTypeLabel(
	pgType: string | null | undefined,
): StandardizedDataType {
	if (!pgType) {
		return StandardizedDataType.text;
	}

	const normalized = pgType.toLowerCase().trim();

	if (
		normalized === "integer" ||
		normalized === "int" ||
		normalized === "int4" ||
		normalized === "serial" ||
		normalized === "serial4"
	) {
		return StandardizedDataType.int;
	}

	if (
		normalized === "bigint" ||
		normalized === "int8" ||
		normalized === "bigserial" ||
		normalized === "serial8"
	) {
		return StandardizedDataType.bigint;
	}

	if (normalized === "smallint" || normalized === "int2") {
		return StandardizedDataType.smallint;
	}

	if (
		normalized === "decimal" ||
		normalized.startsWith("decimal(") ||
		normalized === "numeric" ||
		normalized.startsWith("numeric(")
	) {
		return StandardizedDataType.numeric;
	}

	if (normalized === "real" || normalized === "float4") {
		return StandardizedDataType.float;
	}

	if (normalized === "double precision" || normalized === "float8" || normalized === "float") {
		return StandardizedDataType.double;
	}

	if (normalized === "money") {
		return StandardizedDataType.money;
	}

	if (normalized === "boolean" || normalized === "bool") {
		return StandardizedDataType.boolean;
	}

	if (normalized === "text") {
		return StandardizedDataType.text;
	}

	if (
		normalized === "character varying" ||
		normalized.startsWith("varchar") ||
		normalized.startsWith("character varying(")
	) {
		return StandardizedDataType.varchar;
	}

	if (
		normalized === "character" ||
		normalized.startsWith("char") ||
		normalized.startsWith("character(") ||
		normalized === "bpchar"
	) {
		return StandardizedDataType.char;
	}

	if (normalized === "json") {
		return StandardizedDataType.json;
	}

	if (normalized === "jsonb") {
		return StandardizedDataType.jsonb;
	}

	if (normalized === "xml") {
		return StandardizedDataType.xml;
	}

	if (normalized === "uuid") {
		return StandardizedDataType.uuid;
	}

	if (normalized === "date") {
		return StandardizedDataType.date;
	}

	if (
		normalized === "time" ||
		normalized === "time without time zone" ||
		normalized.startsWith("time(")
	) {
		return StandardizedDataType.time;
	}

	if (
		normalized === "timestamp" ||
		normalized === "timestamp without time zone" ||
		normalized.startsWith("timestamp(")
	) {
		return StandardizedDataType.timestamp;
	}

	if (
		normalized === "timestamp with time zone" ||
		normalized === "timestamptz" ||
		normalized.startsWith("timestamp with time zone(")
	) {
		return StandardizedDataType.timestamptz;
	}

	if (normalized === "interval" || normalized.startsWith("interval")) {
		return StandardizedDataType.interval;
	}

	if (normalized === "bytea") {
		return StandardizedDataType.bytea;
	}

	if (normalized === "inet") {
		return StandardizedDataType.inet;
	}

	if (normalized === "cidr") {
		return StandardizedDataType.cidr;
	}

	if (normalized === "macaddr") {
		return StandardizedDataType.macaddr;
	}

	if (normalized === "macaddr8") {
		return StandardizedDataType.macaddr8;
	}

	if (normalized === "point") {
		return StandardizedDataType.point;
	}

	if (normalized === "line") {
		return StandardizedDataType.line;
	}

	if (normalized === "polygon") {
		return StandardizedDataType.polygon;
	}

	// todo: handle array types
	if (normalized.startsWith("array") || normalized.includes("[]")) {
		return StandardizedDataType.text;
	}

	// User-defined types (enums)
	if (normalized.startsWith("user-defined") || normalized === "enum") {
		return StandardizedDataType.enum;
	}

	return StandardizedDataType.text;
}
