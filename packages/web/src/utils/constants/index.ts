//* header tabs routes
export const TABS = ["table", "runner", "schema", "indexes", "logs", "visualizer"] as const;

export const CONSTANTS = {
	//* sidebar search query state key
	SIDEBAR_SEARCH: "search",

	ACTIVE_TABLE: "table", // query state key for active table
	ACTIVE_SCHEMA: "schema", // query state key for selected schema
	// The open table's schema on engines that list schemas, so same-named tables stay apart.
	TABLE_SCHEMA: "tableSchema" as const,
	COLUMN_NAME: "columnName", // query state key for column name

	//* cache keys
	CACHE_KEYS: {
		TABLES_LIST: "tablesList",
		TABLE_COLUMNS: "tableColumns",
		TABLE_DATA: "tableData",
		TABLE_DEFAULT_LIMIT: 50,
		DATABASES_LIST: "databasesList",
		CURRENT_DATABASE: "currentDatabase",
		DATABASE_CONNECTION_INFO: "databaseConnectionInfo",
	},

	//* table state keys (cursor-based pagination)
	TABLE_STATE_KEYS: {
		SORT: "sort",
		ORDER: "order",
		CURSOR: "cursor",
		DIRECTION: "dir",
		LIMIT: "limit",
		FILTERS: "filters",
	},

	//* referenced table state keys (cursor-based pagination)
	REFERENCED_TABLE_STATE_KEYS: {
		ACTIVE_TABLE: "rTable",
		CURSOR: "rCursor",
		DIRECTION: "rDir",
		LIMIT: "rLimit",
		DEFAULT_LIMIT: 30,
		FILTERS: "rFilters",
		SORT: "rSort",
		ORDER: "rOrder",
	},

	//* other constants
	RAIL_WIDTH: 48, // px, the left navigation rail
};
