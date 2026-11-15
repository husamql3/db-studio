import type { DotenvParseOutput } from "dotenv";

/**
 * Get the database URL from the .env file, then process.env. Without one, the server starts
 * unconnected and the browser opens on the Connect page.
 */
export const getDatabaseUrl = (
	env: DotenvParseOutput | null,
	varName: string,
): string | undefined => env?.[varName] || process.env[varName] || undefined;
