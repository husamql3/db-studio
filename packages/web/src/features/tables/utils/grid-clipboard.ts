import type { ColumnMeta } from "@tanstack/react-table";
import type { TableRecord } from "@/types/table.type";

type PasteColumn = Pick<
	ColumnMeta<TableRecord, unknown>,
	"variant" | "enumValues" | "dataTypeLabel" | "isNullable"
>;

const quote = (value: string) =>
	/[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Tab-separated text that spreadsheets paste into the same cells. */
export const toClipboardText = (rows: string[][]) =>
	rows.map((row) => row.map(quote).join("\t")).join("\n");

/**
 * Spreadsheet clipboard text to rows of cells. Unlike the CSV import, a blank line is a row
 * with one empty cell, and only a cell that starts with a quote is quoted.
 */
export const parseClipboardText = (text: string): string[][] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let i = 0;
	const input = text.replace(/\r?\n$/, "");
	while (i <= input.length) {
		let cell = "";
		if (input[i] === '"') {
			const end = input.indexOf('"', i + 1);
			// An opening quote without a closing one is a literal character.
			if (end === -1) {
				cell = input.slice(i);
				i = input.length;
			} else {
				for (i++; i < input.length; i++) {
					if (input[i] === '"' && input[i + 1] === '"') {
						cell += '"';
						i++;
					} else if (input[i] === '"') {
						i++;
						break;
					} else cell += input[i];
				}
			}
		}
		while (i < input.length && input[i] !== "\t" && input[i] !== "\n" && input[i] !== "\r") {
			cell += input[i++];
		}
		row.push(cell);
		if (input[i] === "\t") {
			i++;
			continue;
		}
		rows.push(row);
		row = [];
		i += input[i] === "\r" && input[i + 1] === "\n" ? 2 : 1;
	}
	return rows;
};

const INTEGER_TYPES = new Set(["int", "bigint", "smallint", "tinyint", "mediumint"]);
// The date variant also covers time and array columns, whose text Date cannot parse.
const DATE_TYPES = new Set(["date", "timestamp", "timestamptz", "datetime"]);
const BOOLEANS: Record<string, boolean> = {
	true: true,
	t: true,
	yes: true,
	"1": true,
	false: false,
	f: false,
	no: false,
	"0": false,
};

/** The value a pasted cell stages for its column, in the form that column's editor stages. */
export const coercePastedValue = (
	text: string,
	column: PasteColumn,
): { value: unknown } | { error: string } => {
	if (text === "") {
		if (column.isNullable) return { value: null };
		return column.variant === "text" || !column.variant
			? { value: "" }
			: { error: "Required" };
	}
	switch (column.variant) {
		case "number": {
			const value = Number(text.trim());
			if (text.trim() === "" || !Number.isFinite(value)) return { error: "Not a number" };
			if (INTEGER_TYPES.has(column.dataTypeLabel ?? "") && !Number.isSafeInteger(value)) {
				return {
					error: Number.isInteger(value) ? "Too large to paste exactly" : "Not a whole number",
				};
			}
			return { value };
		}
		case "boolean": {
			const value = BOOLEANS[text.trim().toLowerCase()];
			return value === undefined ? { error: "Not true or false" } : { value };
		}
		case "enum":
			return column.enumValues?.includes(text)
				? { value: text }
				: { error: `Not one of ${column.enumValues?.join(", ")}` };
		case "json":
			try {
				return { value: JSON.parse(text) };
			} catch {
				return { error: "Invalid JSON" };
			}
		case "date":
			return DATE_TYPES.has(column.dataTypeLabel ?? "") && Number.isNaN(Date.parse(text))
				? { error: "Not a date" }
				: { value: text };
		default:
			return { value: text };
	}
};
