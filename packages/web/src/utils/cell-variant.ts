import type { ColumnInfoSchemaType, DataTypes } from "@db-studio/shared/types";

/**
 * The kind of value a column holds, which picks its editor and how pasted text is read: an
 * enum's labels, else its data type. A foreign key keeps the kind of its value; its reference
 * picker is decided beside this.
 */
export const cellVariant = ({
	enumValues,
	dataType,
}: Pick<ColumnInfoSchemaType, "enumValues" | "dataType">): DataTypes =>
	enumValues ? "enum" : dataType;

/**
 * Record form values as they are written. A form shows NULL as an empty field, so an empty
 * field is NULL, except in a text column, where it is the empty string.
 */
export const toWriteValues = <V>(
	values: Record<string, V>,
	tableCols: ColumnInfoSchemaType[],
): Record<string, V | null> => {
	const written: Record<string, V | null> = { ...values };

	for (const col of tableCols) {
		if (written[col.columnName] === "" && cellVariant(col) !== "text") {
			written[col.columnName] = null;
		}
	}

	return written;
};
