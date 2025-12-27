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
			{ title: "Solid connection to PostgreSQL databases", status: "completed" },
			{ title: "Easy browsing of tables with full details", status: "completed" },
			{ title: "Clear view of how tables are structured", status: "completed" },
			{ title: "Modern, spreadsheet-style interface", status: "completed" },
			{ title: "Fast filtering and sorting of data", status: "completed" },
			{ title: "Simple way to create new tables and add rows", status: "completed" },
		],
	},
	{
		title: "Release & Distribution",
		status: "in-progress",
		items: [
			{ title: "Develop CLI tool for running the db studio app", status: "in-progress" },
			{ title: "Publish the tool on npm and release it", status: "planned" },
		],
	},
	{
		title: "Core Views & Tabs",
		status: "planned",
		items: [
			{ title: "SQL editor with run button and results table", status: "planned" },
			{
				title: "Built-in AI helper for writing, explaining, and improving SQL",
				status: "planned",
			},
			{
				title: "Indexes section to view, add, edit, or remove indexes",
				status: "planned",
			},
			{
				title: "Interactive diagram showing table relationships (ER diagram)",
				status: "planned",
			},
			{
				title: "Schema section for views, functions, triggers, and extensions",
				status: "planned",
			},
			{ title: "Safe playground area to test queries without risk", status: "planned" },
			{ title: "Save favorite queries and view recent query history", status: "planned" },
			{
				title: "Smart SQL editor with color coding, auto-complete, and formatting",
				status: "planned",
			},
		],
	},
	{
		title: "Data Management Improvements",
		status: "planned",
		items: [
			{ title: "Import many rows at once using CSV or JSON files", status: "planned" },
			{
				title: "Smart dropdowns for related tables with search and easy navigation",
				status: "planned",
			},
			{ title: "Export and import both data and database structure", status: "planned" },
			{
				title: "Better JSON editor inside cells with formatting and line numbers",
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
				title:
					"Turn plain English into accurate SQL using knowledge of your full database",
				status: "planned",
			},
			{ title: "Explain any SQL query in simple, everyday English", status: "planned" },
			{
				title:
					"Suggest faster ways to write queries and show how much quicker they’ll run",
				status: "planned",
			},
			{
				title:
					"Help design tables and suggest smart improvements to your database structure",
				status: "planned",
			},
			{
				title: "Ask questions about your data in normal English and get instant answers",
				status: "planned",
			},
			{
				title: "Spot errors in failed queries and suggest quick fixes",
				status: "planned",
			},
		],
	},
	{
		title: "Multi-Database Support",
		status: "planned",
		items: [
			{ title: "Add full support for MySQL databases", status: "planned" },
			{ title: "Add full support for SQLite databases", status: "planned" },
			{
				title: "Easy switching between different database connections",
				status: "planned",
			},
			{
				title: "Support for multiple open connections at the same time",
				status: "planned",
			},
		],
	},
	{
		title: "Platform Availability",
		status: "planned",
		items: [
			{ title: "Native desktop apps for macOS, Windows, and Linux", status: "planned" },
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
				title: "Compare database structures and create update scripts",
				status: "planned",
			},
			{ title: "Turn query results into charts directly in the app", status: "planned" },
			{
				title: "Secure connections using SSH tunnels and SSL/TLS encryption",
				status: "planned",
			},
		],
	},
];
