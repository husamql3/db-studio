export type ChangelogEntry = {
	text: string;
	username?: string;
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
	// add at the top of the array
	// {
	// 	version: "1.2.3",
	// 	date: "2026-01-10",
	// 	title: "Implement the AI chat assistant",
	// 	features: [],
	// 	bugsFixed: [],
	// 	improvements: [],
	// },
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
		version: "1.1.1",
		date: "2026-01-08",
		title: "Implement AI Assistant `talk to your database`",
		features: [
			{
				text: "",
			},
		],
		bugsFixed: [
			{
				text: "Fix displaying the add table form when the user navigates to the table page",
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
