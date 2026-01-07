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
