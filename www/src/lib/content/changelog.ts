export type ChangelogEntry = {
	text: string;
	username?: string | string[];
};

export type ChangelogItem = {
	version: string;
	date: string;
	title: string;
	tags?: string[];
	image?: string;
	features?: ChangelogEntry[];
	improvements?: ChangelogEntry[];
	bugsFixed?: ChangelogEntry[];
};

export const changelog: ChangelogItem[] = [
	{
		version: "1.3.29",
		date: "2026-02-15",
		title: "Add table actions menu",
		features: [
			{
				text: "Add table menu with delete table feature (with support for foreign key constraints) and copy table schema feature, export table data feature (CSV, JSON, Excel)",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Improved database initialization and selection flow",
				username: "husamql3",
			},
			{
				text: "Fix retriving the row count of the tables",
				username: "husamql3",
			},
		],
		improvements: [
			{
				text: "Improved error message for unsupported database types",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.2.21",
		date: "2026-01-27",
		title: "",
		features: [
			{
				text: "Add delete column feature in the table tab",
				username: "husamql3",
			},
			{
				text: "Add export table data to CSV or Excel files feature in the table tab",
				username: "Zeyad-F16",
			},
		],
		bugsFixed: [],
		improvements: [
			{
				text: "Used turbo to run and build the project",
				username: "husamql3",
			},
			{
				text: "Implemented shared package to share code between the packages",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.2.6",
		date: "2026-01-13",
		title: "Implement the AI chat assistant",
		features: [
			{
				text: "Added AI chat assistant that helps users ask natural language questions about their data",
				username: "husamql3",
			},
			{
				text: "Uses the user's database schema as context for more accurate and relevant responses; limited to 5 messages per day",
				username: "husamql3",
			},
		],
		bugsFixed: [],
		improvements: [],
	},
	{
		version: "1.1.4",
		date: "2026-01-11",
		title: "Support multiple databases from same host",
		features: [
			{
				text: "Allow users to add the database server link and switch between multiple databases on the same host",
				username: "Amirosagan",
			},
		],
		improvements: [
			{
				text: "Improved date/time input handling and timestamp field UI for better accuracy",
				username: "saraanbih",
			},
		],
		bugsFixed: [
			{
				text: "Fix the bug where displaying the Add Table sheet was not working",
				username: "husamql3",
			},
			{
				text: "Fix the copy button in the landing page CodeBlockTabs component",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.1.0",
		date: "2026-01-07",
		title: "Implement the runner tab",
		features: [
			{
				text: "New SQL query runner with Monaco editor featuring PostgreSQL syntax highlighting, autocomplete, and code snippets",
				username: "husamql3",
			},
			{
				text: "Query execution with results displayed in both table and JSON formats, including execution time and row count",
				username: "husamql3",
			},
			{
				text: "Query management with save, favorite, and format features, plus keyboard shortcuts for quick access",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.0.0",
		date: "2025-12-29",
		title: "Initial Release",
	},
];
