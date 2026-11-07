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
