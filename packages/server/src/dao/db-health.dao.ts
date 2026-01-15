import type { DatabaseStatus } from "shared/types";
import { getDbPool } from "@/db-manager.js";

export const checkDatabaseConnection = async (
	database?: string,
): Promise<DatabaseStatus> => {
	const startTime = Date.now();
	const pool = getDbPool(database);

	try {
		await pool.query("SELECT 1");
		const latency = Date.now() - startTime;

		return {
			type: "db_status",
			status: "healthy",
			latency,
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		const latency = Date.now() - startTime;

		return {
			type: "db_status",
			status: "unhealthy",
			latency,
			error: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		};
	}
};
