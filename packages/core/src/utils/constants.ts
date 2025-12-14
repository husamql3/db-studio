export const CONSTANTS = {
	//* queries
	SIDEBAR_TABLE_SEARCH: "s",
	//* cache keys
	TABLES_LIST: "tables-list",

	ACTIVE_TABLE: "t", // query state key for active table
	ACTIVE_TAB: "tab", // query state key for active tab

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
