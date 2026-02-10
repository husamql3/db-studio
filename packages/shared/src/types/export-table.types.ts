import { z } from "zod";
import { databaseSchema } from "./database.types.js";

export const FORMAT_TYPES = ["csv", "xlsx", "json"] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export const exportTableSchema = databaseSchema.extend({
	format: z.enum(FORMAT_TYPES, {
		message: "Invalid format. Supported formats: csv, xlsx, json",
	}),
});
export type ExportTableSchemaType = z.infer<typeof exportTableSchema>;

export type CellValue = string | number | boolean | Date | null | undefined;
