import { z } from "zod";

export const databaseSchema = z.object({
	database: z
		.string("Database name is required")
		.min(1, "Database name is required"),
});

export type DatabaseSchemaType = z.infer<typeof databaseSchema>;
