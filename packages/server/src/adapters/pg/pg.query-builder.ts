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
