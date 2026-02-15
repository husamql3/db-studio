import { z } from "zod";

export const tableSchemaResultSchema = z.object({
	schema: z.string(),
});

export type TableSchemaResult = z.infer<typeof tableSchemaResultSchema>;
