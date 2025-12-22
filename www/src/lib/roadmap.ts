export const roadmapItems = [
	{
		title: "Foundation",
		status: "completed",
		items: [
			"Core PostgreSQL connection handling",
			"Basic table browsing and metadata",
			"Table structure visualization",
			"Initial UI/UX design system with spreadsheet-like grid",
			"Filtering, sorting for tables",
			"Add a new table & add a new record",
		],
	},
	{
		title: "Core Views & Tabs",
		status: "in-progress",
		items: [
			"SQL Runner tab with editor, execution, and result grid",
			"Indexes tab (list, create, edit, drop)",
			"Visualizer tab (interactive ER diagram)",
			"Schema tab (views, functions, triggers, extensions)",
			"Dedicated playground page for safe testing and experimentation",
			"Query history & favorites for SQL Runner tab",
			"Advanced SQL editor features (syntax highlighting, auto-completion, query formatting)",
		],
	},
	{
		title: "Data Management Enhancements",
		status: "in-progress",
		items: [
			"Add multiple records via CSV or JSON import",
			"Relation field dropdowns with linked records and filtered navigation",
			"Export/Import functionality for data and schemas",
			"Inline JSON cell editing with dedicated editor and line numbers",
			"Advanced grid features (column hiding, reordering, custom formatting)",
		],
	},
	{
		title: "Administration & Monitoring",
		status: "planned",
		items: [
			"User and role management (create/edit users, privileges)",
			"Database monitoring (connections, active queries, server stats)",
			"Basic backup and restore tools",
			"Performance insights (slow queries, index recommendations)",
		],
	},
	{
		title: "Advanced Tools",
		status: "planned",
		items: [
			"Visual query builder",
			"Schema comparison and migration tools",
			"Data visualization (charts from query results)",
			"SSH tunneling and SSL connection support",
		],
	},
	{
		title: "Multi-Database & Extensibility",
		status: "planned",
		items: [
			"Multi-database support (PostgreSQL, MySQL, SQLite)",
			"Multiple simultaneous connections and switching",
			"Broader DBMS adapters (e.g., SQL Server, Oracle via drivers)",
			"Plugin/extension system for custom features",
		],
	},
];
