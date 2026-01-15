export type DatabaseInfo = {
	name: string;
	size: string;
	owner: string;
	encoding: string;
};

export type DatabaseConnectionInfo = {
	host: string;
	port: number;
	user: string;
	database: string;
	version: string;
	activeConnections: number;
	maxConnections: number;
};

export type CurrentDatabase = {
	database: string;
};

export type DatabaseStatus = {
	type: "db_status";
	status: "healthy" | "unhealthy";
	latency: number;
	timestamp: string;
	error?: string;
};
