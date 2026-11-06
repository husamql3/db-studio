import { DATABASE_TYPES, type DatabaseTypeSchema } from "./database.types.js";

export type DataModel = "relational" | "document" | "key-value";

interface DatabaseEngineBase {
	label: string;
	/** URL schemes; the first is canonical. */
	protocols: Readonly<Record<string, ProtocolTraits>>;
	dataModel: DataModel;
	editorLanguage: "pgsql" | "json" | "plaintext";
	liveMode: boolean;
	schemaSelector: boolean;
	/** Grid edits can set a cell to its column default (`UPDATE … SET c = DEFAULT`). */
	cellDefault: boolean;
	/** Tables and columns can be created, renamed, altered and dropped; `false` refuses with 400. */
	schemaMutation: boolean;
	/** Dropping a column can CASCADE to the indexes, constraints and views that depend on it. */
	dropColumnCascade: boolean;
	/** A connection can be opened in a read-only session the database itself enforces. */
	readOnly: boolean;
	/** How "Copy as SQL INSERT" writes literals; `null` hides it. */
	sqlInsert: SqlInsertDialect | null;
}

/** How a URL scheme names its database. */
export type ProtocolTraits =
	| {
			/** The server port when the URL names none. */
			defaultPort: number;
			/** The scheme the driver expects, for a wire-compatible alias it does not know. */
			driverScheme?: string;
	  }
	/** `scheme://<path>`: a local file, or `:memory:`. */
	| { file: true }
	/** A hosted database its client addresses by the URL alone (libSQL / Turso, Cloudflare D1). */
	| { hosted: true };

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

export type DatabaseEngine = DatabaseEngineBase &
	RowMutationCapability &
	IndexCapability &
	ServerLogsCapability;

export const DATABASE_ENGINES = {
	pg: {
		label: "PostgreSQL",
		protocols: {
			postgres: { defaultPort: 5432 },
			postgresql: { defaultPort: 5432 },
			cockroachdb: { defaultPort: 26257, driverScheme: "postgresql" },
		},
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: true,
		cellDefault: true,
		schemaMutation: true,
		dropColumnCascade: true,
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
	},
	mysql: {
		label: "MySQL",
		protocols: {
			mysql: { defaultPort: 3306 },
			mysql2: { defaultPort: 3306 },
			mariadb: { defaultPort: 3306, driverScheme: "mysql" },
			tidb: { defaultPort: 4000, driverScheme: "mysql" },
		},
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
	mssql: {
		label: "SQL Server",
		protocols: { mssql: { defaultPort: 1433 }, sqlserver: { defaultPort: 1433 } },
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
	mongodb: {
		label: "MongoDB",
		protocols: { mongodb: { defaultPort: 27017 }, "mongodb+srv": { defaultPort: 27017 } },
		dataModel: "document",
		editorLanguage: "json",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		schemaMutation: true,
		dropColumnCascade: false,
		readOnly: false,
		sqlInsert: null,
		rowMutation: true,
		indexes: { methods: [], createNote: null },
		serverLogs: true,
	},
	sqlite: {
		label: "SQLite / libSQL / D1",
		protocols: { sqlite: { file: true }, libsql: { hosted: true }, d1: { hosted: true } },
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: false,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
	redis: {
		label: "Redis",
		protocols: { redis: { defaultPort: 6379 }, rediss: { defaultPort: 6379 } },
		dataModel: "key-value",
		editorLanguage: "plaintext",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		schemaMutation: false,
		dropColumnCascade: false,
		readOnly: false,
		sqlInsert: null,
		rowMutation: true,
		indexes: false,
		serverLogs: true,
	},
	duckdb: {
		label: "DuckDB",
		protocols: { duckdb: { file: true } },
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
	oracle: {
		label: "Oracle",
		protocols: { oracle: { defaultPort: 1521 } },
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		cellDefault: true,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
	clickhouse: {
		label: "ClickHouse",
		protocols: { clickhouse: { defaultPort: 8123 }, clickhouses: { defaultPort: 8443 } },
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: false,
		schemaSelector: false,
		cellDefault: false,
		schemaMutation: true,
		dropColumnCascade: false,
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
	},
} satisfies Record<DatabaseTypeSchema, DatabaseEngine>;

/** Maps a URL scheme without the trailing colon (e.g. `"postgresql"`) to its db type. */
export const dbTypeFromProtocol = (protocol: string): DatabaseTypeSchema | undefined =>
	DATABASE_TYPES.find((type) => Object.hasOwn(DATABASE_ENGINES[type].protocols, protocol));
