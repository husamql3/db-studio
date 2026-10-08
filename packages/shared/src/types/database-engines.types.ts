import { DATABASE_TYPES, type DatabaseTypeSchema } from "./database.types.js";

export type DataModel = "relational" | "document" | "key-value";

export interface DatabaseEngine {
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

export const DATABASE_ENGINES: Record<DatabaseTypeSchema, DatabaseEngine> = {
	pg: {
		label: "PostgreSQL",
		protocols: ["postgres", "postgresql", "cockroachdb"],
		defaultPort: 5432,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: true,
	},
	mysql: {
		label: "MySQL",
		protocols: ["mysql", "mysql2", "mariadb", "tidb"],
		defaultPort: 3306,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
	},
	mssql: {
		label: "SQL Server",
		protocols: ["mssql", "sqlserver"],
		defaultPort: 1433,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
	},
	mongodb: {
		label: "MongoDB",
		protocols: ["mongodb", "mongodb+srv"],
		defaultPort: 27017,
		dataModel: "document",
		editorLanguage: "json",
		liveMode: false,
		schemaSelector: false,
	},
	sqlite: {
		label: "SQLite / libSQL",
		protocols: ["sqlite", "libsql"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
	},
	redis: {
		label: "Redis",
		protocols: ["redis", "rediss"],
		defaultPort: 6379,
		dataModel: "key-value",
		editorLanguage: "plaintext",
		liveMode: false,
		schemaSelector: false,
	},
	duckdb: {
		label: "DuckDB",
		protocols: ["duckdb"],
		defaultPort: null,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
	},
	oracle: {
		label: "Oracle",
		protocols: ["oracle"],
		defaultPort: 1521,
		dataModel: "relational",
		editorLanguage: "pgsql",
		liveMode: true,
		schemaSelector: false,
	},
};

/** Maps a URL scheme without the trailing colon (e.g. `"postgresql"`) to its db type. */
export const dbTypeFromProtocol = (protocol: string): DatabaseTypeSchema | undefined =>
	DATABASE_TYPES.find((type) => DATABASE_ENGINES[type].protocols.includes(protocol));
