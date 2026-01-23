import { z } from "zod";

export const databaseSchema = z.object({
	database: z.string("Database name is required"),
});

export type DatabaseSchemaType = z.infer<typeof databaseSchema>;

export const DATABASE_TYPES = ["pg"] as const;

export const databaseTypeSchema = z.enum(DATABASE_TYPES, {
	message: "Invalid database type",
});
export type DatabaseTypeSchema = z.infer<typeof databaseTypeSchema>;

export const databaseTypeParamSchema = z.object({
	dbType: databaseTypeSchema,
});

export const tableNameSchema = z.object({
	tableName: z.string("Table name is required"),
});

export type TableNameSchemaType = z.infer<typeof tableNameSchema>;
