import { DATABASE_TYPES, type DatabaseTypeSchema } from "./database.types.js";

export type DataModel = "relational" | "document" | "key-value";

interface DatabaseEngineBase {
	label: string;
	/** URL schemes; the first is canonical. */
	protocols: readonly string[];
	/** `null` for file-based engines. */
	defaultPort: number | null;
	dataModel: DataModel;
	editorLanguage: "pgsql" | "json" | "plaintext";
	liveMode: boolean;
	schemaSelector: boolean;
	/** Grid edits can set a cell to its column default (`UPDATE … SET c = DEFAULT`). */
	cellDefault: boolean;
	/** A connection can be opened in a read-only session the database itself enforces. */
	readOnly: boolean;
	/** How "Copy as SQL INSERT" writes literals; `null` hides it. */
	sqlInsert: SqlInsertDialect | null;
}

export type SqlInsertDialect = {
	/** Opening identifier quote; `[` closes with `]`. */
	quote: '"' | "`" | "[";
	/** `TRUE`/`FALSE`, or `1`/`0` where the engine has no boolean literal. */
	booleanKeywords: boolean;
	/** String literals treat a backslash as an escape, so it is doubled. */
	backslashEscapes: boolean;
	/** `N'…'`, so non-ASCII text survives a non-Unicode collation. */
	unicodePrefix: boolean;
};

type RowMutationCapability =
	| { rowMutation: true; rowMutationReason?: never }
	| { rowMutation: false; rowMutationReason: string };

/** `false` hides the Indexes tab and makes the index routes answer 400. */
type IndexCapability = {
	indexes:
		| false
		| {
				/** Access methods offered when creating an index; empty means no method picker. */
				methods: readonly string[];
				/** One line shown in the create form, or `null`. */
				createNote: string | null;
		  };
};

/** `false` hides the Logs tab: the engine runs inside DB Studio, so no server writes a log. */
type ServerLogsCapability = { serverLogs: boolean };

/** Whether the engine exposes stored procedures or functions in the Routines tab. */
type RoutinesCapability = { routines: boolean };

export type DatabaseEngine = DatabaseEngineBase &
	RowMutationCapability &
	IndexCapability &
	ServerLogsCapability &
	RoutinesCapability;

export const DATABASE_ENGINES = {
	pg: {
		label: "PostgreSQL",
		protocols: ["postgres", "postgresql", "cockroachdb"],
		defaultPort: 5432,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: true,
		cellDefault: true,
		readOnly: true,
		sqlInsert: {
			quote: '"',
			booleanKeywords: true,
			backslashEscapes: false,
			unicodePrefix: false,
		},
		rowMutation: true,
		indexes: {
			methods: ["btree", "hash", "gin", "gist", "spgist", "brin"],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
		serverLogs: true,
		routines: true,
	},
	mysql: {
		label: "MySQL",
		protocols: ["mysql", "mysql2", "mariadb", "tidb"],
		defaultPort: 3306,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		readOnly: true,
		sqlInsert: {
			quote: "`",
			booleanKeywords: true,
			backslashEscapes: true,
			unicodePrefix: false,
		},
		rowMutation: true,
		indexes: { methods: [], createNote: null },
		serverLogs: true,
		routines: true,
	},
	mssql: {
		label: "SQL Server",
		protocols: ["mssql", "sqlserver"],
		defaultPort: 1433,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		readOnly: false,
		sqlInsert: {
			quote: "[",
			booleanKeywords: false,
			backslashEscapes: false,
			unicodePrefix: true,
		},
		rowMutation: true,
		indexes: {
			methods: [],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
		serverLogs: true,
		routines: true,
	},
	mongodb: {
		label: "MongoDB",
		protocols: ["mongodb", "mongodb+srv"],
		defaultPort: 27017,
		dataModel: "document",
		editorLanguage: "json",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		readOnly: false,
		sqlInsert: null,
		rowMutation: true,
		indexes: { methods: [], createNote: null },
		serverLogs: true,
		routines: false,
	},
	sqlite: {
		label: "SQLite / libSQL / D1",
		protocols: ["sqlite", "libsql", "d1"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: false,
		readOnly: false,
		sqlInsert: {
			quote: '"',
			booleanKeywords: true,
			backslashEscapes: false,
			unicodePrefix: false,
		},
		rowMutation: true,
		indexes: { methods: [], createNote: null },
		serverLogs: false,
		routines: false,
	},
	redis: {
		label: "Redis",
		protocols: ["redis", "rediss"],
		defaultPort: 6379,
		dataModel: "key-value",
		editorLanguage: "plaintext",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		readOnly: false,
		sqlInsert: null,
		rowMutation: true,
		indexes: false,
		serverLogs: true,
		routines: false,
	},
	duckdb: {
		label: "DuckDB",
		protocols: ["duckdb"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		readOnly: true,
		sqlInsert: {
			quote: '"',
			booleanKeywords: true,
			backslashEscapes: false,
			unicodePrefix: false,
		},
		rowMutation: true,
		indexes: {
			methods: [],
			createNote:
				"DuckDB cannot alter or rename a table that has an index, or alter or drop a column an index covers.",
		},
		serverLogs: false,
		routines: false,
	},
	oracle: {
		label: "Oracle",
		protocols: ["oracle"],
		defaultPort: 1521,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		readOnly: false,
		sqlInsert: {
			quote: '"',
			booleanKeywords: false,
			backslashEscapes: false,
			unicodePrefix: false,
		},
		rowMutation: true,
		indexes: {
			methods: [],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
		serverLogs: true,
		routines: true,
	},
	clickhouse: {
		label: "ClickHouse",
		protocols: ["clickhouse", "clickhouses"],
		defaultPort: 8123,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		readOnly: true,
		sqlInsert: {
			quote: "`",
			booleanKeywords: true,
			backslashEscapes: true,
			unicodePrefix: false,
		},
		indexes: false,
		rowMutation: false,
		rowMutationReason:
			"Use a SQL query to update or delete ClickHouse rows; sorting keys are not unique.",
		serverLogs: true,
		routines: false,
	},
} satisfies Record<DatabaseTypeSchema, DatabaseEngine>;

/** Maps a URL scheme without the trailing colon (e.g. `"postgresql"`) to its db type. */
export const dbTypeFromProtocol = (protocol: string): DatabaseTypeSchema | undefined =>
	DATABASE_TYPES.find((type) => DATABASE_ENGINES[type].protocols.includes(protocol));
