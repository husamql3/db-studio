export type RoadmapItemStatus = "completed" | "planned" | "in-progress";

export type RoadmapItemTask = {
	title: string;
	status: RoadmapItemStatus;
};

export type RoadmapItem = {
	title: string;
	status: RoadmapItemStatus;
	items: RoadmapItemTask[];
};

export const roadmapItems: RoadmapItem[] = [
	{
		title: "Foundation",
		status: "completed",
		items: [
			{
				title: "Solid connection to PostgreSQL databases",
				status: "completed",
			},
			{
				title: "Easy browsing of tables with full details",
				status: "completed",
			},
			{ title: "Clear view of how tables are structured", status: "completed" },
			{ title: "Modern, spreadsheet-style interface", status: "completed" },
			{ title: "Fast filtering and sorting of data", status: "completed" },
			{
				title: "Simple way to create new tables and add rows",
				status: "completed",
			},
		],
	},
	{
		title: "Release & Distribution",
		status: "completed",
		items: [
			{
				title: "Develop CLI tool for running the db studio app",
				status: "completed",
			},
			{ title: "Publish the tool on npm and release it", status: "completed" },
		],
	},
	{
		title: "Core Views & Tabs",
		status: "in-progress",
		items: [
			{
				title: "SQL editor with run button and results table",
				status: "completed",
			},
			{
				title: "Built-in AI helper for writing, explaining, and improving SQL",
				status: "completed",
			},
			{
				title:
					"Edit table columns directly from the schema tab, including add, rename, update, and drop actions",
				status: "completed",
			},
			{
				title: "Indexes section to view, add, edit, remove, and understand indexes",
				status: "planned",
			},
			{
				title: "Interactive ER diagram with relationship navigation and join query generation",
				status: "planned",
			},
			{
				title: "Schema section for views, functions, triggers, and extensions",
				status: "completed",
			},
			{
				title: "Safe query mode with transaction preview, commit, and rollback",
				status: "planned",
			},
			{
				title: "Explain plan viewer for understanding query performance",
				status: "planned",
			},
			{
				title: "Save favorite queries and view recent query history",
				status: "completed",
			},
			{
				title: "Query workspace with saved files, snippets, variables, and database context",
				status: "planned",
			},
			{
				title: "Smart SQL editor with color coding, auto-complete, and formatting",
				status: "completed",
			},
		],
	},
	{
		title: "Data Management Improvements",
		status: "in-progress",
		items: [
			{
				title: "Import many rows at once using CSV or JSON files",
				status: "completed",
			},
			{
				title: "Smart dropdowns for related tables with search and easy navigation",
				status: "planned",
			},
			{
				title: "Export and import both data and database structure",
				status: "completed",
			},
			{
				title: "Better JSON editor inside cells with formatting and line numbers",
				status: "planned",
			},
			{
				title: "Bulk edit rows, clone records, and preview pending changes before saving",
				status: "planned",
			},
			{
				title:
					"Advanced import/export pipelines with column mapping, type inference, invalid-row preview, and reusable presets",
				status: "planned",
			},
			{
				title: "Compare table data or query results and highlight differences",
				status: "planned",
			},
			{
				title: "Customize the grid: hide/reorder columns and add color rules",
				status: "planned",
			},
		],
	},
	{
		title: "AI-Powered Features",
		status: "planned",
		items: [
			{
				title: "Turn plain English into accurate SQL using knowledge of your full database",
				status: "planned",
			},
			{
				title: "Explain any SQL query in simple, everyday English",
				status: "completed",
			},
			{
				title: "Support for adding personal AI provider credentials (OpenAI, Anthropic, etc.)",
				status: "planned",
			},
			{
				title:
					"Suggest faster ways to write queries, explain plans, and show how much quicker they’ll run",
				status: "planned",
			},
			{
				title: "Help design tables and suggest smart improvements to your database structure",
				status: "planned",
			},
			{
				title: "Ask questions about your data in normal English and get instant answers",
				status: "completed",
			},
			{
				title: "Spot errors in failed queries and suggest quick fixes",
				status: "planned",
			},
			{
				title: "Generate migration drafts from schema changes with human review",
				status: "planned",
			},
			{
				title: "AI chat sidebar scoped to the selected database",
				status: "completed",
			},
		],
	},
	{
		title: "Multi-Database Support",
		status: "in-progress",
		items: [
			{ title: "Add full support for PostgreSQL databases", status: "completed" },
			{ title: "Add full support for MySQL databases", status: "completed" },
			{
				title: "Add full support for SQL Server databases",
				status: "completed",
			},
			{
				title: "Add full support for MongoDB databases",
				status: "completed",
			},
			{ title: "Add full support for SQLite databases", status: "planned" },
			{
				title: "Add full support for MariaDB databases",
				status: "planned",
			},
			{
				title: "Add full support for Oracle databases",
				status: "planned",
			},
			{
				title: "Add support for Redis and Valkey key-value databases",
				status: "planned",
			},
			{
				title: "Add support for DuckDB and ClickHouse analytics databases",
				status: "planned",
			},
			{
				title: "Add support for Elasticsearch and OpenSearch databases",
				status: "planned",
			},
			{
				title: "Easy switching between different database connections",
				status: "completed",
			},
		],
	},
	{
		title: "Platform Availability",
		status: "planned",
		items: [
			{
				title: "Native desktop apps for macOS, Windows, and Linux",
				status: "planned",
			},
		],
	},
	{
		title: "Database Operations",
		status: "planned",
		items: [
			{
				title:
					"Deep object explorer for views, functions, triggers, constraints, sequences, users, roles, and permissions",
				status: "planned",
			},
			{
				title: "Saved connection manager with SSH tunnels, SSL/TLS, env vars, and templates",
				status: "planned",
			},
			{
				title: "Connection health checks with clear diagnostics and reconnect actions",
				status: "planned",
			},
			{
				title: "Schema drift detection between environments",
				status: "planned",
			},
		],
	},
	{
		title: "NoSQL Tools",
		status: "planned",
		items: [
			{
				title:
					"Redis and Valkey key browser with TTL, memory usage, and data structure viewers",
				status: "planned",
			},
			{
				title: "MongoDB collection schema inference, aggregation builder, and document diff",
				status: "planned",
			},
			{
				title:
					"Elasticsearch and OpenSearch index explorer, mappings viewer, and query builder",
				status: "planned",
			},
		],
	},
	{
		title: "Advanced Tools",
		status: "planned",
		items: [
			{
				title: "Drag-and-drop visual tool to build queries without writing SQL",
				status: "planned",
			},
			{
				title: "Compare database structures and generate migration scripts",
				status: "planned",
			},
			{
				title: "Turn query results into charts directly in the app",
				status: "planned",
			},
			{
				title: "Review schema changes before applying them to production databases",
				status: "planned",
			},
		],
	},
];
