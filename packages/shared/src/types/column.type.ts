/**
 * The PostgreSQL type names the column form offers on relational engines. Every other engine's
 * query builder maps each of them, so adding one here fails typecheck until they all do.
 */
export type FormColumnType =
	| "int2"
	| "int4"
	| "int8"
	| "float4"
	| "float8"
	| "numeric"
	| "serial"
	| "bigserial"
	| "text"
	| "varchar"
	| "char"
	| "uuid"
	| "boolean"
	| "date"
	| "time"
	| "timestamp"
	| "timestamptz"
	| "interval"
	| "json"
	| "jsonb"
	| "bytea"
	| "inet"
	| "cidr"
	| "macaddr"
	| "macaddr8"
	| "point"
	| "line"
	| "polygon"
	| "xml";

const SERIAL_TYPES = new Set([
	"serial",
	"serial4",
	"bigserial",
	"serial8",
	"smallserial",
	"serial2",
]);

/** A PostgreSQL serial type from the column form, which other engines turn into an auto id. */
export const isSerialType = (columnType: string) =>
	SERIAL_TYPES.has(columnType.toLowerCase().trim());
