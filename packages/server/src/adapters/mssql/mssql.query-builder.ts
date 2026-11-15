import {
	DataTypes,
	type SortDirection,
	type SortType,
	StandardizedDataType,
	type FormColumnType,
} from "@db-studio/shared/types";
import type { FilterDialect } from "@/adapters/sql-filters.js";
import { offsetOrderBy, orderTerms } from "@/adapters/sql-pagination.js";
import type { InlineConstraints } from "@/adapters/sql.adapter.js";

export const quoteMssqlIdent = (name: string) => `[${name.replaceAll("]", "]]")}]`;

export const mssqlFilters: FilterDialect = { quote: quoteMssqlIdent, ilike: "like" };

/** `mssql` binds each value by name: `@p0`, `@p1`, … */
export const mssqlPlaceholder = (position: number) => `@p${position - 1}`;

/** OFFSET/FETCH requires an ORDER BY, so an unsorted table without a key gets a no-op one. */
export const buildOrderByClause = (
	sorts: SortType[],
	order: SortDirection,
	keyColumns: string[],
) =>
	offsetOrderBy(orderTerms(sorts, order, keyColumns), quoteMssqlIdent) ||
	"ORDER BY (SELECT NULL)";

export function mapColumnTypeToMssql(columnType: string, isArray: boolean): string {
	if (isArray) return "NVARCHAR(MAX)";

	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string | undefined> &
		Record<FormColumnType, string | undefined> = {
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
		numeric: "NUMERIC",
		decimal: "DECIMAL",
		real: "REAL",
		float4: "REAL",
		float: "FLOAT",
		"double precision": "FLOAT",
		float8: "FLOAT",
		money: "MONEY",
		boolean: "BIT",
		bool: "BIT",
		text: "NVARCHAR(MAX)",
		varchar: "VARCHAR(255)",
		"character varying": "VARCHAR(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR",
		uuid: "UNIQUEIDENTIFIER",
		json: "NVARCHAR(MAX)",
		jsonb: "NVARCHAR(MAX)",
		xml: "XML",
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "DATETIME2",
		"timestamp without time zone": "DATETIME2",
		"timestamp with time zone": "DATETIMEOFFSET",
		timestamptz: "DATETIMEOFFSET",
		interval: "VARCHAR(255)",
		bytea: "VARBINARY(MAX)",
		inet: "VARCHAR(45)",
		cidr: "VARCHAR(45)",
		macaddr: "VARCHAR(17)",
		macaddr8: "VARCHAR(23)",
		// No SQL Server type is mapped for these; the name passes through upper-cased.
		point: undefined,
		line: undefined,
		polygon: undefined,
	};

	return typeMap[normalized] || columnType.toUpperCase();
}

export function formatMssqlDefaultValue(
	defaultValue: string,
	columnType: string,
): string | null {
	const trimmed = defaultValue.trim().toLowerCase();

	if (trimmed.includes("(") && trimmed.includes(")")) {
		if (trimmed.includes("newid()")) {
			if (!columnType.toUpperCase().includes("UNIQUEIDENTIFIER")) return null;

			return "NEWID()";
		}

		if (trimmed.includes("getdate") || trimmed.includes("current_timestamp"))
			return "GETDATE()";

		return defaultValue.trim();
	}

	if (trimmed === "null") return "NULL";

	if (trimmed === "true" || trimmed === "false") return trimmed === "true" ? "1" : "0";

	return defaultValue.trim();
}

type MssqlColumnDefinitionInput = {
	columnName: string;
	columnType: string;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	isNullable?: boolean;
	isUnique?: boolean;
	isIdentity?: boolean;
	isArray?: boolean;
};

