import { statSync } from "node:fs";
import type { Client, Value } from "@libsql/client";

/** Exactly what the adapter's toSqliteValue produces. */
export type SqlParam = null | string | number | bigint;

export interface SqlStatement {
	sql: string;
	args: SqlParam[];
}

/** libsql's ResultSet already has this shape. */
export interface SqlResult {
	columns: string[];
	rows: ArrayLike<Value>[];
	rowsAffected: number;
}

interface SqliteInfo {
	name: string;
	size: string;
	version: string;
}

export interface SqliteClient {
	execute(stmt: SqlStatement | string): Promise<SqlResult>;
	/** One transaction: any failing statement rolls back every statement. */
	batch(stmts: (SqlStatement | string)[], mode: "read" | "write"): Promise<SqlResult[]>;
	/**
	 * Replaces a table by CREATE tmp / INSERT SELECT / DROP / RENAME (+ index/trigger SQL)
	 * without firing foreign key actions on rows of the tables in `referencedBy`.
	 */
	rebuildTable(statements: string[], referencedBy: string[]): Promise<void>;
	info(): Promise<SqliteInfo>;
	close(): void;
}

export const formatFileSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileSize = (filePath: string): string => {
	if (!filePath) return "in-memory";
	try {
		return formatFileSize(statSync(filePath).size);
	} catch {
		return "N/A";
	}
};

export const fromLibsql = (client: Client): SqliteClient => ({
	execute: (stmt) => client.execute(stmt),
	batch: (stmts, mode) => client.batch(stmts, mode),
	// DROP TABLE runs an implicit DELETE, which would fire ON DELETE CASCADE on child tables.
	// PRAGMA foreign_keys is a no-op inside a transaction and does not outlive one request on
	// a remote server; migrate() turns it off, runs the statements in one transaction on one
	// connection, and turns it back on even when a statement fails.
	rebuildTable: async (statements) => {
		await client.migrate(statements);
	},
	info: async () => {
		const [databases, version] = await Promise.all([
			client.execute("PRAGMA database_list"),
			client.execute("SELECT sqlite_version()"),
		]);
		const file = databases.rows.find((row) => row.name === "main")?.file;
		return {
			name: "main",
			// A remote server reports its own filesystem path; there is nothing local to stat.
			size:
				client.protocol === "file" ? getFileSize(typeof file === "string" ? file : "") : "N/A",
			version: `SQLite ${version.rows[0]?.[0]}`,
		};
	},
	close: () => client.close(),
});
