import type { CellValue, FormatType } from "@db-studio/shared/types";

interface ExportFileOptions {
	cols: string[];
	rows: Record<string, unknown>[];
	format: FormatType;
	tableName: string;
}

/**
 * Arrays and nested objects (Mongo documents, Postgres `jsonb`, MySQL `json`) are
 * JSON-serialized so they do not land in the sheet as "[object Object]". Only CSV and XLSX
 * need this; the JSON export keeps the nested structure.
 */
const toCellValue = (value: unknown): CellValue => {
	if (value === null || value === undefined) return value;

	if (value instanceof Date) return value;

	// BLOB/bytea/varbinary arrive as Buffers from the sqlite adapter, mssql and mysql2.
	// JSON.stringify would turn them into {"type":"Buffer","data":[...]}.
	if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;

	if (typeof value === "object") return JSON.stringify(value);

	if (typeof value === "bigint") return value.toString();

	return value as CellValue;
};

const toSheetData = (cols: string[], rows: Record<string, unknown>[]): CellValue[][] => [
	cols,
	...(rows?.map((row) => cols?.map((col) => toCellValue(row[col]))) ?? []),
];

export async function getExportFile({
	cols,
	rows,
	format,
	tableName,
}: ExportFileOptions): Promise<BodyInit> {
	if (format === "json") {
		const jsonContent = JSON.stringify(rows ?? [], null, 2);

		return new Uint8Array(Buffer.from(jsonContent, "utf-8"));
	}

	// The sheet library takes tens of milliseconds to load, so it loads on the first export
	// instead of with the server.
	const { utils, write } = await import("xlsx");

	switch (format) {
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
