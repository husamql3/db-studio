import type { CellValue, FormatType } from "shared/types";
import { utils, write } from "xlsx";

interface ExportFileOptions {
	cols: string[];
	rows: Record<string, CellValue>[];
	format: FormatType;
	tableName: string;
}

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
			const data: CellValue[][] = [
				cols,
				...(rows?.map((row) => cols?.map((col) => row[col])) ?? []),
			];
			const worksheet = utils.aoa_to_sheet(data);
			const csvContent = utils.sheet_to_csv(worksheet);
			return new Uint8Array(Buffer.from(csvContent, "utf-8"));
		}

		case "xlsx": {
			const data: CellValue[][] = [
				cols,
				...(rows?.map((row) => cols?.map((col) => row[col])) ?? []),
			];
			const worksheet = utils.aoa_to_sheet(data);
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
