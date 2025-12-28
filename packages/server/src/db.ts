import { Pool } from "pg";

let dbInstance: Pool | null = null;

const getPool = (): Pool => {
	if (!dbInstance) {
		if (!process.env.DATABASE_URL) {
			throw new Error(
				"DATABASE_URL is not set. Please provide a database connection string.",
			);
		}
		dbInstance = new Pool({
			connectionString: process.env.DATABASE_URL,
		});
	}
	return dbInstance;
};

// Export db as a Proxy that lazily initializes the pool
// This allows process.env.DATABASE_URL to be set after module import
export const db = new Proxy({} as Pool, {
	get(_target, prop) {
		return getPool()[prop as keyof Pool];
	},
});
