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
		version: "1.14.2",
		date: "2026-09-26",
		title: "Leaner test suite and an up-to-date roadmap",
		improvements: [
			{
				text: "Removed unit tests that could not catch real bugs, keeping the ones that pin down SQL building, error mapping, data parsing, and credential redaction",
				username: "husamql3",
			},
			{
				text: "Added the website's admin authentication tests to the project-wide test run; they had never been running",
				username: "husamql3",
			},
			{
				text: "Brought the roadmap up to date with shipped features, including the JSON cell editor, column preferences, bring-your-own AI keys, the command palette, and Live mode",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.14.1",
		date: "2026-09-23",
		title: "A real JSON editor and a quicker row details sheet",
		features: [
			{
				text: "Replaced the JSON cell's plain textarea with a code editor: line numbers, syntax highlighting, folding, and inline errors that block saving invalid JSON",
				username: "husamql3",
			},
		],
		improvements: [
			{
				text: "Row details now opens on a single click and the cell editor on a double click, with the sheet no longer dimming or blocking the grid behind it",
				username: "husamql3",
			},
			{
				text: "Updated production dependencies: @tanstack/ai (0.54→0.55), @tanstack/ai-client (0.31.1→0.32.1), @tanstack/ai-gemini (0.29.4→0.30), @tanstack/ai-react (0.24.1→0.27), @tanstack/react-router (1.170.35→1.170.38), @tanstack/react-start (1.168.52→1.168.56), dotenv (17.4.2→18)",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Fixed saving an unedited JSON cell marking it as a pending change",
				username: "husamql3",
			},
			{
				text: "Fixed the Save and Cancel buttons in the JSON cell editor doing nothing",
				username: "husamql3",
			},
			{
				text: "Fixed Enter and Escape in the grid committing or discarding JSON cells other than the one being edited",
				username: "husamql3",
			},
			{
				text: "Fixed a single click on a selected cell opening the cell editor and the row details sheet at the same time",
				username: "husamql3",
			},
			{
				text: "Fixed the row details close button overlapping the row navigation arrows",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.14.0",
		date: "2026-09-21",
		title: "Live mode, row details, and a command palette",
		features: [
			{
				text: "Added Live mode for PostgreSQL: the table refreshes every second and highlights inserted rows and changed cells, pausing automatically while you edit",
				username: ["marwan562", "husamql3"],
			},
			{
				text: "Added an editable row details sheet with keyboard navigation between rows and a confirmation before unsaved edits are discarded",
				username: ["marwan562", "husamql3"],
			},
			{
				text: "Added a command palette for jumping to tables, running actions, and opening the assistant",
				username: ["marwan562", "husamql3"],
			},
			{
				text: "Added per-table column preferences so you can hide and reorder columns, saved across sessions",
				username: ["marwan562", "husamql3"],
			},
			{
				text: "Added table renaming across PostgreSQL, MySQL, SQL Server, SQLite, and MongoDB",
				username: ["marwan562", "husamql3"],
			},
		],
		improvements: [
			{
				text: "Blurred the sticky table headers so rows stay legible as they scroll underneath",
				username: ["marwan562", "husamql3"],
			},
			{
				text: "Enforced server coverage thresholds in CI",
				username: "marwan562",
			},
		],
		bugsFixed: [
			{
				text: "Fixed PostgreSQL tables outside the public schema listing in the sidebar but failing to open, export, or show their columns",
				username: "husamql3",
			},
			{
				text: "Fixed edits to a record with a composite primary key updating every row that shared the first key column",
				username: "husamql3",
			},
			{
				text: "Fixed renaming a PostgreSQL table applying to a same-named table in another schema",
				username: "husamql3",
			},
			{
				text: "Fixed editing a Redis key's name writing to the old key instead of renaming it",
				username: "husamql3",
			},
			{
				text: "Fixed MongoDB record updates failing mid-write when the immutable _id field was edited",
				username: "husamql3",
			},
			{
				text: "Fixed binary columns crashing the record editor when they already held a value",
				username: "husamql3",
			},
			{
				text: "Fixed Edit Table navigation not returning to the data view",
				username: "marwan562",
			},
		],
	},
	{
		version: "1.13.1",
		date: "2026-09-18",
		title: "CLI accuracy and safer startup errors",
		improvements: [
			{
				text: "Refreshed TanStack, Vite, and Vitest, and tightened the build, typecheck, and task graph setup",
				username: ["marwan562", "husamql3"],
			},
		],
		bugsFixed: [
			{
				text: "Fixed CLI help and status listing only MySQL and PostgreSQL instead of all six supported databases",
				username: "marwan562",
			},
			{
				text: "Stopped startup errors from leaking connection URLs containing commas or parentheses, such as MongoDB replica set URIs",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.13.0",
		date: "2026-09-07",
		title: "Anonymous usage and reliability analytics",
		features: [
			{
				text: "Added opt-out anonymous analytics covering feature usage, database engine, performance, and sanitized errors, with a toggle in Settings — queries, schemas, names, and values are never collected",
				username: "husamql3",
			},
		],
		improvements: [
			{
				text: "Replaced raw error console output with structured logs that record the operation and error type without leaking connection details",
				username: "husamql3",
			},
		],
	},
	{
		version: "1.12.0",
		date: "2026-09-06",
		title: "Bring your own AI provider",
		features: [
			{
				text: "Added Gemini, OpenAI, Anthropic, Grok, and OpenRouter to the AI assistant, with a model picker and bring-your-own-key support",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added Generate with AI, Optimize with AI, and Suggest fix actions to the query runner",
				username: "Mahmoudgalalz",
			},
			{
				text: "Added a Settings panel for the AI provider, key, and schema sharing, plus editor tab size, font size, and word wrap",
				username: "Mahmoudgalalz",
			},
		],
		improvements: [
			{
				text: "Gave personal API keys their own rate-limit bucket and blocked forwarding them over plain HTTP",
				username: "husamql3",
			},
			{
				text: "Kept the assistant working when a response stream fails or table metadata is only partly readable",
				username: "husamql3",
			},
		],
		bugsFixed: [
			{
				text: "Fixed non-Gemini providers defaulting to a Gemini model, dropped query runner prompts, and stale indentation in the JSON cell editor",
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
