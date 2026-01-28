import { z } from "zod";
import { databaseTypeSchema } from "./database.types.js";

export const databaseInfoSchema = z.object({
	name: z.string("Name is required"),
	size: z.string("Size is required"),
	owner: z.string("Owner is required"),
	encoding: z.string("Encoding is required"),
});

export type DatabaseInfoSchemaType = z.infer<typeof databaseInfoSchema>;

export const databaseListSchema = z.object({
	databases: z.array(databaseInfoSchema),
	dbType: databaseTypeSchema,
});

export type DatabaseListSchemaType = z.infer<typeof databaseListSchema>;

export const connectionInfoSchema = z.object({
	version: z.string("Version is required"),
	database: z.string("Database is required"),
	user: z.string("User is required"),
	host: z.string("Host is required").nullable(),
	port: z.number("Port is required").nullable(),
	active_connections: z.coerce.number("Active connections is required"),
	max_connections: z.coerce.number("Max connections is required"),
});

export type ConnectionInfoSchemaType = z.infer<typeof connectionInfoSchema>;
