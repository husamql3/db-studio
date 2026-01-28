import { Pool } from "pg";

let dbInstance: Pool | null = null;

const getPool = (): Pool => {
	if (!dbInstance) {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL is not set. Please provide a database connection string.");
		}
		try {
			dbInstance = new Pool({
				connectionString: process.env.DATABASE_URL,
			});

			// Handle pool errors to prevent server crashes
			// This catches connection errors, idle client errors, etc.
			dbInstance.on("error", (err) => {
				console.error("Unexpected database pool error:", err.message);
				// Don't throw - just log the error to prevent server crash
				// The pool will automatically retry connections
			});
		} catch (error) {
			console.error("Failed to create database pool:", error);
			// Re-throw initialization errors as they indicate a configuration problem
			throw error;
		}
	}
	return dbInstance;
};

// Export db as a Proxy that lazily initializes the pool
// This allows process.env.DATABASE_URL to be set after module import
export const db = new Proxy({} as Pool, {
	get(_target, prop) {
		try {
			return getPool()[prop as keyof Pool];
		} catch (error) {
			// If pool initialization fails, log and re-throw
			console.error("Database pool access error:", error);
			throw error;
		}
	},
});
