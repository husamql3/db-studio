import { z } from "zod";

export const databaseInfoSchema = z.object({
	name: z.string(),
	size: z.string(),
	owner: z.string(),
	encoding: z.string(),
});

export type DatabaseInfoType = z.infer<typeof databaseInfoSchema>;

export const connectionInfoSchema = z.object({
	version: z.string(),
	database: z.string(),
	user: z.string(),
	host: z.string().nullable(),
	port: z.string().nullable(),
	active_connections: z.coerce.number(),
	max_connections: z.coerce.number(),
});

export type ConnectionQueryResult = z.infer<typeof connectionInfoSchema>;
