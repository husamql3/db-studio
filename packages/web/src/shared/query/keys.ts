import { CONSTANTS } from "@/utils/constants";

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
	columnsByTable: (tableName: string) =>
		[CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName] as const,
	columns: (tableName?: string, db?: string | null) =>
		[CONSTANTS.CACHE_KEYS.TABLE_COLUMNS, tableName, db] as const,
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
	}: {
		tableName: string;
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
		] as const,
	schema: (tableName: string, db?: string | null) => ["table-schema", tableName, db] as const,
};

export const schemaKeys = {
	all: ["schema"] as const,
	table: (tableName: string, db?: string | null) => tableKeys.schema(tableName, db),
};

export const recordKeys = {
	all: ["records"] as const,
	byTable: (tableName: string, db?: string | null) => ["records", tableName, db] as const,
};

export const queryRunnerKeys = {
	all: ["query-runner"] as const,
	execution: (db?: string | null) => ["query-runner", "execution", db] as const,
};

export const chatKeys = {
	rateLimit: () => ["rate-limit"] as const,
};
