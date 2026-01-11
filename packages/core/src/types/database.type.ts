export interface DatabaseInfo {
	name: string;
	size: string;
	owner: string;
	encoding: string;
}

export interface DatabaseConnectionInfo {
	host: string;
	port: number;
	user: string;
	database: string;
	version: string;
	activeConnections: number;
	maxConnections: number;
}

export interface CurrentDatabase {
	database: string;
}
