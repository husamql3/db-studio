import { CONSTANTS } from "@/utils/constants";

export const connectionKeys = {
	state: () => ["connections"] as const,
};

export const databaseKeys = {
	all: [CONSTANTS.CACHE_KEYS.DATABASES_LIST] as const,
	list: () => [CONSTANTS.CACHE_KEYS.DATABASES_LIST] as const,
	current: () => [CONSTANTS.CACHE_KEYS.CURRENT_DATABASE] as const,
	connectionInfo: () => [CONSTANTS.CACHE_KEYS.DATABASE_CONNECTION_INFO] as const,
};

export const tableKeys = {
	all: ["tables"] as const,
	lists: () => [CONSTANTS.CACHE_KEYS.TABLES_LIST] as const,
	list: (db?: string | null) => [CONSTANTS.CACHE_KEYS.TABLES_LIST, db] as const,
	// Under the list key, so invalidating the tables list refreshes the visualizer too.
	graph: (db?: string | null) => [CONSTANTS.CACHE_KEYS.TABLES_LIST, db, "graph"] as const,
	columnsByTable: (tableName: string) =>
		[CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName] as const,
	columns: (tableName?: string, db?: string | null, schemaName?: string) =>
		[CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName, db, schemaName] as const,
	dataByTable: (tableName: string) => [CONSTANTS.CACHE_KEYS.TABLE_DATA, tableName] as const,
	data: ({
		tableName,
		cursor,
		limit,
		direction,
		sort,
		order,
		filters,
		db,
		schemaName,
	}: {
		tableName: string;
		schemaName?: string;
		cursor?: string | null;
		limit?: string | null;
		direction?: string | null;
		sort?: string | null;
		order?: string | null;
		filters?: string | null;
		db?: string | null;
	}) =>
		[
			CONSTANTS.CACHE_KEYS.TABLE_DATA,
			tableName,
			cursor,
			limit,
			direction,
			sort,
			order,
			filters,
			db,
			schemaName,
		] as const,
	schema: (tableName: string, db?: string | null, schemaName?: string) =>
		["table-schema", tableName, db, schemaName] as const,
};

export const indexKeys = {
	byTable: (tableName: string) => ["table-indexes", tableName] as const,
	table: (tableName: string, db?: string | null, schemaName?: string) =>
		["table-indexes", tableName, db, schemaName] as const,
};

export const serverLogKeys = {
	all: ["server-logs"] as const,
	database: (db?: string | null) => ["server-logs", db] as const,
};

export const redisKeyBrowserKeys = {
	all: ["redis-keys"] as const,
	list: (db: string | null, search: string, exactPattern: boolean, type: string) =>
		["redis-keys", "list", db, search, exactPattern, type] as const,
	detail: (
		db: string | null,
		key: string | null,
		full: boolean,
		direction: "forward" | "backward",
	) => ["redis-keys", "detail", db, key, full, direction] as const,
};

export const chatKeys = {
	rateLimit: () => ["rate-limit"] as const,
};
