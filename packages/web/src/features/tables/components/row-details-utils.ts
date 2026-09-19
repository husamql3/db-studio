import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import type { TableRecord } from "@/types/table.type";

// Column defaults that mean the database fills the value itself
// (serial sequences, identities, auto-increment, generated UUIDs).
const GENERATED_DEFAULT_PATTERNS = [
	"nextval(",
	"next_value",
	"auto_increment",
	"autoincrement",
	"identity",
	"uuid_generate",
	"gen_random_uuid",
	"newid(",
	"newsequentialid(",
];

export const isGeneratedColumn = (
	column: Pick<ColumnInfoSchemaType, "columnDefault">,
): boolean => {
	const columnDefault = column.columnDefault?.toLowerCase() ?? "";
	return GENERATED_DEFAULT_PATTERNS.some((pattern) => columnDefault.includes(pattern));
};

export const getPrimaryKeyColumn = (
	tableCols: ColumnInfoSchemaType[] | undefined,
): ColumnInfoSchemaType | undefined => tableCols?.find((col) => col.isPrimaryKey);

export const getRecordIdentity = (
	row: TableRecord | undefined,
	tableCols: ColumnInfoSchemaType[] | undefined,
): string | undefined => {
	if (!row || !tableCols) return undefined;
	const pkCols = tableCols.filter((col) => col.isPrimaryKey);
	if (pkCols.length > 0) {
		return JSON.stringify(pkCols.map((col) => [col.columnName, String(row[col.columnName])]));
	}
	const idCol = tableCols.find((col) => col.columnName === "id");
	if (idCol && row[idCol.columnName] !== undefined && row[idCol.columnName] !== null) {
		return JSON.stringify([idCol.columnName, String(row[idCol.columnName])]);
	}
	return undefined;
};

export const toFormValues = (
	row: TableRecord | undefined,
	tableCols: ColumnInfoSchemaType[] | undefined,
): Record<string, string> => {
	const values: Record<string, string> = {};
	if (!row || !tableCols) return values;
	for (const col of tableCols) {
		const value = row[col.columnName];
		if (value === null || value === undefined) {
			values[col.columnName] = "";
		} else if (typeof value === "boolean") {
			values[col.columnName] = value ? "true" : "false";
		} else if (typeof value === "object") {
			try {
				values[col.columnName] = JSON.stringify(value);
			} catch {
				values[col.columnName] = String(value);
			}
		} else {
			values[col.columnName] = String(value);
		}
	}
	return values;
};

export const buildRowUpdates = (
	dirtyFields: Partial<Record<string, boolean>>,
	values: Record<string, string>,
): Array<{ columnName: string; value: unknown }> =>
	Object.keys(dirtyFields)
		.filter((columnName) => dirtyFields[columnName])
		.map((columnName) => ({ columnName, value: values[columnName] ?? "" }));

// Separate seam so tests can mock clipboard access without patching globals.
export const copyTextToClipboard = async (value: string): Promise<void> => {
	await navigator.clipboard.writeText(value);
};
