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
}

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

export type DatabaseEngine = DatabaseEngineBase & RowMutationCapability & IndexCapability;

export const DATABASE_ENGINES = {
	pg: {
		label: "PostgreSQL",
		protocols: ["postgres", "postgresql", "cockroachdb"],
		defaultPort: 5432,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: true,
		rowMutation: true,
		indexes: {
			methods: ["btree", "hash", "gin", "gist", "spgist", "brin"],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
	},
	mysql: {
		label: "MySQL",
		protocols: ["mysql", "mysql2", "mariadb", "tidb"],
		defaultPort: 3306,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		rowMutation: true,
		indexes: { methods: [], createNote: null },
	},
	mssql: {
		label: "SQL Server",
		protocols: ["mssql", "sqlserver"],
		defaultPort: 1433,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		rowMutation: true,
		indexes: {
			methods: [],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
	},
	mongodb: {
		label: "MongoDB",
		protocols: ["mongodb", "mongodb+srv"],
		defaultPort: 27017,
		dataModel: "document",
		editorLanguage: "json",
		liveMode: false,
		schemaSelector: false,
		rowMutation: true,
		indexes: false,
	},
	sqlite: {
		label: "SQLite / libSQL",
		protocols: ["sqlite", "libsql"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		rowMutation: true,
		indexes: { methods: [], createNote: null },
	},
	redis: {
		label: "Redis",
		protocols: ["redis", "rediss"],
		defaultPort: 6379,
		dataModel: "key-value",
		editorLanguage: "plaintext",
		liveMode: false,
		schemaSelector: false,
		rowMutation: true,
		indexes: false,
	},
	duckdb: {
		label: "DuckDB",
		protocols: ["duckdb"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		rowMutation: true,
		indexes: {
			methods: [],
			createNote:
				"DuckDB cannot alter or rename a table that has an index, or alter or drop a column an index covers.",
		},
	},
	oracle: {
		label: "Oracle",
		protocols: ["oracle"],
		defaultPort: 1521,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
		rowMutation: true,
		indexes: {
			methods: [],
			createNote: "Building an index blocks writes to this table until it finishes.",
		},
	},
	clickhouse: {
		label: "ClickHouse",
		protocols: ["clickhouse", "clickhouses"],
		defaultPort: 8123,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: false,
		schemaSelector: false,
		indexes: false,
		rowMutation: false,
		rowMutationReason:
			"Use a SQL query to update or delete ClickHouse rows; sorting keys are not unique.",
	},
} satisfies Record<DatabaseTypeSchema, DatabaseEngine>;

/** Maps a URL scheme without the trailing colon (e.g. `"postgresql"`) to its db type. */
export const dbTypeFromProtocol = (protocol: string): DatabaseTypeSchema | undefined =>
	DATABASE_TYPES.find((type) => DATABASE_ENGINES[type].protocols.includes(protocol));
