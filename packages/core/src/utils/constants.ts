export const CONSTANTS = {
	//* queries
	SIDEBAR_TABLE_SEARCH: "s",
	//* cache keys
	TABLES_LIST: "tables-list",

	//* table state keys
	ACTIVE_TABLE: "table", // query state key for active table
	SORT: "sort",
	ORDER: "order",
	PAGE: "page",
	LIMIT: "limit",
	FILTERS: "filters",
	COLUMN_NAME: "col-name",
	COLUMN_OPERATOR: "col-operator",
	COLUMN_VALUE: "col-value",
	FILTER_OPERATORS: {
		EQUAL: "eq",
		NOT_EQUAL: "neq",
		GREATER_THAN: "gt",
		LESS_THAN: "lt",
		GREATER_THAN_OR_EQUAL: "gte",
		LESS_THAN_OR_EQUAL: "lte",
	},

	//* tab state keys
	ACTIVE_TAB: "tab", // query state key for active tab

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
