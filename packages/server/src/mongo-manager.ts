import { MongoClient, ObjectId } from "mongodb";

type MongoBaseConfig = {
	url: string;
	dbName: string | null;
};

let client: MongoClient | null = null;
let baseConfig: MongoBaseConfig | null = null;

const getDatabaseUrl = () => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set. Please provide a database connection string.");
	}
	return databaseUrl;
};

const parseDbName = (url: URL): string | null => {
	const path = url.pathname?.replace(/^\//, "");
	return path ? path : null;
};

const initBaseConfig = () => {
	if (baseConfig) return;
	const databaseUrl = getDatabaseUrl();
	const parsedUrl = new URL(databaseUrl);
	baseConfig = {
		url: databaseUrl,
		dbName: parseDbName(parsedUrl),
	};
};

export const getMongoClient = async (): Promise<MongoClient> => {
	initBaseConfig();
	if (!baseConfig) {
		throw new Error("Mongo base configuration not initialized");
	}

	if (!client) {
		client = new MongoClient(baseConfig.url);
		await client.connect();
	}

	return client;
};

export const getMongoDbName = (): string => {
	initBaseConfig();
	if (!baseConfig) {
		throw new Error("Mongo base configuration not initialized");
	}
	return baseConfig.dbName ?? "admin";
};

export const getMongoDb = async (dbName?: string) => {
	const mongoClient = await getMongoClient();
	const name = dbName ?? getMongoDbName();
	return mongoClient.db(name);
};

export const isValidObjectId = (value: unknown): value is string => {
	return typeof value === "string" && ObjectId.isValid(value);
};

export const coerceObjectId = (value: unknown): unknown => {
	if (typeof value === "string" && ObjectId.isValid(value)) {
		return new ObjectId(value);
	}
	return value;
};
