import { z } from "zod";
import { databaseTypeSchema } from "./database.types.js";

export const savedConnectionSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	color: z.string().optional(),
	dbType: databaseTypeSchema.optional(),
	/** Host and database without credentials, safe to display. */
	summary: z.string(),
	createdAt: z.string(),
	lastUsedAt: z.string().optional(),
});
export type SavedConnectionSchemaType = z.infer<typeof savedConnectionSchema>;

export const saveConnectionInputSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1, "Name is required"),
	url: z.string().min(1, "Connection URL is required"),
	color: z.string().optional(),
});
export type SaveConnectionInputSchemaType = z.infer<typeof saveConnectionInputSchema>;

export const envConnectionCandidateSchema = z.object({
	name: z.string(),
	url: z.string(),
});
export type EnvConnectionCandidateSchemaType = z.infer<typeof envConnectionCandidateSchema>;

export type DesktopServerStatus =
	| { state: "idle" }
	| { state: "starting"; connectionId: string }
	| { state: "running"; connectionId: string; apiBaseUrl: string }
	| { state: "error"; connectionId: string; message: string };

export type DesktopPlatform = "darwin" | "win32" | "linux";

/** Surface exposed to the renderer by the Electron preload as `window.desktop`. */
export interface DesktopBridge {
	platform: DesktopPlatform;
	version: string;
	/** Origin of the running server child, or null when disconnected. Synchronous so the API client can read it at boot. */
	getApiBaseUrl: () => string | null;
	getServerStatus: () => Promise<DesktopServerStatus>;
	onServerStatus: (listener: (status: DesktopServerStatus) => void) => () => void;
	listConnections: () => Promise<SavedConnectionSchemaType[]>;
	saveConnection: (input: SaveConnectionInputSchemaType) => Promise<SavedConnectionSchemaType>;
	deleteConnection: (id: string) => Promise<void>;
	connect: (id: string) => Promise<DesktopServerStatus>;
	disconnect: () => Promise<void>;
	/** Opens a file picker for a .env file and returns every value that looks like a database URL. */
	importEnvFile: () => Promise<EnvConnectionCandidateSchemaType[]>;
	openExternal: (url: string) => Promise<void>;
}
