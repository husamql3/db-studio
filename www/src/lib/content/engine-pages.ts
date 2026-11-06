export type EnginePage = {
	/** URL is `/<slug>-gui`; also the engine's anchor on /docs/databases. */
	slug: string;
	name: string;
	title: string;
	description: string;
	headline: string;
	intro: string;
	command: string;
	highlights: { title: string; text: string }[];
	limits: string[];
	faq: { question: string; answer: string }[];
};

/** Landing pages for "<engine> GUI" searches. Keep claims in sync with content/docs/databases.mdx. */
export const enginePages: EnginePage[] = [
	{
		slug: "duckdb",
		name: "DuckDB",
		title: "DuckDB GUI: browse, edit and query .duckdb files | db-studio",
		description:
			"A free, open-source DuckDB GUI. Open a .duckdb file with one command, then browse tables, edit rows, run SQL, and export tables.",
		headline: "A DuckDB GUI that opens with one command",
		intro:
			"Point db-studio at a .duckdb file and you get a table browser, a SQL editor and a schema editor. It runs on your machine and opens the file directly, with no server to set up and no DuckDB install.",
		command: 'npx db-studio --database-url "duckdb:///absolute/path/to/data.duckdb"',
		highlights: [
			{
				title: "Browse tables",
				text: "Sort, filter and page through any table. NULLs sort last, in both directions.",
			},
			{
				title: "Edit rows in the grid",
				text: "Edit cells, add records, and bulk insert from CSV, JSON or Excel files.",
			},
			{
				title: "Run SQL",
				text: "Write queries in the editor and see the results in a grid. Export any table as CSV, JSON or Excel from the sidebar.",
			},
			{
				title: "Change the schema",
				text: "Create tables, add and edit columns, manage foreign keys and indexes.",
			},
			{
				title: "Watch data change",
				text: "Live mode refreshes the grid every second and highlights changed rows and cells.",
			},
		],
		limits: [
			"DuckDB lets one process write to a file at a time. Close any other program that has the file open before you connect.",
			"The query editor runs one statement at a time and rejects BEGIN, COMMIT and ROLLBACK.",
			"Only the main schema is listed.",
			"Deleting a record that other rows reference is refused, not cascaded.",
		],
		faq: [
			{
				question: "Do I need to install DuckDB?",
				answer:
					"No. db-studio ships with DuckDB built in. You only need Node.js to run the npx command, or you can use the desktop app.",
			},
			{
				question: "How do I open a file in the current folder?",
				answer:
					"Use a relative path with one dot: duckdb://./data.duckdb. For an absolute path, use three slashes: duckdb:///Users/me/data.duckdb.",
			},
			{
				question: "Why does it say the file is locked?",
				answer:
					"Another process, such as a Python script or the DuckDB CLI, has the file open for writing. Close it and connect again.",
			},
			{
				question: "Is it free?",
				answer: "Yes. db-studio is free and open source under the Apache 2.0 license.",
			},
		],
	},
	{
		slug: "clickhouse",
		name: "ClickHouse",
		title: "ClickHouse GUI: browse tables and run SQL | db-studio",
		description:
			"A free, open-source ClickHouse GUI. Connect with one command, see row counts without scanning, browse and export tables, run SQL, and read the server log.",
		headline: "A ClickHouse GUI built for big tables",
		intro:
			"db-studio connects to ClickHouse over its HTTP interface and gives you a table browser, a SQL editor and the server log in one place. The sidebar reads row counts from table metadata, so listing tables with billions of rows does not scan them.",
		command:
			'npx db-studio --database-url "clickhouse://user:password@localhost:8123/default"',
		highlights: [
			{
				title: "Row counts without scanning",
				text: "The sidebar reads row counts from system.tables instead of running count(). Sort, filter and page through any table.",
			},
			{
				title: "Exact numbers",
				text: "UInt64, Int128, Int256 and Decimal values keep their exact value instead of being rounded.",
			},
			{
				title: "Run SQL",
				text: "Write queries in the editor and see the results in a grid. Mutations wait until they finish. Export any table as CSV, JSON or Excel from the sidebar.",
			},
			{
				title: "Insert data",
				text: "Add records, and bulk insert from CSV, JSON or Excel files.",
			},
			{
				title: "Read the server log",
				text: "The Logs tab shows recent queries and server messages from query_log and text_log, with duration, rows read and errors.",
			},
		],
		limits: [
			"Rows cannot be edited or deleted from the grid, because a sorting key does not identify one row. Use ALTER TABLE ... UPDATE or DELETE in the query editor.",
			"Foreign keys and unique constraints do not exist in ClickHouse.",
			"Live mode is not available.",
		],
		faq: [
			{
				question: "How do I connect over TLS?",
				answer: "Use clickhouses:// instead of clickhouse://.",
			},
			{
				question: "Which port does it use?",
				answer: "The HTTP interface, 8123 by default. The native TCP port (9000) is not used.",
			},
			{
				question: "What engine do new tables use?",
				answer:
					"Tables you create in db-studio use MergeTree, ordered by the primary key you pick.",
			},
			{
				question: "Is it free?",
				answer: "Yes. db-studio is free and open source under the Apache 2.0 license.",
			},
		],
	},
];
