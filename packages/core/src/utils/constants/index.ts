export const CONSTANTS = {
	SIDEBAR_TABLE_SEARCH: "s",
	ACTIVE_TABLE: "table", // query state key for active table
	ACTIVE_TAB: "t", // query state key for active tab
	COLUMN_NAME: "columnName", // query state key for column name

	//* cache keys
	CACHE_KEYS: {
		TABLES_LIST: "tablesList",
		TABLE_COLUMNS: "tableColumns",
		TABLE_DATA: "tableData",
		TABLE_DEFAULT_PAGE: 1,
		TABLE_DEFAULT_LIMIT: 50, // todo: change to 50
	},

	//* table state keys
	TABLE_STATE_KEYS: {
		SORT: "sort",
		ORDER: "order",
		PAGE: "page",
		LIMIT: "limit",
		FILTERS: "filters",
	},
	REFERENCED_TABLE_STATE_KEYS: {
		ACTIVE_TABLE: "rTable",
		PAGE: "rPage",
		LIMIT: "rLimit",
		FILTERS: "rFilters",
		SORT: "rSort",
		ORDER: "rOrder",
	},

	//* other constants
	HOVER_ZONE: 20, // pixels from left edge
	HOVER_DELAY: 100, // ms delay before opening
};

export const TABS = [
	{ id: "table", label: "Table" },
	{ id: "schema", label: "Schema" },
	{ id: "indexes", label: "Indexes" },
	{ id: "runner", label: "Runner" },
	{ id: "logs", label: "Logs" },
	{ id: "visualizer", label: "Visualizer" },
	// { id: "assistant", label: "Assistant" },
];

export const LINKS = {
	GITHUB: "https://github.com/husamql3/db-studio",
};

export const API_URL = "http://localhost:3000";
