export type SupportedDatabase = {
	name: string;
	slug: string;
	scheme: string;
};

/** Every engine with a section on /docs/databases (slug = heading anchor), in display order. */
export const supportedDatabases: SupportedDatabase[] = [
	{ name: "PostgreSQL", slug: "postgresql", scheme: "postgresql://" },
	{ name: "MySQL", slug: "mysql", scheme: "mysql://" },
	{ name: "MariaDB", slug: "mariadb", scheme: "mariadb://" },
	{ name: "CockroachDB", slug: "cockroachdb", scheme: "cockroachdb://" },
	{ name: "TiDB", slug: "tidb", scheme: "tidb://" },
	{ name: "SQL Server", slug: "sql-server", scheme: "mssql://" },
	{ name: "MongoDB", slug: "mongodb", scheme: "mongodb://" },
	{ name: "SQLite", slug: "sqlite", scheme: "sqlite://" },
	{ name: "Turso", slug: "turso", scheme: "libsql://" },
	{ name: "Redis", slug: "redis", scheme: "redis://" },
	{ name: "DuckDB", slug: "duckdb", scheme: "duckdb://" },
	{ name: "Oracle", slug: "oracle", scheme: "oracle://" },
	{ name: "ClickHouse", slug: "clickhouse", scheme: "clickhouse://" },
];
