//* header tabs routes
export const TABS = [
	"table",
	"runner",
	"schema",
	"indexes",
	"logs",
	"visualizer",
	// "assistant",
] as const;

export const CONSTANTS = {
	//* sidebar search query state key
	SIDEBAR_SEARCH: "search",

	ACTIVE_TABLE: "table", // query state key for active table
	ACTIVE_TAB: "t", // query state key for active tab
	COLUMN_NAME: "columnName", // query state key for column name

	//* cache keys
	CACHE_KEYS: {
		TABLES_LIST: "tablesList",
		TABLE_COLUMNS: "tableColumns",
		TABLE_DATA: "tableData",
		TABLE_DEFAULT_PAGE: 1,
		TABLE_DEFAULT_LIMIT: 50,
	},

	RUNNER_STATE_KEYS: {
		SHOW_AS: "view",
	},

	//* table state keys
	TABLE_STATE_KEYS: {
		SORT: "sort",
		ORDER: "order",
		PAGE: "page",
		LIMIT: "limit",
		FILTERS: "filters",
	},

	//* referenced table state keys
	REFERENCED_TABLE_STATE_KEYS: {
		ACTIVE_TABLE: "rTable",
		PAGE: "rPage",
		DEFAULT_PAGE: 1,
		LIMIT: "rLimit",
		DEFAULT_LIMIT: 30,
		FILTERS: "rFilters",
		SORT: "rSort",
		ORDER: "rOrder",
	},

	//* other constants
	HOVER_ZONE: 20, // pixels from left edge
	HOVER_DELAY: 100, // ms delay before opening
};

// State reset helpers
export const STATE_RESETS = {
	TABLE: {
		...CONSTANTS.TABLE_STATE_KEYS,
	},
	REFERENCED_TABLE: {
		...CONSTANTS.REFERENCED_TABLE_STATE_KEYS,
	},
	COLUMN: {
		[CONSTANTS.COLUMN_NAME]: null,
	},
	// Combined reset for tab changes
	ALL: {
		...CONSTANTS.TABLE_STATE_KEYS,
		...CONSTANTS.REFERENCED_TABLE_STATE_KEYS,
		columnName: null,
	},
} as const;

export const LINKS = {
	GITHUB: "https://github.com/husamql3/db-studio",
};

export const API_URL = "http://localhost:3333";
