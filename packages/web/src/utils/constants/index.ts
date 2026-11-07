export const CONSTANTS = {
	//* sidebar search query state key
	SIDEBAR_SEARCH: "search",

	ACTIVE_TABLE: "table", // query state key for active table
	ACTIVE_SCHEMA: "schema", // query state key for selected schema
	// The ACTIVE_SCHEMA value that selects every schema.
	ALL_SCHEMAS: "all",
	// The open table's schema on engines that list schemas, so same-named tables stay apart.
	TABLE_SCHEMA: "tableSchema" as const,
	// PostgreSQL's default schema, left out of table labels.
	DEFAULT_SCHEMA: "public",

	//* table state keys (cursor-based pagination)
	TABLE_STATE_KEYS: {
		SORT: "sort",
		ORDER: "order",
		CURSOR: "cursor",
		DIRECTION: "dir",
		LIMIT: "limit",
		FILTERS: "filters",
	},

	RAIL_WIDTH: 48, // px, the left navigation rail
};
