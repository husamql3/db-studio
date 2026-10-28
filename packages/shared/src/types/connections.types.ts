import { z } from "zod";
import { databaseTypeSchema } from "./database.types.js";

export const CONNECTION_COLORS = [
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
] as const;
export const connectionColorSchema = z.enum(CONNECTION_COLORS);
export type ConnectionColorSchemaType = z.infer<typeof connectionColorSchema>;

/** A saved connection as the browser sees it: never the URL itself, which holds the password. */
export const connectionSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	color: connectionColorSchema.nullable(),
	lastUsedAt: z.number(),
	dbType: databaseTypeSchema,
	/** The URL with its password and auth token replaced by `••••`. */
	maskedUrl: z.string(),
});
export type ConnectionSummarySchemaType = z.infer<typeof connectionSummarySchema>;

export const connectionsStateSchema = z.object({
	connections: z.array(connectionSummarySchema),
	/**
	 * The open connection this browser tab works with, or `null` before the first connection. `id`
	 * is `null` when the user deleted the saved entry of the connection that is still open.
	 * Each open connection has its own `connectionId`. A tab sends it as `X-Connection-Id`, the
	 * server answers from that connection, and it refuses one the server no longer has open.
	 */
	active: z
		.object({
			id: z.string().nullable(),
			dbType: databaseTypeSchema,
			connectionId: z.string(),
		})
		.nullable(),
});
export type ConnectionsStateSchemaType = z.infer<typeof connectionsStateSchema>;

export const connectUrlSchema = z.object({
	url: z.string().trim().min(1, "Paste a connection URL"),
});
export type ConnectUrlSchemaType = z.infer<typeof connectUrlSchema>;

export const updateConnectionSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100).optional(),
	color: connectionColorSchema.nullable().optional(),
});
export type UpdateConnectionSchemaType = z.infer<typeof updateConnectionSchema>;
