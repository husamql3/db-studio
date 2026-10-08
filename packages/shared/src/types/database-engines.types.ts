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

export type DatabaseEngine = DatabaseEngineBase & RowMutationCapability;

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
	},
	clickhouse: {
		label: "ClickHouse",
		protocols: ["clickhouse", "clickhouses"],
		defaultPort: 8123,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: false,
		schemaSelector: false,
		rowMutation: false,
		rowMutationReason:
			"Use a SQL query to update or delete ClickHouse rows; sorting keys are not unique.",
	},
} satisfies Record<DatabaseTypeSchema, DatabaseEngine>;

/** Maps a URL scheme without the trailing colon (e.g. `"postgresql"`) to its db type. */
export const dbTypeFromProtocol = (protocol: string): DatabaseTypeSchema | undefined =>
	DATABASE_TYPES.find((type) => DATABASE_ENGINES[type].protocols.includes(protocol));
