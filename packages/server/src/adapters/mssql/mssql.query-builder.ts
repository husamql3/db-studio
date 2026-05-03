import type { FilterType, SortDirection, SortType } from "shared/types";

export function buildWhereClause(
	filters: FilterType[],
	startIdx = 0,
): { clause: string; values: unknown[]; nextIdx: number } {
	if (filters.length === 0) return { clause: "", values: [], nextIdx: startIdx };

	const conditions: string[] = [];
	const values: unknown[] = [];
	let idx = startIdx;

	for (const filter of filters) {
		const col = `[${filter.columnName}]`;
		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${col} ${filter.operator} @p${idx}`);
				values.push(filter.value);
				idx++;
				break;
			case "is":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NULL`);
				} else {
					conditions.push(`${col} = @p${idx}`);
					values.push(filter.value);
					idx++;
				}
				break;
			case "is not":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NOT NULL`);
				} else {
					conditions.push(`${col} != @p${idx}`);
					values.push(filter.value);
					idx++;
				}
				break;
			case "like":
			case "ilike":
				conditions.push(`${col} LIKE @p${idx}`);
				values.push(filter.value);
				idx++;
				break;
			case "not like":
			case "not ilike":
				conditions.push(`${col} NOT LIKE @p${idx}`);
				values.push(filter.value);
				idx++;
				break;
			default:
				break;
		}
	}

	if (conditions.length === 0) return { clause: "", values: [], nextIdx: startIdx };
	return { clause: `WHERE ${conditions.join(" AND ")}`, values, nextIdx: idx };
}

export function buildSortClause(sorts: SortType[] | string, order: SortDirection): string {
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) return "";
		return `ORDER BY ${sorts.map((s) => `[${s.columnName}] ${s.direction.toUpperCase()}`).join(", ")}`;
	}
	if (sorts && typeof sorts === "string") {
		return `ORDER BY [${sorts}] ${order?.toUpperCase() || "ASC"}`;
	}
	return "";
}

export function mapColumnTypeToMssql(columnType: string, isArray: boolean): string {
	if (isArray) return "NVARCHAR(MAX)";

	const normalized = columnType.toLowerCase().trim();
	const typeMap: Record<string, string> = {
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
	options: { includePrimaryKey?: boolean; includeUnique?: boolean } = {},
): string {
	const mappedType = mapColumnTypeToMssql(field.columnType, field.isArray ?? false);
	let def = `[${field.columnName}] ${mappedType}`;

	if (field.isIdentity && !mappedType.includes("IDENTITY")) {
		def += " IDENTITY(1,1)";
	}

	if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

	if (field.defaultValue?.trim() && !mappedType.includes("IDENTITY")) {
		const dv = formatMssqlDefaultValue(field.defaultValue, mappedType);
		if (dv !== null) def += ` DEFAULT ${dv}`;
	}

	if (options.includeUnique && field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
	if (options.includePrimaryKey && field.isPrimaryKey) def += " PRIMARY KEY";

	return def;
}
