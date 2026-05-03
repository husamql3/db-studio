import type { CursorData, FilterType, SortDirection, SortType } from "shared/types";

export function buildWhereClause(filters: FilterType[]): {
	clause: string;
	values: unknown[];
} {
	if (filters.length === 0) return { clause: "", values: [] };

	const conditions: string[] = [];
	const values: unknown[] = [];

	for (const filter of filters) {
		const col = `\`${filter.columnName}\``;
		switch (filter.operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${col} ${filter.operator} ?`);
				values.push(filter.value);
				break;
			case "is":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NULL`);
				} else {
					conditions.push(`${col} = ?`);
					values.push(filter.value);
				}
				break;
			case "is not":
				if (filter.value.toLowerCase() === "null") {
					conditions.push(`${col} IS NOT NULL`);
				} else {
					conditions.push(`${col} != ?`);
					values.push(filter.value);
				}
				break;
			case "like":
			case "ilike":
				conditions.push(`${col} LIKE ?`);
				values.push(filter.value);
				break;
			case "not like":
			case "not ilike":
				conditions.push(`${col} NOT LIKE ?`);
				values.push(filter.value);
				break;
			default:
				break;
		}
	}

	if (conditions.length === 0) return { clause: "", values: [] };
	return { clause: `WHERE ${conditions.join(" AND ")}`, values };
}

export function buildSortClause(sorts: SortType[] | string, order: SortDirection): string {
	if (Array.isArray(sorts)) {
		if (sorts.length === 0) return "";
		return `ORDER BY ${sorts.map((s) => `\`${s.columnName}\` ${s.direction.toUpperCase()}`).join(", ")}`;
	}
	if (sorts && typeof sorts === "string") {
		return `ORDER BY \`${sorts}\` ${order?.toUpperCase() || "ASC"}`;
	}
	return "";
}

export function buildCursorWhereClause(
	cursorData: CursorData,
	direction: SortDirection,
	sortDirection: SortDirection,
): { clause: string; values: unknown[] } {
	const { values, sortColumns } = cursorData;
	if (sortColumns.length === 0) return { clause: "", values: [] };

	const isAscending = sortDirection === "asc";
	const isForward = direction === "asc";
	const useGreaterThan = isAscending === isForward;
	const operator = useGreaterThan ? ">" : "<";

	const columnList = sortColumns.map((col) => `\`${col}\``).join(", ");
	const placeholders = sortColumns.map(() => "?").join(", ");
	const queryValues = sortColumns.map((col) => values[col]);

	return {
		clause: `(${columnList}) ${operator} (${placeholders})`,
		values: queryValues,
	};
}

type MysqlColumnDefinitionInput = {
	columnName: string;
	columnType: string;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	isNullable?: boolean;
	isUnique?: boolean;
	isIdentity?: boolean;
	isArray?: boolean;
};

type BuildMysqlColumnDefinitionOptions = {
	includePrimaryKey?: boolean;
	includeUnique?: boolean;
	preserveAutoIncrement?: boolean;
};

export function mapColumnTypeToMysql(columnType: string, isArray: boolean): string {
	if (isArray) return "JSON";
	const normalized = columnType.toLowerCase().trim();
	const typeMap: Record<string, string> = {
		serial: "INT AUTO_INCREMENT",
		serial4: "INT AUTO_INCREMENT",
		bigserial: "BIGINT AUTO_INCREMENT",
		serial8: "BIGINT AUTO_INCREMENT",
		int: "INT",
		int4: "INT",
		integer: "INT",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		numeric: "DECIMAL",
		decimal: "DECIMAL",
		real: "FLOAT",
		float4: "FLOAT",
		float: "FLOAT",
		"double precision": "DOUBLE",
		float8: "DOUBLE",
		money: "DECIMAL(19, 4)",
		boolean: "TINYINT(1)",
		bool: "TINYINT(1)",
		text: "LONGTEXT",
		varchar: "VARCHAR(255)",
		"character varying": "VARCHAR(255)",
		char: "CHAR(1)",
		character: "CHAR(1)",
		bpchar: "CHAR",
		uuid: "CHAR(36)",
		json: "JSON",
		jsonb: "JSON",
		xml: "LONGTEXT",
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "DATETIME",
		"timestamp without time zone": "DATETIME",
		"timestamp with time zone": "DATETIME",
		timestamptz: "DATETIME",
		interval: "VARCHAR(255)",
		bytea: "LONGBLOB",
		inet: "VARCHAR(45)",
		cidr: "VARCHAR(45)",
		macaddr: "VARCHAR(17)",
		macaddr8: "VARCHAR(23)",
		point: "POINT",
		line: "LINESTRING",
		polygon: "POLYGON",
	};
	return typeMap[normalized] || columnType.toUpperCase();
}

export function formatMysqlDefaultValue(
	defaultValue: string | null | undefined,
	columnType: string,
): string | null {
	if (!defaultValue?.trim()) return null;
	const trimmed = defaultValue.trim().toLowerCase();

	if (trimmed.includes("(") && trimmed.includes(")")) {
		if (trimmed.includes("uuid()")) {
			if (
				!columnType.toUpperCase().includes("CHAR") &&
				!columnType.toUpperCase().includes("TEXT")
			) {
				return null;
			}
			return "(UUID())";
		}
		if (trimmed.includes("current_timestamp") || trimmed.includes("now()"))
			return "(CURRENT_TIMESTAMP)";
		if (trimmed.includes("current_date")) return "(CURRENT_DATE)";
		return `(${defaultValue.trim()})`;
	}

	if (trimmed === "null") return "NULL";
	if (trimmed === "true") return "1";
	if (trimmed === "false") return "0";
	return defaultValue.trim();
}

export function buildMysqlColumnDefinition(
	field: MysqlColumnDefinitionInput,
	options: BuildMysqlColumnDefinitionOptions = {},
): string {
	const mappedType = mapColumnTypeToMysql(field.columnType, field.isArray ?? false);
	let def = `\`${field.columnName}\` ${mappedType}`;

	if (!field.isNullable && !field.isPrimaryKey) def += " NOT NULL";

	if (field.defaultValue && !mappedType.includes("AUTO_INCREMENT")) {
		const dv = formatMysqlDefaultValue(field.defaultValue, mappedType);
		if (dv !== null) def += ` DEFAULT ${dv}`;
	}

	if (
		(field.isIdentity || options.preserveAutoIncrement) &&
		!mappedType.includes("AUTO_INCREMENT")
	) {
		def += " AUTO_INCREMENT";
	}

	if (options.includeUnique && field.isUnique && !field.isPrimaryKey) def += " UNIQUE";
	if (options.includePrimaryKey && field.isPrimaryKey) def += " PRIMARY KEY";

	return def;
}