export function buildMssqlColumnDefinition(
	field: MssqlColumnDefinitionInput,
	{ inlineKey, inlineUnique }: InlineConstraints,
): string {
	const mappedType = mapColumnTypeToMssql(field.columnType, field.isArray ?? false);
	let def = `${quoteMssqlIdent(field.columnName)} ${mappedType}`;

	if (field.isIdentity && !mappedType.includes("IDENTITY")) {
		def += " IDENTITY(1,1)";
	}

	if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

	if (field.defaultValue?.trim() && !mappedType.includes("IDENTITY")) {
		const dv = formatMssqlDefaultValue(field.defaultValue, mappedType);

		if (dv !== null) def += ` DEFAULT ${dv}`;
	}

	if (inlineUnique) def += " UNIQUE";

	if (inlineKey) def += " PRIMARY KEY";

	return def;
}

/**
 * Maps SQL Server data types to generic DataType enum (used for cell rendering)
 * @param mssqlDataType - The data type from sys.columns or information_schema.columns
 */
export function mapMssqlToDataType(mssqlDataType: string): DataTypes {
	const normalized = mssqlDataType?.toLowerCase().trim() || "";

	if (
		normalized === "tinyint" ||
		normalized === "smallint" ||
		normalized === "int" ||
		normalized === "bigint" ||
		normalized === "decimal" ||
		normalized === "numeric" ||
		normalized === "float" ||
		normalized === "real" ||
		normalized === "money" ||
		normalized === "smallmoney"
	) {
		return DataTypes.number;
	}

	if (normalized === "bit") {
		return DataTypes.boolean;
	}

	if (
		normalized === "date" ||
		normalized === "datetime" ||
		normalized === "datetime2" ||
		normalized === "smalldatetime" ||
		normalized === "datetimeoffset"
	) {
		return DataTypes.date;
	}

	// JSON (SQL Server 2016+)
	if (normalized === "json") {
		return DataTypes.json;
	}

	return DataTypes.text;
}

/**
 * Maps SQL Server data types to standardized display labels
 * @param mssqlDataType - The data type from sys.columns or information_schema.columns
 */
export function standardizeMssqlDataTypeLabel(mssqlDataType: string): StandardizedDataType {
	if (!mssqlDataType) {
		return StandardizedDataType.text;
	}

	const normalized = mssqlDataType.toLowerCase().trim();

	if (normalized === "tinyint") return StandardizedDataType.tinyint;

	if (normalized === "smallint") return StandardizedDataType.smallint;

	if (normalized === "int") return StandardizedDataType.int;

	if (normalized === "bigint") return StandardizedDataType.bigint;

	if (normalized === "decimal" || normalized === "numeric")
		return StandardizedDataType.numeric;

	if (normalized === "float") return StandardizedDataType.float;

	if (normalized === "real") return StandardizedDataType.float;

	if (normalized === "money" || normalized === "smallmoney") return StandardizedDataType.money;

	if (normalized === "bit") return StandardizedDataType.boolean;

	if (normalized === "char") return StandardizedDataType.char;

	if (normalized === "varchar") return StandardizedDataType.varchar;

	if (normalized === "text") return StandardizedDataType.text;

	if (normalized === "nchar") return StandardizedDataType.char;

	if (normalized === "nvarchar") return StandardizedDataType.varchar;

	if (normalized === "ntext") return StandardizedDataType.text;

	if (normalized === "binary") return StandardizedDataType.binary;

	if (normalized === "varbinary") return StandardizedDataType.varbinary;

	if (normalized === "image") return StandardizedDataType.blob;

	if (normalized === "uniqueidentifier") return StandardizedDataType.uuid;

	if (normalized === "date") return StandardizedDataType.date;

	if (normalized === "time") return StandardizedDataType.time;

	if (normalized === "datetime") return StandardizedDataType.datetime;

	if (normalized === "datetime2") return StandardizedDataType.datetime;

	if (normalized === "smalldatetime") return StandardizedDataType.datetime;

	if (normalized === "datetimeoffset") return StandardizedDataType.timestamptz;

	if (normalized === "json") return StandardizedDataType.json;

	if (normalized === "xml") return StandardizedDataType.xml;

	return StandardizedDataType.text;
}
