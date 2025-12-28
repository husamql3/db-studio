import { db } from "../db.js";

type DatabaseStatus = {
	type: "db_status";
	status: "healthy" | "unhealthy";
	latency: number;
	timestamp: string;
	error?: string;
};

export const checkDatabaseConnection = async (): Promise<DatabaseStatus> => {
	const startTime = Date.now();

	try {
		await db.query("SELECT 1");
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
