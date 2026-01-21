import { z } from "zod";

export const databaseInfoSchema = z.object({
	name: z.string(),
	size: z.string(),
	owner: z.string(),
	encoding: z.string(),
});

export type DatabaseInfoType = z.infer<typeof databaseInfoSchema>;

export const connectionInfoSchema = z.object({
	version: z.string("Version is required"),
	database: z.string("Database is required"),
	user: z.string("User is required"),
	host: z.string("Host is required").nullable(),
	port: z.number("Port is required").nullable(),
	active_connections: z.coerce.number("Active connections is required"),
	max_connections: z.coerce.number("Max connections is required"),
});

export type ConnectionQueryResult = z.infer<typeof connectionInfoSchema>;
