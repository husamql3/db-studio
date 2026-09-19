import type { CellValue, FormatType } from "@db-studio/shared/types";
import { utils, write } from "xlsx";

interface ExportFileOptions {
	cols: string[];
	rows: Record<string, unknown>[];
	format: FormatType;
	tableName: string;
}

/**
 * Flatten a value into the scalar `CellValue` contract that the sheet writer
 * accepts. Arrays and nested objects (Mongo documents, Postgres `jsonb`, MySQL
 * `json`) are JSON-serialized so they no longer land in the sheet as
 * "[object Object]". Scalars pass through untouched.
 *
 * Only CSV and XLSX need this — the JSON export keeps the nested structure.
 */
const toCellValue = (value: unknown): CellValue => {
	if (value === null || value === undefined) return value;
	if (value instanceof Date) return value;
	if (typeof value === "object") return JSON.stringify(value);
	if (typeof value === "bigint") return value.toString();
	return value as CellValue;
};

const toSheetData = (cols: string[], rows: Record<string, unknown>[]): CellValue[][] => [
	cols,
	...(rows?.map((row) => cols?.map((col) => toCellValue(row[col]))) ?? []),
];

/**
 * Converts table data to the specified export format (CSV, XLSX, or JSON)
 *
 * @param options - The export options
 * @param options.cols - Array of column names
 * @param options.rows - Array of row data objects
 * @param options.format - The export format ('csv', 'xlsx', or 'json')
 * @param options.tableName - The name of the table being exported
 * @returns The file content as a Uint8Array
 */
export function getExportFile({ cols, rows, format, tableName }: ExportFileOptions): BodyInit {
	switch (format) {
		case "json": {
			const jsonContent = JSON.stringify(rows ?? [], null, 2);
			return new Uint8Array(Buffer.from(jsonContent, "utf-8"));
		}

		case "csv": {
			const worksheet = utils.aoa_to_sheet(toSheetData(cols, rows));
			const csvContent = utils.sheet_to_csv(worksheet);
			return new Uint8Array(Buffer.from(csvContent, "utf-8"));
		}

		case "xlsx": {
			const worksheet = utils.aoa_to_sheet(toSheetData(cols, rows));
			const workbook = utils.book_new();
			utils.book_append_sheet(workbook, worksheet, tableName.slice(0, 31));
			const buffer = write(workbook, {
				bookType: "xlsx",
				type: "buffer",
			}) as Buffer;
			return new Uint8Array(buffer);
		}
	}
}
