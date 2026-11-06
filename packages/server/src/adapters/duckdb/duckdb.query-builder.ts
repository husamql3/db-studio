import type { FilterDialect } from "@/adapters/sql-filters.js";
import type { KeysetDialect } from "@/adapters/sql-pagination.js";

export const quoteDuckdbIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

export const duckdbFilters: FilterDialect = {
	quote: quoteDuckdbIdent,
	likeOperand: (column) => `CAST(${column} AS VARCHAR)`,
	ilike: "keyword",
};

export const duckdbKeyset: KeysetDialect = { quote: quoteDuckdbIdent, nulls: "keyword" };

/** Translate a PostgreSQL type name from the web form into a DuckDB column type. */
export function mapColumnTypeToDuckdb(columnType: string, isArray: boolean): string {
	const normalized = columnType.toLowerCase().trim();

	const typeMap: Record<string, string> = {
		serial: "INTEGER",
		serial4: "INTEGER",
		bigserial: "BIGINT",
		serial8: "BIGINT",
		smallserial: "SMALLINT",
		serial2: "SMALLINT",
		int: "INTEGER",
		int4: "INTEGER",
		integer: "INTEGER",
		bigint: "BIGINT",
		int8: "BIGINT",
		smallint: "SMALLINT",
		int2: "SMALLINT",
		numeric: "DECIMAL(18, 3)",
		decimal: "DECIMAL(18, 3)",
		real: "FLOAT",
		float4: "FLOAT",
		float: "DOUBLE",
		"double precision": "DOUBLE",
		float8: "DOUBLE",
		money: "DECIMAL(19, 4)",
		boolean: "BOOLEAN",
		bool: "BOOLEAN",
		text: "VARCHAR",
		varchar: "VARCHAR",
		"character varying": "VARCHAR",
		char: "VARCHAR",
		character: "VARCHAR",
		bpchar: "VARCHAR",
		uuid: "UUID",
		json: "JSON",
		jsonb: "JSON",
		xml: "VARCHAR",
		date: "DATE",
		time: "TIME",
		"time without time zone": "TIME",
		timestamp: "TIMESTAMP",
		"timestamp without time zone": "TIMESTAMP",
		"timestamp with time zone": "TIMESTAMPTZ",
		timestamptz: "TIMESTAMPTZ",
		interval: "INTERVAL",
		bytea: "BLOB",
		inet: "VARCHAR",
		cidr: "VARCHAR",
		macaddr: "VARCHAR",
		macaddr8: "VARCHAR",
		point: "VARCHAR",
		line: "VARCHAR",
		polygon: "VARCHAR",
	};

	const mapped = typeMap[normalized] ?? columnType.toUpperCase();

	return isArray ? `${mapped}[]` : mapped;
}
