import type { FilterType, SortDirection, SortType } from "@db-studio/shared/types";

export const quoteClickhouseIdentifier = (name: string): string =>
	`\`${name.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;

const q = quoteClickhouseIdentifier;

/**
 * Filter values bind as positional `{pN:String}` parameters: ClickHouse converts a
 * string operand to the column's type for comparisons. LIKE needs a string column,
 * so it compares the column's text form.
 */
export function buildWhereClause(filters: FilterType[]): { clause: string; values: string[] } {
	const conditions: string[] = [];
	const values: string[] = [];

	const bind = (value: string) => {
		values.push(value);
		return `{p${values.length - 1}:String}`;
	};

	for (const { columnName, operator, value } of filters) {
		const col = q(columnName);
		switch (operator) {
			case "=":
			case "!=":
			case ">":
			case ">=":
			case "<":
			case "<=":
				conditions.push(`${col} ${operator} ${bind(value)}`);
				break;
			case "is":
				conditions.push(
					value.toLowerCase() === "null" ? `${col} IS NULL` : `${col} = ${bind(value)}`,
				);
				break;
			case "is not":
				conditions.push(
					value.toLowerCase() === "null" ? `${col} IS NOT NULL` : `${col} != ${bind(value)}`,
				);
				break;
			case "like":
				conditions.push(`toString(${col}) LIKE ${bind(value)}`);
				break;
			case "not like":
				conditions.push(`toString(${col}) NOT LIKE ${bind(value)}`);
				break;
			case "ilike":
				conditions.push(`toString(${col}) ILIKE ${bind(value)}`);
				break;
			case "not ilike":
				conditions.push(`toString(${col}) NOT ILIKE ${bind(value)}`);
				break;
		}
	}

	return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

/**
 * User sort first, then `tieBreakers` (raw expressions such as the table's sorting
 * key) in the leading sort direction, so OFFSET pages stay stable.
 */
export function buildOrderByClause(
	sort: SortType[] | string,
	order: SortDirection,
	tieBreakers: string[],
): string {
	const sorts: SortType[] = Array.isArray(sort)
		? sort
		: sort
			? [{ columnName: sort, direction: order }]
			: [];
	const direction = (sorts[0]?.direction ?? order).toUpperCase();
	const terms = [
		...sorts.map((s) => `${q(s.columnName)} ${s.direction.toUpperCase()}`),
		...tieBreakers.map((expr) => `${expr} ${direction}`),
	];
	return terms.length ? `ORDER BY ${terms.join(", ")}` : "";
}

/** Postgres types (from the web form) to ClickHouse. Unknown names pass through as native ClickHouse types. */
export function mapColumnTypeToClickhouse(
	columnType: string,
	isArray: boolean,
	supportsJsonType: boolean,
): string {
	const typeMap: Record<string, string> = {
		smallserial: "UInt16",
		serial2: "UInt16",
		serial: "UInt32",
		serial4: "UInt32",
		bigserial: "UInt64",
		serial8: "UInt64",
		tinyint: "Int8",
		smallint: "Int16",
		int2: "Int16",
		int: "Int32",
		int4: "Int32",
		integer: "Int32",
		bigint: "Int64",
		int8: "Int64",
		numeric: "Decimal(38, 10)",
		decimal: "Decimal(38, 10)",
		money: "Decimal(19, 4)",
		real: "Float32",
		float4: "Float32",
		float: "Float64",
		float8: "Float64",
		"double precision": "Float64",
		boolean: "Bool",
		bool: "Bool",
		text: "String",
		varchar: "String",
		"character varying": "String",
		char: "String",
		character: "String",
		bpchar: "String",
		citext: "String",
		uuid: "UUID",
		json: supportsJsonType ? "JSON" : "String",
		jsonb: supportsJsonType ? "JSON" : "String",
		xml: "String",
		date: "Date32",
		time: "String",
		"time without time zone": "String",
		timestamp: "DateTime64(6)",
		"timestamp without time zone": "DateTime64(6)",
		timestamptz: "DateTime64(6, 'UTC')",
		"timestamp with time zone": "DateTime64(6, 'UTC')",
		interval: "String",
		bytea: "String",
		inet: "String",
		cidr: "String",
		macaddr: "String",
		macaddr8: "String",
	};

	const base = typeMap[columnType.toLowerCase().trim()] ?? columnType.trim();
	return isArray ? `Array(${base})` : base;
}

const DEFAULT_FUNCTIONS: Record<string, string> = {
	"now()": "now()",
	current_timestamp: "now()",
	"current_timestamp()": "now()",
	current_date: "today()",
	"gen_random_uuid()": "generateUUIDv4()",
	"uuid_generate_v4()": "generateUUIDv4()",
};

type ClickhouseColumnInput = {
	columnName: string;
	columnType: string;
	isArray?: boolean;
	isNullable?: boolean;
	isPrimaryKey?: boolean;
	isIdentity?: boolean;
	defaultValue?: string | null;
};

/**
 * Identity and serial columns become `UInt64 DEFAULT generateSnowflakeID()`:
 * ClickHouse has no auto-increment, and Snowflake IDs are unique and grow in
 * insertion order.
 */
export function buildClickhouseColumnDefinition(
	field: ClickhouseColumnInput,
	supportsJsonType: boolean,
): string {
	const name = q(field.columnName);
	if (field.isIdentity || /serial/i.test(field.columnType)) {
		return `${name} UInt64 DEFAULT generateSnowflakeID()`;
	}

	const type = mapColumnTypeToClickhouse(
		field.columnType,
		field.isArray ?? false,
		supportsJsonType,
	);
	const nullable = field.isNullable && !field.isPrimaryKey && !field.isArray;
	let def = `${name} ${nullable ? `Nullable(${type})` : type}`;

	const defaultValue = field.defaultValue?.trim();
	if (defaultValue) {
		def += ` DEFAULT ${DEFAULT_FUNCTIONS[defaultValue.toLowerCase()] ?? defaultValue}`;
	}
	return def;
}
