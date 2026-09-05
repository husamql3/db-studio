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
		version: "1.12.0",
		date: "2026-09-06",
		title: "Bring your own AI provider",
		features: [
			{
				text: "Added support for Google Gemini, OpenAI, Anthropic, xAI Grok, and OpenRouter in the AI assistant, with a model picker per provider",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added bring-your-own-key AI settings so a personal provider API key is stored in the browser and never sent in the request body",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added a Settings panel, reachable from the header and the command palette, covering AI provider, model, API key, and schema sharing",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added editor preferences for tab size, font size, and word wrapping, applied to the query editor and JSON cells",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added Generate with AI and Optimize with AI actions to the query runner, plus a Suggest fix action on failed queries",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added an opt-out toggle for sending the database schema to the AI assistant as context",
				username: "Mahmoudgalalz",
			},
		],
		improvements: [
			{
				text: "Kept the AI response stream attached to the proxy response so streaming errors surface instead of a generic body-read failure",
				username: "husamql3",
			},
			{
				text: "Kept schema introspection working when table metadata is unavailable or only partially readable",
				username: "husamql3",
			},
			{
				text: "Gave requests carrying a personal API key their own higher rate-limit bucket instead of skipping the proxy limiter, so an unvalidated header can no longer bypass it",
				username: "husamql3",
			},
			{
				text: "Rejected non-HTTPS AI proxy destinations unless they point at loopback, so personal API keys are never forwarded in cleartext",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Fixed the AI model defaulting to Gemini when another provider was selected without an explicit model, which made the proxy reject the request",
				username: "husamql3",
			},
			{
				text: "Fixed a queued query-runner prompt being discarded when the assistant was not ready to send it",
				username: "husamql3",
			},
			{
				text: "Stopped refetching the hosted chat quota after responses that do not consume it",
				username: "husamql3",
			},
			{
				text: "Fixed the JSON cell editor restoring a cancelled value with a stale indentation width",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.11.0",
		date: "2026-09-05",
		title: "Light mode and local development improvements",
		features: [
			{
				text: "Added Light, Dark, and System theme options with theme-aware colors across the application",
				username: "marwan562",
			},
		],
		improvements: [
			{
				text: "Made number, date, boolean, and enum table cell controls transparent for consistent styling across light and dark themes",
				username: "husamql3",
			},
			{
				text: "Removed the browser-native increment and decrement controls from numeric table cells",
				username: "husamql3",
			},
			{
				text: "Made the pre-commit hook resolve Bun across macOS, Linux, and Windows and added type checking",
				username: "marwan562",
			},
			{
				text: "Expanded the contributor guide with environment setup, Portless development, database initialization, and testing workflows",
				username: "marwan562",
			},
		],
		bugsFixed: [
			{
				text: "Allowed local development origins and preserved custom Portless ports when connecting the web app to the API",
				username: "marwan562",
			},
		],
	},
	{
		version: "1.10.1",
		date: "2026-09-04",
		title: "Fix scrolling in column type dropdowns",
		bugsFixed: [
			{
				text: "Fixed column type dropdowns not scrolling with a mouse wheel or trackpad inside table, add-column, and edit-column overlays",
				username: "marwan562",
			},
		],
	},
	{
		version: "1.10.0",
		date: "2026-08-28",
		title: "Support Redis key browsing",
		features: [
			{
				text: "Added Redis support with a dedicated key browser for strings, hashes, lists, sets, sorted sets, and streams, including a redis-cli style query runner",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.9.7",
		date: "2026-08-15",
		title: "Relicense to Apache 2.0",
		improvements: [
			{
				text: "Relicensed DB Studio from BSL-1.1 to the Apache License 2.0",
			},
			{
				text: "Fixed the release workflow failing when a merge to main doesn't bump the package version — npm publish is now skipped if the version is already published",
			},
		],
	},
	{
		version: "1.9.6",
		date: "2026-07-07",
		title: "Fix SPA/API namespace collision and dependency updates",
		bugsFixed: [
			{
				text: "Fix browser refresh on client routes returning 400 — API now lives under /api prefix so the SPA owns the root namespace",
			},
		],
		improvements: [
			{
				text: "Updated production dependencies: @tanstack/ai (0.38→0.39.1), @tanstack/ai-gemini (0.18→0.19), @tanstack/react-router (1.170.16→1.170.17), @tanstack/react-start (1.168.26→1.168.27)",
			},
			{
				text: "Updated dev dependencies: portless (0.13→0.15), vite (8.0.12→8.1.3), @vitejs/plugin-react (4→6)",
			},
		],
	},
	{
		version: "1.9.5",
		date: "2026-07-02",
		title: "Fix npm package URLs in README",
		bugsFixed: [
			{
				text: "Fixed the npm package URLs and license badge repository in the published README",
			},
		],
	},
	{
		version: "1.9.4",
		date: "2026-07-02",
		title: "Dependency updates and README fix",
		improvements: [
			{
				text: "Updated production dependencies: @tanstack/ai (0.16→0.38), @tanstack/ai-react (0.8→0.16), @tanstack/react-router (1.170.2→1.170.16), @tanstack/react-start (1.168.3→1.168.26), commander (14→15), three (0.184→0.185)",
			},
			{
				text: "Updated dev dependencies (6 packages)",
			},
		],
		bugsFixed: [
			{
				text: "Fixed license badge in README pointing to wrong repository",
			},
		],
	},
	{
		version: "1.9.3",
		date: "2026-05-16",
		title: "Fix the database connection error",
		features: [
			{
				text: "Fix the database connection error",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.9.1",
		date: "2026-05-09",
		title: "Integrated PostHog analytics and Sentry error tracking",
		features: [
			{
				text: "Integrated PostHog analytics and Sentry error tracking for enhanced monitoring and error visibility",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.9.0",
		date: "2026-05-03",
		title:
			"Turn the current frontend package into a feature-first web app with extractable UI primitives, stable data/client boundaries, and a future desktop host path",
		features: [
			{
				text: "Turn the current frontend package into a feature-first web app with extractable UI primitives, stable data/client boundaries, and a future desktop host path",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.8.0",
		date: "2026-05-03",
		title:
			"Refactored database operation layer with new adapter-based architecture for better multi-database support",
		features: [
			{
				text: "Refactored database operation layer with new adapter-based architecture for better multi-database support",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.7.12",
		date: "2026-04-30",
		title:
			"Improved spacing in the table tab layout with enhanced bottom padding for better visual definition and separation",
		features: [
			{
				text: "Improved spacing in the table tab layout with enhanced bottom padding for better visual definition and separation",
				username: "MohmedAref31",
			},
		],
	},
	{
		version: "1.7.11",
		date: "2026-04-28",
		title: "Add hover copy button for table cells to copy the cell value",
		features: [
			{
				text: "Add hover copy button for table cells",
				username: "MohmedAref31",
			},
		],
	},
	{
		version: "1.7.10",
		date: "2026-04-26",
		title:
			"Reorganized MongoDB database access layer into modular components for improved maintainability and clarity of database operations",
		improvements: [
			{
				text: "Reorganized MongoDB database access layer into modular components for improved maintainability and clarity of database operations",
				username: "Youssef-joe",
			},
		],
	},
	{
		version: "1.7.9",
		date: "2026-04-25",
		title:
			"Foreign key columns now support an interactive drawer to browse related table data",
		features: [
			{
				text: "New drawer component for improved data visualization",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Fix the rate limit logic in the chat sidebar",
				username: "amrable",
			},
			{
				text: "Hide the drawer if there is no data to display",
				username: "Amirosagan",
			},
		],
	},
	{
		version: "1.7.5",
		date: "2026-04-24",
		title: "Revive chat sidebar and align with local dev",
		features: [
			{
				text: "Revived chat sidebar and is now scoped to the selected database",
				username: "amrable",
			},
		],
		bugsFixed: [
			{
				text: "Fix custom server port configuration not working",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.7.4",
		date: "2026-04-23",
		title: "Table sidebar now displays schema names for better organization",
		features: [
			{
				text: "Added schema dropdown to the table sidebar for better organization",
				username: "Amirosagan",
			},
		],
		improvements: [
			{
				text: "Display database connection errors in frontend root route",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.7.0",
		date: "2026-04-12",
		title: "Support MSSQL and MongoDB databases",
		features: [
			{
				text: "Added Microsoft SQL Server (MSSQL) database support",
				username: "Amirosagan",
			},
			{
				text: "Added MongoDB database support",
				username: "Youssef-joe",
			},
		],
		improvements: [
			{
				text: "Improved API base URL detection to dynamically adapt to runtime environment, with fallback support for default configurations",
				username: "xaaksw",
			},
		],
		bugsFixed: [
			{
				text: "Enhanced GitHub Actions workflows with concurrency controls to prevent overlapping automated pull request creation jobs",
				username: "xaaksw",
			},
			{
				text: "Fixed table cell display to properly handle and render non-primitive object values",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.5.1",
		date: "2026-04-08",
		title: "Schema tab column editing",
		features: [
			{
				text: "Added schema tab column management with support for adding, editing, renaming, and dropping columns directly from the table structure view",
				username: "husamql3",
			},
		],
		improvements: [
			{
				text: "Updated the table actions flow so the Edit table menu item opens the schema editor for the selected table",
				username: "husamql3",
			},
			{
				text: "Added a report a bug button to the header to create a new GitHub issue",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.4.0",
		date: "2026-03-02",
		title: "Support MySQL database",
		features: [
			{
				text: "Added MySQL database support alongside PostgreSQL",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Improved database connection error detection and messaging",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.3.33",
		date: "2026-02-20",
		title: "Add table actions menu",
		features: [
			{
				text: "Add table menu with delete table feature (with support for foreign key constraints) and copy table schema feature, export table data feature (CSV, JSON, Excel)",
				username: "husamql3",
			},
			{
				text: "Add bulk insert records feature by CSV, JSON, or Excel files in the table tab",
				username: "Youssef-joe",
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
			{
				text: "Added the init-db script to initialize the database for local development",
				username: "Youssef-joe",
			},
			{
				text: "Added confirmation dialog for delete record feature in the table tab",
				username: "husamql3",
			},
			{
				text: "Added tooltip for the primary key and foreign key columns in the table tab",
				username: "husamql3",
			},
			{
				text: "Added preset row count options to the table footer",
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
