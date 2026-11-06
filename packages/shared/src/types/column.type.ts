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
