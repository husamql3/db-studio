import { HTTPException } from "hono/http-exception";
import type { ConnectionInfoSchemaType, DatabaseInfoSchemaType, DatabaseSchemaType } from "shared/types";
import { getMongoClient, getMongoDbName } from "@/mongo-manager.js";
import { parseDatabaseUrl } from "@/utils/parse-database-url.js";

const formatBytes = (bytes: number): string => {
	if (!Number.isFinite(bytes)) return "n/a";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export async function getMongoDatabasesList(): Promise<DatabaseInfoSchemaType[]> {
	const client = await getMongoClient();
	const admin = client.db().admin();
	const result = await admin.listDatabases();
	const databases = result.databases ?? [];

	if (!databases[0]) {
		throw new HTTPException(500, {
			message: "No databases returned from MongoDB",
		});
	}

	return databases.map((db) => ({
		name: db.name,
		size: formatBytes(db.sizeOnDisk ?? 0),
		owner: "n/a",
		encoding: "n/a",
	}));
}

export async function getMongoCurrentDatabase(): Promise<DatabaseSchemaType> {
	return { db: getMongoDbName() };
}

export async function getMongoConnectionInfo(): Promise<ConnectionInfoSchemaType> {
	const client = await getMongoClient();
	const admin = client.db().admin();
	const urlDefaults = parseDatabaseUrl();
	let serverStatus: { version?: string; connections?: { current?: number; available?: number } } =
		{};
	try {
		serverStatus = await admin.serverStatus();
	} catch (error) {
		console.warn("Failed to read MongoDB serverStatus:", error);
	}

	return {
		host: urlDefaults.host,
		port: urlDefaults.port,
		user: "n/a",
		database: getMongoDbName(),
		version: serverStatus.version ?? "unknown",
		active_connections: serverStatus.connections?.current ?? 0,
		max_connections: serverStatus.connections?.available ?? 0,
	};
}
