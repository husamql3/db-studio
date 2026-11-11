import type { ColumnInfoSchemaType } from "@db-studio/shared/types";

/** A column for tests: nullable text with no key or default, unless `overrides` says otherwise. */
export const column = (
	columnName: string,
	overrides: Partial<ColumnInfoSchemaType> = {},
): ColumnInfoSchemaType => ({
	columnName,
	dataType: "text",
	dataTypeLabel: "text",
	isNullable: true,
	columnDefault: null,
	isPrimaryKey: false,
	isForeignKey: false,
	referencedTable: null,
	referencedColumn: null,
	enumValues: null,
	...overrides,
});
