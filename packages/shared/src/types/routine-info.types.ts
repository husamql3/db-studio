import { z } from "zod";

export const ROUTINE_TYPES = ["function", "procedure"] as const;

export const routineInfoSchema = z.object({
	routineName: z.string(),
	schemaName: z.string().nullable(),
	routineType: z.enum(ROUTINE_TYPES),
	signature: z.string().nullable(),
	returnType: z.string().nullable(),
	language: z.string().nullable(),
	definition: z.string().nullable(),
});

export type RoutineInfoSchemaType = z.infer<typeof routineInfoSchema>;
